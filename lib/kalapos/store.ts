import { generateId, generateIdempotencyKey } from "./format"
import type {
  Branch,
  BranchStatus,
  CartDraftItem,
  KalaPOSState,
  Order,
  OrderItem,
  OrderStatus,
  OrderType,
  PaymentMethod,
  Role,
  Shift,
  SplitPaymentPart,
  StockMovement,
  StockTransfer,
} from "./types"

export interface StoreResult<T = undefined> {
  ok: boolean
  error?: string
  data?: T
  nextState?: KalaPOSState
}

export interface CheckoutInput {
  branch_id: string
  cashier_id: string
  customer_name: string
  order_type: OrderType
  table_number: string | null
  payment_method: PaymentMethod
  tendered_amount: number | null
  discount: number
  discount_reason: string | null
  items: CartDraftItem[]
  split_payments?: SplitPaymentPart[] | null
  held_order_id?: string | null
  idempotency_key?: string
  is_offline?: boolean
}

export function getActiveShift(state: KalaPOSState, branchId: string): Shift | null {
  return (
    state.shifts.find((s) => s.branch_id === branchId && s.status === "OPEN") ?? null
  )
}

export function calculateItemUnitCogs(state: KalaPOSState, item: CartDraftItem): number {
  const ingMap = new Map(state.ingredients.map((i) => [i.id, i]))
  let cogs = 0
  for (const r of state.product_recipes) {
    if (r.product_id === item.product_id) {
      cogs += Math.round((ingMap.get(r.ingredient_id)?.cost_per_unit ?? 0) * r.qty_required)
    }
  }
  for (const mod of item.modifiers) {
    if (mod.ingredient_id && mod.qty_required > 0) {
      cogs += Math.round((ingMap.get(mod.ingredient_id)?.cost_per_unit ?? 0) * mod.qty_required)
    }
  }
  return cogs
}

export function computeOrderTotals(
  items: CartDraftItem[],
  branch: Branch | undefined,
  discount: number
) {
  const subtotal = items.reduce((sum, item) => {
    const modDelta = item.modifiers.reduce((mSum, m) => mSum + m.price_delta, 0)
    return sum + (item.base_price + modDelta) * item.qty
  }, 0)
  const safeDiscount = Math.max(0, Math.min(subtotal, Math.round(discount)))
  const netSubtotal = Math.max(0, subtotal - safeDiscount)
  const serviceRate = branch?.service_charge_rate ?? 0
  const taxRate = branch?.tax_rate ?? 10
  const serviceCharge = Math.round((netSubtotal * serviceRate) / 100)
  const taxAmount = Math.round(((netSubtotal + serviceCharge) * taxRate) / 100)
  const total = netSubtotal + serviceCharge + taxAmount
  return { subtotal, discount: safeDiscount, serviceCharge, taxAmount, total }
}

/**
 * Atomic End-to-End Checkout:
 * 1. Validates active OPEN shift on branch_id
 * 2. Deduplicates by idempotency_key
 * 3. Creates Order with branch-prefixed order_number & daily queue_number + immutable OrderItem snapshots
 * 4. Snapshots recipe COGS (HPP) per item for Gross Profit & Shift Recipe Estimate
 *    (physical BranchStock is intentionally NOT auto-deducted; controlled manually per shift)
 * 5. Increments Shift.expected_cash for CASH (or cash portion of split payments)
 * 6. Immediately spawns Order as QUEUED in KDS & queues offline sync entry if offline
 */
export function executeAtomicCheckout(
  state: KalaPOSState,
  input: CheckoutInput
): StoreResult<Order> {
  const branch = state.branches.find(
    (b) => b.id === input.branch_id && !b.deleted_at && b.status !== "INACTIVE"
  )
  if (!branch) {
    return { ok: false, error: "Cabang tidak ditemukan atau sedang nonaktif." }
  }

  // Idempotency deduplication
  const idempotencyKey = input.idempotency_key || generateIdempotencyKey(branch.code)
  const existing = state.orders.find((o) => o.idempotency_key === idempotencyKey)
  if (existing) {
    return { ok: true, data: existing, nextState: state }
  }

  // 1. Validate active OPEN shift
  const openShift = getActiveShift(state, branch.id)
  if (!openShift) {
    return {
      ok: false,
      error: "Shift belum dibuka. Buka shift terlebih dahulu sebelum memproses transaksi.",
    }
  }

  if (input.items.length === 0) {
    return { ok: false, error: "Keranjang pesanan masih kosong." }
  }

  const { subtotal, discount, serviceCharge, taxAmount, total } = computeOrderTotals(
    input.items,
    branch,
    input.discount
  )

  if (input.payment_method === "CASH" && (!input.split_payments || input.split_payments.length === 0)) {
    const tendered = Math.round(input.tendered_amount ?? 0)
    if (tendered < total) {
      return { ok: false, error: "Nominal tunai diterima kurang dari total pembayaran." }
    }
  }

  // 2. Generate branch-prefixed order_number & daily queue_number
  const branchOrders = state.orders.filter((o) => o.branch_id === branch.id && o.status !== "HOLD")
  const todayStr = new Date().toISOString().slice(0, 10)
  const todayBranchOrders = branchOrders.filter((o) => o.created_at.slice(0, 10) === todayStr)

  const codePrefix = branch.code.replace(/[^A-Z0-9]/gi, "").toUpperCase()
  const orderNumber = `${codePrefix}-${String(branchOrders.length + 1).padStart(4, "0")}`
  const queueNumber = `A-${String(todayBranchOrders.length + 1).padStart(3, "0")}`

  const orderId = generateId("ord")
  const nowIso = new Date().toISOString()

  // Build immutable OrderItem snapshots
  const orderItems: OrderItem[] = input.items.map((item, idx) => {
    const modDelta = item.modifiers.reduce((s, m) => s + m.price_delta, 0)
    const unitPrice = Math.round(item.base_price + modDelta)
    const unitCogs = calculateItemUnitCogs(state, item)
    return {
      id: `${orderId}-it-${idx + 1}`,
      order_id: orderId,
      product_id: item.product_id,
      product_name_snapshot: item.product_name,
      unit_price_snapshot: unitPrice,
      unit_cogs_snapshot: unitCogs,
      modifiers_snapshot: item.modifiers.map((m) => ({ ...m })),
      qty: item.qty,
      subtotal: unitPrice * item.qty,
      barista_notes: item.barista_notes.trim(),
    }
  })

  // Calculate cash increment for shift expected_cash
  let cashAdded = 0
  let tenderedAmount: number | null = null
  let changeAmount: number | null = null

  if (input.split_payments && input.split_payments.length > 0) {
    cashAdded = input.split_payments
      .filter((p) => p.method === "CASH")
      .reduce((sum, p) => sum + Math.round(p.amount), 0)
  } else if (input.payment_method === "CASH") {
    cashAdded = total
    tenderedAmount = Math.round(input.tendered_amount ?? total)
    changeAmount = Math.max(0, tenderedAmount - total)
  }

  const newOrder: Order = {
    id: orderId,
    branch_id: branch.id,
    shift_id: openShift.id,
    order_number: orderNumber,
    queue_number: queueNumber,
    customer_name: input.customer_name.trim() || "Pelanggan",
    order_type: input.order_type,
    table_number: input.order_type === "DINE_IN" ? (input.table_number?.trim() || null) : null,
    status: "QUEUED",
    subtotal,
    tax_amount: taxAmount,
    service_charge: serviceCharge,
    discount,
    discount_reason: discount > 0 ? input.discount_reason : null,
    total,
    payment_method: input.payment_method,
    tendered_amount: tenderedAmount,
    change_amount: changeAmount,
    split_payments: input.split_payments && input.split_payments.length > 0 ? input.split_payments : null,
    void_reason: null,
    voided_by: null,
    cashier_id: input.cashier_id,
    idempotency_key: idempotencyKey,
    synced: !input.is_offline,
    created_at: nowIso,
    completed_at: null,
    items: orderItems,
  }

  // Note: Menu recipes are linked for HPP & shift theoretical usage tracking ONLY.
  // Physical BranchStock is intentionally NOT auto-deducted on checkout.

  // 3. Update Shift expected_cash
  const updatedShifts = state.shifts.map((s) =>
    s.id === openShift.id ? { ...s, expected_cash: s.expected_cash + cashAdded } : s
  )

  // Remove held order if this checkout resumed a HOLD order
  const remainingOrders = input.held_order_id
    ? state.orders.filter((o) => o.id !== input.held_order_id)
    : state.orders

  // 4. Queue offline sync record if offline
  const nextOfflineQueue = input.is_offline
    ? [
        ...state.offline_queue,
        {
          idempotency_key: idempotencyKey,
          type: "CHECKOUT" as const,
          branch_id: branch.id,
          summary: `${orderNumber} · ${newOrder.customer_name} · ${total}`,
          created_at: nowIso,
          attempts: 0,
        },
      ]
    : state.offline_queue

  const nextState: KalaPOSState = {
    ...state,
    shifts: updatedShifts,
    orders: [newOrder, ...remainingOrders],
    offline_queue: nextOfflineQueue,
  }

  return { ok: true, data: newOrder, nextState }
}

export function executeHoldOrder(
  state: KalaPOSState,
  input: {
    branch_id: string
    cashier_id: string
    customer_name: string
    order_type: OrderType
    table_number: string | null
    discount: number
    discount_reason: string | null
    items: CartDraftItem[]
    existing_hold_id?: string | null
  }
): StoreResult<Order> {
  const branch = state.branches.find((b) => b.id === input.branch_id)
  if (!branch) return { ok: false, error: "Cabang tidak ditemukan." }
  if (input.items.length === 0) return { ok: false, error: "Tidak ada item untuk ditahan." }

  const { subtotal, discount, serviceCharge, taxAmount, total } = computeOrderTotals(
    input.items,
    branch,
    input.discount
  )

  const heldCount = state.orders.filter((o) => o.branch_id === branch.id && o.status === "HOLD").length
  const orderId = input.existing_hold_id || generateId("hold")
  const codePrefix = branch.code.replace(/[^A-Z0-9]/gi, "").toUpperCase()
  const nowIso = new Date().toISOString()

  const orderItems: OrderItem[] = input.items.map((item, idx) => {
    const modDelta = item.modifiers.reduce((s, m) => s + m.price_delta, 0)
    const unitPrice = Math.round(item.base_price + modDelta)
    return {
      id: `${orderId}-it-${idx + 1}`,
      order_id: orderId,
      product_id: item.product_id,
      product_name_snapshot: item.product_name,
      unit_price_snapshot: unitPrice,
      unit_cogs_snapshot: calculateItemUnitCogs(state, item),
      modifiers_snapshot: item.modifiers.map((m) => ({ ...m })),
      qty: item.qty,
      subtotal: unitPrice * item.qty,
      barista_notes: item.barista_notes.trim(),
    }
  })

  const holdOrder: Order = {
    id: orderId,
    branch_id: branch.id,
    shift_id: getActiveShift(state, branch.id)?.id ?? null,
    order_number: `${codePrefix}-HOLD-${String(heldCount + 1).padStart(3, "0")}`,
    queue_number: `H-${String(heldCount + 1).padStart(3, "0")}`,
    customer_name:
      input.customer_name.trim() ||
      (input.table_number ? `Meja ${input.table_number}` : "Open Bill"),
    order_type: input.order_type,
    table_number: input.order_type === "DINE_IN" ? (input.table_number?.trim() || null) : null,
    status: "HOLD",
    subtotal,
    tax_amount: taxAmount,
    service_charge: serviceCharge,
    discount,
    discount_reason: discount > 0 ? input.discount_reason : null,
    total,
    payment_method: null,
    tendered_amount: null,
    change_amount: null,
    split_payments: null,
    void_reason: null,
    voided_by: null,
    cashier_id: input.cashier_id,
    idempotency_key: generateIdempotencyKey(branch.code),
    synced: true,
    created_at: nowIso,
    completed_at: null,
    items: orderItems,
  }

  const filtered = state.orders.filter((o) => o.id !== orderId)
  return {
    ok: true,
    data: holdOrder,
    nextState: { ...state, orders: [holdOrder, ...filtered] },
  }
}

export function executeAdvanceOrderStatus(
  state: KalaPOSState,
  orderId: string,
  nextStatus: OrderStatus
): StoreResult<Order> {
  const target = state.orders.find((o) => o.id === orderId)
  if (!target) return { ok: false, error: "Pesanan tidak ditemukan." }
  const updated: Order = {
    ...target,
    status: nextStatus,
    completed_at: nextStatus === "COMPLETED" ? new Date().toISOString() : target.completed_at,
  }
  return {
    ok: true,
    data: updated,
    nextState: {
      ...state,
      orders: state.orders.map((o) => (o.id === orderId ? updated : o)),
    },
  }
}

export function executeVoidOrder(
  state: KalaPOSState,
  orderId: string,
  reason: string,
  supervisorId: string
): StoreResult<Order> {
  if (!supervisorId) {
    return { ok: false, error: "Otorisasi Supervisor diperlukan." }
  }
  if (!reason.trim()) {
    return { ok: false, error: "Alasan pembatalan (VOID) wajib diisi." }
  }
  const target = state.orders.find((o) => o.id === orderId)
  if (!target) return { ok: false, error: "Pesanan tidak ditemukan." }
  if (target.status === "VOID") return { ok: false, error: "Pesanan sudah dibatalkan." }

  const updatedOrder: Order = {
    ...target,
    status: "VOID",
    void_reason: reason.trim(),
    voided_by: supervisorId,
  }

  // If paid in CASH on an OPEN shift, reverse expected_cash
  let updatedShifts = state.shifts
  if (target.shift_id && target.status !== "HOLD") {
    const cashPortion =
      target.split_payments && target.split_payments.length > 0
        ? target.split_payments
            .filter((p) => p.method === "CASH")
            .reduce((s, p) => s + p.amount, 0)
        : target.payment_method === "CASH"
        ? target.total
        : 0

    if (cashPortion > 0) {
      updatedShifts = state.shifts.map((s) =>
        s.id === target.shift_id && s.status === "OPEN"
          ? { ...s, expected_cash: Math.max(0, s.expected_cash - cashPortion) }
          : s
      )
    }
  }

  return {
    ok: true,
    data: updatedOrder,
    nextState: {
      ...state,
      shifts: updatedShifts,
      orders: state.orders.map((o) => (o.id === orderId ? updatedOrder : o)),
    },
  }
}

function captureBranchStockSnapshot(state: KalaPOSState, branchId: string) {
  const stockByIng = new Map(
    state.branch_stocks
      .filter((bs) => bs.branch_id === branchId)
      .map((bs) => [bs.ingredient_id, bs.current_qty])
  )
  return state.ingredients.map((ing) => ({
    ingredient_id: ing.id,
    ingredient_name: ing.name,
    sku: ing.sku,
    unit: ing.unit,
    qty: stockByIng.get(ing.id) ?? 0,
  }))
}

export function executeOpenShift(
  state: KalaPOSState,
  branchId: string,
  userId: string,
  openingCash: number,
  notes = ""
): StoreResult<Shift> {
  const existing = getActiveShift(state, branchId)
  if (existing) {
    return { ok: false, error: "Sudah ada shift yang sedang aktif di cabang ini." }
  }
  const cash = Math.max(0, Math.round(openingCash))
  const shift: Shift = {
    id: generateId("sh"),
    branch_id: branchId,
    user_id: userId,
    opening_cash: cash,
    expected_cash: cash,
    actual_cash: null,
    status: "OPEN",
    notes: notes.trim(),
    opened_at: new Date().toISOString(),
    closed_at: null,
    opening_stocks: captureBranchStockSnapshot(state, branchId),
  }
  return {
    ok: true,
    data: shift,
    nextState: { ...state, shifts: [shift, ...state.shifts] },
  }
}

export interface BlindCloseSummary {
  shift: Shift
  expected_cash: number
  actual_cash: number
  variance_cash: number
}

export function executeCloseShiftBlind(
  state: KalaPOSState,
  shiftId: string,
  actualCash: number,
  notes = ""
): StoreResult<BlindCloseSummary> {
  const shift = state.shifts.find((s) => s.id === shiftId && s.status === "OPEN")
  if (!shift) return { ok: false, error: "Shift aktif tidak ditemukan." }
  const counted = Math.max(0, Math.round(actualCash))
  const closedShift: Shift = {
    ...shift,
    actual_cash: counted,
    status: "CLOSED",
    notes: notes.trim() || shift.notes,
    closed_at: new Date().toISOString(),
    closing_stocks: captureBranchStockSnapshot(state, shift.branch_id),
  }
  return {
    ok: true,
    data: {
      shift: closedShift,
      expected_cash: shift.expected_cash,
      actual_cash: counted,
      variance_cash: counted - shift.expected_cash,
    },
    nextState: {
      ...state,
      shifts: state.shifts.map((s) => (s.id === shiftId ? closedShift : s)),
    },
  }
}

export function executeStockAdjustment(
  state: KalaPOSState,
  input: {
    branch_id: string
    shift_id?: string | null
    ingredient_id: string
    type: "RESTOCK" | "MANUAL_OUT" | "WASTE" | "OPNAME"
    qty: number // positive for restock/manual_out/waste; target counted qty for opname
    notes: string
    user_id: string
    supervisor_authorized?: boolean
  }
): StoreResult<StockMovement> {
  if (input.type === "OPNAME") {
    if (!input.supervisor_authorized) {
      return { ok: false, error: "Otorisasi PIN Supervisor diperlukan untuk Stock Opname." }
    }
    if (!input.notes.trim()) {
      return { ok: false, error: "Catatan audit opname wajib diisi." }
    }
  }

  const stockIdx = state.branch_stocks.findIndex(
    (bs) => bs.branch_id === input.branch_id && bs.ingredient_id === input.ingredient_id
  )
  const existing = stockIdx >= 0 ? state.branch_stocks[stockIdx] : null
  const currentQty = existing?.current_qty ?? 0

  let delta = 0
  let nextQty = currentQty
  if (input.type === "RESTOCK") {
    if (input.qty <= 0) return { ok: false, error: "Jumlah restok harus lebih dari 0." }
    delta = input.qty
    nextQty = currentQty + input.qty
  } else if (input.type === "MANUAL_OUT" || input.type === "WASTE") {
    if (input.qty <= 0) return { ok: false, error: "Jumlah keluar harus lebih dari 0." }
    delta = -Math.min(currentQty, input.qty)
    nextQty = Math.max(0, currentQty - input.qty)
  } else {
    if (input.qty < 0) return { ok: false, error: "Hasil opname tidak boleh negatif." }
    nextQty = input.qty
    delta = Number((nextQty - currentQty).toFixed(3))
  }

  const nextStocks =
    stockIdx >= 0
      ? state.branch_stocks.map((bs, idx) =>
          idx === stockIdx ? { ...bs, current_qty: nextQty } : bs
        )
      : [
          ...state.branch_stocks,
          {
            branch_id: input.branch_id,
            ingredient_id: input.ingredient_id,
            current_qty: nextQty,
            min_threshold: 0,
          },
        ]

  const movement: StockMovement = {
    id: generateId("sm"),
    branch_id: input.branch_id,
    shift_id: input.shift_id ?? getActiveShift(state, input.branch_id)?.id ?? null,
    ingredient_id: input.ingredient_id,
    type: input.type,
    qty_delta: delta,
    balance_after: nextQty,
    reference_id: null,
    notes:
      input.notes.trim() ||
      (input.type === "RESTOCK"
        ? "Stok masuk pemasok"
        : input.type === "MANUAL_OUT"
        ? "Pemakaian bahan shift"
        : input.type === "WASTE"
        ? "Pencatatan waste bar"
        : "Penyesuaian stock opname"),
    created_by: input.user_id,
    created_at: new Date().toISOString(),
  }

  return {
    ok: true,
    data: movement,
    nextState: {
      ...state,
      branch_stocks: nextStocks,
      stock_movements: [movement, ...state.stock_movements],
    },
  }
}

export function executeStockTransfer(
  state: KalaPOSState,
  input: {
    from_branch_id: string
    to_branch_id: string
    ingredient_id: string
    qty: number
    notes: string
    user_id: string
  }
): StoreResult<StockTransfer> {
  if (input.from_branch_id === input.to_branch_id) {
    return { ok: false, error: "Cabang asal dan tujuan tidak boleh sama." }
  }
  if (input.qty <= 0) {
    return { ok: false, error: "Jumlah transfer harus lebih dari 0." }
  }

  const fromBranch = state.branches.find((b) => b.id === input.from_branch_id)
  const toBranch = state.branches.find((b) => b.id === input.to_branch_id)
  if (!fromBranch || !toBranch) {
    return { ok: false, error: "Cabang asal atau tujuan tidak valid." }
  }

  const fromStock = state.branch_stocks.find(
    (bs) => bs.branch_id === input.from_branch_id && bs.ingredient_id === input.ingredient_id
  )
  if (!fromStock || fromStock.current_qty < input.qty) {
    return { ok: false, error: "Stok cabang asal tidak mencukupi untuk jumlah transfer ini." }
  }

  const nowIso = new Date().toISOString()
  const transferId = generateId("tr")
  const fromBalance = Number((fromStock.current_qty - input.qty).toFixed(3))

  const existingTo = state.branch_stocks.find(
    (bs) => bs.branch_id === input.to_branch_id && bs.ingredient_id === input.ingredient_id
  )
  const toBalance = Number(((existingTo?.current_qty ?? 0) + input.qty).toFixed(3))

  let updatedStocks = state.branch_stocks.map((bs) => {
    if (bs.branch_id === input.from_branch_id && bs.ingredient_id === input.ingredient_id) {
      return { ...bs, current_qty: fromBalance }
    }
    if (bs.branch_id === input.to_branch_id && bs.ingredient_id === input.ingredient_id) {
      return { ...bs, current_qty: toBalance }
    }
    return bs
  })

  if (!existingTo) {
    updatedStocks = [
      ...updatedStocks,
      {
        branch_id: input.to_branch_id,
        ingredient_id: input.ingredient_id,
        current_qty: toBalance,
        min_threshold: fromStock.min_threshold,
      },
    ]
  }

  const transfer: StockTransfer = {
    id: transferId,
    from_branch_id: input.from_branch_id,
    to_branch_id: input.to_branch_id,
    ingredient_id: input.ingredient_id,
    qty: input.qty,
    status: "COMPLETED",
    notes: input.notes.trim() || `Transfer dari ${fromBranch.name} ke ${toBranch.name}`,
    created_by: input.user_id,
    created_at: nowIso,
    completed_at: nowIso,
  }

  const outMovement: StockMovement = {
    id: generateId("sm"),
    branch_id: input.from_branch_id,
    ingredient_id: input.ingredient_id,
    type: "TRANSFER_OUT",
    qty_delta: -input.qty,
    balance_after: fromBalance,
    reference_id: transferId,
    notes: `Transfer keluar ke ${toBranch.name}${input.notes.trim() ? ` · ${input.notes.trim()}` : ""}`,
    created_by: input.user_id,
    created_at: nowIso,
  }

  const inMovement: StockMovement = {
    id: generateId("sm"),
    branch_id: input.to_branch_id,
    ingredient_id: input.ingredient_id,
    type: "TRANSFER_IN",
    qty_delta: input.qty,
    balance_after: toBalance,
    reference_id: transferId,
    notes: `Transfer masuk dari ${fromBranch.name}${input.notes.trim() ? ` · ${input.notes.trim()}` : ""}`,
    created_by: input.user_id,
    created_at: nowIso,
  }

  return {
    ok: true,
    data: transfer,
    nextState: {
      ...state,
      branch_stocks: updatedStocks,
      stock_transfers: [transfer, ...state.stock_transfers],
      stock_movements: [inMovement, outMovement, ...state.stock_movements],
    },
  }
}

export interface BranchUpsertInput {
  name: string
  code: string
  address: string
  phone: string
  tax_rate: number
  service_charge_rate: number
  receipt_footer: string
  status: BranchStatus
}

export function executeCreateBranch(
  state: KalaPOSState,
  input: BranchUpsertInput,
  preset?: { id: string; created_at: string }
): StoreResult<Branch> {
  const code = input.code.trim().toUpperCase()
  if (!input.name.trim() || !code) {
    return { ok: false, error: "Nama dan kode cabang wajib diisi." }
  }
  if (state.branches.some((b) => b.code.toUpperCase() === code && !b.deleted_at)) {
    return { ok: false, error: `Kode cabang ${code} sudah digunakan.` }
  }

  const newBranch: Branch = {
    id: preset?.id || generateId("br"),
    code,
    name: input.name.trim(),
    address: input.address.trim() || "Alamat belum dilengkapi",
    phone: input.phone.trim() || "-",
    tax_rate: Math.max(0, Math.min(100, Math.round(input.tax_rate))),
    service_charge_rate: Math.max(0, Math.min(100, Math.round(input.service_charge_rate))),
    receipt_footer: input.receipt_footer.trim() || "Terima kasih telah singgah di Kafe Kala.",
    status: input.status,
    deleted_at: null,
    created_at: preset?.created_at || new Date().toISOString(),
  }

  // Initialize default branch_products and branch_stocks for the new branch
  const newBranchProducts = state.products.map((p) => ({
    branch_id: newBranch.id,
    product_id: p.id,
    is_available: true,
    custom_price: null,
  }))

  const newBranchStocks = state.ingredients.map((ing) => ({
    branch_id: newBranch.id,
    ingredient_id: ing.id,
    current_qty: 0,
    min_threshold: ing.unit === "pcs" ? 20 : 500,
  }))

  return {
    ok: true,
    data: newBranch,
    nextState: {
      ...state,
      branches: [...state.branches, newBranch],
      branch_products: [...state.branch_products, ...newBranchProducts],
      branch_stocks: [...state.branch_stocks, ...newBranchStocks],
    },
  }
}

export function executeUpdateBranch(
  state: KalaPOSState,
  branchId: string,
  input: BranchUpsertInput
): StoreResult<Branch> {
  const existing = state.branches.find((b) => b.id === branchId)
  if (!existing) return { ok: false, error: "Cabang tidak ditemukan." }
  const code = input.code.trim().toUpperCase()
  if (state.branches.some((b) => b.id !== branchId && b.code.toUpperCase() === code && !b.deleted_at)) {
    return { ok: false, error: `Kode cabang ${code} sudah digunakan cabang lain.` }
  }

  const updated: Branch = {
    ...existing,
    name: input.name.trim() || existing.name,
    code: code || existing.code,
    address: input.address.trim(),
    phone: input.phone.trim(),
    tax_rate: Math.max(0, Math.min(100, Math.round(input.tax_rate))),
    service_charge_rate: Math.max(0, Math.min(100, Math.round(input.service_charge_rate))),
    receipt_footer: input.receipt_footer.trim() || existing.receipt_footer,
    status: input.status,
    deleted_at: input.status === "INACTIVE" ? existing.deleted_at : null,
  }

  return {
    ok: true,
    data: updated,
    nextState: {
      ...state,
      branches: state.branches.map((b) => (b.id === branchId ? updated : b)),
    },
  }
}

/** Soft-delete / archive branch while keeping historical orders intact */
export function executeArchiveBranch(
  state: KalaPOSState,
  branchId: string
): StoreResult<{ archived: boolean; hasHistory: boolean }> {
  const existing = state.branches.find((b) => b.id === branchId)
  if (!existing) return { ok: false, error: "Cabang tidak ditemukan." }

  const hasHistory = state.orders.some((o) => o.branch_id === branchId)
  const nowIso = new Date().toISOString()

  const updatedBranches = state.branches.map((b) =>
    b.id === branchId
      ? { ...b, status: "INACTIVE" as BranchStatus, deleted_at: nowIso }
      : b
  )

  return {
    ok: true,
    data: { archived: true, hasHistory },
    nextState: {
      ...state,
      branches: updatedBranches,
    },
  }
}

/** Permanently remove a branch and clean its branch-scoped product/stock records */
export function executeDeleteBranch(
  state: KalaPOSState,
  branchId: string
): StoreResult<{ deleted: boolean }> {
  const existing = state.branches.find((b) => b.id === branchId)
  if (!existing) return { ok: false, error: "Cabang tidak ditemukan." }

  return {
    ok: true,
    data: { deleted: true },
    nextState: {
      ...state,
      branches: state.branches.filter((b) => b.id !== branchId),
      branch_products: state.branch_products.filter((bp) => bp.branch_id !== branchId),
      branch_stocks: state.branch_stocks.filter((bs) => bs.branch_id !== branchId),
      users: state.users.map((u) =>
        u.branch_id === branchId ? { ...u, branch_id: null, is_active: false } : u
      ),
    },
  }
}

export function executeRestoreBranch(
  state: KalaPOSState,
  branchId: string
): StoreResult<Branch> {
  const existing = state.branches.find((b) => b.id === branchId)
  if (!existing) return { ok: false, error: "Cabang tidak ditemukan." }
  const restored: Branch = { ...existing, status: "ACTIVE", deleted_at: null }
  return {
    ok: true,
    data: restored,
    nextState: {
      ...state,
      branches: state.branches.map((b) => (b.id === branchId ? restored : b)),
    },
  }
}

export function executeFlushOfflineQueue(state: KalaPOSState): KalaPOSState {
  if (state.offline_queue.length === 0) return state
  const pendingKeys = new Set(state.offline_queue.map((q) => q.idempotency_key))
  return {
    ...state,
    orders: state.orders.map((o) =>
      pendingKeys.has(o.idempotency_key) ? { ...o, synced: true } : o
    ),
    offline_queue: [],
  }
}

export interface CreateStaffInput {
  fullName: string
  email: string
  password: string
  role: Exclude<Role, "OWNER">
  branchId: string
  pin: string
}
