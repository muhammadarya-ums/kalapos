import fs from "node:fs"
import path from "node:path"
import { generateId } from "./format"
import { getSupabaseAdmin } from "./supabase-server"
import type {
  BranchProduct,
  Category,
  ModifierGroup,
  ModifierOption,
  Product,
  ProductModifierGroup,
  ProductRecipe,
  ProductTone,
} from "./types"

export interface MenuCatalogSnapshot {
  categories: Category[]
  products: Product[]
  branch_products: BranchProduct[]
  modifier_groups: ModifierGroup[]
  modifier_options: ModifierOption[]
  product_modifier_groups: ProductModifierGroup[]
  product_recipes: ProductRecipe[]
}

const DATA_DIR = path.join(process.cwd(), ".kala-data")
const MENU_FILE = path.join(DATA_DIR, "kala-menu.json")

interface GlobalMenuStore {
  cache: MenuCatalogSnapshot | null
}

const g = globalThis as unknown as { __kalaMenuStore?: GlobalMenuStore }
if (!g.__kalaMenuStore) {
  g.__kalaMenuStore = { cache: null }
}

const DEFAULT_MODIFIER_GROUPS: ModifierGroup[] = [
  { id: "mg-temp", name: "Suhu", required: true },
  { id: "mg-sugar", name: "Level Gula", required: true },
]

const DEFAULT_MODIFIER_OPTIONS: ModifierOption[] = [
  { id: "mo-iced", group_id: "mg-temp", name: "Iced", price_delta: 0, ingredient_id: null, qty_required: 0 },
  { id: "mo-hot", group_id: "mg-temp", name: "Hot", price_delta: 0, ingredient_id: null, qty_required: 0 },
  { id: "mo-sugar-normal", group_id: "mg-sugar", name: "Normal Sugar", price_delta: 0, ingredient_id: null, qty_required: 0 },
  { id: "mo-sugar-less", group_id: "mg-sugar", name: "Less Sugar", price_delta: 0, ingredient_id: null, qty_required: 0 },
  { id: "mo-sugar-no", group_id: "mg-sugar", name: "No Sugar", price_delta: 0, ingredient_id: null, qty_required: 0 },
]

function emptyCatalog(): MenuCatalogSnapshot {
  return {
    categories: [],
    products: [],
    branch_products: [],
    modifier_groups: DEFAULT_MODIFIER_GROUPS,
    modifier_options: DEFAULT_MODIFIER_OPTIONS,
    product_modifier_groups: [],
    product_recipes: [],
  }
}

function readMenuFromDisk(): MenuCatalogSnapshot {
  if (g.__kalaMenuStore!.cache) {
    return g.__kalaMenuStore!.cache
  }
  try {
    if (fs.existsSync(MENU_FILE)) {
      const raw = fs.readFileSync(MENU_FILE, "utf8")
      const parsed = JSON.parse(raw) as Partial<MenuCatalogSnapshot>
      if (parsed && typeof parsed === "object") {
        const loaded: MenuCatalogSnapshot = {
          categories: Array.isArray(parsed.categories) ? parsed.categories : [],
          products: Array.isArray(parsed.products) ? parsed.products : [],
          branch_products: Array.isArray(parsed.branch_products) ? parsed.branch_products : [],
          modifier_groups:
            Array.isArray(parsed.modifier_groups) && parsed.modifier_groups.length > 0
              ? parsed.modifier_groups
              : DEFAULT_MODIFIER_GROUPS,
          modifier_options:
            Array.isArray(parsed.modifier_options) && parsed.modifier_options.length > 0
              ? parsed.modifier_options
              : DEFAULT_MODIFIER_OPTIONS,
          product_modifier_groups: Array.isArray(parsed.product_modifier_groups)
            ? parsed.product_modifier_groups
            : [],
          product_recipes: Array.isArray(parsed.product_recipes) ? parsed.product_recipes : [],
        }
        g.__kalaMenuStore!.cache = loaded
        return loaded
      }
    }
  } catch {
    /* fallback to empty catalog */
  }
  const initial = emptyCatalog()
  g.__kalaMenuStore!.cache = initial
  return initial
}

function writeMenuToDisk(catalog: MenuCatalogSnapshot): void {
  g.__kalaMenuStore!.cache = catalog
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true })
    }
    fs.writeFileSync(MENU_FILE, JSON.stringify(catalog, null, 2), "utf8")
  } catch {
    /* read-only fallback */
  }
}

export async function getMenuCatalogServer(): Promise<MenuCatalogSnapshot> {
  const supabase = getSupabaseAdmin()
  if (supabase) {
    const [
      catRes,
      prodRes,
      bpRes,
      mgRes,
      moRes,
      pmgRes,
      recRes,
    ] = await Promise.all([
      supabase.from("categories").select("*").order("sort_order", { ascending: true }),
      supabase.from("products").select("*").order("created_at", { ascending: true }),
      supabase.from("branch_products").select("*"),
      supabase.from("modifier_groups").select("*"),
      supabase.from("modifier_options").select("*"),
      supabase.from("product_modifier_groups").select("*").order("sort_order", { ascending: true }),
      supabase.from("product_recipes").select("*"),
    ])

    if (!catRes.error && !prodRes.error && !bpRes.error) {
      return {
        categories: (catRes.data ?? []).map((c) => ({
          id: c.id,
          name: c.name,
          sort_order: Number(c.sort_order),
        })),
        products: (prodRes.data ?? []).map((p) => ({
          id: p.id,
          category_id: p.category_id,
          branch_id: p.branch_id,
          name: p.name,
          base_price: Number(p.base_price),
          sku: p.sku,
          mark: p.mark,
          tone: p.tone as ProductTone,
          is_customizable: p.is_customizable,
          is_active: p.is_active,
        })),
        branch_products: (bpRes.data ?? []).map((bp) => ({
          branch_id: bp.branch_id,
          product_id: bp.product_id,
          is_available: bp.is_available,
          custom_price: bp.custom_price === null ? null : Number(bp.custom_price),
        })),
        modifier_groups:
          mgRes.data && mgRes.data.length > 0 ? mgRes.data : DEFAULT_MODIFIER_GROUPS,
        modifier_options:
          moRes.data && moRes.data.length > 0
            ? moRes.data.map((mo) => ({
                id: mo.id,
                group_id: mo.group_id,
                name: mo.name,
                price_delta: Number(mo.price_delta),
                ingredient_id: mo.ingredient_id,
                qty_required: Number(mo.qty_required),
              }))
            : DEFAULT_MODIFIER_OPTIONS,
        product_modifier_groups: (pmgRes.data ?? []).map((pmg) => ({
          product_id: pmg.product_id,
          group_id: pmg.group_id,
          sort_order: Number(pmg.sort_order),
        })),
        product_recipes: (recRes.data ?? []).map((r) => ({
          product_id: r.product_id,
          ingredient_id: r.ingredient_id,
          qty_required: Number(r.qty_required),
        })),
      }
    }
  }
  return readMenuFromDisk()
}

export async function getScopedMenuCatalogServer(
  branchId: string | null
): Promise<MenuCatalogSnapshot> {
  const full = await getMenuCatalogServer()
  if (!branchId) return full
  const visibleProducts = full.products.filter((p) => !p.branch_id || p.branch_id === branchId)
  const visibleIds = new Set(visibleProducts.map((p) => p.id))
  return {
    ...full,
    products: visibleProducts,
    branch_products: full.branch_products.filter(
      (bp) => bp.branch_id === branchId && visibleIds.has(bp.product_id)
    ),
    product_modifier_groups: full.product_modifier_groups.filter((pmg) =>
      visibleIds.has(pmg.product_id)
    ),
    product_recipes: full.product_recipes.filter((pr) => visibleIds.has(pr.product_id)),
  }
}

export async function createCategoryServer(
  name: string
): Promise<{ ok: true; category: Category; catalog: MenuCatalogSnapshot } | { ok: false; error: string }> {
  const cleanName = name.trim()
  if (!cleanName) return { ok: false, error: "Nama kategori wajib diisi." }

  const catalog = await getMenuCatalogServer()
  if (catalog.categories.some((c) => c.name.toLowerCase() === cleanName.toLowerCase())) {
    return { ok: false, error: `Kategori "${cleanName}" sudah ada.` }
  }

  const maxSort = catalog.categories.reduce((m, c) => Math.max(m, c.sort_order), 0)
  const category: Category = {
    id: generateId("cat"),
    name: cleanName,
    sort_order: maxSort + 1,
  }

  const supabase = getSupabaseAdmin()
  if (supabase) {
    const { error } = await supabase.from("categories").insert(category)
    if (error) return { ok: false, error: `Gagal menambah kategori di Supabase: ${error.message}` }
    return { ok: true, category, catalog: await getMenuCatalogServer() }
  }

  const next: MenuCatalogSnapshot = {
    ...catalog,
    categories: [...catalog.categories, category],
  }
  writeMenuToDisk(next)
  return { ok: true, category, catalog: next }
}

export async function deleteCategoryServer(
  categoryId: string
): Promise<{ ok: true; catalog: MenuCatalogSnapshot } | { ok: false; error: string }> {
  const catalog = await getMenuCatalogServer()
  if (!catalog.categories.some((c) => c.id === categoryId)) {
    return { ok: false, error: "Kategori tidak ditemukan." }
  }
  if (catalog.products.some((p) => p.category_id === categoryId)) {
    return {
      ok: false,
      error: "Kategori masih digunakan oleh menu. Pindahkan atau hapus menu di kategori ini terlebih dahulu.",
    }
  }

  const supabase = getSupabaseAdmin()
  if (supabase) {
    const { error } = await supabase.from("categories").delete().eq("id", categoryId)
    if (error) return { ok: false, error: `Gagal menghapus kategori di Supabase: ${error.message}` }
    return { ok: true, catalog: await getMenuCatalogServer() }
  }

  const next: MenuCatalogSnapshot = {
    ...catalog,
    categories: catalog.categories.filter((c) => c.id !== categoryId),
  }
  writeMenuToDisk(next)
  return { ok: true, catalog: next }
}

export interface ProductRecipeInput {
  ingredient_id: string
  qty_required: number
}

export interface ProductUpsertServerInput {
  category_id: string
  branch_id?: string | null
  name: string
  base_price: number
  sku: string
  mark?: string
  tone?: ProductTone
  is_customizable?: boolean
  is_active?: boolean
  recipes: ProductRecipeInput[]
}

const VALID_TONES: ProductTone[] = ["sand", "rose", "olive", "tan", "slate"]

function normalizeMark(name: string, provided?: string): string {
  const clean = (provided ?? "").trim().toUpperCase().slice(0, 3)
  if (clean) return clean
  const words = name.trim().split(/\s+/).filter(Boolean)
  if (words.length >= 2) return `${words[0][0]}${words[1][0]}`.toUpperCase()
  return name.trim().slice(0, 2).toUpperCase() || "MN"
}

function normalizeRecipes(productId: string, recipes: ProductRecipeInput[]): ProductRecipe[] {
  const dedup = new Map<string, number>()
  for (const r of recipes) {
    const id = typeof r.ingredient_id === "string" ? r.ingredient_id.trim() : ""
    const qty = Number(r.qty_required)
    if (!id || Number.isNaN(qty) || qty <= 0) continue
    dedup.set(id, Number(((dedup.get(id) ?? 0) + qty).toFixed(3)))
  }
  return Array.from(dedup.entries()).map(([ingredient_id, qty_required]) => ({
    product_id: productId,
    ingredient_id,
    qty_required,
  }))
}

export async function createProductServer(
  input: ProductUpsertServerInput
): Promise<{ ok: true; product: Product; catalog: MenuCatalogSnapshot } | { ok: false; error: string }> {
  const catalog = await getMenuCatalogServer()
  const name = input.name.trim()
  const sku = input.sku.trim().toUpperCase()
  const basePrice = Math.round(Number(input.base_price))

  if (!name) return { ok: false, error: "Nama menu wajib diisi." }
  if (!sku) return { ok: false, error: "Kode SKU menu wajib diisi." }
  if (!input.category_id || !catalog.categories.some((c) => c.id === input.category_id)) {
    return { ok: false, error: "Pilih kategori menu yang valid." }
  }
  if (Number.isNaN(basePrice) || basePrice < 0) {
    return { ok: false, error: "Harga menu tidak boleh negatif." }
  }
  if (catalog.products.some((p) => p.sku.toUpperCase() === sku)) {
    return { ok: false, error: `SKU ${sku} sudah digunakan menu lain.` }
  }

  const tone: ProductTone =
    input.tone && VALID_TONES.includes(input.tone) ? input.tone : "sand"
  const isCustomizable = Boolean(input.is_customizable)
  const productId = generateId("prd")

  const product: Product = {
    id: productId,
    category_id: input.category_id,
    branch_id: input.branch_id ? input.branch_id.trim() : null,
    name,
    base_price: basePrice,
    sku,
    mark: normalizeMark(name, input.mark),
    tone,
    is_customizable: isCustomizable,
    is_active: input.is_active !== false,
  }

  const nextRecipes = normalizeRecipes(productId, input.recipes ?? [])
  const nextModifierGroups: ProductModifierGroup[] = isCustomizable
    ? [
        { product_id: productId, group_id: "mg-temp", sort_order: 1 },
        { product_id: productId, group_id: "mg-sugar", sort_order: 2 },
      ]
    : []

  const supabase = getSupabaseAdmin()
  if (supabase) {
    const { error: prodErr } = await supabase.from("products").insert({
      id: product.id,
      category_id: product.category_id,
      branch_id: product.branch_id ?? null,
      name: product.name,
      base_price: product.base_price,
      sku: product.sku,
      mark: product.mark,
      tone: product.tone,
      is_customizable: product.is_customizable,
      is_active: product.is_active,
    })
    if (prodErr) {
      return { ok: false, error: `Gagal menyimpan menu ke Supabase: ${prodErr.message}` }
    }

    if (nextRecipes.length > 0) {
      await supabase.from("product_recipes").insert(nextRecipes)
    }
    if (nextModifierGroups.length > 0) {
      await supabase.from("product_modifier_groups").insert(nextModifierGroups)
    }
    if (product.branch_id) {
      await supabase.from("branch_products").upsert(
        {
          branch_id: product.branch_id,
          product_id: productId,
          is_available: true,
          custom_price: null,
        },
        { onConflict: "branch_id,product_id" }
      )
    }

    return { ok: true, product, catalog: await getMenuCatalogServer() }
  }

  const nextBranchProducts = product.branch_id
    ? [
        ...catalog.branch_products,
        {
          branch_id: product.branch_id,
          product_id: productId,
          is_available: true,
          custom_price: null,
        },
      ]
    : catalog.branch_products

  const next: MenuCatalogSnapshot = {
    ...catalog,
    products: [...catalog.products, product],
    branch_products: nextBranchProducts,
    product_recipes: [...catalog.product_recipes, ...nextRecipes],
    product_modifier_groups: [...catalog.product_modifier_groups, ...nextModifierGroups],
  }

  writeMenuToDisk(next)
  return { ok: true, product, catalog: next }
}

export async function updateProductServer(
  productId: string,
  input: ProductUpsertServerInput,
  actor: { role: "OWNER" | "MANAGER"; branchId: string | null }
): Promise<{ ok: true; product: Product; catalog: MenuCatalogSnapshot } | { ok: false; error: string }> {
  const catalog = await getMenuCatalogServer()
  const existing = catalog.products.find((p) => p.id === productId)
  if (!existing) return { ok: false, error: "Menu tidak ditemukan." }

  // Manager can only edit branch-local menus belonging to their own branch
  if (actor.role === "MANAGER") {
    if (!existing.branch_id || existing.branch_id !== actor.branchId) {
      return {
        ok: false,
        error:
          "Manager cabang hanya dapat mengedit menu lokal cabangnya sendiri. Untuk menu pusat, ubah ketersediaan atau harga cabang.",
      }
    }
  }

  const name = input.name.trim()
  const sku = input.sku.trim().toUpperCase()
  const basePrice = Math.round(Number(input.base_price))

  if (!name) return { ok: false, error: "Nama menu wajib diisi." }
  if (!sku) return { ok: false, error: "Kode SKU menu wajib diisi." }
  if (!input.category_id || !catalog.categories.some((c) => c.id === input.category_id)) {
    return { ok: false, error: "Pilih kategori menu yang valid." }
  }
  if (Number.isNaN(basePrice) || basePrice < 0) {
    return { ok: false, error: "Harga menu tidak boleh negatif." }
  }
  if (catalog.products.some((p) => p.id !== productId && p.sku.toUpperCase() === sku)) {
    return { ok: false, error: `SKU ${sku} sudah digunakan menu lain.` }
  }

  const tone: ProductTone =
    input.tone && VALID_TONES.includes(input.tone) ? input.tone : existing.tone
  const isCustomizable = Boolean(input.is_customizable)
  const targetBranchId =
    actor.role === "MANAGER"
      ? actor.branchId
      : input.branch_id !== undefined
      ? input.branch_id
        ? input.branch_id.trim()
        : null
      : existing.branch_id ?? null

  const updated: Product = {
    ...existing,
    category_id: input.category_id,
    branch_id: targetBranchId,
    name,
    base_price: basePrice,
    sku,
    mark: normalizeMark(name, input.mark),
    tone,
    is_customizable: isCustomizable,
    is_active: input.is_active !== false,
  }

  const nextRecipes = normalizeRecipes(productId, input.recipes ?? [])
  const nextModifierGroups: ProductModifierGroup[] = isCustomizable
    ? [
        { product_id: productId, group_id: "mg-temp", sort_order: 1 },
        { product_id: productId, group_id: "mg-sugar", sort_order: 2 },
      ]
    : []

  const supabase = getSupabaseAdmin()
  if (supabase) {
    const { error: updErr } = await supabase
      .from("products")
      .update({
        category_id: updated.category_id,
        branch_id: updated.branch_id ?? null,
        name: updated.name,
        base_price: updated.base_price,
        sku: updated.sku,
        mark: updated.mark,
        tone: updated.tone,
        is_customizable: updated.is_customizable,
        is_active: updated.is_active,
      })
      .eq("id", productId)

    if (updErr) {
      return { ok: false, error: `Gagal memperbarui menu di Supabase: ${updErr.message}` }
    }

    await supabase.from("product_recipes").delete().eq("product_id", productId)
    if (nextRecipes.length > 0) {
      await supabase.from("product_recipes").insert(nextRecipes)
    }

    await supabase.from("product_modifier_groups").delete().eq("product_id", productId)
    if (nextModifierGroups.length > 0) {
      await supabase.from("product_modifier_groups").insert(nextModifierGroups)
    }

    return { ok: true, product: updated, catalog: await getMenuCatalogServer() }
  }

  const next: MenuCatalogSnapshot = {
    ...catalog,
    products: catalog.products.map((p) => (p.id === productId ? updated : p)),
    product_recipes: [
      ...catalog.product_recipes.filter((r) => r.product_id !== productId),
      ...nextRecipes,
    ],
    product_modifier_groups: [
      ...catalog.product_modifier_groups.filter((pmg) => pmg.product_id !== productId),
      ...nextModifierGroups,
    ],
  }

  writeMenuToDisk(next)
  return { ok: true, product: updated, catalog: next }
}

export async function deleteProductServer(
  productId: string,
  actor: { role: "OWNER" | "MANAGER"; branchId: string | null }
): Promise<{ ok: true; catalog: MenuCatalogSnapshot } | { ok: false; error: string }> {
  const catalog = await getMenuCatalogServer()
  const existing = catalog.products.find((p) => p.id === productId)
  if (!existing) return { ok: false, error: "Menu tidak ditemukan." }

  if (actor.role === "MANAGER") {
    if (!existing.branch_id || existing.branch_id !== actor.branchId) {
      return {
        ok: false,
        error:
          "Manager cabang tidak dapat menghapus menu pusat Kafe Kala. Nonaktifkan saja ketersediaannya untuk cabang ini.",
      }
    }
  }

  const supabase = getSupabaseAdmin()
  if (supabase) {
    const { error } = await supabase.from("products").delete().eq("id", productId)
    if (error) return { ok: false, error: `Gagal menghapus menu di Supabase: ${error.message}` }
    return { ok: true, catalog: await getMenuCatalogServer() }
  }

  const next: MenuCatalogSnapshot = {
    ...catalog,
    products: catalog.products.filter((p) => p.id !== productId),
    branch_products: catalog.branch_products.filter((bp) => bp.product_id !== productId),
    product_recipes: catalog.product_recipes.filter((pr) => pr.product_id !== productId),
    product_modifier_groups: catalog.product_modifier_groups.filter(
      (pmg) => pmg.product_id !== productId
    ),
  }

  writeMenuToDisk(next)
  return { ok: true, catalog: next }
}

export async function upsertBranchProductOverrideServer(input: {
  branch_id: string
  product_id: string
  is_available: boolean
  custom_price: number | null
}): Promise<{ ok: true; branchProduct: BranchProduct; catalog: MenuCatalogSnapshot } | { ok: false; error: string }> {
  const catalog = await getMenuCatalogServer()
  if (!catalog.products.some((p) => p.id === input.product_id)) {
    return { ok: false, error: "Menu tidak ditemukan." }
  }
  const customPrice =
    input.custom_price === null ||
    input.custom_price === undefined ||
    Number.isNaN(Number(input.custom_price))
      ? null
      : Math.max(0, Math.round(Number(input.custom_price)))

  const entry: BranchProduct = {
    branch_id: input.branch_id,
    product_id: input.product_id,
    is_available: Boolean(input.is_available),
    custom_price: customPrice,
  }

  const supabase = getSupabaseAdmin()
  if (supabase) {
    const { error } = await supabase
      .from("branch_products")
      .upsert(entry, { onConflict: "branch_id,product_id" })

    if (error) {
      return { ok: false, error: `Gagal menyimpan pengaturan cabang di Supabase: ${error.message}` }
    }
    return { ok: true, branchProduct: entry, catalog: await getMenuCatalogServer() }
  }

  const exists = catalog.branch_products.some(
    (bp) => bp.branch_id === entry.branch_id && bp.product_id === entry.product_id
  )
  const nextBranchProducts = exists
    ? catalog.branch_products.map((bp) =>
        bp.branch_id === entry.branch_id && bp.product_id === entry.product_id ? entry : bp
      )
    : [...catalog.branch_products, entry]

  const next: MenuCatalogSnapshot = {
    ...catalog,
    branch_products: nextBranchProducts,
  }

  writeMenuToDisk(next)
  return { ok: true, branchProduct: entry, catalog: next }
}

export async function removeIngredientFromRecipesServer(ingredientId: string): Promise<void> {
  const supabase = getSupabaseAdmin()
  if (supabase) {
    await supabase.from("product_recipes").delete().eq("ingredient_id", ingredientId)
    return
  }

  const catalog = readMenuFromDisk()
  const filtered = catalog.product_recipes.filter((r) => r.ingredient_id !== ingredientId)
  if (filtered.length !== catalog.product_recipes.length) {
    writeMenuToDisk({ ...catalog, product_recipes: filtered })
  }
}

export async function removeBranchFromMenuServer(branchId: string): Promise<void> {
  const supabase = getSupabaseAdmin()
  if (supabase) {
    // Handled automatically by Postgres ON DELETE CASCADE when deleting from public.branches
    return
  }

  const catalog = readMenuFromDisk()
  const removedProductIds = new Set(
    catalog.products.filter((p) => p.branch_id === branchId).map((p) => p.id)
  )
  const next: MenuCatalogSnapshot = {
    ...catalog,
    products: catalog.products.filter((p) => p.branch_id !== branchId),
    branch_products: catalog.branch_products.filter(
      (bp) => bp.branch_id !== branchId && !removedProductIds.has(bp.product_id)
    ),
    product_recipes: catalog.product_recipes.filter((pr) => !removedProductIds.has(pr.product_id)),
    product_modifier_groups: catalog.product_modifier_groups.filter(
      (pmg) => !removedProductIds.has(pmg.product_id)
    ),
  }
  writeMenuToDisk(next)
}
