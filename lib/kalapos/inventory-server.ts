import fs from "node:fs"
import path from "node:path"
import { generateId } from "./format"
import { removeIngredientFromRecipesServer } from "./menu-server"
import type { BranchStock, Ingredient, StockMovement, StockTransfer } from "./types"

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

export function getInventoryServer(): InventorySnapshot {
  return readInventoryFromDisk()
}

export function getScopedInventoryServer(branchId: string | null): InventorySnapshot {
  const full = readInventoryFromDisk()
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

export function createIngredientServer(
  input: IngredientUpsertServerInput,
  allBranchIds: string[]
): { ok: true; ingredient: Ingredient; inventory: InventorySnapshot } | { ok: false; error: string } {
  const inv = readInventoryFromDisk()
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

  const next: InventorySnapshot = {
    ...inv,
    ingredients: [...inv.ingredients, ingredient],
    branch_stocks: [...inv.branch_stocks, ...newStocks],
    stock_movements: [...newMovements, ...inv.stock_movements],
  }
  writeInventoryToDisk(next)
  return { ok: true, ingredient, inventory: next }
}

export function updateIngredientServer(
  ingredientId: string,
  input: {
    sku: string
    name: string
    unit: string
    cost_per_unit: number
    branch_id?: string | null
    min_threshold?: number
  }
): { ok: true; ingredient: Ingredient; inventory: InventorySnapshot } | { ok: false; error: string } {
  const inv = readInventoryFromDisk()
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

export function deleteIngredientServer(
  ingredientId: string
): { ok: true; inventory: InventorySnapshot } | { ok: false; error: string } {
  const inv = readInventoryFromDisk()
  if (!inv.ingredients.some((i) => i.id === ingredientId)) {
    return { ok: false, error: "Bahan baku tidak ditemukan." }
  }

  const next: InventorySnapshot = {
    ...inv,
    ingredients: inv.ingredients.filter((i) => i.id !== ingredientId),
    branch_stocks: inv.branch_stocks.filter((bs) => bs.ingredient_id !== ingredientId),
  }
  writeInventoryToDisk(next)
  removeIngredientFromRecipesServer(ingredientId)
  return { ok: true, inventory: next }
}

export function adjustBranchStockServer(input: {
  branch_id: string
  shift_id?: string | null
  ingredient_id: string
  type: "RESTOCK" | "MANUAL_OUT" | "WASTE" | "OPNAME"
  qty: number
  notes: string
  user_id: string
}): { ok: true; movement: StockMovement; inventory: InventorySnapshot } | { ok: false; error: string } {
  const inv = readInventoryFromDisk()
  if (!inv.ingredients.some((i) => i.id === input.ingredient_id)) {
    return { ok: false, error: "Bahan baku tidak ditemukan." }
  }

  const stockIdx = inv.branch_stocks.findIndex(
    (bs) => bs.branch_id === input.branch_id && bs.ingredient_id === input.ingredient_id
  )
  const existing = stockIdx >= 0 ? inv.branch_stocks[stockIdx] : null
  const currentQty = existing?.current_qty ?? 0
  const qty = Number(input.qty)

  if (Number.isNaN(qty)) return { ok: false, error: "Jumlah tidak valid." }

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

export function transferBranchStockServer(input: {
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
}): { ok: true; transfer: StockTransfer; inventory: InventorySnapshot } | { ok: false; error: string } {
  const inv = readInventoryFromDisk()
  if (input.from_branch_id === input.to_branch_id) {
    return { ok: false, error: "Cabang asal dan tujuan tidak boleh sama." }
  }
  const qty = Number(input.qty)
  if (Number.isNaN(qty) || qty <= 0) {
    return { ok: false, error: "Jumlah transfer harus lebih dari 0." }
  }

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

export function initBranchStocksForNewBranchServer(branchId: string): void {
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

export function removeBranchStocksServer(branchId: string): void {
  const inv = readInventoryFromDisk()
  const filtered = inv.branch_stocks.filter((bs) => bs.branch_id !== branchId)
  if (filtered.length !== inv.branch_stocks.length) {
    writeInventoryToDisk({ ...inv, branch_stocks: filtered })
  }
}
