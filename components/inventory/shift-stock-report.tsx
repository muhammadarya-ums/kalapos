"use client"

import { useMemo } from "react"
import { Badge } from "@/components/ui/badge"
import {
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { computeShiftStockReport } from "@/lib/kalapos/analytics"
import { formatDateTimeID, formatQty } from "@/lib/kalapos/format"
import type { KalaPOSState, Shift } from "@/lib/kalapos/types"
import { cn } from "@/lib/utils"

export interface ShiftStockReportProps {
  state: KalaPOSState
  shift: Shift | null
  title?: string
  emptyMessage?: string
}

export function ShiftStockReport({
  state,
  shift,
  title = "Pantauan Stok per Shift",
  emptyMessage = "Buka shift atau pilih riwayat shift untuk melihat pergerakan stok masuk, keluar, opname, dan referensi resep.",
}: ShiftStockReportProps) {
  const rows = useMemo(
    () => (shift ? computeShiftStockReport(state, shift) : []),
    [state, shift]
  )

  if (!shift) {
    return (
      <section className="rounded-lg border border-dashed border-[#D6D2C9] bg-white px-5 py-10 text-center">
        <p className="text-xs font-semibold text-[#18181B]">{title}</p>
        <p className="mt-1 text-xs text-[#8E8982]">{emptyMessage}</p>
      </section>
    )
  }

  const branchName = state.branches.find((b) => b.id === shift.branch_id)?.name ?? "Kafe Kala"
  const cashierName = state.users.find((u) => u.id === shift.user_id)?.full_name ?? "Staf"

  return (
    <section className="overflow-hidden rounded-lg border border-[#E5E2DC] bg-white">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#EFECE7] px-5 py-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-sm font-semibold text-[#18181B]">{title}</h3>
            <Badge variant={shift.status === "OPEN" ? "aman" : "default"} dot>
              {shift.status === "OPEN" ? "Shift Aktif" : "Shift Ditutup"}
            </Badge>
          </div>
          <p className="mt-0.5 text-xs text-[#8E8982]">
            {branchName} · Petugas: {cashierName} · Dibuka {formatDateTimeID(shift.opened_at)}
            {shift.closed_at ? ` — Ditutup ${formatDateTimeID(shift.closed_at)}` : ""}
          </p>
        </div>

        <span className="rounded border border-[#EFECE7] bg-[#FAF9F7] px-2.5 py-1 text-[10px] font-medium text-[#67625B]">
          Kolom Estimasi Resep = referensi penjualan (tidak memotong stok otomatis)
        </span>
      </div>

      <TableContainer>
        <TableHeader>
          <tr>
            <TableHead>Bahan Baku</TableHead>
            <TableHead className="text-right">Stok Awal Shift</TableHead>
            <TableHead className="text-right">Masuk</TableHead>
            <TableHead className="text-right">Keluar Manual</TableHead>
            <TableHead className="text-right">Opname</TableHead>
            <TableHead className="text-right">
              {shift.status === "OPEN" ? "Stok Saat Ini" : "Stok Akhir Shift"}
            </TableHead>
            <TableHead className="text-right">Est. Resep (Ref)</TableHead>
          </tr>
        </TableHeader>
        <TableBody>
          {rows.map((r) => (
            <TableRow key={r.ingredientId}>
              <TableCell>
                <p className="font-semibold text-[#18181B]">{r.name}</p>
                <p className="font-mono text-[10px] text-[#8E8982]">{r.sku}</p>
              </TableCell>
              <TableCell className="text-right font-mono tabular-nums text-[#57534E]">
                {formatQty(r.openingQty, r.unit)}
              </TableCell>
              <TableCell className="text-right font-mono tabular-nums text-[#166534]">
                {r.inQty > 0 ? `+${formatQty(r.inQty, r.unit)}` : "—"}
              </TableCell>
              <TableCell className="text-right font-mono tabular-nums text-[#991B1B]">
                {r.outQty > 0 ? `-${formatQty(r.outQty, r.unit)}` : "—"}
              </TableCell>
              <TableCell
                className={cn(
                  "text-right font-mono tabular-nums",
                  r.opnameDelta > 0
                    ? "text-[#166534]"
                    : r.opnameDelta < 0
                    ? "text-[#991B1B]"
                    : "text-[#8E8982]"
                )}
              >
                {r.opnameDelta !== 0
                  ? `${r.opnameDelta > 0 ? "+" : ""}${formatQty(r.opnameDelta, r.unit)}`
                  : "—"}
              </TableCell>
              <TableCell className="text-right font-mono font-semibold tabular-nums text-[#18181B]">
                {formatQty(r.closingQty, r.unit)}
              </TableCell>
              <TableCell className="text-right font-mono tabular-nums text-[#67625B]">
                {r.recipeEstimateQty > 0 ? formatQty(r.recipeEstimateQty, r.unit) : "—"}
              </TableCell>
            </TableRow>
          ))}
          {rows.length === 0 && (
            <TableRow>
              <TableCell colSpan={7} className="py-10 text-center text-xs text-[#8E8982]">
                Belum ada bahan baku terdaftar untuk dipantau pada shift ini.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </TableContainer>
    </section>
  )
}
