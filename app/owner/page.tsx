"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import { ArrowDownLeft, ArrowRight, ArrowUpRight, Plus, Store } from "lucide-react"
import { BranchLeaderboard } from "@/components/owner/branch-leaderboard"
import { KpiStrip } from "@/components/owner/kpi-strip"
import { RevenueChart } from "@/components/owner/revenue-chart"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Select } from "@/components/ui/select"
import { Tabs } from "@/components/ui/tabs"
import {
  computeBranchLeaderboard,
  computeCashflowLedger,
  computeOwnerKpis,
  computeRevenueSeries,
  computeTopProducts,
  type AnalyticsTimeframe,
} from "@/lib/kalapos/analytics"
import { useKalaPOS } from "@/lib/kalapos/context"
import { formatDateShortID, formatIDR, formatLongDateID, TONE_CLASSES } from "@/lib/kalapos/format"
import type { ProductTone } from "@/lib/kalapos/types"
import { cn } from "@/lib/utils"

export default function OwnerOverviewPage() {
  const { state, session, activeBranches } = useKalaPOS()
  const [timeframe, setTimeframe] = useState<AnalyticsTimeframe>("7D")
  const [branchFilterId, setBranchFilterId] = useState<string | "ALL">("ALL")
  const [rightPanelTab, setRightPanelTab] = useState<"CASHFLOW" | "TOP_MENU">("CASHFLOW")

  const effectiveFilter =
    branchFilterId !== "ALL" && !state.branches.some((b) => b.id === branchFilterId && !b.deleted_at)
      ? "ALL"
      : branchFilterId

  const kpis = useMemo(
    () => computeOwnerKpis(state, timeframe, effectiveFilter),
    [state, timeframe, effectiveFilter]
  )

  const leaderboard = useMemo(
    () => computeBranchLeaderboard(state, timeframe),
    [state, timeframe]
  )

  const topProducts = useMemo(
    () => computeTopProducts(state, timeframe, effectiveFilter, 5),
    [state, timeframe, effectiveFilter]
  )

  const cashflowLedger = useMemo(
    () => computeCashflowLedger(state, timeframe, effectiveFilter, 8),
    [state, timeframe, effectiveFilter]
  )

  const chartData = useMemo(
    () => computeRevenueSeries(state, timeframe, effectiveFilter),
    [state, timeframe, effectiveFilter]
  )

  const maxProductQty = topProducts[0]?.qty ?? 1

  return (
    <div className="mx-auto max-w-[1440px] space-y-5 p-5 sm:p-8">
      {/* Page Header */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[#8E8982]">
            {formatLongDateID().toUpperCase()} · KAFE KALA
          </p>
          <h2 className="mt-1 text-2xl font-semibold tracking-[-0.025em] text-[#18181B]">
            Selamat datang, {session?.fullName?.split(" ")[0] ?? "Owner"}
          </h2>
          <p className="mt-1 text-xs text-[#77736D]">
            Ringkasan omset, arus kas keluar-masuk, laba kotor, dan performa cabang Kafe Kala.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <div className="flex items-center gap-2">
            <Store className="h-4 w-4 text-[#8E8982]" strokeWidth={1.5} />
            <Select
              aria-label="Filter cabang"
              value={effectiveFilter}
              onChange={(e) => setBranchFilterId(e.target.value)}
              className="h-9 min-w-[180px] text-xs"
              options={[
                { value: "ALL", label: `Semua Cabang (${activeBranches.length})` },
                ...state.branches
                  .filter((b) => !b.deleted_at)
                  .map((b) => ({
                    value: b.id,
                    label: `${b.name} (${b.code})`,
                  })),
              ]}
            />
          </div>

          <Tabs
            value={timeframe}
            onChange={setTimeframe}
            options={[
              { value: "TODAY", label: "Hari Ini" },
              { value: "7D", label: "7 Hari" },
              { value: "30D", label: "30 Hari" },
            ]}
          />
        </div>
      </div>

      {/* Onboarding hint if Kafe Kala has no branches yet */}
      {activeBranches.length === 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[#E5E2DC] bg-white px-5 py-4">
          <div>
            <p className="text-xs font-semibold text-[#18181B]">
              Belum ada cabang Kafe Kala terdaftar
            </p>
            <p className="mt-0.5 text-xs text-[#77736D]">
              Data cabang dan menu lama telah dibersihkan. Tambahkan cabang pertama Kafe Kala untuk mulai mengoperasikan kasir dan staf.
            </p>
          </div>
          <Link href="/owner/branches">
            <Button variant="default" size="sm">
              <Plus className="h-3.5 w-3.5" strokeWidth={1.5} />
              Kelola &amp; Tambah Cabang
            </Button>
          </Link>
        </div>
      )}

      {/* KPI Strip: Revenue, Transactions/AOV, Gross Profit, Food Cost % */}
      <KpiStrip kpis={kpis} />

      {/* Chart + Cashflow / Top Selling Menu */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        <div className="lg:col-span-8">
          <RevenueChart
            series={chartData.series}
            branches={chartData.branches}
            timeframe={timeframe}
            branchFilterId={effectiveFilter}
            totalRevenue={kpis.revenue}
          />
        </div>

        <section className="flex flex-col rounded-lg border border-[#E5E2DC] bg-white p-5 lg:col-span-4">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <h2 className="text-sm font-semibold text-[#18181B]">
                {rightPanelTab === "CASHFLOW" ? "Arus Keluar Masuk" : "Menu Terlaris"}
              </h2>
              <p className="mt-0.5 text-xs text-[#8E8982]">
                {rightPanelTab === "CASHFLOW"
                  ? "Catatan omset masuk & beban HPP keluar"
                  : "Kontribusi penjualan produk aktif"}
              </p>
            </div>
            <Tabs
              value={rightPanelTab}
              onChange={setRightPanelTab}
              options={[
                { value: "CASHFLOW", label: "Keluar Masuk" },
                { value: "TOP_MENU", label: "Menu" },
              ]}
            />
          </div>

          {rightPanelTab === "CASHFLOW" ? (
            <div className="mt-4 flex-1 divide-y divide-[#EFECE7]">
              {cashflowLedger.map((entry) => (
                <div key={entry.id} className="flex items-center justify-between gap-3 py-2.5 text-xs">
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="font-mono text-[10px] font-semibold text-[#8E8982]">
                        {entry.orderNumber}
                      </span>
                      <Badge variant="default" className="px-1.5 py-0 text-[9px]">
                        {entry.paymentMethod}
                      </Badge>
                    </div>
                    <p className="mt-0.5 truncate font-medium text-[#18181B]">{entry.label}</p>
                    <p className="text-[10px] text-[#8E8982]">
                      {formatDateShortID(entry.createdAt)} · {entry.branchName}
                    </p>
                  </div>
                  <div className="shrink-0 text-right font-mono tabular-nums">
                    <p className="inline-flex items-center justify-end gap-0.5 text-xs font-semibold text-[#166534]">
                      <ArrowDownLeft className="h-3 w-3" strokeWidth={1.75} />
                      +{formatIDR(entry.inflow)}
                    </p>
                    <p className="flex items-center justify-end gap-0.5 text-[10px] text-[#991B1B]">
                      <ArrowUpRight className="h-2.5 w-2.5" strokeWidth={1.75} />
                      HPP -{formatIDR(entry.outflowCogs)}
                    </p>
                  </div>
                </div>
              ))}
              {cashflowLedger.length === 0 && (
                <p className="py-10 text-center text-xs text-[#8E8982]">
                  Belum ada catatan arus keluar masuk pada periode ini.
                </p>
              )}
            </div>
          ) : (
            <div className="mt-4 flex-1 divide-y divide-[#EFECE7]">
              {topProducts.map((item, idx) => {
                const pct = Math.max(10, Math.round((item.qty / maxProductQty) * 100))
                const toneClass =
                  TONE_CLASSES[
                    (item.tone as ProductTone) in TONE_CLASSES
                      ? (item.tone as ProductTone)
                      : "sand"
                  ]
                return (
                  <div key={item.productId} className="flex items-center gap-3 py-3">
                    <span className="w-5 font-mono text-[11px] text-[#9A958E]">
                      {String(idx + 1).padStart(2, "0")}
                    </span>
                    <span
                      className={cn(
                        "flex h-8 w-8 shrink-0 items-center justify-center rounded font-mono text-[10px] font-semibold",
                        toneClass
                      )}
                    >
                      {item.mark}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline justify-between gap-2">
                        <p className="truncate text-xs font-semibold text-[#18181B]">{item.name}</p>
                        <span className="font-mono text-[11px] tabular-nums text-[#67625B]">
                          {item.qty} terjual
                        </span>
                      </div>
                      <div className="mt-1.5 flex items-center gap-2">
                        <div className="h-1 flex-1 overflow-hidden rounded-full bg-[#EFECE7]">
                          <div
                            className="h-full rounded-full bg-[#C2572A]"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                        <span className="font-mono text-[10px] tabular-nums text-[#8E8982]">
                          {formatIDR(item.revenue)}
                        </span>
                      </div>
                    </div>
                  </div>
                )
              })}
              {topProducts.length === 0 && (
                <div className="py-10 text-center">
                  <p className="text-xs font-medium text-[#57534E]">Belum ada data menu terjual</p>
                  <p className="mt-1 text-[11px] text-[#8E8982]">
                    Katalog menu saat ini kosong. Data omset historis tetap tampil pada tab Keluar Masuk.
                  </p>
                </div>
              )}
            </div>
          )}

          <div className="mt-3 flex items-center justify-between border-t border-[#EFECE7] pt-3 text-[11px] text-[#8E8982]">
            <span>{cashflowLedger.length} catatan ditampilkan</span>
            <Link
              href="/owner/branches"
              className="inline-flex items-center gap-1 font-medium text-[#67625B] hover:text-[#C2572A]"
            >
              Cabang
              <ArrowRight className="h-3.5 w-3.5" strokeWidth={1.5} />
            </Link>
          </div>
        </section>
      </div>

      {/* Clickable Branch Leaderboard */}
      <BranchLeaderboard
        rows={leaderboard}
        selectedBranchId={effectiveFilter}
        onSelectBranch={setBranchFilterId}
      />
    </div>
  )
}
