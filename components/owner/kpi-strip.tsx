import { ArrowDownRight, ArrowUpRight, Percent, Receipt, TrendingUp, Wallet } from "lucide-react"
import type { OwnerKpis } from "@/lib/kalapos/analytics"
import { formatIDR, formatNumberID } from "@/lib/kalapos/format"
import { cn } from "@/lib/utils"

export function KpiStrip({ kpis }: { kpis: OwnerKpis }) {
  const positiveDelta = kpis.revenueDeltaPct >= 0
  const foodCostHealthy = kpis.foodCostPct <= 36

  const cards = [
    {
      label: "Omset Keseluruhan",
      value: formatIDR(kpis.revenue),
      icon: Wallet,
      pill: `${positiveDelta ? "+" : ""}${kpis.revenueDeltaPct.toFixed(1).replace(".", ",")}%`,
      pillTone: positiveDelta
        ? "bg-[#ECFDF5] text-[#166534]"
        : "bg-[#FEF2F2] text-[#991B1B]",
      pillIcon: positiveDelta ? ArrowUpRight : ArrowDownRight,
      sub: "dibanding periode sebelumnya",
    },
    {
      label: "Total Transaksi",
      value: formatNumberID(kpis.transactions),
      icon: Receipt,
      pill: `AOV ${formatIDR(kpis.averageOrderValue)}`,
      pillTone: "bg-[#F1EFEB] text-[#4A4640]",
      pillIcon: null,
      sub: "rata-rata nilai per struk",
    },
    {
      label: "Laba Kotor (Gross Profit)",
      value: formatIDR(kpis.grossProfit),
      icon: TrendingUp,
      pill: `Margin ${kpis.grossMarginPct.toFixed(1).replace(".", ",")}%`,
      pillTone: "bg-[#ECFDF5] text-[#166534]",
      pillIcon: null,
      sub: `dari penjualan bersih ${formatIDR(kpis.netSales)}`,
    },
    {
      label: "Food Cost (HPP Resep)",
      value: `${kpis.foodCostPct.toFixed(1).replace(".", ",")}%`,
      icon: Percent,
      pill: formatIDR(kpis.cogs),
      pillTone: foodCostHealthy
        ? "bg-[#F1EFEB] text-[#4A4640]"
        : "bg-[#FFFBEB] text-[#A16207]",
      pillIcon: null,
      sub: foodCostHealthy ? "dalam target ideal (≤ 36%)" : "perlu evaluasi resep / waste",
    },
  ]

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {cards.map((card) => {
        const Icon = card.icon
        const PillIcon = card.pillIcon
        return (
          <article
            key={card.label}
            className="rounded-lg border border-[#E5E2DC] bg-white p-4"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-[#77736D]">{card.label}</span>
              <span className="flex h-8 w-8 items-center justify-center rounded-md border border-[#EFECE7] bg-[#FAF9F7] text-[#57534E]">
                <Icon className="h-4 w-4" strokeWidth={1.5} />
              </span>
            </div>
            <p className="mt-3 font-mono text-2xl font-semibold tracking-tight tabular-nums text-[#18181B]">
              {card.value}
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <span
                className={cn(
                  "inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 font-mono text-[11px] font-medium tabular-nums",
                  card.pillTone
                )}
              >
                {PillIcon && <PillIcon className="h-3 w-3" strokeWidth={1.75} />}
                {card.pill}
              </span>
              <span className="text-[11px] text-[#8E8982]">{card.sub}</span>
            </div>
          </article>
        )
      })}
    </div>
  )
}
