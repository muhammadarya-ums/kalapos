"use client"

import Link from "next/link"
import { ArrowRight } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import {
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import type { BranchPerformanceRow } from "@/lib/kalapos/analytics"
import { formatIDR, formatNumberID } from "@/lib/kalapos/format"
import { cn } from "@/lib/utils"

export interface BranchLeaderboardProps {
  rows: BranchPerformanceRow[]
  selectedBranchId: string | "ALL"
  onSelectBranch: (branchId: string | "ALL") => void
}

export function BranchLeaderboard({
  rows,
  selectedBranchId,
  onSelectBranch,
}: BranchLeaderboardProps) {
  return (
    <section className="overflow-hidden rounded-lg border border-[#E5E2DC] bg-white">
      <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
        <div>
          <h2 className="text-sm font-semibold text-[#18181B]">Peringkat Performa Cabang</h2>
          <p className="mt-0.5 text-xs text-[#8E8982]">
            Klik baris cabang untuk memfilter grafik &amp; KPI periode ini.
          </p>
        </div>

        <div className="flex items-center gap-3">
          {selectedBranchId !== "ALL" && (
            <button
              type="button"
              onClick={() => onSelectBranch("ALL")}
              className="text-xs font-semibold text-[#C2572A] hover:underline cursor-pointer"
            >
              Tampilkan Semua Cabang
            </button>
          )}
          <Link
            href="/owner/branches"
            className="inline-flex items-center gap-1 text-xs font-medium text-[#67625B] hover:text-[#18181B]"
          >
            Kelola Cabang
            <ArrowRight className="h-3.5 w-3.5" strokeWidth={1.5} />
          </Link>
        </div>
      </div>

      <TableContainer>
        <TableHeader>
          <tr>
            <TableHead>Cabang</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="text-right">Transaksi</TableHead>
            <TableHead className="text-right">Omset</TableHead>
            <TableHead className="text-right">Laba Kotor</TableHead>
            <TableHead className="text-right">Food Cost</TableHead>
            <TableHead>Kontribusi</TableHead>
            <TableHead>Stok Kritis / Menipis</TableHead>
            <TableHead />
          </tr>
        </TableHeader>
        <TableBody>
          {rows.map((row, idx) => {
            const isSelected = selectedBranchId === row.branch.id
            const totalAlert = row.criticalStockCount + row.lowStockCount
            return (
              <TableRow
                key={row.branch.id}
                onClick={() =>
                  onSelectBranch(isSelected ? "ALL" : row.branch.id)
                }
                className={cn(
                  "cursor-pointer",
                  isSelected && "bg-[#FDF4F0]/60 hover:bg-[#FDF4F0]/80"
                )}
              >
                <TableCell>
                  <div className="flex items-center gap-3">
                    <span className="flex h-7 w-7 items-center justify-center rounded bg-[#F1E8DC] font-mono text-[11px] font-semibold text-[#6B4E3D]">
                      {String(idx + 1).padStart(2, "0")}
                    </span>
                    <div>
                      <p className="font-semibold text-[#18181B]">{row.branch.name}</p>
                      <p className="font-mono text-[10px] text-[#8E8982]">{row.branch.code}</p>
                    </div>
                  </div>
                </TableCell>
                <TableCell>
                  <Badge
                    variant={
                      row.branch.status === "ACTIVE"
                        ? "aman"
                        : row.branch.status === "RENOVATION"
                        ? "menipis"
                        : "kritis"
                    }
                    dot
                  >
                    {row.branch.status === "ACTIVE"
                      ? "Beroperasi"
                      : row.branch.status === "RENOVATION"
                      ? "Renovasi"
                      : "Nonaktif"}
                  </Badge>
                </TableCell>
                <TableCell className="text-right font-mono tabular-nums text-[#18181B]">
                  {formatNumberID(row.transactions)}
                </TableCell>
                <TableCell className="text-right font-mono font-semibold tabular-nums text-[#18181B]">
                  {formatIDR(row.revenue)}
                </TableCell>
                <TableCell className="text-right font-mono tabular-nums text-[#166534]">
                  {formatIDR(row.grossProfit)}
                </TableCell>
                <TableCell className="text-right font-mono tabular-nums text-[#57534E]">
                  {row.foodCostPct.toFixed(1).replace(".", ",")}%
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-2 font-mono text-[11px] tabular-nums">
                    <span className="w-8">{row.contributionPct}%</span>
                    <div className="h-1.5 w-16 overflow-hidden rounded-full bg-[#EFECE7]">
                      <div
                        className="h-full rounded-full bg-[#C2572A]"
                        style={{ width: `${row.contributionPct}%` }}
                      />
                    </div>
                  </div>
                </TableCell>
                <TableCell>
                  {totalAlert > 0 ? (
                    <Badge variant={row.criticalStockCount > 0 ? "kritis" : "menipis"}>
                      {totalAlert} bahan
                    </Badge>
                  ) : (
                    <span className="text-xs text-[#9A958E]">Aman</span>
                  )}
                </TableCell>
                <TableCell className="text-right">
                  <ArrowRight className="inline h-4 w-4 text-[#A09B94]" strokeWidth={1.5} />
                </TableCell>
              </TableRow>
            )
          })}
          {rows.length === 0 && (
            <TableRow>
              <TableCell colSpan={9} className="py-10 text-center text-xs text-[#8E8982]">
                Belum ada cabang Kafe Kala terdaftar. Tambahkan cabang melalui menu Manajemen Cabang.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </TableContainer>
    </section>
  )
}
