"use client"

import { useMemo, useState } from "react"
import { ArrowLeftRight, Edit3, Package, Search, Trash2 } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  computeStockHealth,
  formatDateTimeID,
  formatIDR,
  formatQty,
} from "@/lib/kalapos/format"
import type { Branch, BranchStock, Ingredient, StockTransfer } from "@/lib/kalapos/types"

export interface GlobalInventoryTableProps {
  branches: Branch[]
  ingredients: Ingredient[]
  branchStocks: BranchStock[]
  transfers: StockTransfer[]
  onOpenTransfer: (ingredientId?: string) => void
  onEditIngredient?: (ingredient: Ingredient) => void
  onDeleteIngredient?: (ingredient: Ingredient) => void
}

export function GlobalInventoryTable({
  branches,
  ingredients,
  branchStocks,
  transfers,
  onOpenTransfer,
  onEditIngredient,
  onDeleteIngredient,
}: GlobalInventoryTableProps) {
  const [search, setSearch] = useState("")
  const activeBranchIds = useMemo(() => new Set(branches.map((b) => b.id)), [branches])
  const branchMap = useMemo(() => new Map(branches.map((b) => [b.id, b])), [branches])
  const ingMap = useMemo(() => new Map(ingredients.map((i) => [i.id, i])), [ingredients])

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase()
    return ingredients
      .map((ing) => {
        const stocks = branchStocks.filter(
          (bs) => bs.ingredient_id === ing.id && activeBranchIds.has(bs.branch_id)
        )
        const totalQty = stocks.reduce((s, bs) => s + bs.current_qty, 0)
        const totalMin = stocks.reduce((s, bs) => s + bs.min_threshold, 0)
        const valuation = Math.round(totalQty * ing.cost_per_unit)
        const criticalBranches = stocks.filter(
          (bs) => computeStockHealth(bs.current_qty, bs.min_threshold) === "Kritis"
        ).length
        const lowBranches = stocks.filter(
          (bs) => computeStockHealth(bs.current_qty, bs.min_threshold) === "Menipis"
        ).length
        const overallHealth =
          criticalBranches > 0
            ? "Kritis"
            : lowBranches > 0
            ? "Menipis"
            : computeStockHealth(totalQty, totalMin)
        return {
          ingredient: ing,
          totalQty,
          totalMin,
          valuation,
          criticalBranches,
          lowBranches,
          overallHealth,
        }
      })
      .filter(
        (r) =>
          !q ||
          r.ingredient.name.toLowerCase().includes(q) ||
          r.ingredient.sku.toLowerCase().includes(q)
      )
  }, [ingredients, branchStocks, activeBranchIds, search])

  return (
    <div className="space-y-6">
      <section className="overflow-hidden rounded-lg border border-[#E5E2DC] bg-white">
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
          <div>
            <h3 className="text-sm font-semibold text-[#18181B]">
              Konsolidasi Stok Global ({branches.length} Cabang Aktif)
            </h3>
            <p className="mt-0.5 text-xs text-[#8E8982]">
              Akumulasi ketersediaan bahan baku dan nilai HPP persediaan seluruh jaringan.
            </p>
          </div>

          <label className="flex h-9 items-center gap-2 rounded-md border border-[#E5E2DC] bg-white px-3">
            <Search className="h-3.5 w-3.5 text-[#8E8982]" strokeWidth={1.5} />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Cari bahan atau SKU…"
              className="w-44 bg-transparent text-xs text-[#18181B] placeholder:text-[#9A958E] outline-none"
            />
          </label>
        </div>

        <TableContainer>
          <TableHeader>
            <tr>
              <TableHead>Bahan Baku</TableHead>
              <TableHead>SKU</TableHead>
              <TableHead className="text-right">Total Stok Global</TableHead>
              <TableHead className="text-right">Total Batas Min</TableHead>
              <TableHead className="text-right">Nilai Persediaan (HPP)</TableHead>
              <TableHead>Kesehatan Jaringan</TableHead>
              <TableHead className="text-right">Aksi</TableHead>
            </tr>
          </TableHeader>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={r.ingredient.id}>
                <TableCell>
                  <div className="flex items-center gap-2.5">
                    <span className="flex h-8 w-8 items-center justify-center rounded border border-[#EFECE7] bg-[#FAF9F7] text-[#67625B]">
                      <Package className="h-4 w-4" strokeWidth={1.5} />
                    </span>
                    <div>
                      <p className="font-semibold text-[#18181B]">{r.ingredient.name}</p>
                      <p className="font-mono text-[10px] text-[#8E8982]">
                        HPP {formatIDR(r.ingredient.cost_per_unit)}/{r.ingredient.unit}
                      </p>
                    </div>
                  </div>
                </TableCell>
                <TableCell className="font-mono text-[11px] text-[#8E8982]">
                  {r.ingredient.sku}
                </TableCell>
                <TableCell className="text-right font-mono font-semibold tabular-nums text-[#18181B]">
                  {formatQty(r.totalQty, r.ingredient.unit)}
                </TableCell>
                <TableCell className="text-right font-mono tabular-nums text-[#8E8982]">
                  {formatQty(r.totalMin, r.ingredient.unit)}
                </TableCell>
                <TableCell className="text-right font-mono tabular-nums text-[#18181B]">
                  {formatIDR(r.valuation)}
                </TableCell>
                <TableCell>
                  {r.criticalBranches > 0 ? (
                    <Badge variant="kritis" dot>
                      Kritis di {r.criticalBranches} cabang
                    </Badge>
                  ) : r.lowBranches > 0 ? (
                    <Badge variant="menipis" dot>
                      Menipis di {r.lowBranches} cabang
                    </Badge>
                  ) : (
                    <Badge variant="aman" dot>
                      Semua Cabang Aman
                    </Badge>
                  )}
                </TableCell>
                <TableCell className="text-right">
                  <div className="inline-flex items-center gap-1">
                    {branches.length >= 2 && (
                      <Button
                        variant="outline"
                        size="xs"
                        onClick={() => onOpenTransfer(r.ingredient.id)}
                      >
                        <ArrowLeftRight className="h-3 w-3" strokeWidth={1.5} />
                        Transfer
                      </Button>
                    )}
                    {onEditIngredient && (
                      <Button
                        variant="ghost"
                        size="iconSm"
                        aria-label={`Edit ${r.ingredient.name}`}
                        title="Edit bahan baku"
                        onClick={() => onEditIngredient(r.ingredient)}
                      >
                        <Edit3 className="h-3.5 w-3.5 text-[#67625B]" strokeWidth={1.5} />
                      </Button>
                    )}
                    {onDeleteIngredient && (
                      <Button
                        variant="ghost"
                        size="iconSm"
                        aria-label={`Hapus ${r.ingredient.name}`}
                        title="Hapus bahan baku"
                        onClick={() => onDeleteIngredient(r.ingredient)}
                      >
                        <Trash2
                          className="h-3.5 w-3.5 text-[#8E8982] hover:text-[#991B1B]"
                          strokeWidth={1.5}
                        />
                      </Button>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ))}
            {rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} className="py-10 text-center text-xs text-[#8E8982]">
                  Belum ada data persediaan bahan baku terdaftar.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </TableContainer>
      </section>

      {/* Inter-Branch Transfer History */}
      <section className="overflow-hidden rounded-lg border border-[#E5E2DC] bg-white">
        <div className="px-5 py-4">
          <h3 className="text-sm font-semibold text-[#18181B]">
            Riwayat Transfer Stok Antar Cabang
          </h3>
          <p className="mt-0.5 text-xs text-[#8E8982]">
            Setiap transfer otomatis mencatat TRANSFER_OUT dan TRANSFER_IN di buku besar masing-masing cabang.
          </p>
        </div>

        <TableContainer>
          <TableHeader>
            <tr>
              <TableHead>Waktu</TableHead>
              <TableHead>Bahan Baku</TableHead>
              <TableHead>Dari Cabang</TableHead>
              <TableHead>Ke Cabang</TableHead>
              <TableHead className="text-right">Jumlah</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Catatan</TableHead>
            </tr>
          </TableHeader>
          <TableBody>
            {transfers.map((tr) => {
              const ing = ingMap.get(tr.ingredient_id)
              return (
                <TableRow key={tr.id}>
                  <TableCell className="font-mono text-[11px] tabular-nums text-[#8E8982]">
                    {formatDateTimeID(tr.created_at)}
                  </TableCell>
                  <TableCell className="font-semibold text-[#18181B]">
                    {ing?.name ?? tr.ingredient_id}
                  </TableCell>
                  <TableCell>{branchMap.get(tr.from_branch_id)?.name ?? tr.from_branch_id}</TableCell>
                  <TableCell className="font-medium text-[#18181B]">
                    {branchMap.get(tr.to_branch_id)?.name ?? tr.to_branch_id}
                  </TableCell>
                  <TableCell className="text-right font-mono font-semibold tabular-nums text-[#C2572A]">
                    {formatQty(tr.qty, ing?.unit ?? "")}
                  </TableCell>
                  <TableCell>
                    <Badge variant="aman" dot>
                      Selesai
                    </Badge>
                  </TableCell>
                  <TableCell className="max-w-xs truncate text-xs text-[#67625B]">
                    {tr.notes}
                  </TableCell>
                </TableRow>
              )
            })}
            {transfers.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} className="py-8 text-center text-xs text-[#8E8982]">
                  Belum ada riwayat transfer antar cabang.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </TableContainer>
      </section>
    </div>
  )
}
