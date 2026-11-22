import { computeStockHealth } from "./format"
import type { Branch, KalaPOSState, Order, Shift } from "./types"

export type AnalyticsTimeframe = "TODAY" | "7D" | "30D"

export interface OwnerKpis {
  revenue: number
  netSales: number // subtotal - discount (excluding tax for accurate COGS/Food Cost %)
  transactions: number
  averageOrderValue: number
  cogs: number
  grossProfit: number
  grossMarginPct: number
  foodCostPct: number
  revenueDeltaPct: number
}

export interface BranchPerformanceRow {
  branch: Branch
  revenue: number
  netSales: number
  cogs: number
  grossProfit: number
  foodCostPct: number
  transactions: number
  aov: number
  contributionPct: number
  lowStockCount: number
  criticalStockCount: number
}

export interface TopProductRow {
  productId: string
  name: string
  mark: string
  tone: string
  qty: number
  revenue: number
  cogs: number
}

export interface RevenueChartPoint {
  label: string
  dateKey: string
  total: number
  [branchKey: string]: string | number
}

function isPaidOrder(order: Order): boolean {
  return order.status !== "HOLD" && order.status !== "VOID"
}

function startOfDayOffset(daysAgo: number): Date {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  d.setDate(d.getDate() - daysAgo)
  return d
}

export function filterOrdersByTimeframe(
  orders: Order[],
  timeframe: AnalyticsTimeframe,
  branchFilterId: string | "ALL"
): { current: Order[]; previous: Order[] } {
  const days = timeframe === "TODAY" ? 1 : timeframe === "7D" ? 7 : 30
  const currentStart = startOfDayOffset(days - 1).getTime()
  const prevStart = startOfDayOffset(days * 2 - 1).getTime()

  const paid = orders.filter(
    (o) => isPaidOrder(o) && (branchFilterId === "ALL" || o.branch_id === branchFilterId)
  )

  const current: Order[] = []
  const previous: Order[] = []
  for (const o of paid) {
    const t = new Date(o.created_at).getTime()
    if (t >= currentStart) current.push(o)
    else if (t >= prevStart && t < currentStart) previous.push(o)
  }
  return { current, previous }
}

export function computeOrderCogs(order: Order): number {
  return order.items.reduce((sum, item) => sum + item.unit_cogs_snapshot * item.qty, 0)
}

export function computeOwnerKpis(
  state: KalaPOSState,
  timeframe: AnalyticsTimeframe,
  branchFilterId: string | "ALL"
): OwnerKpis {
  const { current, previous } = filterOrdersByTimeframe(state.orders, timeframe, branchFilterId)

  const revenue = current.reduce((s, o) => s + o.total, 0)
  const netSales = current.reduce((s, o) => s + Math.max(0, o.subtotal - o.discount), 0)
  const cogs = current.reduce((s, o) => s + computeOrderCogs(o), 0)
  const grossProfit = Math.max(0, netSales - cogs)
  const transactions = current.length
  const averageOrderValue = transactions > 0 ? Math.round(revenue / transactions) : 0
  const foodCostPct = netSales > 0 ? Number(((cogs / netSales) * 100).toFixed(1)) : 0
  const grossMarginPct = netSales > 0 ? Number(((grossProfit / netSales) * 100).toFixed(1)) : 0

  const prevRevenue = previous.reduce((s, o) => s + o.total, 0)
  const revenueDeltaPct =
    prevRevenue > 0 ? Number((((revenue - prevRevenue) / prevRevenue) * 100).toFixed(1)) : 0

  return {
    revenue,
    netSales,
    transactions,
    averageOrderValue,
    cogs,
    grossProfit,
    grossMarginPct,
    foodCostPct,
    revenueDeltaPct,
  }
}

export function computeBranchLeaderboard(
  state: KalaPOSState,
  timeframe: AnalyticsTimeframe
): BranchPerformanceRow[] {
  const visibleBranches = state.branches.filter((b) => !b.deleted_at)
  const { current } = filterOrdersByTimeframe(state.orders, timeframe, "ALL")
  const totalRevenueAll = current.reduce((s, o) => s + o.total, 0)

  return visibleBranches
    .map((branch) => {
      const bOrders = current.filter((o) => o.branch_id === branch.id)
      const revenue = bOrders.reduce((s, o) => s + o.total, 0)
      const netSales = bOrders.reduce((s, o) => s + Math.max(0, o.subtotal - o.discount), 0)
      const cogs = bOrders.reduce((s, o) => s + computeOrderCogs(o), 0)
      const grossProfit = Math.max(0, netSales - cogs)
      const transactions = bOrders.length
      const aov = transactions > 0 ? Math.round(revenue / transactions) : 0
      const foodCostPct = netSales > 0 ? Number(((cogs / netSales) * 100).toFixed(1)) : 0
      const contributionPct = totalRevenueAll > 0 ? Math.round((revenue / totalRevenueAll) * 100) : 0

      const stocks = state.branch_stocks.filter((bs) => bs.branch_id === branch.id)
      let lowStockCount = 0
      let criticalStockCount = 0
      for (const s of stocks) {
        const h = computeStockHealth(s.current_qty, s.min_threshold)
        if (h === "Kritis") criticalStockCount++
        else if (h === "Menipis") lowStockCount++
      }

      return {
        branch,
        revenue,
        netSales,
        cogs,
        grossProfit,
        foodCostPct,
        transactions,
        aov,
        contributionPct,
        lowStockCount,
        criticalStockCount,
      }
    })
    .sort((a, b) => b.revenue - a.revenue)
}

export function computeTopProducts(
  state: KalaPOSState,
  timeframe: AnalyticsTimeframe,
  branchFilterId: string | "ALL",
  limit = 5
): TopProductRow[] {
  const { current } = filterOrdersByTimeframe(state.orders, timeframe, branchFilterId)
  const productLookup = new Map(state.products.map((p) => [p.id, p]))
  const map = new Map<string, TopProductRow>()

  for (const order of current) {
    for (const item of order.items) {
      if (!item.product_id) continue
      const key = item.product_id
      const prod = productLookup.get(item.product_id)
      const existing = map.get(key)
      if (existing) {
        existing.qty += item.qty
        existing.revenue += item.subtotal
        existing.cogs += item.unit_cogs_snapshot * item.qty
      } else {
        map.set(key, {
          productId: key,
          name: item.product_name_snapshot,
          mark: prod?.mark ?? item.product_name_snapshot.slice(0, 2).toUpperCase(),
          tone: prod?.tone ?? "sand",
          qty: item.qty,
          revenue: item.subtotal,
          cogs: item.unit_cogs_snapshot * item.qty,
        })
      }
    }
  }

  return Array.from(map.values())
    .sort((a, b) => b.qty - a.qty)
    .slice(0, limit)
}

export interface CashflowEntry {
  id: string
  orderNumber: string
  label: string
  branchName: string
  paymentMethod: string
  inflow: number
  outflowCogs: number
  grossProfit: number
  createdAt: string
}

export function computeCashflowLedger(
  state: KalaPOSState,
  timeframe: AnalyticsTimeframe,
  branchFilterId: string | "ALL",
  limit = 10
): CashflowEntry[] {
  const { current } = filterOrdersByTimeframe(state.orders, timeframe, branchFilterId)
  const branchMap = new Map(state.branches.map((b) => [b.id, b.name]))

  return [...current]
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .slice(0, limit)
    .map((o) => {
      const cogs = computeOrderCogs(o)
      const netSales = Math.max(0, o.subtotal - o.discount)
      return {
        id: o.id,
        orderNumber: o.order_number,
        label: o.customer_name || o.items[0]?.product_name_snapshot || "Transaksi Kasir",
        branchName: branchMap.get(o.branch_id) ?? "Riwayat Kafe Kala",
        paymentMethod: o.payment_method ?? "QRIS",
        inflow: o.total,
        outflowCogs: cogs,
        grossProfit: Math.max(0, netSales - cogs),
        createdAt: o.created_at,
      }
    })
}

export function computeRevenueSeries(
  state: KalaPOSState,
  timeframe: AnalyticsTimeframe,
  branchFilterId: string | "ALL"
): { series: RevenueChartPoint[]; branches: Branch[] } {
  const activeBranches = state.branches.filter((b) => !b.deleted_at)
  const paidOrders = state.orders.filter(
    (o) => isPaidOrder(o) && (branchFilterId === "ALL" || o.branch_id === branchFilterId)
  )

  if (timeframe === "TODAY") {
    // Hourly buckets from 08:00 to 21:00 (2-hour windows for crisp minimalist bars)
    const todayStr = new Date().toISOString().slice(0, 10)
    const todayOrders = paidOrders.filter((o) => o.created_at.slice(0, 10) === todayStr)
    const slots = [
      { label: "08-10", start: 0, end: 10 },
      { label: "10-12", start: 10, end: 12 },
      { label: "12-14", start: 12, end: 14 },
      { label: "14-16", start: 14, end: 16 },
      { label: "16-18", start: 16, end: 18 },
      { label: "18-22", start: 18, end: 24 },
    ]
    const series: RevenueChartPoint[] = slots.map((slot) => {
      const point: RevenueChartPoint = { label: slot.label, dateKey: slot.label, total: 0 }
      for (const b of activeBranches) point[b.id] = 0
      for (const o of todayOrders) {
        const hr = new Date(o.created_at).getHours()
        if (hr >= slot.start && hr < slot.end) {
          point.total += o.total
          point[o.branch_id] = (Number(point[o.branch_id]) || 0) + o.total
        }
      }
      return point
    })
    return { series, branches: activeBranches }
  }

  const daysCount = timeframe === "7D" ? 7 : 30
  const dayNames = ["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"]
  const bucketMap = new Map<string, RevenueChartPoint>()
  const orderedKeys: string[] = []

  for (let i = daysCount - 1; i >= 0; i--) {
    const d = startOfDayOffset(i)
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
    const label =
      daysCount === 7
        ? dayNames[d.getDay()]
        : `${d.getDate()}/${d.getMonth() + 1}`
    const point: RevenueChartPoint = { label, dateKey: key, total: 0 }
    for (const b of activeBranches) point[b.id] = 0
    bucketMap.set(key, point)
    orderedKeys.push(key)
  }

  for (const o of paidOrders) {
    const d = new Date(o.created_at)
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
    const bucket = bucketMap.get(key)
    if (bucket) {
      bucket.total += o.total
      bucket[o.branch_id] = (Number(bucket[o.branch_id]) || 0) + o.total
    }
  }

  return {
    series: orderedKeys.map((k) => bucketMap.get(k)!),
    branches: activeBranches,
  }
}

export interface ShiftStockReportRow {
  ingredientId: string
  sku: string
  name: string
  unit: string
  openingQty: number
  inQty: number // RESTOCK + TRANSFER_IN
  outQty: number // MANUAL_OUT + WASTE + TRANSFER_OUT (positive magnitude)
  opnameDelta: number // net OPNAME adjustment
  closingQty: number // live balance if OPEN, closing snapshot if CLOSED
  recipeEstimateQty: number // theoretical usage from orders linked to this shift (reference only, does NOT auto-deduct)
  varianceVsRecipe: number // (outQty - opnameDelta) vs recipeEstimateQty
}

export function computeShiftStockReport(
  state: KalaPOSState,
  shift: Shift
): ShiftStockReportRow[] {
  const openTime = new Date(shift.opened_at).getTime()
  const closeTime = shift.closed_at ? new Date(shift.closed_at).getTime() : Date.now()

  const openingMap = new Map(
    (shift.opening_stocks ?? []).map((s) => [s.ingredient_id, s])
  )
  const closingMap = new Map(
    (shift.closing_stocks ?? []).map((s) => [s.ingredient_id, s])
  )
  const liveStockMap = new Map(
    state.branch_stocks
      .filter((bs) => bs.branch_id === shift.branch_id)
      .map((bs) => [bs.ingredient_id, bs.current_qty])
  )

  // Movements belonging to this shift (by explicit shift_id, or timestamp window for this branch)
  const shiftMovements = state.stock_movements.filter((m) => {
    if (m.branch_id !== shift.branch_id) return false
    if (m.shift_id) return m.shift_id === shift.id
    const t = new Date(m.created_at).getTime()
    return t >= openTime && t <= closeTime
  })

  // Paid orders belonging to this shift -> compute theoretical recipe consumption (reference only)
  const shiftOrders = state.orders.filter(
    (o) =>
      o.branch_id === shift.branch_id &&
      o.status !== "HOLD" &&
      o.status !== "VOID" &&
      (o.shift_id === shift.id ||
        (!o.shift_id &&
          new Date(o.created_at).getTime() >= openTime &&
          new Date(o.created_at).getTime() <= closeTime))
  )

  const recipeEstimateMap = new Map<string, number>()
  for (const order of shiftOrders) {
    for (const item of order.items) {
      if (item.product_id) {
        for (const r of state.product_recipes) {
          if (r.product_id === item.product_id) {
            recipeEstimateMap.set(
              r.ingredient_id,
              Number(((recipeEstimateMap.get(r.ingredient_id) ?? 0) + r.qty_required * item.qty).toFixed(3))
            )
          }
        }
      }
      for (const mod of item.modifiers_snapshot) {
        if (mod.ingredient_id && mod.qty_required > 0) {
          recipeEstimateMap.set(
            mod.ingredient_id,
            Number(((recipeEstimateMap.get(mod.ingredient_id) ?? 0) + mod.qty_required * item.qty).toFixed(3))
          )
        }
      }
    }
  }

  // Union of all ingredients in catalog + opening/closing snapshots
  const ingMetaMap = new Map<string, { sku: string; name: string; unit: string }>()
  for (const ing of state.ingredients) {
    ingMetaMap.set(ing.id, { sku: ing.sku, name: ing.name, unit: ing.unit })
  }
  for (const snap of [...(shift.opening_stocks ?? []), ...(shift.closing_stocks ?? [])]) {
    if (!ingMetaMap.has(snap.ingredient_id)) {
      ingMetaMap.set(snap.ingredient_id, {
        sku: snap.sku,
        name: snap.ingredient_name,
        unit: snap.unit,
      })
    }
  }

  return Array.from(ingMetaMap.entries()).map(([ingredientId, meta]) => {
    const movs = shiftMovements.filter((m) => m.ingredient_id === ingredientId)
    let inQty = 0
    let outQty = 0
    let opnameDelta = 0
    for (const m of movs) {
      if (m.type === "RESTOCK" || m.type === "TRANSFER_IN") {
        inQty += Math.max(0, m.qty_delta)
      } else if (m.type === "MANUAL_OUT" || m.type === "WASTE" || m.type === "TRANSFER_OUT" || m.type === "SALE_DEDUCT") {
        outQty += Math.abs(m.qty_delta)
      } else if (m.type === "OPNAME") {
        opnameDelta += m.qty_delta
      }
    }

    const closingQty =
      shift.status === "CLOSED" && closingMap.has(ingredientId)
        ? closingMap.get(ingredientId)!.qty
        : liveStockMap.get(ingredientId) ?? 0

    const openingQty = openingMap.has(ingredientId)
      ? openingMap.get(ingredientId)!.qty
      : Math.max(0, Number((closingQty - inQty + outQty - opnameDelta).toFixed(3)))

    const recipeEstimateQty = recipeEstimateMap.get(ingredientId) ?? 0
    const actualNetUsed = Math.max(0, Number((openingQty + inQty - closingQty).toFixed(3)))
    const varianceVsRecipe = Number((actualNetUsed - recipeEstimateQty).toFixed(3))

    return {
      ingredientId,
      sku: meta.sku,
      name: meta.name,
      unit: meta.unit,
      openingQty: Number(openingQty.toFixed(3)),
      inQty: Number(inQty.toFixed(3)),
      outQty: Number(outQty.toFixed(3)),
      opnameDelta: Number(opnameDelta.toFixed(3)),
      closingQty: Number(closingQty.toFixed(3)),
      recipeEstimateQty,
      varianceVsRecipe,
    }
  })
}
