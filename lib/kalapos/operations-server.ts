import fs from "node:fs"
import path from "node:path"
import { findActiveBranchServer, listBranchesServer } from "./branches-server"
import type { Json } from "./database.types"
import { generateId, generateIdempotencyKey } from "./format"
import { getInventoryServer } from "./inventory-server"
import { getMenuCatalogServer } from "./menu-server"
import { createSeedState } from "./seed"
import {
  computeOrderTotals,
  type BlindCloseSummary,
  type CheckoutInput,
} from "./store"
import { getSupabaseAdmin } from "./supabase-server"
import type {
  CartDraftItem,
  Order,
  OrderItem,
  OrderModifierSnapshot,
  OrderStatus,
  OrderType,
  PaymentMethod,
  Shift,
  ShiftStatus,
  ShiftStockSnapshot,
  SplitPaymentPart,
} from "./types"

export interface OperationsSnapshot {
  shifts: Shift[]
  orders: Order[]
}

const DATA_DIR = path.join(process.cwd(), ".kala-data")
const OPS_FILE = path.join(DATA_DIR, "kala-operations.json")

interface GlobalOpsStore {
  cache: OperationsSnapshot | null
}

const g = globalThis as unknown as { __kalaOpsStore?: GlobalOpsStore }
if (!g.__kalaOpsStore) {
  g.__kalaOpsStore = { cache: null }
}

function initialOpsSnapshot(): OperationsSnapshot {
  const seed = createSeedState()
  return {
    shifts: seed.shifts,
    orders: seed.orders,
  }
}

function readOpsFromDisk(): OperationsSnapshot {
  if (g.__kalaOpsStore!.cache) {
    return g.__kalaOpsStore!.cache
  }
  try {
    if (fs.existsSync(OPS_FILE)) {
      const raw = fs.readFileSync(OPS_FILE, "utf8")
      const parsed = JSON.parse(raw) as Partial<OperationsSnapshot>
      if (parsed && Array.isArray(parsed.shifts) && Array.isArray(parsed.orders)) {
        const loaded: OperationsSnapshot = {
          shifts: parsed.shifts,
          orders: parsed.orders,
        }
        g.__kalaOpsStore!.cache = loaded
        return loaded
      }
    }
  } catch {
    /* fallback to seed */
  }
  const initial = initialOpsSnapshot()
  g.__kalaOpsStore!.cache = initial
  return initial
}

function writeOpsToDisk(snapshot: OperationsSnapshot): void {
  g.__kalaOpsStore!.cache = snapshot
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true })
    }
    fs.writeFileSync(OPS_FILE, JSON.stringify(snapshot, null, 2), "utf8")
  } catch {
    /* read-only fallback */
  }
}

function parseStockSnapshots(val: Json | null | undefined): ShiftStockSnapshot[] | undefined {
  if (!Array.isArray(val)) return undefined
  return val as unknown as ShiftStockSnapshot[]
}

function parseModifiers(val: Json | null | undefined): OrderModifierSnapshot[] {
  if (!Array.isArray(val)) return []
  return val as unknown as OrderModifierSnapshot[]
}

function parseSplitPayments(val: Json | null | undefined): SplitPaymentPart[] | null {
  if (!Array.isArray(val) || val.length === 0) return null
  return val as unknown as SplitPaymentPart[]
}

export async function getOperationsSnapshotServer(
  branchId: string | null
): Promise<OperationsSnapshot> {
  const supabase = getSupabaseAdmin()
  if (supabase) {
    let shiftQuery = supabase
      .from("shifts")
      .select("*")
      .order("opened_at", { ascending: false })
      .limit(250)

    let orderQuery = supabase
      .from("orders")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(500)

    if (branchId) {
      shiftQuery = shiftQuery.eq("branch_id", branchId)
      orderQuery = orderQuery.eq("branch_id", branchId)
    }

    const [shiftRes, orderRes] = await Promise.all([shiftQuery, orderQuery])
    if (!shiftRes.error && !orderRes.error) {
      const orderRows = orderRes.data ?? []
      const orderIds = orderRows.map((o) => o.id)
      const itemsByOrder = new Map<string, OrderItem[]>()

      if (orderIds.length > 0) {
        const { data: itemRows } = await supabase
          .from("order_items")
          .select("*")
          .in("order_id", orderIds)

        for (const it of itemRows ?? []) {
          const list = itemsByOrder.get(it.order_id) ?? []
          list.push({
            id: it.id,
            order_id: it.order_id,
            product_id: it.product_id,
            product_name_snapshot: it.product_name_snapshot,
            unit_price_snapshot: Number(it.unit_price_snapshot),
            unit_cogs_snapshot: Number(it.unit_cogs_snapshot),
            modifiers_snapshot: parseModifiers(it.modifiers_snapshot),
            qty: Number(it.qty),
            subtotal: Number(it.subtotal),
            barista_notes: it.barista_notes,
          })
          itemsByOrder.set(it.order_id, list)
        }
      }

      const shifts: Shift[] = (shiftRes.data ?? []).map((s) => ({
        id: s.id,
        branch_id: s.branch_id,
        user_id: s.user_id,
        opening_cash: Number(s.opening_cash),
        expected_cash: Number(s.expected_cash),
        actual_cash: s.actual_cash === null ? null : Number(s.actual_cash),
        status: s.status as ShiftStatus,
        notes: s.notes,
        opened_at: s.opened_at,
        closed_at: s.closed_at,
        opening_stocks: parseStockSnapshots(s.opening_stocks),
        closing_stocks: parseStockSnapshots(s.closing_stocks),
      }))

      const orders: Order[] = orderRows.map((o) => ({
        id: o.id,
        branch_id: o.branch_id,
        shift_id: o.shift_id,
        order_number: o.order_number,
        queue_number: o.queue_number,
        customer_name: o.customer_name,
        order_type: o.order_type as OrderType,
        table_number: o.table_number,
        status: o.status as OrderStatus,
        subtotal: Number(o.subtotal),
        tax_amount: Number(o.tax_amount),
        service_charge: Number(o.service_charge),
        discount: Number(o.discount),
        discount_reason: o.discount_reason,
        total: Number(o.total),
        payment_method: o.payment_method as PaymentMethod | null,
        tendered_amount: o.tendered_amount === null ? null : Number(o.tendered_amount),
        change_amount: o.change_amount === null ? null : Number(o.change_amount),
        split_payments: parseSplitPayments(o.split_payments),
        void_reason: o.void_reason,
        voided_by: o.voided_by,
        cashier_id: o.cashier_id,
        idempotency_key: o.idempotency_key,
        synced: true,
        created_at: o.created_at,
        completed_at: o.completed_at,
        items: itemsByOrder.get(o.id) ?? [],
      }))

      return { shifts, orders }
    }
  }

  const ops = readOpsFromDisk()
  if (!branchId) return ops
  return {
    shifts: ops.shifts.filter((s) => s.branch_id === branchId),
    orders: ops.orders.filter((o) => o.branch_id === branchId),
  }
}

async function captureServerBranchStockSnapshot(branchId: string): Promise<ShiftStockSnapshot[]> {
  const inv = await getInventoryServer()
  const stockByIng = new Map(
    inv.branch_stocks
      .filter((bs) => bs.branch_id === branchId)
      .map((bs) => [bs.ingredient_id, bs.current_qty])
  )
  return inv.ingredients.map((ing) => ({
    ingredient_id: ing.id,
    ingredient_name: ing.name,
    sku: ing.sku,
    unit: ing.unit,
    qty: stockByIng.get(ing.id) ?? 0,
  }))
}

export async function openShiftServer(input: {
  branchId: string
  userId: string
  openingCash: number
  notes?: string
}): Promise<{ ok: true; shift: Shift; shifts: Shift[] } | { ok: false; error: string }> {
  const branch = await findActiveBranchServer(input.branchId)
  if (!branch) {
    return { ok: false, error: "Cabang tidak ditemukan atau sedang nonaktif." }
  }

  const cash = Math.max(0, Math.round(Number(input.openingCash) || 0))
  const openingStocks = await captureServerBranchStockSnapshot(branch.id)
  const shift: Shift = {
    id: generateId("sh"),
    branch_id: branch.id,
    user_id: input.userId,
    opening_cash: cash,
    expected_cash: cash,
    actual_cash: null,
    status: "OPEN",
    notes: (input.notes ?? "").trim(),
    opened_at: new Date().toISOString(),
    closed_at: null,
    opening_stocks: openingStocks,
  }

  const supabase = getSupabaseAdmin()
  if (supabase) {
    const { data: existingOpen } = await supabase
      .from("shifts")
      .select("id")
      .eq("branch_id", branch.id)
      .eq("status", "OPEN")
      .maybeSingle()

    if (existingOpen) {
      return { ok: false, error: "Sudah ada shift yang sedang aktif di cabang ini." }
    }

    const { error } = await supabase.from("shifts").insert({
      id: shift.id,
      branch_id: shift.branch_id,
      user_id: shift.user_id,
      opening_cash: shift.opening_cash,
      expected_cash: shift.expected_cash,
      actual_cash: null,
      status: "OPEN",
      notes: shift.notes,
      opened_at: shift.opened_at,
      closed_at: null,
      opening_stocks: openingStocks as unknown as Json,
      closing_stocks: null,
    })

    if (error) {
      if (error.code === "23505") {
        return { ok: false, error: "Sudah ada shift yang sedang aktif di cabang ini." }
      }
      return { ok: false, error: `Gagal membuka shift di Supabase: ${error.message}` }
    }

    const ops = await getOperationsSnapshotServer(null)
    return { ok: true, shift, shifts: ops.shifts }
  }

  const ops = readOpsFromDisk()
  if (ops.shifts.some((s) => s.branch_id === branch.id && s.status === "OPEN")) {
    return { ok: false, error: "Sudah ada shift yang sedang aktif di cabang ini." }
  }
  const nextShifts = [shift, ...ops.shifts]
  writeOpsToDisk({ ...ops, shifts: nextShifts })
  return { ok: true, shift, shifts: nextShifts }
}

export async function closeShiftBlindServer(input: {
  shiftId: string
  actualCash: number
  notes?: string
  actor: { role: string; branchId: string | null }
}): Promise<{ ok: true; summary: BlindCloseSummary; shifts: Shift[] } | { ok: false; error: string }> {
  const counted = Math.max(0, Math.round(Number(input.actualCash) || 0))
  const closedAt = new Date().toISOString()

  const supabase = getSupabaseAdmin()
  if (supabase) {
    const { data: existing, error: fetchErr } = await supabase
      .from("shifts")
      .select("*")
      .eq("id", input.shiftId)
      .eq("status", "OPEN")
      .maybeSingle()

    if (fetchErr || !existing) {
      return { ok: false, error: "Shift aktif tidak ditemukan." }
    }
    if (input.actor.role !== "OWNER" && input.actor.branchId !== existing.branch_id) {
      return { ok: false, error: "Anda tidak memiliki akses untuk menutup shift cabang lain." }
    }

    const closingStocks = await captureServerBranchStockSnapshot(existing.branch_id)
    const nextNotes = (input.notes ?? "").trim() || existing.notes

    const { error: updErr } = await supabase
      .from("shifts")
      .update({
        actual_cash: counted,
        status: "CLOSED",
        notes: nextNotes,
        closed_at: closedAt,
        closing_stocks: closingStocks as unknown as Json,
      })
      .eq("id", existing.id)

    if (updErr) {
      return { ok: false, error: `Gagal menutup shift di Supabase: ${updErr.message}` }
    }

    const closedShift: Shift = {
      id: existing.id,
      branch_id: existing.branch_id,
      user_id: existing.user_id,
      opening_cash: Number(existing.opening_cash),
      expected_cash: Number(existing.expected_cash),
      actual_cash: counted,
      status: "CLOSED",
      notes: nextNotes,
      opened_at: existing.opened_at,
      closed_at: closedAt,
      opening_stocks: parseStockSnapshots(existing.opening_stocks),
      closing_stocks: closingStocks,
    }

    const ops = await getOperationsSnapshotServer(null)
    return {
      ok: true,
      summary: {
        shift: closedShift,
        expected_cash: closedShift.expected_cash,
        actual_cash: counted,
        variance_cash: counted - closedShift.expected_cash,
      },
      shifts: ops.shifts,
    }
  }

  const ops = readOpsFromDisk()
  const existing = ops.shifts.find((s) => s.id === input.shiftId && s.status === "OPEN")
  if (!existing) return { ok: false, error: "Shift aktif tidak ditemukan." }
  if (input.actor.role !== "OWNER" && input.actor.branchId !== existing.branch_id) {
    return { ok: false, error: "Anda tidak memiliki akses untuk menutup shift cabang lain." }
  }

  const closingStocks = await captureServerBranchStockSnapshot(existing.branch_id)
  const closedShift: Shift = {
    ...existing,
    actual_cash: counted,
    status: "CLOSED",
    notes: (input.notes ?? "").trim() || existing.notes,
    closed_at: closedAt,
    closing_stocks: closingStocks,
  }
  const nextShifts = ops.shifts.map((s) => (s.id === existing.id ? closedShift : s))
  writeOpsToDisk({ ...ops, shifts: nextShifts })
  return {
    ok: true,
    summary: {
      shift: closedShift,
      expected_cash: closedShift.expected_cash,
      actual_cash: counted,
      variance_cash: counted - closedShift.expected_cash,
    },
    shifts: nextShifts,
  }
}

async function computeUnitCogsFromCatalog(item: CartDraftItem): Promise<number> {
  const [catalog, inv] = await Promise.all([getMenuCatalogServer(), getInventoryServer()])
  const ingMap = new Map(inv.ingredients.map((i) => [i.id, i]))
  let cogs = 0
  for (const r of catalog.product_recipes) {
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

/**
 * Atomic checkout on server (Supabase RPC `process_pos_checkout` when configured).
 * IMPORTANT: Recipes compute HPP (`unit_cogs_snapshot`) and theoretical shift usage ONLY.
 * Physical branch stocks are intentionally NOT auto-deducted!
 */
export async function checkoutOrderServer(
  input: CheckoutInput
): Promise<{ ok: true; order: Order; operations: OperationsSnapshot } | { ok: false; error: string }> {
  const branch = await findActiveBranchServer(input.branch_id)
  if (!branch) {
    return { ok: false, error: "Cabang tidak ditemukan atau sedang nonaktif." }
  }
  if (!Array.isArray(input.items) || input.items.length === 0) {
    return { ok: false, error: "Keranjang pesanan masih kosong." }
  }

  const idempotencyKey = input.idempotency_key || generateIdempotencyKey(branch.code)
  const orderId = generateId("ord")

  const supabase = getSupabaseAdmin()
  if (supabase) {
    const rpcItems = input.items.map((it) => ({
      product_id: it.product_id,
      product_name: it.product_name,
      qty: it.qty,
      modifiers: it.modifiers.map((m) => ({ option_id: m.option_id })),
      barista_notes: it.barista_notes ?? "",
    }))

    const { data, error } = await supabase.rpc("process_pos_checkout", {
      p_order_id: orderId,
      p_branch_id: branch.id,
      p_cashier_id: input.cashier_id,
      p_customer_name: input.customer_name || "Pelanggan",
      p_order_type: input.order_type,
      p_table_number: input.order_type === "DINE_IN" ? input.table_number ?? null : null,
      p_payment_method: input.payment_method,
      p_tendered_amount: input.tendered_amount ?? null,
      p_discount: Math.max(0, Math.round(Number(input.discount) || 0)),
      p_discount_reason: input.discount_reason ?? null,
      p_split_payments:
        input.split_payments && input.split_payments.length > 0
          ? (input.split_payments as unknown as Json)
          : null,
      p_held_order_id: input.held_order_id ?? null,
      p_idempotency_key: idempotencyKey,
      p_items: rpcItems as unknown as Json,
    })

    if (error) {
      return { ok: false, error: error.message }
    }

    const resObj = data as Record<string, unknown>
    const resolvedOrderId = String(resObj.order_id ?? orderId)
    const operations = await getOperationsSnapshotServer(null)
    const created = operations.orders.find((o) => o.id === resolvedOrderId)
    if (!created) {
      return { ok: false, error: "Pesanan berhasil diproses tetapi gagal dimuat ulang." }
    }
    return { ok: true, order: created, operations }
  }

  // Local `.kala-data` fallback
  const ops = readOpsFromDisk()
  const existing = ops.orders.find((o) => o.idempotency_key === idempotencyKey)
  if (existing) {
    return { ok: true, order: existing, operations: ops }
  }

  const openShift = ops.shifts.find((s) => s.branch_id === branch.id && s.status === "OPEN")
  if (!openShift) {
    return {
      ok: false,
      error: "Shift belum dibuka. Buka shift terlebih dahulu sebelum memproses transaksi.",
    }
  }

  const { subtotal, discount, serviceCharge, taxAmount, total } = computeOrderTotals(
    input.items,
    branch,
    input.discount
  )

  if (
    input.payment_method === "CASH" &&
    (!input.split_payments || input.split_payments.length === 0)
  ) {
    const tendered = Math.round(input.tendered_amount ?? 0)
    if (tendered < total) {
      return { ok: false, error: "Nominal tunai diterima kurang dari total pembayaran." }
    }
  }

  const branchOrders = ops.orders.filter((o) => o.branch_id === branch.id && o.status !== "HOLD")
  const todayStr = new Date().toISOString().slice(0, 10)
  const todayBranchOrders = branchOrders.filter((o) => o.created_at.slice(0, 10) === todayStr)
  const codePrefix = branch.code.replace(/[^A-Z0-9]/gi, "").toUpperCase()
  const orderNumber = `${codePrefix}-${String(branchOrders.length + 1).padStart(4, "0")}`
  const queueNumber = `A-${String(todayBranchOrders.length + 1).padStart(3, "0")}`
  const nowIso = new Date().toISOString()

  const orderItems: OrderItem[] = await Promise.all(
    input.items.map(async (item, idx) => {
      const modDelta = item.modifiers.reduce((s, m) => s + m.price_delta, 0)
      const unitPrice = Math.round(item.base_price + modDelta)
      const unitCogs = await computeUnitCogsFromCatalog(item)
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
  )

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
    table_number: input.order_type === "DINE_IN" ? input.table_number?.trim() || null : null,
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
    split_payments:
      input.split_payments && input.split_payments.length > 0 ? input.split_payments : null,
    void_reason: null,
    voided_by: null,
    cashier_id: input.cashier_id,
    idempotency_key: idempotencyKey,
    synced: true,
    created_at: nowIso,
    completed_at: null,
    items: orderItems,
  }

  const updatedShifts = ops.shifts.map((s) =>
    s.id === openShift.id ? { ...s, expected_cash: s.expected_cash + cashAdded } : s
  )
  const remainingOrders = input.held_order_id
    ? ops.orders.filter((o) => o.id !== input.held_order_id)
    : ops.orders

  const nextOps: OperationsSnapshot = {
    shifts: updatedShifts,
    orders: [newOrder, ...remainingOrders],
  }
  writeOpsToDisk(nextOps)
  return { ok: true, order: newOrder, operations: nextOps }
}

export async function holdOrderServer(input: {
  branch_id: string
  cashier_id: string
  customer_name: string
  order_type: OrderType
  table_number: string | null
  discount: number
  discount_reason: string | null
  items: CartDraftItem[]
  existing_hold_id?: string | null
}): Promise<{ ok: true; order: Order; operations: OperationsSnapshot } | { ok: false; error: string }> {
  const branches = await listBranchesServer()
  const branch = branches.find((b) => b.id === input.branch_id && !b.deleted_at)
  if (!branch) return { ok: false, error: "Cabang tidak ditemukan." }
  if (!Array.isArray(input.items) || input.items.length === 0) {
    return { ok: false, error: "Tidak ada item untuk ditahan." }
  }

  const { subtotal, discount, serviceCharge, taxAmount, total } = computeOrderTotals(
    input.items,
    branch,
    input.discount
  )

  const ops = await getOperationsSnapshotServer(branch.id)
  const heldCount = ops.orders.filter((o) => o.status === "HOLD").length
  const orderId = input.existing_hold_id || generateId("hold")
  const codePrefix = branch.code.replace(/[^A-Z0-9]/gi, "").toUpperCase()
  const nowIso = new Date().toISOString()

  const orderItems: OrderItem[] = await Promise.all(
    input.items.map(async (item, idx) => {
      const modDelta = item.modifiers.reduce((s, m) => s + m.price_delta, 0)
      const unitPrice = Math.round(item.base_price + modDelta)
      const unitCogs = await computeUnitCogsFromCatalog(item)
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
  )

  const openShift = ops.shifts.find((s) => s.status === "OPEN")
  const existingHold = input.existing_hold_id
    ? ops.orders.find((o) => o.id === input.existing_hold_id)
    : undefined

  const heldOrder: Order = {
    id: orderId,
    branch_id: branch.id,
    shift_id: openShift?.id ?? null,
    order_number:
      existingHold?.order_number || `${codePrefix}-HOLD-${String(heldCount + 1).padStart(3, "0")}`,
    queue_number: existingHold?.queue_number || `H-${String(heldCount + 1).padStart(3, "0")}`,
    customer_name:
      input.customer_name.trim() ||
      (input.table_number ? `Meja ${input.table_number}` : "Open Bill"),
    order_type: input.order_type,
    table_number: input.order_type === "DINE_IN" ? input.table_number?.trim() || null : null,
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
    idempotency_key: existingHold?.idempotency_key || generateIdempotencyKey(branch.code),
    synced: true,
    created_at: nowIso,
    completed_at: null,
    items: orderItems,
  }

  const supabase = getSupabaseAdmin()
  if (supabase) {
    const { error: ordErr } = await supabase.from("orders").upsert(
      {
        id: heldOrder.id,
        branch_id: heldOrder.branch_id,
        shift_id: heldOrder.shift_id,
        order_number: heldOrder.order_number,
        queue_number: heldOrder.queue_number,
        customer_name: heldOrder.customer_name,
        order_type: heldOrder.order_type,
        table_number: heldOrder.table_number,
        status: "HOLD",
        subtotal: heldOrder.subtotal,
        tax_amount: heldOrder.tax_amount,
        service_charge: heldOrder.service_charge,
        discount: heldOrder.discount,
        discount_reason: heldOrder.discount_reason,
        total: heldOrder.total,
        payment_method: null,
        tendered_amount: null,
        change_amount: null,
        split_payments: null,
        void_reason: null,
        voided_by: null,
        cashier_id: heldOrder.cashier_id,
        idempotency_key: heldOrder.idempotency_key,
        created_at: heldOrder.created_at,
        completed_at: null,
      },
      { onConflict: "id" }
    )

    if (ordErr) {
      return { ok: false, error: `Gagal menyimpan Open Bill ke Supabase: ${ordErr.message}` }
    }

    await supabase.from("order_items").delete().eq("order_id", heldOrder.id)
    if (orderItems.length > 0) {
      await supabase.from("order_items").insert(
        orderItems.map((it) => ({
          id: it.id,
          order_id: it.order_id,
          product_id: it.product_id,
          product_name_snapshot: it.product_name_snapshot,
          unit_price_snapshot: it.unit_price_snapshot,
          unit_cogs_snapshot: it.unit_cogs_snapshot,
          modifiers_snapshot: it.modifiers_snapshot as unknown as Json,
          qty: it.qty,
          subtotal: it.subtotal,
          barista_notes: it.barista_notes,
        }))
      )
    }

    return { ok: true, order: heldOrder, operations: await getOperationsSnapshotServer(null) }
  }

  const allOps = readOpsFromDisk()
  const filtered = allOps.orders.filter((o) => o.id !== orderId)
  const nextOps: OperationsSnapshot = { ...allOps, orders: [heldOrder, ...filtered] }
  writeOpsToDisk(nextOps)
  return { ok: true, order: heldOrder, operations: nextOps }
}

export async function advanceOrderStatusServer(input: {
  orderId: string
  nextStatus: OrderStatus
  actor: { role: string; branchId: string | null }
}): Promise<{ ok: true; order: Order; operations: OperationsSnapshot } | { ok: false; error: string }> {
  const allowed: OrderStatus[] = ["QUEUED", "PREPARING", "READY", "COMPLETED"]
  if (!allowed.includes(input.nextStatus)) {
    return { ok: false, error: "Status antrean tidak valid." }
  }

  const supabase = getSupabaseAdmin()
  if (supabase) {
    const { data: existing, error: fetchErr } = await supabase
      .from("orders")
      .select("*")
      .eq("id", input.orderId)
      .maybeSingle()

    if (fetchErr || !existing) return { ok: false, error: "Pesanan tidak ditemukan." }
    if (input.actor.role !== "OWNER" && input.actor.branchId !== existing.branch_id) {
      return { ok: false, error: "Anda tidak memiliki akses pada pesanan cabang lain." }
    }

    const completedAt =
      input.nextStatus === "COMPLETED" ? new Date().toISOString() : existing.completed_at

    const { error: updErr } = await supabase
      .from("orders")
      .update({ status: input.nextStatus, completed_at: completedAt })
      .eq("id", existing.id)

    if (updErr) {
      return { ok: false, error: `Gagal memperbarui status pesanan di Supabase: ${updErr.message}` }
    }

    const operations = await getOperationsSnapshotServer(null)
    const updated = operations.orders.find((o) => o.id === existing.id)
    if (!updated) return { ok: false, error: "Pesanan tidak ditemukan setelah pembaruan." }
    return { ok: true, order: updated, operations }
  }

  const ops = readOpsFromDisk()
  const target = ops.orders.find((o) => o.id === input.orderId)
  if (!target) return { ok: false, error: "Pesanan tidak ditemukan." }
  if (input.actor.role !== "OWNER" && input.actor.branchId !== target.branch_id) {
    return { ok: false, error: "Anda tidak memiliki akses pada pesanan cabang lain." }
  }

  const updated: Order = {
    ...target,
    status: input.nextStatus,
    completed_at: input.nextStatus === "COMPLETED" ? new Date().toISOString() : target.completed_at,
  }
  const nextOps: OperationsSnapshot = {
    ...ops,
    orders: ops.orders.map((o) => (o.id === target.id ? updated : o)),
  }
  writeOpsToDisk(nextOps)
  return { ok: true, order: updated, operations: nextOps }
}

export async function voidOrderServer(input: {
  orderId: string
  reason: string
  supervisorId: string
  actor: { role: string; branchId: string | null }
}): Promise<{ ok: true; order: Order; operations: OperationsSnapshot } | { ok: false; error: string }> {
  const cleanReason = input.reason.trim()
  if (!input.supervisorId) return { ok: false, error: "Otorisasi Supervisor diperlukan." }
  if (!cleanReason) return { ok: false, error: "Alasan pembatalan (VOID) wajib diisi." }

  const supabase = getSupabaseAdmin()
  if (supabase) {
    const { data: target, error: fetchErr } = await supabase
      .from("orders")
      .select("*")
      .eq("id", input.orderId)
      .maybeSingle()

    if (fetchErr || !target) return { ok: false, error: "Pesanan tidak ditemukan." }
    if (input.actor.role !== "OWNER" && input.actor.branchId !== target.branch_id) {
      return { ok: false, error: "Anda tidak memiliki akses untuk membatalkan pesanan cabang lain." }
    }
    if (target.status === "VOID") {
      return { ok: false, error: "Pesanan sudah dibatalkan." }
    }

    const { error: updErr } = await supabase
      .from("orders")
      .update({
        status: "VOID",
        void_reason: cleanReason,
        voided_by: input.supervisorId,
      })
      .eq("id", target.id)

    if (updErr) {
      return { ok: false, error: `Gagal membatalkan pesanan di Supabase: ${updErr.message}` }
    }

    // Reverse expected_cash on OPEN shift if paid in cash
    if (target.shift_id && target.status !== "HOLD") {
      const splits = parseSplitPayments(target.split_payments)
      const cashPortion =
        splits && splits.length > 0
          ? splits.filter((p) => p.method === "CASH").reduce((s, p) => s + p.amount, 0)
          : target.payment_method === "CASH"
          ? Number(target.total)
          : 0

      if (cashPortion > 0) {
        const { data: shiftRow } = await supabase
          .from("shifts")
          .select("id, expected_cash, status")
          .eq("id", target.shift_id)
          .eq("status", "OPEN")
          .maybeSingle()

        if (shiftRow) {
          await supabase
            .from("shifts")
            .update({ expected_cash: Math.max(0, Number(shiftRow.expected_cash) - cashPortion) })
            .eq("id", shiftRow.id)
        }
      }
    }

    const operations = await getOperationsSnapshotServer(null)
    const updated = operations.orders.find((o) => o.id === target.id)
    if (!updated) return { ok: false, error: "Pesanan tidak ditemukan setelah pembatalan." }
    return { ok: true, order: updated, operations }
  }

  const ops = readOpsFromDisk()
  const target = ops.orders.find((o) => o.id === input.orderId)
  if (!target) return { ok: false, error: "Pesanan tidak ditemukan." }
  if (input.actor.role !== "OWNER" && input.actor.branchId !== target.branch_id) {
    return { ok: false, error: "Anda tidak memiliki akses untuk membatalkan pesanan cabang lain." }
  }
  if (target.status === "VOID") return { ok: false, error: "Pesanan sudah dibatalkan." }

  const updatedOrder: Order = {
    ...target,
    status: "VOID",
    void_reason: cleanReason,
    voided_by: input.supervisorId,
  }

  let updatedShifts = ops.shifts
  if (target.shift_id && target.status !== "HOLD") {
    const cashPortion =
      target.split_payments && target.split_payments.length > 0
        ? target.split_payments.filter((p) => p.method === "CASH").reduce((s, p) => s + p.amount, 0)
        : target.payment_method === "CASH"
        ? target.total
        : 0
    if (cashPortion > 0) {
      updatedShifts = ops.shifts.map((s) =>
        s.id === target.shift_id && s.status === "OPEN"
          ? { ...s, expected_cash: Math.max(0, s.expected_cash - cashPortion) }
          : s
      )
    }
  }

  const nextOps: OperationsSnapshot = {
    shifts: updatedShifts,
    orders: ops.orders.map((o) => (o.id === target.id ? updatedOrder : o)),
  }
  writeOpsToDisk(nextOps)
  return { ok: true, order: updatedOrder, operations: nextOps }
}
