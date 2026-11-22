"use client"

import { useMemo, useState } from "react"
import { AlertTriangle, ArrowLeftRight, Boxes, Package, Plus, Trash2 } from "lucide-react"
import { IngredientCrudModal } from "@/components/inventory/ingredient-crud-modal"
import { ShiftStockReport } from "@/components/inventory/shift-stock-report"
import { BranchStockMatrix } from "@/components/owner/branch-stock-matrix"
import { GlobalInventoryTable } from "@/components/owner/global-inventory-table"
import { StockTransferModal } from "@/components/owner/stock-transfer-modal"
import { Button } from "@/components/ui/button"
import { Dialog } from "@/components/ui/dialog"
import { Select } from "@/components/ui/select"
import { Tabs } from "@/components/ui/tabs"
import { useToast } from "@/components/ui/toast"
import { useKalaPOS } from "@/lib/kalapos/context"
import {
  computeStockHealth,
  formatDateTimeID,
  formatIDR,
  formatIDRCompact,
} from "@/lib/kalapos/format"
import type { Ingredient } from "@/lib/kalapos/types"

export default function OwnerInventoryPage() {
  const { toast } = useToast()
  const {
    state,
    activeBranches,
    createIngredient,
    updateIngredient,
    deleteIngredient,
    transferStock,
  } = useKalaPOS()

  const [viewMode, setViewMode] = useState<"GLOBAL" | "MATRIX" | "SHIFT">("GLOBAL")
  const [transferModal, setTransferModal] = useState<{
    open: boolean
    ingredientId?: string
    toBranchId?: string
  }>({ open: false })

  // Ingredient CRUD state
  const [ingModalOpen, setIngModalOpen] = useState(false)
  const [editingIngredient, setEditingIngredient] = useState<Ingredient | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<Ingredient | null>(null)
  const [deleting, setDeleting] = useState(false)

  // Shift report selector
  const [selectedShiftId, setSelectedShiftId] = useState<string>("")

  const visibleBranches = useMemo(
    () => state.branches.filter((b) => !b.deleted_at),
    [state.branches]
  )

  const sortedShifts = useMemo(
    () =>
      [...state.shifts].sort(
        (a, b) => new Date(b.opened_at).getTime() - new Date(a.opened_at).getTime()
      ),
    [state.shifts]
  )

  const selectedShift = useMemo(() => {
    if (selectedShiftId) {
      const found = sortedShifts.find((s) => s.id === selectedShiftId)
      if (found) return found
    }
    return sortedShifts.find((s) => s.status === "OPEN") ?? sortedShifts[0] ?? null
  }, [sortedShifts, selectedShiftId])

  const branchNameMap = useMemo(
    () => new Map(state.branches.map((b) => [b.id, b.name])),
    [state.branches]
  )

  const summary = useMemo(() => {
    const visibleIds = new Set(visibleBranches.map((b) => b.id))
    const ingMap = new Map(state.ingredients.map((i) => [i.id, i]))
    let totalValuation = 0
    let lowCells = 0
    let criticalCells = 0

    for (const bs of state.branch_stocks) {
      if (!visibleIds.has(bs.branch_id)) continue
      const ing = ingMap.get(bs.ingredient_id)
      if (!ing) continue
      totalValuation += Math.round(bs.current_qty * ing.cost_per_unit)
      const h = computeStockHealth(bs.current_qty, bs.min_threshold)
      if (h === "Kritis") criticalCells++
      else if (h === "Menipis") lowCells++
    }
    return { totalValuation, lowCells, criticalCells }
  }, [state.branch_stocks, state.ingredients, visibleBranches])

  const editingMinThreshold = useMemo(() => {
    if (!editingIngredient) return 500
    const firstStock = state.branch_stocks.find(
      (bs) => bs.ingredient_id === editingIngredient.id
    )
    return firstStock?.min_threshold ?? 0
  }, [editingIngredient, state.branch_stocks])

  const recipeRefCount = useMemo(() => {
    if (!deleteTarget) return 0
    return state.product_recipes.filter((r) => r.ingredient_id === deleteTarget.id).length
  }, [deleteTarget, state.product_recipes])

  return (
    <div className="mx-auto max-w-[1440px] space-y-5 p-5 sm:p-8">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[#8E8982]">
            PERSEDIAAN &amp; PANTAUAN SHIFT · KAFE KALA
          </p>
          <h2 className="mt-1 text-2xl font-semibold tracking-[-0.025em] text-[#18181B]">
            Stok Bahan Baku &amp; Matriks Cabang
          </h2>
          <p className="mt-1 text-xs text-[#77736D]">
            Tambah, ubah, atau hapus bahan baku, distribusikan stok antar cabang, dan pantau mutasi stok setiap shift.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Tabs
            value={viewMode}
            onChange={setViewMode}
            options={[
              { value: "GLOBAL", label: "Stok Global" },
              { value: "MATRIX", label: "Matriks Cabang" },
              { value: "SHIFT", label: "Pantauan Shift" },
            ]}
          />
          <Button
            variant="outline"
            size="md"
            disabled={activeBranches.length < 2 || state.ingredients.length === 0}
            onClick={() => setTransferModal({ open: true })}
          >
            <ArrowLeftRight className="h-4 w-4" strokeWidth={1.5} />
            Transfer Stok
          </Button>
          <Button
            variant="default"
            size="md"
            onClick={() => {
              setEditingIngredient(null)
              setIngModalOpen(true)
            }}
          >
            <Plus className="h-4 w-4" strokeWidth={1.5} />
            Tambah Bahan Baku
          </Button>
        </div>
      </div>

      {/* Inventory Summary Cards */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <article className="rounded-lg border border-[#E5E2DC] bg-white p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs text-[#77736D]">Total Valuasi Stok (HPP)</span>
            <Package className="h-4 w-4 text-[#67625B]" strokeWidth={1.5} />
          </div>
          <p className="mt-2 font-mono text-2xl font-semibold tabular-nums text-[#18181B]">
            {formatIDRCompact(summary.totalValuation)}
          </p>
          <p className="mt-1 font-mono text-[11px] tabular-nums text-[#8E8982]">
            Exact: {formatIDR(summary.totalValuation)}
          </p>
        </article>

        <article className="rounded-lg border border-[#E5E2DC] bg-white p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs text-[#77736D]">SKU Bahan Terdaftar</span>
            <Boxes className="h-4 w-4 text-[#67625B]" strokeWidth={1.5} />
          </div>
          <p className="mt-2 font-mono text-2xl font-semibold tabular-nums text-[#18181B]">
            {state.ingredients.length}{" "}
            <span className="font-sans text-xs font-normal text-[#8E8982]">
              × {visibleBranches.length} cabang
            </span>
          </p>
          <p className="mt-1 text-[11px] text-[#8E8982]">
            Terhubung ke resep HPP (stok dikelola manual per shift)
          </p>
        </article>

        <article className="rounded-lg border border-[#E5E2DC] bg-white p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs text-[#77736D]">Peringatan Stok Jaringan</span>
            <AlertTriangle className="h-4 w-4 text-[#C2572A]" strokeWidth={1.5} />
          </div>
          <p className="mt-2 font-mono text-2xl font-semibold tabular-nums text-[#18181B]">
            {summary.criticalCells}{" "}
            <span className="font-sans text-xs font-medium text-[#991B1B]">kritis</span>
            <span className="mx-2 text-[#D6D2C9]">/</span>
            {summary.lowCells}{" "}
            <span className="font-sans text-xs font-medium text-[#A16207]">menipis</span>
          </p>
          <p className="mt-1 text-[11px] text-[#8E8982]">
            Pantau per cabang lewat Matriks atau tab Pantauan Shift
          </p>
        </article>
      </div>

      {/* Main View */}
      {viewMode === "GLOBAL" ? (
        <GlobalInventoryTable
          branches={visibleBranches}
          ingredients={state.ingredients}
          branchStocks={state.branch_stocks}
          transfers={state.stock_transfers}
          onOpenTransfer={(ingredientId) =>
            setTransferModal({ open: true, ingredientId })
          }
          onEditIngredient={(ing) => {
            setEditingIngredient(ing)
            setIngModalOpen(true)
          }}
          onDeleteIngredient={(ing) => setDeleteTarget(ing)}
        />
      ) : viewMode === "MATRIX" ? (
        <BranchStockMatrix
          branches={visibleBranches}
          ingredients={state.ingredients}
          branchStocks={state.branch_stocks}
          onQuickTransferTo={(ingredientId, toBranchId) =>
            setTransferModal({ open: true, ingredientId, toBranchId })
          }
        />
      ) : (
        <div className="space-y-4">
          {sortedShifts.length > 0 && (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[#E5E2DC] bg-white px-4 py-3">
              <p className="text-xs font-medium text-[#57534E]">
                Pilih shift cabang untuk meninjau mutasi stok &amp; referensi resep:
              </p>
              <Select
                aria-label="Pilih shift"
                value={selectedShift?.id ?? ""}
                onChange={(e) => setSelectedShiftId(e.target.value)}
                className="h-9 min-w-[260px] text-xs"
                options={sortedShifts.map((s) => ({
                  value: s.id,
                  label: `${branchNameMap.get(s.branch_id) ?? "Kafe Kala"} · ${formatDateTimeID(s.opened_at)} (${s.status === "OPEN" ? "Aktif" : "Tutup"})`,
                }))}
              />
            </div>
          )}
          <ShiftStockReport state={state} shift={selectedShift} />
        </div>
      )}

      {/* Ingredient Create / Edit Modal */}
      <IngredientCrudModal
        open={ingModalOpen}
        editingIngredient={editingIngredient}
        defaultMinThreshold={editingMinThreshold}
        allowBranchSelect
        branches={visibleBranches}
        onClose={() => setIngModalOpen(false)}
        onSubmit={async (payload) => {
          const res = editingIngredient
            ? await updateIngredient(editingIngredient.id, {
                sku: payload.sku,
                name: payload.name,
                unit: payload.unit,
                cost_per_unit: payload.cost_per_unit,
                branch_id: payload.branch_id,
                min_threshold: payload.min_threshold,
              })
            : await createIngredient(payload)

          if (res.ok) {
            toast(
              editingIngredient
                ? `Bahan baku "${payload.name}" diperbarui.`
                : `Bahan baku "${payload.name}" ditambahkan.`
            )
          }
          return res
        }}
      />

      {/* Delete Ingredient Confirmation */}
      <Dialog
        open={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        eyebrow="HAPUS BAHAN BAKU"
        title={`Hapus "${deleteTarget?.name ?? ""}"?`}
        description={
          recipeRefCount > 0
            ? `Bahan ini saat ini terhubung ke ${recipeRefCount} baris resep menu. Menghapusnya akan melepaskan bahan dari resep terkait dan menghapus saldo stoknya di semua cabang.`
            : "Bahan baku dan saldo stoknya di seluruh cabang akan dihapus dari daftar persediaan."
        }
        maxWidthClassName="max-w-sm"
      >
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="md"
            className="flex-1"
            disabled={deleting}
            onClick={() => setDeleteTarget(null)}
          >
            Batal
          </Button>
          <Button
            variant="destructiveSolid"
            size="md"
            className="flex-1"
            disabled={deleting}
            onClick={async () => {
              if (!deleteTarget) return
              setDeleting(true)
              try {
                const res = await deleteIngredient(deleteTarget.id)
                if (!res.ok) {
                  toast(res.error || "Gagal menghapus bahan baku.", "error")
                  return
                }
                toast(`Bahan baku "${deleteTarget.name}" dihapus.`, "info")
                setDeleteTarget(null)
              } finally {
                setDeleting(false)
              }
            }}
          >
            <Trash2 className="h-4 w-4" strokeWidth={1.5} />
            {deleting ? "Menghapus…" : "Hapus Bahan"}
          </Button>
        </div>
      </Dialog>

      {/* Inter-Branch Transfer Modal */}
      <StockTransferModal
        open={transferModal.open}
        onClose={() => setTransferModal({ open: false })}
        branches={visibleBranches}
        ingredients={state.ingredients}
        branchStocks={state.branch_stocks}
        defaultIngredientId={transferModal.ingredientId}
        defaultToBranchId={transferModal.toBranchId}
        onSubmitTransfer={transferStock}
      />
    </div>
  )
}
