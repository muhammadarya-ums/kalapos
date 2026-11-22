"use client"

import { useMemo } from "react"
import { ArrowLeftRight } from "lucide-react"
import {
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { computeStockHealth, formatQty } from "@/lib/kalapos/format"
import type { Branch, BranchStock, Ingredient } from "@/lib/kalapos/types"
import { cn } from "@/lib/utils"

export interface BranchStockMatrixProps {
  branches: Branch[]
  ingredients: Ingredient[]
  branchStocks: BranchStock[]
  onQuickTransferTo: (ingredientId: string, toBranchId: string) => void
}

export function BranchStockMatrix({
  branches,
  ingredients,
  branchStocks,
  onQuickTransferTo,
}: BranchStockMatrixProps) {
  const stockLookup = useMemo(() => {
    const map = new Map<string, BranchStock>()
    for (const bs of branchStocks) {
      map.set(`${bs.branch_id}:${bs.ingredient_id}`, bs)
    }
    return map
  }, [branchStocks])

  return (
    <section className="overflow-hidden rounded-lg border border-[#E5E2DC] bg-white">
      <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
        <div>
          <h3 className="text-sm font-semibold text-[#18181B]">
            Matriks Perbandingan Stok Per Cabang
          </h3>
          <p className="mt-0.5 text-xs text-[#8E8982]">
            Klik sel berwarna kuning (Menipis) atau merah bata (Kritis) untuk langsung mengirim transfer stok ke cabang tersebut.
          </p>
        </div>

        <div className="flex items-center gap-3 text-[11px] text-[#67625B]">
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-sm border border-[#D1FAE5] bg-[#ECFDF5]" />
            Aman
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-sm border border-[#FDE68A] bg-[#FFFBEB]" />
            Menipis
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-sm border border-[#FECACA] bg-[#FEF2F2]" />
            Kritis
          </span>
        </div>
      </div>

      <TableContainer>
        <TableHeader>
          <tr>
            <TableHead>Bahan Baku</TableHead>
            {branches.map((b) => (
              <TableHead key={b.id} className="text-right">
                <span className="block text-[#18181B]">{b.name}</span>
                <span className="font-mono text-[10px] font-normal text-[#8E8982]">{b.code}</span>
              </TableHead>
            ))}
            <TableHead className="text-right">Total Jaringan</TableHead>
          </tr>
        </TableHeader>
        <TableBody>
          {ingredients.map((ing) => {
            let totalAcross = 0
            return (
              <TableRow key={ing.id}>
                <TableCell>
                  <p className="font-semibold text-[#18181B]">{ing.name}</p>
                  <p className="font-mono text-[10px] text-[#8E8982]">{ing.sku}</p>
                </TableCell>
                {branches.map((b) => {
                  const bs = stockLookup.get(`${b.id}:${ing.id}`)
                  const qty = bs?.current_qty ?? 0
                  const min = bs?.min_threshold ?? 0
                  totalAcross += qty
                  const health = computeStockHealth(qty, min)

                  return (
                    <TableCell key={b.id} className="p-2 text-right">
                      <button
                        type="button"
                        onClick={() => onQuickTransferTo(ing.id, b.id)}
                        title={`Klik untuk transfer ${ing.name} ke ${b.name}`}
                        className={cn(
                          "group inline-flex w-full min-w-[110px] flex-col items-end rounded-md border px-3 py-2 text-right transition-colors cursor-pointer",
                          health === "Kritis"
                            ? "border-[#FECACA] bg-[#FEF2F2] text-[#991B1B] hover:border-[#991B1B]"
                            : health === "Menipis"
                            ? "border-[#FDE68A] bg-[#FFFBEB] text-[#A16207] hover:border-[#A16207]"
                            : "border-transparent bg-transparent text-[#18181B] hover:border-[#E5E2DC] hover:bg-[#FAF9F7]"
                        )}
                      >
                        <span className="font-mono text-xs font-semibold tabular-nums">
                          {formatQty(qty, ing.unit)}
                        </span>
                        <span className="mt-0.5 flex items-center gap-1 font-mono text-[10px] opacity-75">
                          {health !== "Aman" ? (
                            <>
                              <ArrowLeftRight className="h-2.5 w-2.5" strokeWidth={1.75} />
                              <span>{health}</span>
                            </>
                          ) : (
                            <span>min {min.toLocaleString("id-ID")}</span>
                          )}
                        </span>
                      </button>
                    </TableCell>
                  )
                })}
                <TableCell className="text-right font-mono font-semibold tabular-nums text-[#18181B]">
                  {formatQty(totalAcross, ing.unit)}
                </TableCell>
              </TableRow>
            )
          })}
          {(ingredients.length === 0 || branches.length === 0) && (
            <TableRow>
              <TableCell
                colSpan={Math.max(2, branches.length + 2)}
                className="py-10 text-center text-xs text-[#8E8982]"
              >
                {branches.length === 0
                  ? "Belum ada cabang Kafe Kala terdaftar."
                  : "Belum ada data bahan baku terdaftar."}
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </TableContainer>
    </section>
  )
}
