"use client"

import { useMemo, useState } from "react"
import {
  AlertTriangle,
  ArrowDownRight,
  Boxes,
  ClipboardCheck,
  Edit3,
  MinusCircle,
  Package,
  Plus,
  Search,
  Trash2,
} from "lucide-react"
import { IngredientCrudModal } from "@/components/inventory/ingredient-crud-modal"
import { ShiftStockReport } from "@/components/inventory/shift-stock-report"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Dialog } from "@/components/ui/dialog"
import { FieldLabel, Input } from "@/components/ui/input"
import { SupervisorPinModal } from "@/components/ui/pin-pad"
import { Select } from "@/components/ui/select"
import {
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Tabs } from "@/components/ui/tabs"
import { useToast } from "@/components/ui/toast"
import { useKalaPOS } from "@/lib/kalapos/context"
import {
  computeStockHealth,
  formatDateTimeID,
  formatIDR,
  formatIDRCompact,
  formatQty,
} from "@/lib/kalapos/format"
import type { Ingredient, StockHealth, StockMovementType } from "@/lib/kalapos/types"
import { cn } from "@/lib/utils"

const MOVEMENT_LABELS: Record<
  StockMovementType,
  { label: string; variant: "aman" | "menipis" | "kritis" | "info" | "default" }
> = {
  SALE_DEDUCT: { label: "Penjualan (BOM)", variant: "default" },
  MANUAL_OUT: { label: "Pemakaian Shift", variant: "menipis" },
  RESTOCK: { label: "Restok Masuk", variant: "aman" },
  TRANSFER_IN: { label: "Transfer Masuk", variant: "info" },
  TRANSFER_OUT: { label: "Transfer Keluar", variant: "menipis" },
  WASTE: { label: "Waste / Rusak", variant: "kritis" },
  OPNAME: { label: "Stock Opname", variant: "info" },
}

export function BranchStockTable() {
  const { toast } = useToast()
  const {
    state,
    session,
    activeBranch,
    activeShift,
    createIngredient,
    updateIngredient,
    deleteIngredient,
    recordRestock,
    recordManualOut,
    recordWaste,
    recordStockOpname,
  } = useKalaPOS()

  const canCrudIngredients = session?.role === "OWNER" || session?.role === "MANAGER"

  const [viewTab, setViewTab] = useState<"STOCK" | "SHIFT" | "LEDGER">("STOCK")
  const [search, setSearch] = useState("")
  const [healthFilter, setHealthFilter] = useState<"ALL" | StockHealth>("ALL")
  const [selectedShiftId, setSelectedShiftId] = useState<string>("")

  // Ingredient Master CRUD modal (Owner & Branch Manager)
  const [ingModalOpen, setIngModalOpen] = useState(false)
  const [editingIngredient, setEditingIngredient] = useState<Ingredient | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<Ingredient | null>(null)
  const [deletingIng, setDeletingIng] = useState(false)

  // Stock adjustment modal (Restock / Manual Out / Waste / Opname)
  const [actionModal, setActionModal] = useState<{
    mode: "RESTOCK" | "MANUAL_OUT" | "WASTE" | "OPNAME_DRAFT"
    ingredientId: string
  } | null>(null)
  const [qtyInput, setQtyInput] = useState("")
  const [noteInput, setNoteInput] = useState("")
  const [actionSubmitting, setActionSubmitting] = useState(false)

  // Opname Supervisor PIN step
  const [pendingOpname, setPendingOpname] = useState<{
    ingredientId: string
    ingredientName: string
    countedQty: number
    currentQty: number
    unit: string
  } | null>(null)

  const ingredientMap = useMemo(
    () => new Map(state.ingredients.map((i) => [i.id, i])),
    [state.ingredients]
  )
  const userMap = useMemo(
    () => new Map(state.users.map((u) => [u.id, u.full_name])),
    [state.users]
  )

  const rows = useMemo(() => {
    const branchStocks = state.branch_stocks.filter((bs) => bs.branch_id === activeBranch?.id)
    const stockByIng = new Map(branchStocks.map((bs) => [bs.ingredient_id, bs]))

    return state.ingredients.map((ing) => {
      const bs = stockByIng.get(ing.id)
      const currentQty = bs?.current_qty ?? 0
      const minThreshold = bs?.min_threshold ?? 0
      const health = computeStockHealth(currentQty, minThreshold)
      const valuation = Math.round(currentQty * ing.cost_per_unit)
      return { ingredient: ing, currentQty, minThreshold, health, valuation }
    })
  }, [state.branch_stocks, state.ingredients, activeBranch?.id])

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase()
    return rows.filter((r) => {
      if (healthFilter !== "ALL" && r.health !== healthFilter) return false
      if (
        q &&
        !r.ingredient.name.toLowerCase().includes(q) &&
        !r.ingredient.sku.toLowerCase().includes(q)
      ) {
        return false
      }
      return true
    })
  }, [rows, search, healthFilter])

  const branchMovements = useMemo(
    () =>
      state.stock_movements
        .filter((m) => m.branch_id === activeBranch?.id)
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()),
    [state.stock_movements, activeBranch?.id]
  )

  const branchShifts = useMemo(
    () =>
      state.shifts
        .filter((s) => (activeBranch ? s.branch_id === activeBranch.id : true))
        .sort((a, b) => new Date(b.opened_at).getTime() - new Date(a.opened_at).getTime()),
    [state.shifts, activeBranch]
  )

  const inspectedShift = useMemo(() => {
    if (selectedShiftId) {
      const found = branchShifts.find((s) => s.id === selectedShiftId)
      if (found) return found
    }
    return activeShift ?? branchShifts[0] ?? null
  }, [selectedShiftId, branchShifts, activeShift])

  const totalValuation = useMemo(() => rows.reduce((sum, r) => sum + r.valuation, 0), [rows])
  const alertCount = useMemo(() => rows.filter((r) => r.health !== "Aman").length, [rows])

  const editingMinThreshold = useMemo(() => {
    if (!editingIngredient) return 500
    return (
      rows.find((r) => r.ingredient.id === editingIngredient.id)?.minThreshold ?? 0
    )
  }, [editingIngredient, rows])

  const openModal = (
    mode: "RESTOCK" | "MANUAL_OUT" | "WASTE" | "OPNAME_DRAFT",
    ingredientId?: string
  ) => {
    const targetId = ingredientId || state.ingredients[0]?.id || ""
    const currentRow = rows.find((r) => r.ingredient.id === targetId)
    setActionModal({ mode, ingredientId: targetId })
    setQtyInput(mode === "OPNAME_DRAFT" ? String(currentRow?.currentQty ?? 0) : "")
    setNoteInput("")
  }

  const handleActionSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!actionModal) return
    const numQty = Number(qtyInput)
    if (Number.isNaN(numQty)) return

    if (actionModal.mode === "OPNAME_DRAFT") {
      const row = rows.find((r) => r.ingredient.id === actionModal.ingredientId)
      if (!row) return
      setPendingOpname({
        ingredientId: row.ingredient.id,
        ingredientName: row.ingredient.name,
        countedQty: numQty,
        currentQty: row.currentQty,
        unit: row.ingredient.unit,
      })
      setActionModal(null)
      return
    }

    setActionSubmitting(true)
    try {
      if (actionModal.mode === "RESTOCK") {
        const res = await recordRestock(actionModal.ingredientId, numQty, noteInput)
        if (!res.ok) {
          toast(res.error || "Gagal mencatat restok.", "error")
          return
        }
        toast("Restok bahan berhasil dicatat ke buku besar shift.")
        setActionModal(null)
      } else if (actionModal.mode === "MANUAL_OUT") {
        const res = await recordManualOut(actionModal.ingredientId, numQty, noteInput)
        if (!res.ok) {
          toast(res.error || "Gagal mencatat pemakaian bahan.", "error")
          return
        }
        toast("Pemakaian bahan shift berhasil dicatat.")
        setActionModal(null)
      } else if (actionModal.mode === "WASTE") {
        const res = await recordWaste(actionModal.ingredientId, numQty, noteInput)
        if (!res.ok) {
          toast(res.error || "Gagal mencatat waste.", "error")
          return
        }
        toast("Pencatatan waste berhasil disimpan.", "info")
        setActionModal(null)
      }
    } finally {
      setActionSubmitting(false)
    }
  }

  const selectedModalIng = actionModal ? ingredientMap.get(actionModal.ingredientId) : undefined

  return (
    <div className="mx-auto max-w-[1440px] p-4 sm:p-6">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[#8E8982]">
            PERSEDIAAN CABANG · {activeBranch?.name.toUpperCase() ?? "KAFE KALA"}
          </p>
          <h2 className="mt-1 text-2xl font-semibold tracking-[-0.025em] text-[#18181B]">
            Stok Bahan Baku &amp; Pantauan Shift
          </h2>
          <p className="mt-1 text-xs text-[#77736D]">
            Stok fisik dikelola manual per shift (restok, pemakaian, waste, &amp; opname) — resep menu hanya menjadi referensi estimasi dan tidak memotong stok otomatis.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            size="md"
            disabled={!activeBranch || rows.length === 0}
            onClick={() => openModal("MANUAL_OUT")}
          >
            <MinusCircle className="h-4 w-4 text-[#A16207]" strokeWidth={1.5} />
            Catat Pemakaian
          </Button>
          <Button
            variant="outline"
            size="md"
            disabled={!activeBranch || rows.length === 0}
            onClick={() => openModal("WASTE")}
          >
            <Trash2 className="h-4 w-4 text-[#991B1B]" strokeWidth={1.5} />
            Catat Waste
          </Button>
          <Button
            variant="outline"
            size="md"
            disabled={!activeBranch || rows.length === 0}
            onClick={() => openModal("OPNAME_DRAFT")}
          >
            <ClipboardCheck className="h-4 w-4 text-[#C2572A]" strokeWidth={1.5} />
            Stock Opname
          </Button>
          <Button
            variant="outline"
            size="md"
            disabled={!activeBranch || rows.length === 0}
            onClick={() => openModal("RESTOCK")}
          >
            <Plus className="h-4 w-4 text-[#166534]" strokeWidth={1.5} />
            Restok Masuk
          </Button>
          {canCrudIngredients && (
            <Button
              variant="default"
              size="md"
              disabled={!activeBranch}
              onClick={() => {
                setEditingIngredient(null)
                setIngModalOpen(true)
              }}
            >
              <Plus className="h-4 w-4" strokeWidth={1.5} />
              Tambah Bahan
            </Button>
          )}
        </div>
      </div>

      {/* KPI Cards */}
      <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <article className="rounded-lg border border-[#E5E2DC] bg-white p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs text-[#77736D]">Total SKU Bahan</span>
            <span className="flex h-8 w-8 items-center justify-center rounded border border-[#EFECE7] bg-[#FAF9F7] text-[#57534E]">
              <Boxes className="h-4 w-4" strokeWidth={1.5} />
            </span>
          </div>
          <p className="mt-2 font-mono text-2xl font-semibold tabular-nums text-[#18181B]">
            {rows.length} <span className="font-sans text-xs font-medium text-[#8E8982]">item</span>
          </p>
          <p className="mt-1 text-[11px] text-[#8E8982]">
            {activeShift ? "Terpantau pada shift aktif saat ini" : "Buka shift untuk melacak stok per shift"}
          </p>
        </article>

        <article className="rounded-lg border border-[#E5E2DC] bg-white p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs text-[#77736D]">Nilai Persediaan (HPP)</span>
            <span className="flex h-8 w-8 items-center justify-center rounded border border-[#EFECE7] bg-[#FAF9F7] text-[#57534E]">
              <Package className="h-4 w-4" strokeWidth={1.5} />
            </span>
          </div>
          <p className="mt-2 font-mono text-2xl font-semibold tabular-nums text-[#18181B]">
            {formatIDRCompact(totalValuation)}
          </p>
          <p className="mt-1 font-mono text-[11px] tabular-nums text-[#8E8982]">
            Exact: {formatIDR(totalValuation)}
          </p>
        </article>

        <article className="rounded-lg border border-[#E5E2DC] bg-white p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs text-[#77736D]">Stok Perlu Perhatian</span>
            <span className="flex h-8 w-8 items-center justify-center rounded border border-[#FDE68A] bg-[#FFFBEB] text-[#A16207]">
              <AlertTriangle className="h-4 w-4" strokeWidth={1.5} />
            </span>
          </div>
          <p className="mt-2 font-mono text-2xl font-semibold tabular-nums text-[#18181B]">
            {alertCount} <span className="font-sans text-xs font-medium text-[#8E8982]">bahan</span>
          </p>
          <p className="mt-1 text-[11px] text-[#A16207]">Di bawah batas minimum cabang ini</p>
        </article>
      </div>

      {/* View Switcher & Content */}
      <div className="mt-5 overflow-hidden rounded-lg border border-[#E5E2DC] bg-white">
        <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3.5">
          <Tabs
            value={viewTab}
            onChange={setViewTab}
            options={[
              { value: "STOCK", label: "Stok Tersedia", count: rows.length },
              { value: "SHIFT", label: "Pantauan Shift", count: branchShifts.length },
              { value: "LEDGER", label: "Buku Besar Mutasi", count: branchMovements.length },
            ]}
          />

          {viewTab === "STOCK" && (
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center gap-1 rounded-md border border-[#E5E2DC] bg-[#FAF9F7] p-0.5">
                {(["ALL", "Kritis", "Menipis", "Aman"] as const).map((h) => (
                  <button
                    key={h}
                    type="button"
                    onClick={() => setHealthFilter(h)}
                    className={cn(
                      "rounded px-2.5 py-1 text-[11px] font-medium cursor-pointer",
                      healthFilter === h
                        ? "bg-white text-[#18181B] shadow-[0_1px_2px_rgba(24,24,27,0.06)] font-semibold"
                        : "text-[#77736D] hover:text-[#18181B]"
                    )}
                  >
                    {h === "ALL" ? "Semua" : h}
                  </button>
                ))}
              </div>

              <label className="flex h-9 items-center gap-2 rounded-md border border-[#E5E2DC] bg-white px-2.5">
                <Search className="h-3.5 w-3.5 text-[#8E8982]" strokeWidth={1.5} />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Cari bahan atau SKU…"
                  className="w-40 bg-transparent text-xs text-[#18181B] placeholder:text-[#9A958E] outline-none"
                />
              </label>
            </div>
          )}

          {viewTab === "SHIFT" && branchShifts.length > 0 && (
            <Select
              aria-label="Pilih shift cabang"
              value={inspectedShift?.id ?? ""}
              onChange={(e) => setSelectedShiftId(e.target.value)}
              className="h-9 min-w-[240px] text-xs"
              options={branchShifts.map((s) => ({
                value: s.id,
                label: `${formatDateTimeID(s.opened_at)} (${s.status === "OPEN" ? "Aktif" : "Ditutup"})`,
              }))}
            />
          )}
        </div>

        {viewTab === "STOCK" ? (
          <TableContainer>
            <TableHeader>
              <tr>
                <TableHead>Bahan Baku</TableHead>
                <TableHead>SKU</TableHead>
                <TableHead>Stok Tersedia</TableHead>
                <TableHead>Batas Minimum</TableHead>
                <TableHead>HPP / Satuan</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Aksi Cepat</TableHead>
              </tr>
            </TableHeader>
            <TableBody>
              {filteredRows.map(({ ingredient, currentQty, minThreshold, health }) => {
                const ratio =
                  minThreshold > 0
                    ? Math.min(100, Math.max(8, (currentQty / (minThreshold * 1.8)) * 100))
                    : 100
                const variant =
                  health === "Aman" ? "aman" : health === "Menipis" ? "menipis" : "kritis"
                return (
                  <TableRow key={ingredient.id}>
                    <TableCell>
                      <div className="flex items-center gap-2.5">
                        <span className="flex h-8 w-8 items-center justify-center rounded border border-[#EFECE7] bg-[#FAF9F7] text-[#67625B]">
                          <Package className="h-4 w-4" strokeWidth={1.5} />
                        </span>
                        <span className="font-semibold text-[#18181B]">{ingredient.name}</span>
                      </div>
                    </TableCell>
                    <TableCell className="font-mono text-[11px] text-[#8E8982]">
                      {ingredient.sku}
                    </TableCell>
                    <TableCell>
                      <p className="font-mono font-semibold tabular-nums text-[#18181B]">
                        {formatQty(currentQty, ingredient.unit)}
                      </p>
                      <div className="mt-1.5 h-1 w-24 overflow-hidden rounded-full bg-[#EFECE7]">
                        <div
                          className={cn(
                            "h-full rounded-full",
                            health === "Aman"
                              ? "bg-[#166534]"
                              : health === "Menipis"
                              ? "bg-[#D97706]"
                              : "bg-[#991B1B]"
                          )}
                          style={{ width: `${ratio}%` }}
                        />
                      </div>
                    </TableCell>
                    <TableCell className="font-mono tabular-nums text-[#8E8982]">
                      {formatQty(minThreshold, ingredient.unit)}
                    </TableCell>
                    <TableCell className="font-mono tabular-nums text-[#57534E]">
                      {formatIDR(ingredient.cost_per_unit)}/{ingredient.unit}
                    </TableCell>
                    <TableCell>
                      <Badge variant={variant} dot>
                        {health}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="inline-flex items-center gap-1">
                        <Button
                          variant="outline"
                          size="xs"
                          onClick={() => openModal("RESTOCK", ingredient.id)}
                        >
                          + Masuk
                        </Button>
                        <Button
                          variant="ghost"
                          size="xs"
                          onClick={() => openModal("MANUAL_OUT", ingredient.id)}
                        >
                          Pakai
                        </Button>
                        <Button
                          variant="ghost"
                          size="xs"
                          onClick={() => openModal("OPNAME_DRAFT", ingredient.id)}
                        >
                          Opname
                        </Button>
                        {canCrudIngredients && (
                          <>
                            <Button
                              variant="ghost"
                              size="iconSm"
                              aria-label={`Edit ${ingredient.name}`}
                              title="Edit bahan baku"
                              onClick={() => {
                                setEditingIngredient(ingredient)
                                setIngModalOpen(true)
                              }}
                            >
                              <Edit3 className="h-3.5 w-3.5 text-[#67625B]" strokeWidth={1.5} />
                            </Button>
                            <Button
                              variant="ghost"
                              size="iconSm"
                              aria-label={`Hapus ${ingredient.name}`}
                              title="Hapus bahan baku"
                              onClick={() => setDeleteTarget(ingredient)}
                            >
                              <Trash2
                                className="h-3.5 w-3.5 text-[#8E8982] hover:text-[#991B1B]"
                                strokeWidth={1.5}
                              />
                            </Button>
                          </>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                )
              })}
              {filteredRows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="py-10 text-center text-xs text-[#8E8982]">
                    {rows.length === 0
                      ? "Belum ada data bahan baku terdaftar. Tambahkan bahan baku untuk mulai mencatat stok per shift."
                      : "Tidak ada bahan baku yang cocok dengan pencarian."}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </TableContainer>
        ) : viewTab === "SHIFT" ? (
          <div className="p-4">
            <ShiftStockReport
              state={state}
              shift={inspectedShift}
              title="Pantauan Stok per Shift Cabang"
            />
          </div>
        ) : (
          <TableContainer>
            <TableHeader>
              <tr>
                <TableHead>Waktu</TableHead>
                <TableHead>Bahan</TableHead>
                <TableHead>Tipe Mutasi</TableHead>
                <TableHead className="text-right">Perubahan</TableHead>
                <TableHead className="text-right">Saldo Akhir</TableHead>
                <TableHead>Catatan &amp; Petugas</TableHead>
              </tr>
            </TableHeader>
            <TableBody>
              {branchMovements.map((m) => {
                const ing = ingredientMap.get(m.ingredient_id)
                const meta = MOVEMENT_LABELS[m.type] ?? { label: m.type, variant: "default" as const }
                const isPositive = m.qty_delta > 0
                return (
                  <TableRow key={m.id}>
                    <TableCell className="font-mono text-[11px] tabular-nums text-[#8E8982]">
                      {formatDateTimeID(m.created_at)}
                    </TableCell>
                    <TableCell className="font-semibold text-[#18181B]">
                      {ing?.name ?? m.ingredient_id}
                    </TableCell>
                    <TableCell>
                      <Badge variant={meta.variant}>{meta.label}</Badge>
                    </TableCell>
                    <TableCell
                      className={cn(
                        "text-right font-mono font-semibold tabular-nums",
                        isPositive ? "text-[#166534]" : "text-[#991B1B]"
                      )}
                    >
                      {isPositive ? "+" : ""}
                      {formatQty(m.qty_delta, ing?.unit ?? "")}
                    </TableCell>
                    <TableCell className="text-right font-mono tabular-nums text-[#18181B]">
                      {formatQty(m.balance_after, ing?.unit ?? "")}
                    </TableCell>
                    <TableCell className="max-w-xs truncate text-xs text-[#67625B]">
                      {m.notes}{" "}
                      {m.created_by && (
                        <span className="text-[#9A958E]">
                          · {userMap.get(m.created_by) ?? "Staf"}
                        </span>
                      )}
                    </TableCell>
                  </TableRow>
                )
              })}
              {branchMovements.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="py-10 text-center text-xs text-[#8E8982]">
                    Belum ada riwayat mutasi stok pada cabang ini.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </TableContainer>
        )}
      </div>

      {/* Ingredient CRUD Modal (Owner & Manager) */}
      <IngredientCrudModal
        open={ingModalOpen}
        editingIngredient={editingIngredient}
        defaultMinThreshold={editingMinThreshold}
        defaultBranchId={activeBranch?.id ?? null}
        onClose={() => setIngModalOpen(false)}
        onSubmit={async (payload) => {
          const res = editingIngredient
            ? await updateIngredient(editingIngredient.id, {
                sku: payload.sku,
                name: payload.name,
                unit: payload.unit,
                cost_per_unit: payload.cost_per_unit,
                branch_id: activeBranch?.id ?? null,
                min_threshold: payload.min_threshold,
              })
            : await createIngredient({
                ...payload,
                branch_id: activeBranch?.id ?? null,
              })
          if (res.ok) {
            toast(
              editingIngredient
                ? `Bahan baku "${payload.name}" diperbarui.`
                : `Bahan baku "${payload.name}" ditambahkan ke stok cabang.`
            )
          }
          return res
        }}
      />

      {/* Delete Ingredient Dialog */}
      <Dialog
        open={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        eyebrow="HAPUS BAHAN BAKU"
        title={`Hapus "${deleteTarget?.name ?? ""}"?`}
        description="Bahan baku akan dihapus dari katalog persediaan dan dilepaskan dari resep menu terkait."
        maxWidthClassName="max-w-sm"
      >
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="md"
            className="flex-1"
            disabled={deletingIng}
            onClick={() => setDeleteTarget(null)}
          >
            Batal
          </Button>
          <Button
            variant="destructiveSolid"
            size="md"
            className="flex-1"
            disabled={deletingIng}
            onClick={async () => {
              if (!deleteTarget) return
              setDeletingIng(true)
              try {
                const res = await deleteIngredient(deleteTarget.id)
                if (!res.ok) {
                  toast(res.error || "Gagal menghapus bahan.", "error")
                  return
                }
                toast(`Bahan baku "${deleteTarget.name}" dihapus.`, "info")
                setDeleteTarget(null)
              } finally {
                setDeletingIng(false)
              }
            }}
          >
            <Trash2 className="h-4 w-4" strokeWidth={1.5} />
            {deletingIng ? "Menghapus…" : "Hapus Bahan"}
          </Button>
        </div>
      </Dialog>

      {/* Restock / Manual Out / Waste / Opname Count Dialog */}
      <Dialog
        open={Boolean(actionModal)}
        onClose={() => setActionModal(null)}
        eyebrow={
          actionModal?.mode === "RESTOCK"
            ? "STOK MASUK"
            : actionModal?.mode === "MANUAL_OUT"
            ? "PEMAKAIAN SHIFT"
            : actionModal?.mode === "WASTE"
            ? "PENCATATAN WASTE"
            : "STOCK OPNAME FISIK"
        }
        title={
          actionModal?.mode === "RESTOCK"
            ? "Catat Restok Bahan"
            : actionModal?.mode === "MANUAL_OUT"
            ? "Catat Pemakaian Bahan Shift"
            : actionModal?.mode === "WASTE"
            ? "Catat Bahan Terbuang / Rusak"
            : "Input Hasil Hitung Fisik Opname"
        }
        description={
          actionModal?.mode === "OPNAME_DRAFT"
            ? "Setelah mengisi jumlah fisik aktual, verifikasi PIN Supervisor diperlukan."
            : activeShift
            ? "Mutasi ini otomatis ditautkan ke shift aktif yang sedang berjalan."
            : "Mutasi akan tercatat pada buku besar stok cabang."
        }
      >
        <form onSubmit={handleActionSubmit} className="space-y-4">
          <div>
            <FieldLabel htmlFor="stock-ing-select">Pilih Bahan Baku</FieldLabel>
            <Select
              id="stock-ing-select"
              value={actionModal?.ingredientId ?? ""}
              onChange={(e) => {
                const nextId = e.target.value
                setActionModal((prev) => (prev ? { ...prev, ingredientId: nextId } : null))
                if (actionModal?.mode === "OPNAME_DRAFT") {
                  const found = rows.find((r) => r.ingredient.id === nextId)
                  setQtyInput(String(found?.currentQty ?? 0))
                }
              }}
              options={rows.map((r) => ({
                value: r.ingredient.id,
                label: `${r.ingredient.name} (Saat ini: ${formatQty(r.currentQty, r.ingredient.unit)})`,
              }))}
            />
          </div>

          <div>
            <FieldLabel
              htmlFor="stock-qty-input"
              hint={`Satuan: ${selectedModalIng?.unit ?? ""}`}
            >
              {actionModal?.mode === "OPNAME_DRAFT"
                ? "Jumlah Stok Fisik Aktual"
                : actionModal?.mode === "RESTOCK"
                ? "Jumlah Ditambahkan"
                : actionModal?.mode === "MANUAL_OUT"
                ? "Jumlah Dipakai"
                : "Jumlah Terbuang (Waste)"}
            </FieldLabel>
            <Input
              id="stock-qty-input"
              type="number"
              min={actionModal?.mode === "OPNAME_DRAFT" ? 0 : 0.01}
              step="any"
              required
              value={qtyInput}
              onChange={(e) => setQtyInput(e.target.value)}
              placeholder="0"
              className="font-mono tabular-nums"
            />
          </div>

          {actionModal?.mode !== "OPNAME_DRAFT" && (
            <div>
              <FieldLabel htmlFor="stock-note-input">Catatan</FieldLabel>
              <Input
                id="stock-note-input"
                value={noteInput}
                onChange={(e) => setNoteInput(e.target.value)}
                placeholder={
                  actionModal?.mode === "RESTOCK"
                    ? "Contoh: Pengiriman pemasok invoice #208"
                    : actionModal?.mode === "MANUAL_OUT"
                    ? "Contoh: Pemakaian bar shift pagi"
                    : "Contoh: Susu tumpah saat kalibrasi"
                }
              />
            </div>
          )}

          <div className="flex gap-2 pt-2">
            <Button
              variant="outline"
              size="md"
              className="flex-1"
              disabled={actionSubmitting}
              onClick={() => setActionModal(null)}
            >
              Batal
            </Button>
            <Button
              type="submit"
              variant={actionModal?.mode === "WASTE" ? "destructiveSolid" : "default"}
              size="md"
              className="flex-1"
              disabled={actionSubmitting}
            >
              {actionModal?.mode === "OPNAME_DRAFT" ? (
                <>
                  Lanjut Verifikasi PIN
                  <ArrowDownRight className="h-4 w-4" strokeWidth={1.5} />
                </>
              ) : actionSubmitting ? (
                "Menyimpan…"
              ) : (
                "Simpan Mutasi"
              )}
            </Button>
          </div>
        </form>
      </Dialog>

      {/* Supervisor PIN Modal for Stock Opname */}
      <SupervisorPinModal
        open={Boolean(pendingOpname)}
        onClose={() => setPendingOpname(null)}
        title={`Otorisasi Stock Opname · ${pendingOpname?.ingredientName ?? ""}`}
        description={
          pendingOpname
            ? `Saldo sistem ${formatQty(pendingOpname.currentQty, pendingOpname.unit)} → Fisik aktual ${formatQty(pendingOpname.countedQty, pendingOpname.unit)}`
            : ""
        }
        actionLabel="Sah & Simpan Opname"
        reasonLabel="Catatan Audit Opname"
        reasonPlaceholder="Contoh: Hasil hitung fisik akhir shift pagi"
        onConfirm={async ({ pin, reason }) => {
          if (!pendingOpname) return { ok: false, error: "Data opname tidak valid." }
          const res = await recordStockOpname(
            pendingOpname.ingredientId,
            pendingOpname.countedQty,
            reason,
            pin
          )
          if (!res.ok) return { ok: false, error: res.error }
          toast(`Stock opname ${pendingOpname.ingredientName} tersimpan.`)
          return { ok: true }
        }}
      />
    </div>
  )
}
