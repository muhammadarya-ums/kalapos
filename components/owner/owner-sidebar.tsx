"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import {
  Activity,
  BookOpen,
  Boxes,
  LayoutDashboard,
  LogOut,
  ShoppingCart,
  Store,
} from "lucide-react"
import { BrandLogo } from "@/components/ui/brand-logo"
import { useToast } from "@/components/ui/toast"
import { useKalaPOS } from "@/lib/kalapos/context"
import { getInitials } from "@/lib/kalapos/format"
import { cn } from "@/lib/utils"

export function OwnerSidebar({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const { toast } = useToast()
  const { session, activeBranches, state, logout } = useKalaPOS()
  const [clockLabel, setClockLabel] = useState("")

  useEffect(() => {
    const updateClock = () => {
      const now = new Date()
      const dateStr = new Intl.DateTimeFormat("id-ID", {
        weekday: "long",
        day: "numeric",
        month: "short",
        year: "numeric",
      }).format(now)
      const timeStr = `${String(now.getHours()).padStart(2, "0")}.${String(
        now.getMinutes()
      ).padStart(2, "0")} WIB`
      setClockLabel(`${dateStr} · ${timeStr}`)
    }
    updateClock()
    const id = window.setInterval(updateClock, 30_000)
    return () => window.clearInterval(id)
  }, [])

  const navItems = [
    { href: "/owner", label: "Ikhtisar Omset", icon: LayoutDashboard },
    { href: "/owner/menu", label: "Manajemen Menu", icon: BookOpen, count: state.products.length },
    { href: "/owner/inventory", label: "Stok & Bahan Baku", icon: Boxes, count: state.ingredients.length },
    { href: "/owner/branches", label: "Manajemen Cabang", icon: Store, count: activeBranches.length },
  ]

  const pageTitle =
    pathname === "/owner"
      ? "Ikhtisar Eksekutif"
      : pathname === "/owner/menu"
      ? "Manajemen Menu & Resep"
      : pathname === "/owner/inventory"
      ? "Stok, Bahan Baku & Transfer"
      : pathname === "/owner/branches"
      ? "Manajemen Cabang & Tim"
      : "Konsol Owner"

  const activeQueueAll = state.orders.filter(
    (o) => o.status === "QUEUED" || o.status === "PREPARING" || o.status === "READY"
  ).length

  const handleLogout = async () => {
    await logout()
    toast("Anda keluar dari Konsol Owner.", "info")
    router.replace("/login")
    router.refresh()
  }

  return (
    <div className="flex min-h-screen bg-[#F8F7F4] text-[#18181B]">
      {/* Persistent Owner Sidebar */}
      <aside className="fixed inset-y-0 left-0 z-20 flex w-[68px] flex-col border-r border-[#E5E2DC] bg-white px-2 py-4 lg:w-[244px] lg:px-4 lg:py-5">
        <div className="px-1 pb-6 lg:px-1.5">
          <div className="hidden lg:block">
            <BrandLogo href="/owner" subtitle="EXECUTIVE CONSOLE" />
          </div>
          <div className="flex justify-center lg:hidden">
            <BrandLogo href="/owner" compact />
          </div>
        </div>

        <nav className="flex flex-1 flex-col gap-1" aria-label="Navigasi Owner">
          <p className="mb-1 hidden px-2.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-[#938E86] lg:block">
            KONSOL PEMILIK
          </p>
          {navItems.map((item) => {
            const Icon = item.icon
            const active = pathname === item.href
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "relative flex h-11 items-center justify-center gap-3 rounded-md px-2.5 text-xs font-medium transition-colors lg:justify-start",
                  active
                    ? "bg-[#F1EFEB] font-semibold text-[#18181B]"
                    : "text-[#67625B] hover:bg-[#F8F7F4] hover:text-[#18181B]"
                )}
                title={item.label}
              >
                {active && (
                  <span
                    className="absolute top-2.5 bottom-2.5 left-0 w-[3px] rounded-r bg-[#C2572A]"
                    aria-hidden="true"
                  />
                )}
                <Icon className="h-[18px] w-[18px] shrink-0" strokeWidth={1.5} />
                <span className="hidden flex-1 truncate lg:inline">{item.label}</span>
                {item.count !== undefined && (
                  <span className="hidden rounded bg-[#E7E4DD] px-1.5 py-0.5 font-mono text-[10px] tabular-nums text-[#4A4640] lg:inline">
                    {item.count}
                  </span>
                )}
              </Link>
            )
          })}

          <div className="mt-6 border-t border-[#EFECE7] pt-4">
            <p className="mb-1 hidden px-2.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-[#938E86] lg:block">
              OPERASIONAL CABANG
            </p>
            <Link
              href="/pos"
              className="flex h-10 items-center justify-center gap-3 rounded-md px-2.5 text-xs font-medium text-[#67625B] transition-colors hover:bg-[#F8F7F4] hover:text-[#18181B] lg:justify-start"
              title="Buka Terminal Kasir POS"
            >
              <ShoppingCart className="h-[17px] w-[17px] shrink-0" strokeWidth={1.5} />
              <span className="hidden lg:inline">Terminal Kasir POS</span>
            </Link>
            <Link
              href="/pos/queue"
              className="mt-0.5 flex h-10 items-center justify-center gap-3 rounded-md px-2.5 text-xs font-medium text-[#67625B] transition-colors hover:bg-[#F8F7F4] hover:text-[#18181B] lg:justify-start"
              title="Pantau Antrean KDS"
            >
              <Activity className="h-[17px] w-[17px] shrink-0" strokeWidth={1.5} />
              <span className="hidden flex-1 lg:inline">Antrean Barista</span>
              {activeQueueAll > 0 && (
                <span className="hidden rounded bg-[#FDF4F0] px-1.5 py-0.5 font-mono text-[10px] tabular-nums text-[#C2572A] lg:inline">
                  {activeQueueAll}
                </span>
              )}
            </Link>
          </div>
        </nav>

        <div className="mt-auto border-t border-[#EFECE7] pt-3">
          <div className="flex items-center justify-center gap-2.5 rounded-md px-1.5 py-2 lg:justify-between">
            <div className="flex min-w-0 items-center gap-2.5">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#18181B] font-mono text-[11px] font-semibold text-white">
                {getInitials(session?.fullName ?? "KK")}
              </span>
              <div className="hidden min-w-0 lg:block">
                <p className="truncate text-xs font-semibold text-[#18181B]">
                  {session?.fullName ?? "Owner Kafe Kala"}
                </p>
                <p className="truncate text-[10px] text-[#8E8982]">Owner · Kafe Kala</p>
              </div>
            </div>
            <button
              type="button"
              onClick={handleLogout}
              aria-label="Keluar sesi"
              title="Keluar / Ganti Peran"
              className="hidden h-8 w-8 shrink-0 items-center justify-center rounded-md text-[#8E8982] hover:bg-[#F1EFEB] hover:text-[#991B1B] lg:flex cursor-pointer"
            >
              <LogOut className="h-4 w-4" strokeWidth={1.5} />
            </button>
          </div>
        </div>
      </aside>

      {/* Main Executive Workspace */}
      <div className="flex min-h-screen flex-1 flex-col pl-[68px] lg:pl-[244px]">
        <header className="sticky top-0 z-10 flex h-14 items-center justify-between gap-3 border-b border-[#E5E2DC] bg-[#F8F7F4]/95 px-5 sm:px-8">
          <div className="flex items-center gap-2 text-xs">
            <span className="text-[#8E8982]">Owner Console</span>
            <span className="text-[#C9C4BC]">/</span>
            <h1 className="font-semibold text-[#18181B]">{pageTitle}</h1>
          </div>

          <div className="flex items-center gap-4 text-[11px] text-[#77736D]">
            <span className="hidden items-center gap-1.5 sm:inline-flex">
              <span className="h-1.5 w-1.5 rounded-full bg-[#166534]" />
              {activeBranches.length} cabang aktif tersinkron
            </span>
            <span className="hidden font-mono tabular-nums text-[#8E8982] md:inline">
              {clockLabel}
            </span>
          </div>
        </header>

        <main className="flex-1">{children}</main>

        <footer className="flex h-11 items-center justify-between border-t border-[#E5E2DC] px-5 text-[11px] text-[#9A958E] sm:px-8">
          <span>Kafe Kala · Sistem Operasional Internal</span>
          <span className="font-mono">v2.0 · IDR / WIB</span>
        </footer>
      </div>
    </div>
  )
}
