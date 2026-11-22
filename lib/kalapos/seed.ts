import type { KalaPOSState, Order, PaymentMethod, Shift } from "./types"

// Bumped to v4: clears all legacy dummy branches, staff, menus, recipes, and stocks.
// Retains only clean historical Kafe Kala inflow/outflow records (omset, HPP, shift cashflow).
export const SEED_VERSION = 4

export const HISTORICAL_LEDGER_BRANCH_ID = "kala-riwayat"

const daysAgoAt = (daysAgo: number, hour: number, minute: number) => {
  const d = new Date()
  d.setDate(d.getDate() - daysAgo)
  d.setHours(hour, minute, 0, 0)
  return d.toISOString()
}

const todayAtOffsetMinutes = (minutesAgo: number) => {
  const now = new Date()
  const d = new Date(now.getTime() - minutesAgo * 60_000)
  // Keep timestamp on today's local date so TODAY KPIs and hourly bars stay accurate
  if (d.getDate() !== now.getDate()) {
    const start = new Date(now)
    start.setHours(8, Math.min(55, minutesAgo % 50), 0, 0)
    return start.toISOString()
  }
  return d.toISOString()
}

interface HistoricalLedgerSeed {
  seq: number
  daysAgo: number
  hour: number
  minute: number
  subtotal: number
  cogs: number
  method: PaymentMethod
  label: string
}

export function createSeedState(): KalaPOSState {
  // Curated Kafe Kala financial inflow/outflow history (Omset, HPP, & Cashflow).
  // Intentionally detached from deleted dummy branches & dummy menu items.
  const ledgerRows: HistoricalLedgerSeed[] = [
    // Today (3 entries)
    { seq: 16, daysAgo: 0, hour: 9, minute: 15, subtotal: 420000, cogs: 134000, method: "QRIS", label: "Rekap Omset Pagi" },
    { seq: 15, daysAgo: 0, hour: 12, minute: 40, subtotal: 685000, cogs: 218000, method: "CASH", label: "Rekap Omset Siang" },
    { seq: 14, daysAgo: 0, hour: 15, minute: 20, subtotal: 510000, cogs: 162000, method: "CARD", label: "Rekap Omset Sore" },
    // Last 7 days (6 entries)
    { seq: 13, daysAgo: 1, hour: 19, minute: 30, subtotal: 1480000, cogs: 472000, method: "QRIS", label: "Rekap Omset Harian" },
    { seq: 12, daysAgo: 2, hour: 18, minute: 45, subtotal: 1320000, cogs: 416000, method: "CASH", label: "Rekap Omset Harian" },
    { seq: 11, daysAgo: 3, hour: 20, minute: 10, subtotal: 1640000, cogs: 525000, method: "QRIS", label: "Rekap Omset Harian" },
    { seq: 10, daysAgo: 4, hour: 17, minute: 50, subtotal: 1190000, cogs: 382000, method: "CARD", label: "Rekap Omset Harian" },
    { seq: 9, daysAgo: 5, hour: 19, minute: 15, subtotal: 1560000, cogs: 498000, method: "QRIS", label: "Rekap Omset Harian" },
    { seq: 8, daysAgo: 6, hour: 20, minute: 5, subtotal: 1780000, cogs: 562000, method: "CASH", label: "Rekap Omset Akhir Pekan" },
    // Previous period 8-26 days ago (7 entries for 7D delta & 30D trend)
    { seq: 7, daysAgo: 8, hour: 19, minute: 0, subtotal: 1290000, cogs: 418000, method: "QRIS", label: "Rekap Omset Harian" },
    { seq: 6, daysAgo: 10, hour: 18, minute: 20, subtotal: 1410000, cogs: 450000, method: "CASH", label: "Rekap Omset Harian" },
    { seq: 5, daysAgo: 12, hour: 20, minute: 0, subtotal: 1520000, cogs: 486000, method: "QRIS", label: "Rekap Omset Harian" },
    { seq: 4, daysAgo: 15, hour: 18, minute: 30, subtotal: 1360000, cogs: 432000, method: "CARD", label: "Rekap Omset Harian" },
    { seq: 3, daysAgo: 18, hour: 19, minute: 45, subtotal: 1610000, cogs: 515000, method: "QRIS", label: "Rekap Omset Harian" },
    { seq: 2, daysAgo: 22, hour: 18, minute: 10, subtotal: 1240000, cogs: 398000, method: "CASH", label: "Rekap Omset Harian" },
    { seq: 1, daysAgo: 26, hour: 19, minute: 25, subtotal: 1450000, cogs: 464000, method: "QRIS", label: "Rekap Omset Harian" },
  ]

  const orders: Order[] = ledgerRows.map((row, index) => {
    const orderId = `ord-kala-hist-${row.seq}`
    const taxAmount = Math.round(row.subtotal * 0.1)
    const total = row.subtotal + taxAmount
    const createdAt =
      row.daysAgo === 0
        ? todayAtOffsetMinutes(35 + index * 55)
        : daysAgoAt(row.daysAgo, row.hour, row.minute)

    return {
      id: orderId,
      branch_id: HISTORICAL_LEDGER_BRANCH_ID,
      shift_id: null,
      order_number: `KALA-${String(row.seq).padStart(4, "0")}`,
      queue_number: `R-${String(row.seq).padStart(3, "0")}`,
      customer_name: row.label,
      order_type: "DINE_IN",
      table_number: null,
      status: "COMPLETED",
      subtotal: row.subtotal,
      tax_amount: taxAmount,
      service_charge: 0,
      discount: 0,
      discount_reason: null,
      total,
      payment_method: row.method,
      tendered_amount: row.method === "CASH" ? total : null,
      change_amount: row.method === "CASH" ? 0 : null,
      split_payments: null,
      void_reason: null,
      voided_by: null,
      cashier_id: "usr-kala-owner",
      idempotency_key: `SEED-${orderId}`,
      synced: true,
      created_at: createdAt,
      completed_at: createdAt,
      items: [
        {
          id: `${orderId}-it-1`,
          order_id: orderId,
          product_id: null,
          product_name_snapshot: row.label,
          unit_price_snapshot: row.subtotal,
          unit_cogs_snapshot: row.cogs,
          modifiers_snapshot: [],
          qty: 1,
          subtotal: row.subtotal,
          barista_notes: "",
        },
      ],
    }
  })

  // Retained closed cash-drawer reconciliation records (kas masuk / kas keluar)
  const shifts: Shift[] = [
    {
      id: "sh-kala-hist-1",
      branch_id: HISTORICAL_LEDGER_BRANCH_ID,
      user_id: "usr-kala-owner",
      opening_cash: 500000,
      expected_cash: 1980000,
      actual_cash: 1980000,
      status: "CLOSED",
      notes: "Rekap kas harian Kafe Kala — laci sesuai.",
      opened_at: daysAgoAt(1, 8, 0),
      closed_at: daysAgoAt(1, 22, 0),
    },
    {
      id: "sh-kala-hist-2",
      branch_id: HISTORICAL_LEDGER_BRANCH_ID,
      user_id: "usr-kala-owner",
      opening_cash: 500000,
      expected_cash: 1820000,
      actual_cash: 1815000,
      status: "CLOSED",
      notes: "Selisih kurang Rp 5.000 tercatat pada rekonsiliasi.",
      opened_at: daysAgoAt(2, 8, 0),
      closed_at: daysAgoAt(2, 22, 5),
    },
    {
      id: "sh-kala-hist-3",
      branch_id: HISTORICAL_LEDGER_BRANCH_ID,
      user_id: "usr-kala-owner",
      opening_cash: 500000,
      expected_cash: 2280000,
      actual_cash: 2280000,
      status: "CLOSED",
      notes: "Rekap kas akhir pekan Kafe Kala.",
      opened_at: daysAgoAt(6, 8, 0),
      closed_at: daysAgoAt(6, 22, 15),
    },
  ]

  return {
    version: SEED_VERSION,
    branches: [],
    users: [],
    categories: [],
    ingredients: [],
    products: [],
    branch_products: [],
    modifier_groups: [],
    modifier_options: [],
    product_modifier_groups: [],
    product_recipes: [],
    branch_stocks: [],
    stock_movements: [],
    stock_transfers: [],
    shifts,
    orders,
    offline_queue: [],
  }
}
