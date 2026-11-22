import fs from "node:fs"
import path from "node:path"
import { generateId } from "./format"
import { removeIngredientFromRecipesServer } from "./menu-server"
import { getSupabaseAdmin } from "./supabase-server"
import type {
  BranchStock,
  Ingredient,
  StockMovement,
  StockMovementType,
  StockTransfer,
  StockTransferStatus,
} from "./types"

export interface InventorySnapshot {
  ingredients: Ingredient[]
  branch_stocks: BranchStock[]
  stock_movements: StockMovement[]
  stock_transfers: StockTransfer[]
}

const DATA_DIR = path.join(process.cwd(), ".kala-data")
const INVENTORY_FILE = path.join(DATA_DIR, "kala-inventory.json")

interface GlobalInventoryStore {
  cache: InventorySnapshot | null
}

const g = globalThis as unknown as { __kalaInventoryStore?: GlobalInventoryStore }
if (!g.__kalaInventoryStore) {
  g.__kalaInventoryStore = { cache: null }
}

function emptyInventory(): InventorySnapshot {
  return {
    ingredients: [],
    branch_stocks: [],
    stock_movements: [],
    stock_transfers: [],
  }
}

function readInventoryFromDisk(): InventorySnapshot {
  if (g.__kalaInventoryStore!.cache) {
    return g.__kalaInventoryStore!.cache
  }
  try {
    if (fs.existsSync(INVENTORY_FILE)) {
      const raw = fs.readFileSync(INVENTORY_FILE, "utf8")
      const parsed = JSON.parse(raw) as Partial<InventorySnapshot>
      if (parsed && typeof parsed === "object") {
        const loaded: InventorySnapshot = {
          ingredients: Array.isArray(parsed.ingredients) ? parsed.ingredients : [],
          branch_stocks: Array.isArray(parsed.branch_stocks) ? parsed.branch_stocks : [],
          stock_movements: Array.isArray(parsed.stock_movements) ? parsed.stock_movements : [],
          stock_transfers: Array.isArray(parsed.stock_transfers) ? parsed.stock_transfers : [],
        }
        g.__kalaInventoryStore!.cache = loaded
        return loaded
      }
    }
  } catch {
    /* fallback to empty */
  }
  const initial = emptyInventory()
  g.__kalaInventoryStore!.cache = initial
  return initial
}

function writeInventoryToDisk(snapshot: InventorySnapshot): void {
  g.__kalaInventoryStore!.cache = snapshot
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true })
    }
    fs.writeFileSync(INVENTORY_FILE, JSON.stringify(snapshot, null, 2), "utf8")
  } catch {
    /* read-only fallback */
  }
}

export async function getInventoryServer(): Promise<InventorySnapshot> {
  const supabase = getSupabaseAdmin()
  if (supabase) {
    const [ingRes, bsRes, movRes, trRes] = await Promise.all([
      supabase.from("ingredients").select("*").order("name", { ascending: true }),
      supabase.from("branch_stocks").select("*"),
      supabase
        .from("stock_movements")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(500),
      supabase
        .from("stock_transfers")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(200),
    ])

    if (!ingRes.error && !bsRes.error && !movRes.error && !trRes.error) {
      return {
        ingredients: (ingRes.data ?? []).map((i) => ({
          id: i.id,
          sku: i.sku,
          name: i.name,
          unit: i.unit,
          cost_per_unit: Number(i.cost_per_unit),
        })),
        branch_stocks: (bsRes.data ?? []).map((bs) => ({
          branch_id: bs.branch_id,
          ingredient_id: bs.ingredient_id,
          current_qty: Number(bs.current_qty),
          min_threshold: Number(bs.min_threshold),
        })),
        stock_movements: (movRes.data ?? []).map((sm) => ({
          id: sm.id,
          branch_id: sm.branch_id,
          shift_id: sm.shift_id,
          ingredient_id: sm.ingredient_id,
          type: sm.type as StockMovementType,
          qty_delta: Number(sm.qty_delta),
          balance_after: Number(sm.balance_after),
          reference_id: sm.reference_id,
          notes: sm.notes,
          created_by: sm.created_by,
          created_at: sm.created_at,
        })),
        stock_transfers: (trRes.data ?? []).map((tr) => ({
          id: tr.id,
          from_branch_id: tr.from_branch_id,
          to_branch_id: tr.to_branch_id,
          ingredient_id: tr.ingredient_id,
          qty: Number(tr.qty),
          status: tr.status as StockTransferStatus,
          notes: tr.notes,
          created_by: tr.created_by,
          created_at: tr.created_at,
          completed_at: tr.completed_at,
        })),
      }
    }
  }
  return readInventoryFromDisk()
}

export async function getScopedInventoryServer(
  branchId: string | null
): Promise<InventorySnapshot> {
  const full = await getInventoryServer()
  if (!branchId) return full
  return {
    ingredients: full.ingredients,
    branch_stocks: full.branch_stocks.filter((bs) => bs.branch_id === branchId),
    stock_movements: full.stock_movements.filter((sm) => sm.branch_id === branchId),
    stock_transfers: full.stock_transfers.filter(
      (tr) => tr.from_branch_id === branchId || tr.to_branch_id === branchId
    ),
  }
}

export interface IngredientUpsertServerInput {
  sku: string
  name: string
  unit: string
  cost_per_unit: number
  branch_id?: string | null
  initial_qty?: number
  min_threshold?: number
  user_id?: string | null
  shift_id?: string | null
}

export async function createIngredientServer(
  input: IngredientUpsertServerInput,
  allBranchIds: string[]
): Promise<{ ok: true; ingredient: Ingredient; inventory: InventorySnapshot } | { ok: false; error: string }> {
  const inv = await getInventoryServer()
  const name = input.name.trim()
  const sku = input.sku.trim().toUpperCase()
  const unit = input.unit.trim() || "g"
  const cost = Math.max(0, Math.round(Number(input.cost_per_unit) || 0))
  const minThreshold = Math.max(0, Number(input.min_threshold ?? 0) || 0)
  const initialQty = Math.max(0, Number(input.initial_qty ?? 0) || 0)

  if (!name) return { ok: false, error: "Nama bahan baku wajib diisi." }
  if (!sku) return { ok: false, error: "Kode SKU bahan baku wajib diisi." }
  if (inv.ingredients.some((i) => i.sku.toUpperCase() === sku)) {
    return { ok: false, error: `SKU ${sku} sudah digunakan bahan lain.` }
  }

  const ingredient: Ingredient = {
    id: generateId("ing"),
    sku,
    name,
    unit,
    cost_per_unit: cost,
  }

  const targetBranchId = input.branch_id || null
  const branchSet = new Set<string>(allBranchIds)
  if (targetBranchId) branchSet.add(targetBranchId)

  const newStocks: BranchStock[] = Array.from(branchSet).map((bid) => ({
    branch_id: bid,
    ingredient_id: ingredient.id,
    current_qty: targetBranchId ? (bid === targetBranchId ? initialQty : 0) : initialQty,
    min_threshold: minThreshold,
  }))

  const nowIso = new Date().toISOString()
  const newMovements: StockMovement[] = []
  if (initialQty > 0) {
    const seededBranchIds = targetBranchId ? [targetBranchId] : Array.from(branchSet)
    for (const bid of seededBranchIds) {
      newMovements.push({
        id: generateId("sm"),
        branch_id: bid,
        shift_id: input.shift_id ?? null,
        ingredient_id: ingredient.id,
        type: "RESTOCK",
        qty_delta: initialQty,
        balance_after: initialQty,
        reference_id: null,
        notes: "Saldo awal pendaftaran bahan baku",
        created_by: input.user_id ?? null,
        created_at: nowIso,
      })
    }
  }

  const supabase = getSupabaseAdmin()
  if (supabase) {
    const { error: ingErr } = await supabase.from("ingredients").insert(ingredient)
    if (ingErr) {
      return { ok: false, error: `Gagal menyimpan bahan baku ke Supabase: ${ingErr.message}` }
    }
    if (newStocks.length > 0) {
      await supabase
        .from("branch_stocks")
        .upsert(newStocks, { onConflict: "branch_id,ingredient_id" })
    }
    if (newMovements.length > 0) {
      await supabase.from("stock_movements").insert(
        newMovements.map((m) => ({
          id: m.id,
          branch_id: m.branch_id,
          shift_id: m.shift_id ?? null,
          ingredient_id: m.ingredient_id,
          type: m.type,
          qty_delta: m.qty_delta,
          balance_after: m.balance_after,
          reference_id: m.reference_id,
          notes: m.notes,
          created_by: m.created_by,
          created_at: m.created_at,
        }))
      )
    }
    return { ok: true, ingredient, inventory: await getInventoryServer() }
  }

  const next: InventorySnapshot = {
    ...inv,
    ingredients: [...inv.ingredients, ingredient],
    branch_stocks: [...inv.branch_stocks, ...newStocks],
    stock_movements: [...newMovements, ...inv.stock_movements],
  }
  writeInventoryToDisk(next)
  return { ok: true, ingredient, inventory: next }
}

export async function updateIngredientServer(
  ingredientId: string,
  input: {
    sku: string
    name: string
    unit: string
    cost_per_unit: number
    branch_id?: string | null
    min_threshold?: number
  }
): Promise<{ ok: true; ingredient: Ingredient; inventory: InventorySnapshot } | { ok: false; error: string }> {
  const inv = await getInventoryServer()
  const existing = inv.ingredients.find((i) => i.id === ingredientId)
  if (!existing) return { ok: false, error: "Bahan baku tidak ditemukan." }

  const name = input.name.trim()
  const sku = input.sku.trim().toUpperCase()
  const unit = input.unit.trim() || existing.unit
  const cost = Math.max(0, Math.round(Number(input.cost_per_unit) || 0))

  if (!name) return { ok: false, error: "Nama bahan baku wajib diisi." }
  if (!sku) return { ok: false, error: "Kode SKU bahan baku wajib diisi." }
  if (inv.ingredients.some((i) => i.id !== ingredientId && i.sku.toUpperCase() === sku)) {
    return { ok: false, error: `SKU ${sku} sudah digunakan bahan lain.` }
  }

  const updated: Ingredient = {
    ...existing,
    sku,
    name,
    unit,
    cost_per_unit: cost,
  }

  const supabase = getSupabaseAdmin()
  if (supabase) {
    const { error: updErr } = await supabase
      .from("ingredients")
      .update({
        sku: updated.sku,
        name: updated.name,
        unit: updated.unit,
        cost_per_unit: updated.cost_per_unit,
      })
      .eq("id", ingredientId)

    if (updErr) {
      return { ok: false, error: `Gagal memperbarui bahan baku di Supabase: ${updErr.message}` }
    }

    if (input.min_threshold !== undefined && !Number.isNaN(Number(input.min_threshold))) {
      const safeMin = Math.max(0, Number(input.min_threshold))
      if (input.branch_id) {
        const exists = inv.branch_stocks.some(
          (bs) => bs.branch_id === input.branch_id && bs.ingredient_id === ingredientId
        )
        if (exists) {
          await supabase
            .from("branch_stocks")
            .update({ min_threshold: safeMin })
            .eq("branch_id", input.branch_id)
            .eq("ingredient_id", ingredientId)
        } else {
          await supabase.from("branch_stocks").insert({
            branch_id: input.branch_id,
            ingredient_id: ingredientId,
            current_qty: 0,
            min_threshold: safeMin,
          })
        }
      } else {
        await supabase
          .from("branch_stocks")
          .update({ min_threshold: safeMin })
          .eq("ingredient_id", ingredientId)
      }
    }

    return { ok: true, ingredient: updated, inventory: await getInventoryServer() }
  }

  let nextStocks = inv.branch_stocks
  if (input.min_threshold !== undefined && !Number.isNaN(Number(input.min_threshold))) {
    const safeMin = Math.max(0, Number(input.min_threshold))
    if (input.branch_id) {
      const exists = nextStocks.some(
        (bs) => bs.branch_id === input.branch_id && bs.ingredient_id === ingredientId
      )
      nextStocks = exists
        ? nextStocks.map((bs) =>
            bs.branch_id === input.branch_id && bs.ingredient_id === ingredientId
              ? { ...bs, min_threshold: safeMin }
              : bs
          )
        : [
            ...nextStocks,
            {
              branch_id: input.branch_id,
              ingredient_id: ingredientId,
              current_qty: 0,
              min_threshold: safeMin,
            },
          ]
    } else {
      nextStocks = nextStocks.map((bs) =>
        bs.ingredient_id === ingredientId ? { ...bs, min_threshold: safeMin } : bs
      )
    }
  }

  const next: InventorySnapshot = {
    ...inv,
    ingredients: inv.ingredients.map((i) => (i.id === ingredientId ? updated : i)),
    branch_stocks: nextStocks,
  }
  writeInventoryToDisk(next)
  return { ok: true, ingredient: updated, inventory: next }
}

export async function deleteIngredientServer(
  ingredientId: string
): Promise<{ ok: true; inventory: InventorySnapshot } | { ok: false; error: string }> {
  const inv = await getInventoryServer()
  if (!inv.ingredients.some((i) => i.id === ingredientId)) {
    return { ok: false, error: "Bahan baku tidak ditemukan." }
  }

  const supabase = getSupabaseAdmin()
  if (supabase) {
    // ON DELETE CASCADE cleans branch_stocks & product_recipes automatically
    const { error } = await supabase.from("ingredients").delete().eq("id", ingredientId)
    if (error) {
      return { ok: false, error: `Gagal menghapus bahan baku di Supabase: ${error.message}` }
    }
    return { ok: true, inventory: await getInventoryServer() }
  }

  const next: InventorySnapshot = {
    ...inv,
    ingredients: inv.ingredients.filter((i) => i.id !== ingredientId),
    branch_stocks: inv.branch_stocks.filter((bs) => bs.ingredient_id !== ingredientId),
  }
  writeInventoryToDisk(next)
  await removeIngredientFromRecipesServer(ingredientId)
  return { ok: true, inventory: next }
}

export async function adjustBranchStockServer(input: {
  branch_id: string
  shift_id?: string | null
  ingredient_id: string
  type: "RESTOCK" | "MANUAL_OUT" | "WASTE" | "OPNAME"
  qty: number
  notes: string
  user_id: string
}): Promise<{ ok: true; movement: StockMovement; inventory: InventorySnapshot } | { ok: false; error: string }> {
  const qty = Number(input.qty)
  if (Number.isNaN(qty)) return { ok: false, error: "Jumlah tidak valid." }

  const supabase = getSupabaseAdmin()
  if (supabase) {
    const movementId = generateId("sm")
    const { data, error } = await supabase.rpc("adjust_branch_stock", {
      p_movement_id: movementId,
      p_branch_id: input.branch_id,
      p_shift_id: input.shift_id ?? null,
      p_ingredient_id: input.ingredient_id,
      p_type: input.type,
      p_qty: qty,
      p_notes: input.notes ?? "",
      p_user_id: input.user_id,
    })

    if (error) {
      return { ok: false, error: error.message }
    }

    const row = data as Record<string, unknown>
    const movement: StockMovement = {
      id: String(row.id ?? movementId),
      branch_id: String(row.branch_id ?? input.branch_id),
      shift_id: (row.shift_id as string | null) ?? null,
      ingredient_id: String(row.ingredient_id ?? input.ingredient_id),
      type: (row.type as StockMovementType) ?? input.type,
      qty_delta: Number(row.qty_delta ?? 0),
      balance_after: Number(row.balance_after ?? 0),
      reference_id: null,
      notes: String(row.notes ?? ""),
      created_by: (row.created_by as string | null) ?? input.user_id,
      created_at: String(row.created_at ?? new Date().toISOString()),
    }

    return { ok: true, movement, inventory: await getInventoryServer() }
  }

  const inv = readInventoryFromDisk()
  if (!inv.ingredients.some((i) => i.id === input.ingredient_id)) {
    return { ok: false, error: "Bahan baku tidak ditemukan." }
  }

  const stockIdx = inv.branch_stocks.findIndex(
    (bs) => bs.branch_id === input.branch_id && bs.ingredient_id === input.ingredient_id
  )
  const existing = stockIdx >= 0 ? inv.branch_stocks[stockIdx] : null
  const currentQty = existing?.current_qty ?? 0

  let delta = 0
  let nextQty = currentQty
  if (input.type === "RESTOCK") {
    if (qty <= 0) return { ok: false, error: "Jumlah restok harus lebih dari 0." }
    delta = Number(qty.toFixed(3))
    nextQty = Number((currentQty + qty).toFixed(3))
  } else if (input.type === "MANUAL_OUT" || input.type === "WASTE") {
    if (qty <= 0) return { ok: false, error: "Jumlah keluar harus lebih dari 0." }
    const deducted = Math.min(currentQty, qty)
    delta = -Number(deducted.toFixed(3))
    nextQty = Math.max(0, Number((currentQty - qty).toFixed(3)))
  } else {
    if (qty < 0) return { ok: false, error: "Hasil opname tidak boleh negatif." }
    if (!input.notes.trim()) return { ok: false, error: "Catatan audit opname wajib diisi." }
    nextQty = Number(qty.toFixed(3))
    delta = Number((nextQty - currentQty).toFixed(3))
  }

  const nextStocks =
    stockIdx >= 0
      ? inv.branch_stocks.map((bs, idx) =>
          idx === stockIdx ? { ...bs, current_qty: nextQty } : bs
        )
      : [
          ...inv.branch_stocks,
          {
            branch_id: input.branch_id,
            ingredient_id: input.ingredient_id,
            current_qty: nextQty,
            min_threshold: 0,
          },
        ]

  const defaultNotes =
    input.type === "RESTOCK"
      ? "Stok masuk pemasok"
      : input.type === "MANUAL_OUT"
      ? "Pemakaian bahan shift"
      : input.type === "WASTE"
      ? "Pencatatan waste bar"
      : "Penyesuaian stock opname"

  const movement: StockMovement = {
    id: generateId("sm"),
    branch_id: input.branch_id,
    shift_id: input.shift_id ?? null,
    ingredient_id: input.ingredient_id,
    type: input.type,
    qty_delta: delta,
    balance_after: nextQty,
    reference_id: null,
    notes: input.notes.trim() || defaultNotes,
    created_by: input.user_id,
    created_at: new Date().toISOString(),
  }

  const next: InventorySnapshot = {
    ...inv,
    branch_stocks: nextStocks,
    stock_movements: [movement, ...inv.stock_movements],
  }
  writeInventoryToDisk(next)
  return { ok: true, movement, inventory: next }
}

export async function transferBranchStockServer(input: {
  from_branch_id: string
  from_branch_name: string
  to_branch_id: string
  to_branch_name: string
  ingredient_id: string
  qty: number
  notes: string
  user_id: string
  from_shift_id?: string | null
  to_shift_id?: string | null
}): Promise<{ ok: true; transfer: StockTransfer; inventory: InventorySnapshot } | { ok: false; error: string }> {
  if (input.from_branch_id === input.to_branch_id) {
    return { ok: false, error: "Cabang asal dan tujuan tidak boleh sama." }
  }
  const qty = Number(input.qty)
  if (Number.isNaN(qty) || qty <= 0) {
    return { ok: false, error: "Jumlah transfer harus lebih dari 0." }
  }

  const supabase = getSupabaseAdmin()
  if (supabase) {
    const transferId = generateId("tr")
    const outMovId = generateId("sm")
    const inMovId = generateId("sm")

    const { error } = await supabase.rpc("transfer_branch_stock", {
      p_transfer_id: transferId,
      p_out_movement_id: outMovId,
      p_in_movement_id: inMovId,
      p_from_branch_id: input.from_branch_id,
      p_to_branch_id: input.to_branch_id,
      p_ingredient_id: input.ingredient_id,
      p_qty: qty,
      p_notes: input.notes ?? "",
      p_user_id: input.user_id,
      p_from_shift_id: input.from_shift_id ?? null,
      p_to_shift_id: input.to_shift_id ?? null,
    })

    if (error) {
      return { ok: false, error: error.message }
    }

    const inventory = await getInventoryServer()
    const created = inventory.stock_transfers.find((t) => t.id === transferId)
    const nowIso = new Date().toISOString()
    const transfer: StockTransfer = created ?? {
      id: transferId,
      from_branch_id: input.from_branch_id,
      to_branch_id: input.to_branch_id,
      ingredient_id: input.ingredient_id,
      qty,
      status: "COMPLETED",
      notes: input.notes.trim() || `Transfer dari ${input.from_branch_name} ke ${input.to_branch_name}`,
      created_by: input.user_id,
      created_at: nowIso,
      completed_at: nowIso,
    }
    return { ok: true, transfer, inventory }
  }

  const inv = readInventoryFromDisk()
  const fromStock = inv.branch_stocks.find(
    (bs) => bs.branch_id === input.from_branch_id && bs.ingredient_id === input.ingredient_id
  )
  if (!fromStock || fromStock.current_qty < qty) {
    return { ok: false, error: "Stok cabang asal tidak mencukupi untuk jumlah transfer ini." }
  }

  const nowIso = new Date().toISOString()
  const transferId = generateId("tr")
  const fromBalance = Number((fromStock.current_qty - qty).toFixed(3))

  const existingTo = inv.branch_stocks.find(
    (bs) => bs.branch_id === input.to_branch_id && bs.ingredient_id === input.ingredient_id
  )
  const toBalance = Number(((existingTo?.current_qty ?? 0) + qty).toFixed(3))

  let updatedStocks = inv.branch_stocks.map((bs) => {
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
    qty,
    status: "COMPLETED",
    notes: input.notes.trim() || `Transfer dari ${input.from_branch_name} ke ${input.to_branch_name}`,
    created_by: input.user_id,
    created_at: nowIso,
    completed_at: nowIso,
  }

  const outMovement: StockMovement = {
    id: generateId("sm"),
    branch_id: input.from_branch_id,
    shift_id: input.from_shift_id ?? null,
    ingredient_id: input.ingredient_id,
    type: "TRANSFER_OUT",
    qty_delta: -qty,
    balance_after: fromBalance,
    reference_id: transferId,
    notes: `Transfer keluar ke ${input.to_branch_name}${input.notes.trim() ? ` · ${input.notes.trim()}` : ""}`,
    created_by: input.user_id,
    created_at: nowIso,
  }

  const inMovement: StockMovement = {
    id: generateId("sm"),
    branch_id: input.to_branch_id,
    shift_id: input.to_shift_id ?? null,
    ingredient_id: input.ingredient_id,
    type: "TRANSFER_IN",
    qty_delta: qty,
    balance_after: toBalance,
    reference_id: transferId,
    notes: `Transfer masuk dari ${input.from_branch_name}${input.notes.trim() ? ` · ${input.notes.trim()}` : ""}`,
    created_by: input.user_id,
    created_at: nowIso,
  }

  const next: InventorySnapshot = {
    ...inv,
    branch_stocks: updatedStocks,
    stock_transfers: [transfer, ...inv.stock_transfers],
    stock_movements: [inMovement, outMovement, ...inv.stock_movements],
  }
  writeInventoryToDisk(next)
  return { ok: true, transfer, inventory: next }
}

export async function initBranchStocksForNewBranchServer(branchId: string): Promise<void> {
  const supabase = getSupabaseAdmin()
  if (supabase) {
    const { data: ings } = await supabase.from("ingredients").select("id")
    if (!ings || ings.length === 0) return
    await supabase.from("branch_stocks").upsert(
      ings.map((ing) => ({
        branch_id: branchId,
        ingredient_id: ing.id,
        current_qty: 0,
        min_threshold: 0,
      })),
      { onConflict: "branch_id,ingredient_id", ignoreDuplicates: true }
    )
    return
  }

  const inv = readInventoryFromDisk()
  if (inv.ingredients.length === 0) return
  const existing = new Set(
    inv.branch_stocks.filter((bs) => bs.branch_id === branchId).map((bs) => bs.ingredient_id)
  )
  const additions: BranchStock[] = inv.ingredients
    .filter((ing) => !existing.has(ing.id))
    .map((ing) => ({
      branch_id: branchId,
      ingredient_id: ing.id,
      current_qty: 0,
      min_threshold: 0,
    }))
  if (additions.length > 0) {
    writeInventoryToDisk({
      ...inv,
      branch_stocks: [...inv.branch_stocks, ...additions],
    })
  }
}

export async function removeBranchStocksServer(branchId: string): Promise<void> {
  const supabase = getSupabaseAdmin()
  if (supabase) {
    // Handled automatically by Postgres ON DELETE CASCADE when deleting from public.branches
    return
  }

  const inv = readInventoryFromDisk()
  const filtered = inv.branch_stocks.filter((bs) => bs.branch_id !== branchId)
  if (filtered.length !== inv.branch_stocks.length) {
    writeInventoryToDisk({ ...inv, branch_stocks: filtered })
  }
}
