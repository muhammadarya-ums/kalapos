"use client"

import { useState } from "react"
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"
import { Tabs } from "@/components/ui/tabs"
import type { AnalyticsTimeframe, RevenueChartPoint } from "@/lib/kalapos/analytics"
import { formatIDR, formatIDRCompact } from "@/lib/kalapos/format"
import type { Branch } from "@/lib/kalapos/types"

const BRANCH_COLORS = ["#C2572A", "#18181B", "#B89B82", "#5D7293", "#588157", "#9E6B52"]

export interface RevenueChartProps {
  series: RevenueChartPoint[]
  branches: Branch[]
  timeframe: AnalyticsTimeframe
  branchFilterId: string | "ALL"
  totalRevenue: number
}

export function RevenueChart({
  series,
  branches,
  timeframe,
  branchFilterId,
  totalRevenue,
}: RevenueChartProps) {
  const [chartMode, setChartMode] = useState<"TOTAL" | "PER_BRANCH">("PER_BRANCH")

  const subtitle =
    timeframe === "TODAY"
      ? "Distribusi omset per blok jam hari ini"
      : timeframe === "7D"
      ? "Ringkasan penjualan harian 7 hari terakhir"
      : "Tren penjualan 30 hari terakhir"

  const displayedBranches =
    branchFilterId === "ALL"
      ? branches
      : branches.filter((b) => b.id === branchFilterId)

  const showStacked = chartMode === "PER_BRANCH" && branchFilterId === "ALL" && branches.length > 1

  return (
    <section className="flex flex-col rounded-lg border border-[#E5E2DC] bg-white p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-[#18181B]">Tren Omset Penjualan</h2>
          <p className="mt-0.5 text-xs text-[#8E8982]">{subtitle}</p>
        </div>

        {branchFilterId === "ALL" && (
          <Tabs
            value={chartMode}
            onChange={setChartMode}
            options={[
              { value: "TOTAL", label: "Total" },
              { value: "PER_BRANCH", label: "Per Cabang" },
            ]}
          />
        )}
      </div>

      {/* Legend */}
      <div className="mt-4 flex flex-wrap items-center gap-4 text-[11px] text-[#67625B]">
        {showStacked ? (
          displayedBranches.map((b, idx) => (
            <span key={b.id} className="inline-flex items-center gap-1.5">
              <span
                className="h-2.5 w-2.5 rounded-[2px]"
                style={{ backgroundColor: BRANCH_COLORS[idx % BRANCH_COLORS.length] }}
              />
              {b.name}
            </span>
          ))
        ) : (
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-[2px] bg-[#C2572A]" />
            {branchFilterId === "ALL"
              ? "Total Seluruh Cabang"
              : displayedBranches[0]?.name ?? "Cabang"}
          </span>
        )}
      </div>

      {/* Recharts Canvas */}
      <div className="mt-4 h-[250px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={series}
            margin={{ top: 6, right: 6, left: 0, bottom: 0 }}
            barCategoryGap={timeframe === "30D" ? "20%" : "32%"}
          >
            <CartesianGrid vertical={false} stroke="#EFECE7" strokeDasharray="3 3" />
            <XAxis
              dataKey="label"
              axisLine={false}
              tickLine={false}
              tick={{ fill: "#8E8982", fontSize: 11, fontFamily: "var(--font-mono)" }}
              interval={timeframe === "30D" ? 3 : 0}
            />
            <YAxis
              axisLine={false}
              tickLine={false}
              width={64}
              tickFormatter={(val: number) => formatIDRCompact(val)}
              tick={{ fill: "#8E8982", fontSize: 10, fontFamily: "var(--font-mono)" }}
            />
            <Tooltip
              cursor={{ fill: "#F8F7F4" }}
              content={({ active, payload, label }) => {
                if (!active || !payload || payload.length === 0) return null
                const sum = payload.reduce((acc, p) => acc + Number(p.value || 0), 0)
                return (
                  <div className="rounded-md border border-[#E5E2DC] bg-white px-3.5 py-2.5 text-xs shadow-[0_6px_20px_rgba(24,24,27,0.08)]">
                    <p className="font-mono text-[10px] font-semibold uppercase text-[#8E8982]">
                      {label}
                    </p>
                    <div className="mt-1.5 space-y-1">
                      {payload.map((entry) => (
                        <div
                          key={String(entry.dataKey)}
                          className="flex items-center justify-between gap-5"
                        >
                          <span className="inline-flex items-center gap-1.5 text-[#57534E]">
                            <span
                              className="h-2 w-2 rounded-[2px]"
                              style={{ backgroundColor: entry.color }}
                            />
                            {entry.name}
                          </span>
                          <span className="font-mono font-semibold tabular-nums text-[#18181B]">
                            {formatIDR(Number(entry.value || 0))}
                          </span>
                        </div>
                      ))}
                      {payload.length > 1 && (
                        <div className="flex items-center justify-between gap-5 border-t border-[#EFECE7] pt-1 font-semibold">
                          <span className="text-[#18181B]">Total</span>
                          <span className="font-mono tabular-nums text-[#18181B]">
                            {formatIDR(sum)}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                )
              }}
            />

            {showStacked ? (
              displayedBranches.map((b, idx) => (
                <Bar
                  key={b.id}
                  dataKey={b.id}
                  name={b.name}
                  stackId="rev"
                  fill={BRANCH_COLORS[idx % BRANCH_COLORS.length]}
                  radius={
                    idx === displayedBranches.length - 1 ? [3, 3, 0, 0] : [0, 0, 0, 0]
                  }
                  maxBarSize={36}
                />
              ))
            ) : (
              <Bar
                dataKey="total"
                name="Total Omset"
                fill="#C2572A"
                radius={[3, 3, 0, 0]}
                maxBarSize={36}
              />
            )}
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="mt-4 flex items-center justify-between border-t border-[#EFECE7] pt-3 text-xs text-[#77736D]">
        <span className="inline-flex items-center gap-2">
          <span className="h-1.5 w-1.5 rounded-full bg-[#166534]" />
          Total omset periode terpilih
        </span>
        <strong className="font-mono text-sm font-semibold tabular-nums text-[#18181B]">
          {formatIDR(totalRevenue)}
        </strong>
      </div>
    </section>
  )
}
