"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import Link from "next/link"
import {
  ArrowRight,
  Ban,
  Check,
  Clock3,
  FileText,
  Plus,
  Printer,
  Volume2,
  VolumeX,
} from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { SupervisorPinModal } from "@/components/ui/pin-pad"
import { useToast } from "@/components/ui/toast"
import { useKalaPOS } from "@/lib/kalapos/context"
import { formatTimeWIB } from "@/lib/kalapos/format"
import type { Order, OrderStatus } from "@/lib/kalapos/types"
import { orderToPrintable, usePrinter } from "@/lib/printer/context"
import { cn } from "@/lib/utils"

function playBaristaChime() {
  if (typeof window === "undefined") return
  try {
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!AudioCtx) return
    const ctx = new AudioCtx()
    const now = ctx.currentTime
    const notes = [587.33, 880] // Warm D5 -> A5 cafe counter chime
    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = "sine"
      osc.frequency.setValueAtTime(freq, now + i * 0.14)
      gain.gain.setValueAtTime(0.001, now + i * 0.14)
      gain.gain.exponentialRampToValueAtTime(0.18, now + i * 0.14 + 0.02)
      gain.gain.exponentialRampToValueAtTime(0.0001, now + i * 0.14 + 0.45)
      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.start(now + i * 0.14)
      osc.stop(now + i * 0.14 + 0.46)
    })
  } catch {
    /* Audio playback blocked before interaction */
  }
}

function formatElapsed(createdAtIso: string, nowMs: number): { label: string; minutes: number } {
  const diffSec = Math.max(0, Math.floor((nowMs - new Date(createdAtIso).getTime()) / 1000))
  const mins = Math.floor(diffSec / 60)
  const secs = diffSec % 60
  if (mins >= 60) {
    const hrs = Math.floor(mins / 60)
    return { label: `${hrs}j ${mins % 60}m`, minutes: mins }
  }
  return {
    label: `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`,
    minutes: mins,
  }
}

export function QueueBoard() {
  const { toast } = useToast()
  const { state, activeBranch, advanceOrderStatus, voidOrder } = useKalaPOS()
  const { printBaristaTicket } = usePrinter()

  const [nowMs, setNowMs] = useState(() => Date.now())
  const [soundEnabled, setSoundEnabled] = useState(true)
  const [showArchive, setShowArchive] = useState(false)
  const [voidTarget, setVoidTarget] = useState<Order | null>(null)

  const prevQueuedIdsRef = useRef<Set<string> | null>(null)

  // Live 1-second timer tick for SLA alerts (amber >= 5m, red >= 10m)
  useEffect(() => {
    const timer = window.setInterval(() => setNowMs(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [])

  const branchOrders = useMemo(
    () =>
      state.orders
        .filter((o) => o.branch_id === activeBranch?.id && o.status !== "HOLD")
        .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()),
    [state.orders, activeBranch?.id]
  )

  const queuedOrders = useMemo(
    () => branchOrders.filter((o) => o.status === "QUEUED"),
    [branchOrders]
  )
  const preparingOrders = useMemo(
    () => branchOrders.filter((o) => o.status === "PREPARING"),
    [branchOrders]
  )
  const readyOrders = useMemo(
    () => branchOrders.filter((o) => o.status === "READY"),
    [branchOrders]
  )
  const archivedOrders = useMemo(
    () =>
      branchOrders
        .filter((o) => o.status === "COMPLETED" || o.status === "VOID")
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
        .slice(0, 16),
    [branchOrders]
  )

  // Play chime when a brand-new QUEUED ticket arrives
  useEffect(() => {
    const currentIds = new Set(queuedOrders.map((o) => o.id))
    if (prevQueuedIdsRef.current !== null) {
      let hasNew = false
      for (const id of currentIds) {
        if (!prevQueuedIdsRef.current.has(id)) {
          hasNew = true
          break
        }
      }
      if (hasNew && soundEnabled) {
        playBaristaChime()
      }
    }
    prevQueuedIdsRef.current = currentIds
  }, [queuedOrders, soundEnabled])

  const handleAdvance = useCallback(
    async (order: Order) => {
      const nextMap: Partial<Record<OrderStatus, OrderStatus>> = {
        QUEUED: "PREPARING",
        PREPARING: "READY",
        READY: "COMPLETED",
      }
      const next = nextMap[order.status]
      if (!next) return
      const res = await advanceOrderStatus(order.id, next)
      if (res.ok) {
        const label =
          next === "PREPARING"
            ? "sedang dibuat"
            : next === "READY"
            ? "siap diambil"
            : "selesai diarsipkan"
        toast(`Tiket #${order.queue_number} ${label}.`)
      } else {
        toast(res.error || "Gagal memperbarui status antrean.", "error")
      }
    },
    [advanceOrderStatus, toast]
  )

  const cashierNameMap = useMemo(
    () => new Map(state.users.map((u) => [u.id, u.full_name])),
    [state.users]
  )

  const columns: Array<{
    key: OrderStatus
    title: string
    subtitle: string
    dotColor: string
    actionLabel: string
    items: Order[]
  }> = [
    {
      key: "QUEUED",
      title: "Menunggu",
      subtitle: "Antrean baru dari kasir",
      dotColor: "bg-[#C88731]",
      actionLabel: "Mulai Dibuat",
      items: queuedOrders,
    },
    {
      key: "PREPARING",
      title: "Sedang Dibuat",
      subtitle: "Proses di meja espresso & bar",
      dotColor: "bg-[#334E68]",
      actionLabel: "Tandai Siap Diambil",
      items: preparingOrders,
    },
    {
      key: "READY",
      title: "Siap Diambil",
      subtitle: "Panggil pelanggan di meja pickup",
      dotColor: "bg-[#166534]",
      actionLabel: "Selesaikan & Arsipkan",
      items: readyOrders,
    },
  ]

  return (
    <div className="mx-auto max-w-[1520px] p-4 sm:p-6">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[#8E8982]">
            BARISTA KITCHEN DISPLAY · {activeBranch?.name.toUpperCase() ?? "KAFE KALA"}
          </p>
          <h2 className="mt-1 text-2xl font-semibold tracking-[-0.025em] text-[#18181B]">
            Antrean Pesanan Langsung
          </h2>
          <p className="mt-1 text-xs text-[#77736D]">
            Timer otomatis berubah kuning setelah 5 menit dan merah bata setelah 10 menit.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            size="md"
            onClick={() => {
              const next = !soundEnabled
              setSoundEnabled(next)
              if (next) playBaristaChime()
              toast(next ? "Lonceng pesanan baru aktif." : "Lonceng pesanan dimatikan.", "info")
            }}
          >
            {soundEnabled ? (
              <Volume2 className="h-4 w-4 text-[#166534]" strokeWidth={1.5} />
            ) : (
              <VolumeX className="h-4 w-4 text-[#8E8982]" strokeWidth={1.5} />
            )}
            {soundEnabled ? "Lonceng Aktif" : "Lonceng Nonaktif"}
          </Button>

          <Button
            variant={showArchive ? "terracotta" : "outline"}
            size="md"
            onClick={() => setShowArchive((s) => !s)}
          >
            <FileText className="h-4 w-4" strokeWidth={1.5} />
            {showArchive ? "Sembunyikan Arsip" : `Riwayat (${archivedOrders.length})`}
          </Button>

          <Link href="/pos">
            <Button variant="default" size="md">
              <Plus className="h-4 w-4" strokeWidth={1.5} />
              Pesanan Baru
            </Button>
          </Link>
        </div>
      </div>

      {/* Live Summary Strip */}
      <div className="mt-5 flex flex-wrap items-center gap-x-6 gap-y-2 rounded-lg border border-[#E5E2DC] bg-white px-4 py-3 text-xs">
        <span className="inline-flex items-center gap-2 text-[#57534E]">
          <span className="h-2 w-2 rounded-full bg-[#C88731]" />
          Menunggu <strong className="font-mono tabular-nums text-[#18181B]">{queuedOrders.length}</strong>
        </span>
        <span className="inline-flex items-center gap-2 text-[#57534E]">
          <span className="h-2 w-2 rounded-full bg-[#334E68]" />
          Sedang Dibuat <strong className="font-mono tabular-nums text-[#18181B]">{preparingOrders.length}</strong>
        </span>
        <span className="inline-flex items-center gap-2 text-[#57534E]">
          <span className="h-2 w-2 rounded-full bg-[#166534]" />
          Siap Diambil <strong className="font-mono tabular-nums text-[#18181B]">{readyOrders.length}</strong>
        </span>
        <span className="ml-auto inline-flex items-center gap-1.5 text-[11px] text-[#77736D]">
          <span className="h-1.5 w-1.5 rounded-full bg-[#166534]" />
          Pembaruan real-time aktif
        </span>
      </div>

      {/* 3-Column Kanban Board */}
      <div className="mt-5 grid grid-cols-1 gap-4 lg:grid-cols-3">
        {columns.map((col) => (
          <section key={col.key} className="flex flex-col">
            <div className="mb-3 flex items-center justify-between px-1">
              <div>
                <div className="flex items-center gap-2">
                  <span className={cn("h-2 w-2 rounded-full", col.dotColor)} />
                  <h3 className="text-sm font-semibold text-[#18181B]">{col.title}</h3>
                  <span className="rounded bg-[#EAE7E0] px-2 py-0.5 font-mono text-[11px] font-semibold tabular-nums text-[#4A4640]">
                    {col.items.length}
                  </span>
                </div>
                <p className="mt-0.5 pl-4 text-[11px] text-[#8E8982]">{col.subtitle}</p>
              </div>
            </div>

            <div className="flex-1 space-y-3">
              {col.items.length === 0 ? (
                <div className="rounded-lg border border-dashed border-[#D6D2C9] bg-white/60 px-4 py-10 text-center text-xs text-[#8E8982]">
                  Belum ada tiket di tahap {col.title.toLowerCase()}.
                </div>
              ) : (
                col.items.map((order) => {
                  const elapsed = formatElapsed(order.created_at, nowMs)
                  const isLate = elapsed.minutes >= 10
                  const isWarm = elapsed.minutes >= 5 && elapsed.minutes < 10

                  return (
                    <article
                      key={order.id}
                      className={cn(
                        "rounded-lg border bg-white p-4 transition-colors",
                        isLate
                          ? "border-[#FECACA]"
                          : isWarm
                          ? "border-[#FDE68A]"
                          : "border-[#E5E2DC]"
                      )}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <strong className="font-mono text-base font-semibold tabular-nums text-[#18181B]">
                            #{order.queue_number}
                          </strong>
                          <span className="font-mono text-[10px] text-[#8E8982]">
                            {order.order_number}
                          </span>
                        </div>
                        <span
                          className={cn(
                            "inline-flex items-center gap-1 rounded border px-2 py-0.5 font-mono text-[11px] font-semibold tabular-nums",
                            isLate
                              ? "border-[#FECACA] bg-[#FEF2F2] text-[#991B1B]"
                              : isWarm
                              ? "border-[#FDE68A] bg-[#FFFBEB] text-[#A16207]"
                              : "border-[#EFECE7] bg-[#FAF9F7] text-[#57534E]"
                          )}
                        >
                          <Clock3 className="h-3 w-3" strokeWidth={1.75} />
                          {elapsed.label}
                        </span>
                      </div>

                      <div className="mt-2.5 flex items-center justify-between gap-2">
                        <div>
                          <p className="text-xs font-semibold text-[#18181B]">
                            {order.customer_name}
                          </p>
                          <p className="text-[11px] text-[#8E8982]">
                            {order.order_type === "DINE_IN"
                              ? `Dine-In${order.table_number ? ` · Meja ${order.table_number}` : ""}`
                              : "Takeaway"}
                          </p>
                        </div>
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            title="Cetak ulang Tiket Barista"
                            onClick={async () => {
                              const printable = orderToPrintable(
                                order,
                                activeBranch,
                                cashierNameMap.get(order.cashier_id ?? "") ?? "Kasir"
                              )
                              const res = await printBaristaTicket(printable)
                              toast(res.message, res.ok ? "success" : "error")
                            }}
                            className="flex h-8 w-8 items-center justify-center rounded border border-[#E5E2DC] text-[#67625B] hover:border-[#18181B] hover:text-[#18181B] cursor-pointer"
                          >
                            <Printer className="h-3.5 w-3.5" strokeWidth={1.5} />
                          </button>
                          <button
                            type="button"
                            title="Batalkan pesanan (VOID · PIN Supervisor)"
                            onClick={() => setVoidTarget(order)}
                            className="flex h-8 w-8 items-center justify-center rounded border border-[#E5E2DC] text-[#8E8982] hover:border-[#FECACA] hover:bg-[#FEF2F2] hover:text-[#991B1B] cursor-pointer"
                          >
                            <Ban className="h-3.5 w-3.5" strokeWidth={1.5} />
                          </button>
                        </div>
                      </div>

                      <div className="mt-3 space-y-2 border-t border-[#EFECE7] pt-3">
                        {order.items.map((item) => (
                          <div key={item.id} className="text-xs">
                            <p className="font-semibold text-[#18181B]">
                              <span className="mr-1.5 font-mono tabular-nums text-[#C2572A]">
                                {item.qty}×
                              </span>
                              {item.product_name_snapshot}
                            </p>
                            {item.modifiers_snapshot.length > 0 && (
                              <p className="mt-0.5 pl-5 text-[11px] text-[#67625B]">
                                {item.modifiers_snapshot.map((m) => m.option_name).join(" · ")}
                              </p>
                            )}
                            {item.barista_notes && (
                              <p className="mt-0.5 pl-5 text-[11px] font-semibold text-[#C2572A]">
                                Catatan: {item.barista_notes}
                              </p>
                            )}
                          </div>
                        ))}
                      </div>

                      <Button
                        variant={col.key === "READY" ? "success" : "outline"}
                        size="touch"
                        className="mt-4 w-full justify-between"
                        onClick={() => handleAdvance(order)}
                      >
                        <span>{col.actionLabel}</span>
                        {col.key === "READY" ? (
                          <Check className="h-4 w-4" strokeWidth={1.75} />
                        ) : (
                          <ArrowRight className="h-4 w-4" strokeWidth={1.5} />
                        )}
                      </Button>
                    </article>
                  )
                })
              )}
            </div>
          </section>
        ))}
      </div>

      {/* Archived Orders (Completed & Void) */}
      {showArchive && (
        <section className="mt-8 rounded-lg border border-[#E5E2DC] bg-white p-5">
          <div className="mb-3 flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold text-[#18181B]">Arsip Pesanan Terakhir</h3>
              <p className="text-xs text-[#8E8982]">
                Pesanan selesai (COMPLETED) dan dibatalkan (VOID) di cabang ini.
              </p>
            </div>
          </div>

          <div className="divide-y divide-[#EFECE7]">
            {archivedOrders.map((o) => (
              <div key={o.id} className="flex flex-wrap items-center justify-between gap-3 py-3 text-xs">
                <div className="flex items-center gap-3">
                  <span className="font-mono font-semibold text-[#18181B]">#{o.queue_number}</span>
                  <span className="font-mono text-[11px] text-[#8E8982]">{o.order_number}</span>
                  <span className="font-medium text-[#18181B]">{o.customer_name}</span>
                  <Badge variant={o.status === "VOID" ? "kritis" : "aman"}>
                    {o.status === "VOID" ? "VOID" : "Selesai"}
                  </Badge>
                  {o.void_reason && (
                    <span className="text-[11px] text-[#991B1B]">Alasan: {o.void_reason}</span>
                  )}
                </div>
                <span className="font-mono text-[11px] text-[#8E8982]">
                  {formatTimeWIB(o.created_at)}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Supervisor PIN Modal for VOID */}
      <SupervisorPinModal
        open={Boolean(voidTarget)}
        onClose={() => setVoidTarget(null)}
        title={`Batalkan Pesanan #${voidTarget?.queue_number ?? ""}`}
        description="Pembatalan pesanan (VOID) akan dicatat pada log audit dan mengurangi target kas shift jika dibayar tunai."
        actionLabel="Konfirmasi VOID"
        reasonLabel="Alasan Pembatalan (Audit)"
        reasonPlaceholder="Contoh: Salah input menu / pelanggan batal"
        onConfirm={async ({ pin, reason }) => {
          if (!voidTarget) return { ok: false, error: "Pesanan tidak ditemukan." }
          const res = await voidOrder(voidTarget.id, reason, pin)
          if (!res.ok) return { ok: false, error: res.error }
          toast(`Pesanan #${voidTarget.queue_number} dibatalkan (VOID).`, "info")
          return { ok: true }
        }}
      />
    </div>
  )
}
