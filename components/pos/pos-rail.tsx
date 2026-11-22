"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import {
  Activity,
  BookOpen,
  Boxes,
  Check,
  ChevronDown,
  Clock3,
  CloudOff,
  LayoutDashboard,
  Lock,
  LogOut,
  Printer,
  RefreshCw,
  ShoppingCart,
  Wifi,
  WifiOff,
} from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { BrandLogo } from "@/components/ui/brand-logo"
import { Button } from "@/components/ui/button"
import { useToast } from "@/components/ui/toast"
import { useKalaPOS } from "@/lib/kalapos/context"
import { computeStockHealth, formatTimeWIB, getInitials } from "@/lib/kalapos/format"
import { usePrinter } from "@/lib/printer/context"
import { cn } from "@/lib/utils"

export function PosRail({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const { toast } = useToast()
  const {
    state,
    session,
    activeBranch,
    activeBranches,
    activeShift,
    setActiveBranchId,
    isOnline,
    simulatedOffline,
    offlinePendingCount,
    toggleSimulatedOffline,
    flushOfflineQueue,
    logout,
  } = useKalaPOS()
  const { connected: printerConnected, deviceName: printerName, setDrawerOpen } = usePrinter()

  const [branchMenuOpen, setBranchMenuOpen] = useState(false)
  const [syncMenuOpen, setSyncMenuOpen] = useState(false)
  const [clockLabel, setClockLabel] = useState("")

  useEffect(() => {
    const updateClock = () => {
      const now = new Date()
      const dateStr = new Intl.DateTimeFormat("id-ID", {
        weekday: "short",
        day: "numeric",
        month: "short",
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

  const isOwner = session?.role === "OWNER"
  const isManager = session?.role === "MANAGER"
  const canManageMenu = isOwner || isManager
  const isBarista = session?.role === "BARISTA"

  const activeQueueCount = useMemo(
    () =>
      state.orders.filter(
        (o) =>
          o.branch_id === activeBranch?.id &&
          (o.status === "QUEUED" || o.status === "PREPARING" || o.status === "READY")
      ).length,
    [state.orders, activeBranch?.id]
  )

  const lowStockCount = useMemo(
    () =>
      state.branch_stocks.filter((bs) => {
        if (bs.branch_id !== activeBranch?.id) return false
        return computeStockHealth(bs.current_qty, bs.min_threshold) !== "Aman"
      }).length,
    [state.branch_stocks, activeBranch?.id]
  )

  const navItems = [
    { href: "/pos", label: "Kasir", icon: ShoppingCart, show: true, count: undefined },
    { href: "/pos/queue", label: "Antrean KDS", icon: Activity, show: true, count: activeQueueCount },
    { href: "/pos/menu", label: "Kelola Menu", icon: BookOpen, show: canManageMenu, count: undefined },
    { href: "/pos/stock", label: "Stok Cabang", icon: Boxes, show: true, count: lowStockCount > 0 ? lowStockCount : undefined, warn: lowStockCount > 0 },
    { href: "/pos/shift", label: "Shift & Laci", icon: Clock3, show: !isBarista, count: undefined },
  ].filter((item) => item.show)

  const pageLabel =
    pathname === "/pos"
      ? "Kasir POS"
      : pathname === "/pos/queue"
      ? "Antrean Barista (KDS)"
      : pathname === "/pos/menu"
      ? "Manajemen Menu & Resep Cabang"
      : pathname === "/pos/stock"
      ? "Stok Bahan Baku & Pantauan Shift"
      : pathname === "/pos/shift"
      ? "Manajemen Shift, Kas & Stok"
      : "Operasional"

  const handleLogout = async () => {
    await logout()
    toast("Sesi berakhir. Silakan masuk kembali.", "info")
    router.replace("/login")
    router.refresh()
  }

  return (
    <div className="flex min-h-screen bg-[#F8F7F4] text-[#18181B]">
      {/* Left Persistent Rail */}
      <aside className="fixed inset-y-0 left-0 z-20 flex w-[68px] flex-col border-r border-[#E5E2DC] bg-white px-2 py-4 lg:w-[236px] lg:px-3.5 lg:py-5">
        <div className="px-1 pb-5 lg:px-2">
          <div className="hidden lg:block">
            <BrandLogo href="/pos" subtitle="KAFE KALA · POS" />
          </div>
          <div className="flex justify-center lg:hidden">
            <BrandLogo href="/pos" compact />
          </div>
        </div>

        {/* Active Branch Selector / Lock Indicator */}
        <div className="relative mb-5">
          <button
            type="button"
            disabled={!isOwner}
            onClick={() => isOwner && setBranchMenuOpen((o) => !o)}
            className={cn(
              "flex w-full items-center gap-2.5 rounded-md border border-[#E5E2DC] bg-[#FAF9F7] p-2 text-left transition-colors",
              isOwner ? "hover:border-[#C2572A] cursor-pointer" : "cursor-default"
            )}
            title={
              isOwner
                ? "Ganti cabang operasional"
                : `Terkunci pada cabang ${activeBranch?.name ?? ""}`
            }
          >
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded bg-[#F1E8DC] font-mono text-[11px] font-semibold text-[#6B4E3D]">
              {activeBranch?.code.slice(-2) ?? "--"}
            </span>
            <div className="hidden min-w-0 flex-1 lg:block">
              <p className="flex items-center gap-1 text-[9px] font-semibold uppercase tracking-[0.1em] text-[#8E8982]">
                {!isOwner && <Lock className="h-2.5 w-2.5" strokeWidth={1.75} />}
                {isOwner ? "CABANG AKTIF" : "CABANG TERKUNCI"}
              </p>
              <p className="truncate text-xs font-semibold text-[#18181B]">
                {activeBranch?.name ?? "Belum ada cabang"}
              </p>
            </div>
            {isOwner && (
              <ChevronDown
                className="hidden h-4 w-4 shrink-0 text-[#8E8982] lg:block"
                strokeWidth={1.5}
              />
            )}
          </button>

          {isOwner && branchMenuOpen && (
            <div className="absolute top-full left-0 z-30 mt-1.5 w-56 rounded-md border border-[#E5E2DC] bg-white p-1.5 shadow-[0_8px_24px_rgba(24,24,27,0.1)]">
              <p className="px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.1em] text-[#8E8982]">
                PILIH CABANG KAFE KALA
              </p>
              {activeBranches.length === 0 ? (
                <Link
                  href="/owner/branches"
                  onClick={() => setBranchMenuOpen(false)}
                  className="block rounded px-2.5 py-2 text-xs text-[#C2572A] hover:bg-[#F8F7F4]"
                >
                  + Tambah cabang di Konsol Owner
                </Link>
              ) : (
                activeBranches.map((b) => (
                  <button
                    key={b.id}
                    type="button"
                    onClick={() => {
                      setActiveBranchId(b.id)
                      setBranchMenuOpen(false)
                      toast(`Beralih ke cabang ${b.name}`)
                    }}
                    className="flex w-full items-center justify-between rounded px-2.5 py-2 text-left text-xs hover:bg-[#F8F7F4] cursor-pointer"
                  >
                    <div>
                      <p className="font-medium text-[#18181B]">{b.name}</p>
                      <p className="font-mono text-[10px] text-[#8E8982]">{b.code}</p>
                    </div>
                    {b.id === activeBranch?.id && (
                      <Check className="h-3.5 w-3.5 text-[#C2572A]" strokeWidth={1.75} />
                    )}
                  </button>
                ))
              )}
            </div>
          )}
        </div>

        {/* Navigation Links */}
        <nav className="flex flex-1 flex-col gap-1" aria-label="Navigasi POS">
          <p className="mb-1 hidden px-2.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-[#938E86] lg:block">
            OPERASIONAL
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
                  <span
                    className={cn(
                      "hidden rounded px-1.5 py-0.5 font-mono text-[10px] tabular-nums lg:inline",
                      item.warn
                        ? "bg-[#FFFBEB] text-[#A16207]"
                        : "bg-[#E7E4DD] text-[#4A4640]"
                    )}
                  >
                    {item.count}
                  </span>
                )}
              </Link>
            )
          })}

          {isOwner && (
            <div className="mt-5 border-t border-[#EFECE7] pt-4">
              <p className="mb-1 hidden px-2.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-[#938E86] lg:block">
                KONSOL PEMILIK
              </p>
              <Link
                href="/owner"
                className="flex h-11 items-center justify-center gap-3 rounded-md px-2.5 text-xs font-medium text-[#67625B] transition-colors hover:bg-[#F8F7F4] hover:text-[#18181B] lg:justify-start"
                title="Konsol Eksekutif Owner"
              >
                <LayoutDashboard className="h-[18px] w-[18px] shrink-0 text-[#C2572A]" strokeWidth={1.5} />
                <span className="hidden lg:inline">Konsol Owner</span>
              </Link>
            </div>
          )}
        </nav>

        {/* Bottom Printer & Staff Controls */}
        <div className="mt-auto space-y-1.5 border-t border-[#EFECE7] pt-3">
          <button
            type="button"
            onClick={() => setDrawerOpen(true)}
            className="flex h-11 w-full items-center justify-center gap-3 rounded-md px-2.5 text-xs font-medium text-[#67625B] transition-colors hover:bg-[#F8F7F4] hover:text-[#18181B] lg:justify-start cursor-pointer"
            title="Pengaturan Printer Thermal"
          >
            <Printer className="h-[18px] w-[18px] shrink-0" strokeWidth={1.5} />
            <span className="hidden flex-1 truncate text-left lg:inline">
              {printerConnected ? printerName || "Printer Aktif" : "Printer Thermal"}
            </span>
            <span
              className={cn(
                "h-2 w-2 shrink-0 rounded-full",
                printerConnected ? "bg-[#166534]" : "bg-[#C8C3BA]"
              )}
            />
          </button>

          <div className="flex items-center justify-center gap-2.5 rounded-md px-1.5 py-2 lg:justify-between">
            <div className="flex min-w-0 items-center gap-2.5">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#E5DFD3] font-mono text-[11px] font-semibold text-[#4A4035]">
                {getInitials(session?.fullName ?? "KP")}
              </span>
              <div className="hidden min-w-0 lg:block">
                <p className="truncate text-xs font-semibold text-[#18181B]">
                  {session?.fullName ?? "Staf KalaPOS"}
                </p>
                <p className="truncate text-[10px] text-[#8E8982]">
                  {session?.role === "OWNER"
                    ? "Owner"
                    : session?.role === "MANAGER"
                    ? "Manager"
                    : session?.role === "BARISTA"
                    ? "Barista"
                    : "Kasir"}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={handleLogout}
              aria-label="Keluar sesi"
              title="Keluar / Ganti Akun"
              className="hidden h-8 w-8 shrink-0 items-center justify-center rounded-md text-[#8E8982] hover:bg-[#F1EFEB] hover:text-[#991B1B] lg:flex cursor-pointer"
            >
              <LogOut className="h-4 w-4" strokeWidth={1.5} />
            </button>
          </div>
        </div>
      </aside>

      {/* Main Content Shell */}
      <div className="flex min-h-screen flex-1 flex-col pl-[68px] lg:pl-[236px]">
        {/* Topbar with Offline Sync Queue & Shift Indicator */}
        <header className="sticky top-0 z-10 flex h-14 items-center justify-between gap-3 border-b border-[#E5E2DC] bg-[#F8F7F4]/95 px-4 sm:px-6">
          <div className="flex min-w-0 items-center gap-2 text-xs">
            <span className="hidden text-[#8E8982] sm:inline">{activeBranch?.code}</span>
            <span className="hidden text-[#C9C4BC] sm:inline">/</span>
            <h1 className="truncate font-semibold text-[#18181B]">{pageLabel}</h1>
          </div>

          <div className="flex items-center gap-2 sm:gap-3">
            {/* Shift indicator pill */}
            <Link
              href={isBarista ? "/pos/queue" : "/pos/shift"}
              className="hidden sm:inline-flex"
            >
              {activeShift ? (
                <Badge variant="aman" dot>
                  Shift Aktif · {formatTimeWIB(activeShift.opened_at)}
                </Badge>
              ) : (
                <Badge variant="menipis" dot>
                  Shift Belum Dibuka
                </Badge>
              )}
            </Link>

            {/* Offline Sync Queue Indicator */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setSyncMenuOpen((o) => !o)}
                className={cn(
                  "inline-flex h-8 items-center gap-2 rounded-md border px-2.5 text-[11px] font-medium transition-colors cursor-pointer",
                  isOnline && offlinePendingCount === 0
                    ? "border-[#E5E2DC] bg-white text-[#4A4640] hover:border-[#C2572A]"
                    : "border-[#FDE68A] bg-[#FFFBEB] text-[#92400E]"
                )}
              >
                {isOnline ? (
                  <Wifi className="h-3.5 w-3.5 text-[#166534]" strokeWidth={1.75} />
                ) : (
                  <WifiOff className="h-3.5 w-3.5 text-[#A16207]" strokeWidth={1.75} />
                )}
                <span className="tabular-nums">
                  {!isOnline
                    ? `Offline Mode — ${offlinePendingCount} transaksi antre sinkron`
                    : offlinePendingCount > 0
                    ? `Menyinkronkan ${offlinePendingCount} transaksi…`
                    : "Online"}
                </span>
              </button>

              {syncMenuOpen && (
                <div className="absolute right-0 z-30 mt-1.5 w-72 rounded-md border border-[#E5E2DC] bg-white p-3.5 shadow-[0_8px_24px_rgba(24,24,27,0.1)]">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-semibold text-[#18181B]">
                      Status Sinkronisasi Offline
                    </p>
                    <Badge variant={isOnline ? "aman" : "menipis"} dot>
                      {isOnline ? "Online" : "Offline"}
                    </Badge>
                  </div>
                  <p className="mt-1.5 text-[11px] leading-relaxed text-[#77736D]">
                    Setiap transaksi memakai <span className="font-mono">idempotency_key</span> unik dan disimpan ke IndexedDB agar kasir tetap bisa bertransaksi &amp; mencetak saat Wi-Fi putus.
                  </p>
                  <div className="mt-3 flex items-center justify-between rounded border border-[#EFECE7] bg-[#FAF9F7] px-2.5 py-2 text-xs">
                    <span className="text-[#67625B]">Antrean belum sinkron</span>
                    <strong className="font-mono tabular-nums text-[#18181B]">
                      {offlinePendingCount} transaksi
                    </strong>
                  </div>
                  <div className="mt-3 flex flex-col gap-2">
                    <Button
                      variant={simulatedOffline ? "default" : "outline"}
                      size="sm"
                      className="w-full"
                      onClick={() => {
                        toggleSimulatedOffline()
                        toast(
                          simulatedOffline
                            ? "Koneksi dipulihkan — menyinkronkan antrean."
                            : "Simulasi Offline Mode aktif. Transaksi tetap dapat diproses.",
                          "info"
                        )
                      }}
                    >
                      <CloudOff className="h-3.5 w-3.5" strokeWidth={1.5} />
                      {simulatedOffline ? "Pulihkan Koneksi Online" : "Simulasikan Wi-Fi Putus"}
                    </Button>
                    {offlinePendingCount > 0 && isOnline && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="w-full"
                        onClick={() => {
                          const synced = flushOfflineQueue()
                          toast(`${synced} transaksi berhasil disinkronkan.`)
                          setSyncMenuOpen(false)
                        }}
                      >
                        <RefreshCw className="h-3.5 w-3.5" strokeWidth={1.5} />
                        Sinkronkan Sekarang
                      </Button>
                    )}
                  </div>
                </div>
              )}
            </div>

            <span className="hidden font-mono text-[11px] tabular-nums text-[#8E8982] xl:inline">
              {clockLabel}
            </span>
          </div>
        </header>

        <main className="flex-1">{children}</main>
      </div>
    </div>
  )
}
