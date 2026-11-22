import type { InventorySnapshot, IngredientUpsertServerInput } from "./inventory-server"
import type { MenuCatalogSnapshot, ProductUpsertServerInput } from "./menu-server"
import type { OperationsSnapshot } from "./operations-server"
import type { BlindCloseSummary, BranchUpsertInput, CheckoutInput, CreateStaffInput } from "./store"
import type {
  Branch,
  BranchProduct,
  CartDraftItem,
  Category,
  Ingredient,
  Order,
  OrderStatus,
  OrderType,
  Product,
  PublicBranchInfo,
  Role,
  SessionUser,
  Shift,
  StockMovement,
  StockTransfer,
  User,
} from "./types"

export const ACTIVE_BRANCH_STORAGE_KEY = "kalapos_active_branch_v4"

export function defaultRouteForRole(role: Role): string {
  switch (role) {
    case "OWNER":
      return "/owner"
    case "BARISTA":
      return "/pos/queue"
    case "MANAGER":
    case "CASHIER":
    default:
      return "/pos"
  }
}

export async function fetchServerSession(): Promise<SessionUser | null> {
  try {
    const res = await fetch("/api/auth/session", {
      method: "GET",
      credentials: "same-origin",
      cache: "no-store",
    })
    if (!res.ok) return null
    const data = (await res.json()) as { authenticated?: boolean; session?: SessionUser | null }
    return data.authenticated && data.session ? data.session : null
  } catch {
    return null
  }
}

export async function loginWithEmailRequest(
  email: string,
  password: string,
  rememberMe = true
): Promise<{ ok: boolean; session?: SessionUser; error?: string }> {
  try {
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({ method: "email", email, password, rememberMe }),
    })
    const data = (await res.json().catch(() => ({}))) as {
      ok?: boolean
      session?: SessionUser
      error?: string
    }
    if (!res.ok || !data.ok || !data.session) {
      return { ok: false, error: data.error || "Email atau kata sandi tidak sesuai." }
    }
    return { ok: true, session: data.session }
  } catch {
    return { ok: false, error: "Koneksi ke server autentikasi terputus." }
  }
}

export async function loginWithPinRequest(
  pin: string,
  branchId: string
): Promise<{ ok: boolean; session?: SessionUser; error?: string }> {
  try {
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({ method: "pin", pin, branchId }),
    })
    const data = (await res.json().catch(() => ({}))) as {
      ok?: boolean
      session?: SessionUser
      error?: string
    }
    if (!res.ok || !data.ok || !data.session) {
      return { ok: false, error: data.error || "PIN tidak valid untuk cabang ini." }
    }
    return { ok: true, session: data.session }
  } catch {
    return { ok: false, error: "Koneksi ke server autentikasi terputus." }
  }
}

export async function verifySupervisorPinRequest(
  pin: string,
  branchId?: string | null
): Promise<{ ok: boolean; supervisorName?: string; supervisorId?: string; error?: string }> {
  try {
    const res = await fetch("/api/auth/verify-pin", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({ pin, branchId }),
    })
    const data = (await res.json().catch(() => ({}))) as {
      ok?: boolean
      supervisorName?: string
      supervisorId?: string
      error?: string
    }
    if (!res.ok || !data.ok) {
      return { ok: false, error: data.error || "PIN Supervisor tidak valid." }
    }
    return {
      ok: true,
      supervisorName: data.supervisorName,
      supervisorId: data.supervisorId,
    }
  } catch {
    return { ok: false, error: "Gagal memverifikasi PIN Supervisor ke server." }
  }
}

export async function clearServerSession(): Promise<void> {
  try {
    await fetch("/api/auth/logout", {
      method: "POST",
      credentials: "same-origin",
    })
  } catch {
    /* ignore */
  }
}

export async function fetchPublicBranches(): Promise<PublicBranchInfo[]> {
  try {
    const res = await fetch("/api/branches/public", {
      method: "GET",
      credentials: "same-origin",
      cache: "no-store",
    })
    if (!res.ok) return []
    const data = (await res.json()) as { branches?: PublicBranchInfo[] }
    return Array.isArray(data.branches) ? data.branches : []
  } catch {
    return []
  }
}

export async function fetchServerBranches(): Promise<Branch[] | null> {
  try {
    const res = await fetch("/api/branches", {
      method: "GET",
      credentials: "same-origin",
      cache: "no-store",
    })
    if (!res.ok) return null
    const data = (await res.json()) as { branches?: Branch[] }
    return Array.isArray(data.branches) ? data.branches : null
  } catch {
    return null
  }
}

export async function createBranchRequest(
  input: BranchUpsertInput
): Promise<{ ok: boolean; branch?: Branch; branches?: Branch[]; error?: string }> {
  try {
    const res = await fetch("/api/branches", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify(input),
    })
    const data = (await res.json().catch(() => ({}))) as {
      ok?: boolean
      branch?: Branch
      branches?: Branch[]
      error?: string
    }
    if (!res.ok || !data.ok || !data.branch) {
      return { ok: false, error: data.error || "Gagal menambahkan cabang." }
    }
    return { ok: true, branch: data.branch, branches: data.branches }
  } catch {
    return { ok: false, error: "Gagal menghubungi server saat menambah cabang." }
  }
}

export async function updateBranchRequest(
  branchId: string,
  input: BranchUpsertInput
): Promise<{ ok: boolean; branch?: Branch; branches?: Branch[]; error?: string }> {
  try {
    const res = await fetch("/api/branches", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({ action: "update", branchId, input }),
    })
    const data = (await res.json().catch(() => ({}))) as {
      ok?: boolean
      branch?: Branch
      branches?: Branch[]
      error?: string
    }
    if (!res.ok || !data.ok || !data.branch) {
      return { ok: false, error: data.error || "Gagal memperbarui cabang." }
    }
    return { ok: true, branch: data.branch, branches: data.branches }
  } catch {
    return { ok: false, error: "Gagal menghubungi server saat memperbarui cabang." }
  }
}

export async function archiveBranchRequest(
  branchId: string
): Promise<{ ok: boolean; branches?: Branch[]; error?: string }> {
  try {
    const res = await fetch("/api/branches", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({ action: "archive", branchId }),
    })
    const data = (await res.json().catch(() => ({}))) as {
      ok?: boolean
      branches?: Branch[]
      error?: string
    }
    if (!res.ok || !data.ok) {
      return { ok: false, error: data.error || "Gagal mengarsipkan cabang." }
    }
    return { ok: true, branches: data.branches }
  } catch {
    return { ok: false, error: "Gagal menghubungi server saat mengarsipkan cabang." }
  }
}

export async function restoreBranchRequest(
  branchId: string
): Promise<{ ok: boolean; branch?: Branch; branches?: Branch[]; error?: string }> {
  try {
    const res = await fetch("/api/branches", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({ action: "restore", branchId }),
    })
    const data = (await res.json().catch(() => ({}))) as {
      ok?: boolean
      branch?: Branch
      branches?: Branch[]
      error?: string
    }
    if (!res.ok || !data.ok) {
      return { ok: false, error: data.error || "Gagal mengaktifkan kembali cabang." }
    }
    return { ok: true, branch: data.branch, branches: data.branches }
  } catch {
    return { ok: false, error: "Gagal menghubungi server saat memulihkan cabang." }
  }
}

export async function deleteBranchRequest(
  branchId: string
): Promise<{ ok: boolean; branches?: Branch[]; error?: string }> {
  try {
    const res = await fetch(`/api/branches?branchId=${encodeURIComponent(branchId)}`, {
      method: "DELETE",
      credentials: "same-origin",
    })
    const data = (await res.json().catch(() => ({}))) as {
      ok?: boolean
      branches?: Branch[]
      error?: string
    }
    if (!res.ok || !data.ok) {
      return { ok: false, error: data.error || "Gagal menghapus cabang." }
    }
    return { ok: true, branches: data.branches }
  } catch {
    return { ok: false, error: "Gagal menghubungi server saat menghapus cabang." }
  }
}

export async function fetchServerStaff(): Promise<User[] | null> {
  try {
    const res = await fetch("/api/auth/staff", {
      method: "GET",
      credentials: "same-origin",
      cache: "no-store",
    })
    if (!res.ok) return null
    const data = (await res.json()) as { users?: User[] }
    return Array.isArray(data.users) ? data.users : null
  } catch {
    return null
  }
}

export async function createStaffRequest(
  input: CreateStaffInput
): Promise<{ ok: boolean; user?: User; users?: User[]; error?: string }> {
  try {
    const res = await fetch("/api/auth/staff", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify(input),
    })
    const data = (await res.json().catch(() => ({}))) as {
      ok?: boolean
      user?: User
      users?: User[]
      error?: string
    }
    if (!res.ok || !data.ok) {
      return { ok: false, error: data.error || "Gagal menambahkan akun staf." }
    }
    return { ok: true, user: data.user, users: data.users }
  } catch {
    return { ok: false, error: "Gagal menghubungi server saat menambah staf." }
  }
}

export async function toggleStaffActiveRequest(
  userId: string
): Promise<{ ok: boolean; user?: User; users?: User[]; error?: string }> {
  try {
    const res = await fetch("/api/auth/staff", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({ userId }),
    })
    const data = (await res.json().catch(() => ({}))) as {
      ok?: boolean
      user?: User
      users?: User[]
      error?: string
    }
    if (!res.ok || !data.ok) {
      return { ok: false, error: data.error || "Gagal mengubah status akun staf." }
    }
    return { ok: true, user: data.user, users: data.users }
  } catch {
    return { ok: false, error: "Gagal menghubungi server saat memperbarui staf." }
  }
}

export async function deleteStaffRequest(
  userId: string
): Promise<{ ok: boolean; users?: User[]; error?: string }> {
  try {
    const res = await fetch(`/api/auth/staff?userId=${encodeURIComponent(userId)}`, {
      method: "DELETE",
      credentials: "same-origin",
    })
    const data = (await res.json().catch(() => ({}))) as {
      ok?: boolean
      users?: User[]
      error?: string
    }
    if (!res.ok || !data.ok) {
      return { ok: false, error: data.error || "Gagal menghapus akun staf." }
    }
    return { ok: true, users: data.users }
  } catch {
    return { ok: false, error: "Gagal menghubungi server saat menghapus staf." }
  }
}

// ============================================================================
// Server-Synced Menu Catalog API (/api/menu)
// ============================================================================

export async function fetchServerMenuCatalog(): Promise<MenuCatalogSnapshot | null> {
  try {
    const res = await fetch("/api/menu", {
      method: "GET",
      credentials: "same-origin",
      cache: "no-store",
    })
    if (!res.ok) return null
    const data = (await res.json()) as { catalog?: MenuCatalogSnapshot }
    return data.catalog ?? null
  } catch {
    return null
  }
}

export async function createCategoryRequest(
  name: string
): Promise<{ ok: boolean; category?: Category; catalog?: MenuCatalogSnapshot; error?: string }> {
  try {
    const res = await fetch("/api/menu", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({ entity: "category", name }),
    })
    const data = (await res.json().catch(() => ({}))) as {
      ok?: boolean
      category?: Category
      catalog?: MenuCatalogSnapshot
      error?: string
    }
    if (!res.ok || !data.ok) return { ok: false, error: data.error || "Gagal menambah kategori." }
    return { ok: true, category: data.category, catalog: data.catalog }
  } catch {
    return { ok: false, error: "Gagal menghubungi server saat menambah kategori." }
  }
}

export async function deleteCategoryRequest(
  categoryId: string
): Promise<{ ok: boolean; catalog?: MenuCatalogSnapshot; error?: string }> {
  try {
    const res = await fetch(
      `/api/menu?entity=category&id=${encodeURIComponent(categoryId)}`,
      { method: "DELETE", credentials: "same-origin" }
    )
    const data = (await res.json().catch(() => ({}))) as {
      ok?: boolean
      catalog?: MenuCatalogSnapshot
      error?: string
    }
    if (!res.ok || !data.ok) return { ok: false, error: data.error || "Gagal menghapus kategori." }
    return { ok: true, catalog: data.catalog }
  } catch {
    return { ok: false, error: "Gagal menghubungi server saat menghapus kategori." }
  }
}

export async function createProductRequest(
  input: ProductUpsertServerInput
): Promise<{ ok: boolean; product?: Product; catalog?: MenuCatalogSnapshot; error?: string }> {
  try {
    const res = await fetch("/api/menu", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({ entity: "product", input }),
    })
    const data = (await res.json().catch(() => ({}))) as {
      ok?: boolean
      product?: Product
      catalog?: MenuCatalogSnapshot
      error?: string
    }
    if (!res.ok || !data.ok) return { ok: false, error: data.error || "Gagal menambah menu." }
    return { ok: true, product: data.product, catalog: data.catalog }
  } catch {
    return { ok: false, error: "Gagal menghubungi server saat menambah menu." }
  }
}

export async function updateProductRequest(
  productId: string,
  input: ProductUpsertServerInput
): Promise<{ ok: boolean; product?: Product; catalog?: MenuCatalogSnapshot; error?: string }> {
  try {
    const res = await fetch("/api/menu", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({ entity: "product", productId, input }),
    })
    const data = (await res.json().catch(() => ({}))) as {
      ok?: boolean
      product?: Product
      catalog?: MenuCatalogSnapshot
      error?: string
    }
    if (!res.ok || !data.ok) return { ok: false, error: data.error || "Gagal memperbarui menu." }
    return { ok: true, product: data.product, catalog: data.catalog }
  } catch {
    return { ok: false, error: "Gagal menghubungi server saat memperbarui menu." }
  }
}

export async function deleteProductRequest(
  productId: string
): Promise<{ ok: boolean; catalog?: MenuCatalogSnapshot; error?: string }> {
  try {
    const res = await fetch(
      `/api/menu?entity=product&id=${encodeURIComponent(productId)}`,
      { method: "DELETE", credentials: "same-origin" }
    )
    const data = (await res.json().catch(() => ({}))) as {
      ok?: boolean
      catalog?: MenuCatalogSnapshot
      error?: string
    }
    if (!res.ok || !data.ok) return { ok: false, error: data.error || "Gagal menghapus menu." }
    return { ok: true, catalog: data.catalog }
  } catch {
    return { ok: false, error: "Gagal menghubungi server saat menghapus menu." }
  }
}

export async function updateBranchProductOverrideRequest(payload: {
  branchId: string
  productId: string
  isAvailable: boolean
  customPrice: number | null
}): Promise<{ ok: boolean; branchProduct?: BranchProduct; catalog?: MenuCatalogSnapshot; error?: string }> {
  try {
    const res = await fetch("/api/menu", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({ entity: "branch_override", ...payload }),
    })
    const data = (await res.json().catch(() => ({}))) as {
      ok?: boolean
      branchProduct?: BranchProduct
      catalog?: MenuCatalogSnapshot
      error?: string
    }
    if (!res.ok || !data.ok) {
      return { ok: false, error: data.error || "Gagal memperbarui pengaturan menu cabang." }
    }
    return { ok: true, branchProduct: data.branchProduct, catalog: data.catalog }
  } catch {
    return { ok: false, error: "Gagal menghubungi server saat menyimpan pengaturan cabang." }
  }
}

// ============================================================================
// Server-Synced Inventory & Stock CRUD API (/api/inventory)
// ============================================================================

export async function fetchServerInventory(): Promise<InventorySnapshot | null> {
  try {
    const res = await fetch("/api/inventory", {
      method: "GET",
      credentials: "same-origin",
      cache: "no-store",
    })
    if (!res.ok) return null
    const data = (await res.json()) as { inventory?: InventorySnapshot }
    return data.inventory ?? null
  } catch {
    return null
  }
}

export async function createIngredientRequest(
  input: IngredientUpsertServerInput
): Promise<{ ok: boolean; ingredient?: Ingredient; inventory?: InventorySnapshot; error?: string }> {
  try {
    const res = await fetch("/api/inventory", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({ action: "create_ingredient", input }),
    })
    const data = (await res.json().catch(() => ({}))) as {
      ok?: boolean
      ingredient?: Ingredient
      inventory?: InventorySnapshot
      error?: string
    }
    if (!res.ok || !data.ok) {
      return { ok: false, error: data.error || "Gagal menambah bahan baku." }
    }
    return { ok: true, ingredient: data.ingredient, inventory: data.inventory }
  } catch {
    return { ok: false, error: "Gagal menghubungi server saat menambah bahan baku." }
  }
}

export async function updateIngredientRequest(
  ingredientId: string,
  input: {
    sku: string
    name: string
    unit: string
    cost_per_unit: number
    branch_id?: string | null
    min_threshold?: number
  }
): Promise<{ ok: boolean; ingredient?: Ingredient; inventory?: InventorySnapshot; error?: string }> {
  try {
    const res = await fetch("/api/inventory", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({ ingredientId, input }),
    })
    const data = (await res.json().catch(() => ({}))) as {
      ok?: boolean
      ingredient?: Ingredient
      inventory?: InventorySnapshot
      error?: string
    }
    if (!res.ok || !data.ok) {
      return { ok: false, error: data.error || "Gagal memperbarui bahan baku." }
    }
    return { ok: true, ingredient: data.ingredient, inventory: data.inventory }
  } catch {
    return { ok: false, error: "Gagal menghubungi server saat memperbarui bahan baku." }
  }
}

export async function deleteIngredientRequest(
  ingredientId: string
): Promise<{ ok: boolean; inventory?: InventorySnapshot; error?: string }> {
  try {
    const res = await fetch(
      `/api/inventory?ingredientId=${encodeURIComponent(ingredientId)}`,
      { method: "DELETE", credentials: "same-origin" }
    )
    const data = (await res.json().catch(() => ({}))) as {
      ok?: boolean
      inventory?: InventorySnapshot
      error?: string
    }
    if (!res.ok || !data.ok) {
      return { ok: false, error: data.error || "Gagal menghapus bahan baku." }
    }
    return { ok: true, inventory: data.inventory }
  } catch {
    return { ok: false, error: "Gagal menghubungi server saat menghapus bahan baku." }
  }
}

export async function adjustBranchStockRequest(payload: {
  branchId: string
  shiftId?: string | null
  ingredientId: string
  type: "RESTOCK" | "MANUAL_OUT" | "WASTE" | "OPNAME"
  qty: number
  notes: string
  supervisorPin?: string
}): Promise<{ ok: boolean; movement?: StockMovement; inventory?: InventorySnapshot; error?: string }> {
  try {
    const res = await fetch("/api/inventory", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({ action: "adjust_stock", ...payload }),
    })
    const data = (await res.json().catch(() => ({}))) as {
      ok?: boolean
      movement?: StockMovement
      inventory?: InventorySnapshot
      error?: string
    }
    if (!res.ok || !data.ok) {
      return { ok: false, error: data.error || "Gagal mencatat mutasi stok." }
    }
    return { ok: true, movement: data.movement, inventory: data.inventory }
  } catch {
    return { ok: false, error: "Gagal menghubungi server saat mencatat mutasi stok." }
  }
}

export async function transferBranchStockRequest(payload: {
  fromBranchId: string
  toBranchId: string
  ingredientId: string
  qty: number
  notes: string
}): Promise<{ ok: boolean; transfer?: StockTransfer; inventory?: InventorySnapshot; error?: string }> {
  try {
    const res = await fetch("/api/inventory", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({ action: "transfer_stock", ...payload }),
    })
    const data = (await res.json().catch(() => ({}))) as {
      ok?: boolean
      transfer?: StockTransfer
      inventory?: InventorySnapshot
      error?: string
    }
    if (!res.ok || !data.ok) {
      return { ok: false, error: data.error || "Gagal memproses transfer stok." }
    }
    return { ok: true, transfer: data.transfer, inventory: data.inventory }
  } catch {
    return { ok: false, error: "Gagal menghubungi server saat transfer stok." }
  }
}

// ============================================================================
// Server-Synced Shifts & Orders API (/api/shifts & /api/orders)
// ============================================================================

export async function fetchServerOperations(): Promise<OperationsSnapshot | null> {
  try {
    const res = await fetch("/api/orders", {
      method: "GET",
      credentials: "same-origin",
      cache: "no-store",
    })
    if (!res.ok) return null
    const data = (await res.json()) as { orders?: Order[]; shifts?: Shift[] }
    if (!Array.isArray(data.orders) || !Array.isArray(data.shifts)) return null
    return { orders: data.orders, shifts: data.shifts }
  } catch {
    return null
  }
}

export async function openShiftRequest(payload: {
  branchId: string
  openingCash: number
  notes?: string
}): Promise<{ ok: boolean; shift?: Shift; shifts?: Shift[]; error?: string }> {
  try {
    const res = await fetch("/api/shifts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify(payload),
    })
    const data = (await res.json().catch(() => ({}))) as {
      ok?: boolean
      shift?: Shift
      shifts?: Shift[]
      error?: string
    }
    if (!res.ok || !data.ok || !data.shift) {
      return { ok: false, error: data.error || "Gagal membuka shift." }
    }
    return { ok: true, shift: data.shift, shifts: data.shifts }
  } catch {
    return { ok: false, error: "Gagal menghubungi server saat membuka shift." }
  }
}

export async function closeShiftBlindRequest(payload: {
  shiftId: string
  actualCash: number
  notes?: string
}): Promise<{ ok: boolean; summary?: BlindCloseSummary; shifts?: Shift[]; error?: string }> {
  try {
    const res = await fetch("/api/shifts", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify(payload),
    })
    const data = (await res.json().catch(() => ({}))) as {
      ok?: boolean
      summary?: BlindCloseSummary
      shifts?: Shift[]
      error?: string
    }
    if (!res.ok || !data.ok || !data.summary) {
      return { ok: false, error: data.error || "Gagal menutup shift." }
    }
    return { ok: true, summary: data.summary, shifts: data.shifts }
  } catch {
    return { ok: false, error: "Gagal menghubungi server saat menutup shift." }
  }
}

export async function checkoutOrderRequest(
  payload: Omit<CheckoutInput, "cashier_id" | "is_offline">
): Promise<{ ok: boolean; order?: Order; orders?: Order[]; shifts?: Shift[]; error?: string }> {
  try {
    const res = await fetch("/api/orders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({ action: "checkout", ...payload }),
    })
    const data = (await res.json().catch(() => ({}))) as {
      ok?: boolean
      order?: Order
      orders?: Order[]
      shifts?: Shift[]
      error?: string
    }
    if (!res.ok || !data.ok || !data.order) {
      return { ok: false, error: data.error || "Gagal memproses pembayaran." }
    }
    return { ok: true, order: data.order, orders: data.orders, shifts: data.shifts }
  } catch {
    return { ok: false, error: "Gagal menghubungi server saat memproses pembayaran." }
  }
}

export async function holdOrderRequest(payload: {
  branch_id: string
  customer_name: string
  order_type: OrderType
  table_number: string | null
  discount: number
  discount_reason: string | null
  items: CartDraftItem[]
  existing_hold_id?: string | null
}): Promise<{ ok: boolean; order?: Order; orders?: Order[]; shifts?: Shift[]; error?: string }> {
  try {
    const res = await fetch("/api/orders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({ action: "hold", ...payload }),
    })
    const data = (await res.json().catch(() => ({}))) as {
      ok?: boolean
      order?: Order
      orders?: Order[]
      shifts?: Shift[]
      error?: string
    }
    if (!res.ok || !data.ok || !data.order) {
      return { ok: false, error: data.error || "Gagal menahan Open Bill." }
    }
    return { ok: true, order: data.order, orders: data.orders, shifts: data.shifts }
  } catch {
    return { ok: false, error: "Gagal menghubungi server saat menahan Open Bill." }
  }
}

export async function advanceOrderStatusRequest(payload: {
  orderId: string
  nextStatus: OrderStatus
}): Promise<{ ok: boolean; order?: Order; orders?: Order[]; error?: string }> {
  try {
    const res = await fetch("/api/orders", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({ action: "advance_status", ...payload }),
    })
    const data = (await res.json().catch(() => ({}))) as {
      ok?: boolean
      order?: Order
      orders?: Order[]
      error?: string
    }
    if (!res.ok || !data.ok || !data.order) {
      return { ok: false, error: data.error || "Gagal memperbarui status pesanan." }
    }
    return { ok: true, order: data.order, orders: data.orders }
  } catch {
    return { ok: false, error: "Gagal menghubungi server saat memperbarui status pesanan." }
  }
}

export async function voidOrderRequest(payload: {
  orderId: string
  reason: string
  supervisorPin: string
  branchId?: string | null
}): Promise<{ ok: boolean; order?: Order; orders?: Order[]; shifts?: Shift[]; error?: string }> {
  try {
    const res = await fetch("/api/orders", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({ action: "void", ...payload }),
    })
    const data = (await res.json().catch(() => ({}))) as {
      ok?: boolean
      order?: Order
      orders?: Order[]
      shifts?: Shift[]
      error?: string
    }
    if (!res.ok || !data.ok || !data.order) {
      return { ok: false, error: data.error || "Gagal membatalkan pesanan." }
    }
    return { ok: true, order: data.order, orders: data.orders, shifts: data.shifts }
  } catch {
    return { ok: false, error: "Gagal menghubungi server saat membatalkan pesanan." }
  }
}
