// ============================================================================
// KalaPOS Domain Types — Synchronized 1:1 with lib/kalapos/core-schema.sql
// All IDR monetary values are strictly integer numbers (never floats).
// ============================================================================

export type Role = "OWNER" | "MANAGER" | "CASHIER" | "BARISTA"
export type BranchStatus = "ACTIVE" | "RENOVATION" | "INACTIVE"
export type OrderStatus = "HOLD" | "QUEUED" | "PREPARING" | "READY" | "COMPLETED" | "VOID"
export type OrderType = "DINE_IN" | "TAKEAWAY"
export type PaymentMethod = "CASH" | "QRIS" | "CARD"
export type StockMovementType =
  | "SALE_DEDUCT"
  | "MANUAL_OUT"
  | "RESTOCK"
  | "TRANSFER_IN"
  | "TRANSFER_OUT"
  | "WASTE"
  | "OPNAME"
export type ShiftStatus = "OPEN" | "CLOSED"
export type StockTransferStatus = "PENDING" | "COMPLETED" | "CANCELLED"
export type StockHealth = "Aman" | "Menipis" | "Kritis"
export type ProductTone = "sand" | "rose" | "olive" | "tan" | "slate"

export interface Branch {
  id: string
  code: string
  name: string
  address: string
  phone: string
  tax_rate: number // integer percentage, e.g. 10 = 10%
  service_charge_rate: number // integer percentage, e.g. 5 = 5%
  receipt_footer: string
  status: BranchStatus
  deleted_at: string | null
  created_at: string
}

export interface PublicBranchInfo {
  id: string
  code: string
  name: string
  status: BranchStatus
}

export interface User {
  id: string
  branch_id: string | null // null for OWNER (global access)
  full_name: string
  email: string
  password_hash?: string
  role: Role
  pin_hash?: string
  is_active: boolean
  created_at: string
}

export interface Category {
  id: string
  name: string
  sort_order: number
}

export interface Ingredient {
  id: string
  sku: string
  name: string
  unit: string // 'g' | 'ml' | 'pcs'
  cost_per_unit: number // integer IDR per unit
}

export interface Product {
  id: string
  category_id: string
  branch_id?: string | null // null/undefined = Katalog Pusat Kafe Kala; string = Menu Khusus Cabang
  name: string
  base_price: number // integer IDR
  sku: string
  mark: string // 2-3 char typographic monogram
  tone: ProductTone
  is_customizable: boolean
  is_active: boolean
}

export interface BranchProduct {
  branch_id: string
  product_id: string
  is_available: boolean
  custom_price: number | null // integer IDR override or null
}

export interface ModifierGroup {
  id: string
  name: string
  required: boolean
}

export interface ModifierOption {
  id: string
  group_id: string
  name: string
  price_delta: number // integer IDR
  ingredient_id: string | null
  qty_required: number
}

export interface ProductModifierGroup {
  product_id: string
  group_id: string
  sort_order: number
}

export interface ProductRecipe {
  product_id: string
  ingredient_id: string
  qty_required: number
}

export interface BranchStock {
  branch_id: string
  ingredient_id: string
  current_qty: number
  min_threshold: number
}

export interface StockMovement {
  id: string
  branch_id: string
  shift_id?: string | null
  ingredient_id: string
  type: StockMovementType
  qty_delta: number
  balance_after: number
  reference_id: string | null
  notes: string
  created_by: string | null
  created_at: string
}

export interface StockTransfer {
  id: string
  from_branch_id: string
  to_branch_id: string
  ingredient_id: string
  qty: number
  status: StockTransferStatus
  notes: string
  created_by: string | null
  created_at: string
  completed_at: string | null
}

export interface ShiftStockSnapshot {
  ingredient_id: string
  ingredient_name: string
  sku: string
  unit: string
  qty: number
}

export interface Shift {
  id: string
  branch_id: string
  user_id: string
  opening_cash: number // integer IDR
  expected_cash: number // integer IDR
  actual_cash: number | null // integer IDR, null while OPEN
  status: ShiftStatus
  notes: string
  opened_at: string
  closed_at: string | null
  opening_stocks?: ShiftStockSnapshot[]
  closing_stocks?: ShiftStockSnapshot[]
}

export interface OrderModifierSnapshot {
  group_name: string
  option_id: string
  option_name: string
  price_delta: number // integer IDR
  ingredient_id: string | null
  qty_required: number
}

export interface OrderItem {
  id: string
  order_id: string
  product_id: string | null
  product_name_snapshot: string
  unit_price_snapshot: number // integer IDR (base + modifiers)
  unit_cogs_snapshot: number // integer IDR (recipe + modifier ingredient cost)
  modifiers_snapshot: OrderModifierSnapshot[]
  qty: number
  subtotal: number // integer IDR
  barista_notes: string
}

export interface SplitPaymentPart {
  id: string
  label: string
  method: PaymentMethod
  amount: number // integer IDR
  tendered?: number
  change?: number
}

export interface Order {
  id: string
  branch_id: string
  shift_id: string | null
  order_number: string
  queue_number: string
  customer_name: string
  order_type: OrderType
  table_number: string | null
  status: OrderStatus
  subtotal: number // integer IDR
  tax_amount: number // integer IDR
  service_charge: number // integer IDR
  discount: number // integer IDR
  discount_reason: string | null
  total: number // integer IDR
  payment_method: PaymentMethod | null
  tendered_amount: number | null
  change_amount: number | null
  split_payments: SplitPaymentPart[] | null
  void_reason: string | null
  voided_by: string | null
  cashier_id: string | null
  idempotency_key: string
  synced: boolean
  created_at: string
  completed_at: string | null
  items: OrderItem[]
}

export interface OfflineSyncEntry {
  idempotency_key: string
  type: "CHECKOUT" | "STOCK_MOVEMENT" | "TRANSFER" | "SHIFT"
  branch_id: string
  summary: string
  created_at: string
  attempts: number
}

export interface SessionUser {
  userId: string
  role: Role
  branchId: string | null
  fullName: string
  email: string
}

export interface CartDraftItem {
  draft_id: string
  product_id: string
  product_name: string
  mark: string
  tone: ProductTone
  base_price: number
  modifiers: OrderModifierSnapshot[]
  qty: number
  barista_notes: string
}

export interface KalaPOSState {
  version: number
  branches: Branch[]
  users: User[]
  categories: Category[]
  ingredients: Ingredient[]
  products: Product[]
  branch_products: BranchProduct[]
  modifier_groups: ModifierGroup[]
  modifier_options: ModifierOption[]
  product_modifier_groups: ProductModifierGroup[]
  product_recipes: ProductRecipe[]
  branch_stocks: BranchStock[]
  stock_movements: StockMovement[]
  stock_transfers: StockTransfer[]
  shifts: Shift[]
  orders: Order[]
  offline_queue: OfflineSyncEntry[]
}
