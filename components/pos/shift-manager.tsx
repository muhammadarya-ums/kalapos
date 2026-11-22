"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import {
  ArrowRight,
  Check,
  Clock3,
  EyeOff,
  Lock,
  ShieldAlert,
  Wallet,
} from "lucide-react"
import { ShiftStockReport } from "@/components/inventory/shift-stock-report"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Dialog } from "@/components/ui/dialog"
import { CurrencyInput, FieldLabel, Textarea } from "@/components/ui/input"
import {
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { useToast } from "@/components/ui/toast"
import { useKalaPOS } from "@/lib/kalapos/context"
import { formatDateTimeID, formatIDR, formatTimeWIB } from "@/lib/kalapos/format"
import type { BlindCloseSummary } from "@/lib/kalapos/store"
import { cn } from "@/lib/utils"

const OPENING_PRESETS = [300000, 500000, 750000, 1000000]

export function ShiftManager() {
  const { toast } = useToast()
  const {
    state,
    activeBranch,
    activeShift,
    openShift,
    closeShiftBlind,
  } = useKalaPOS()

  const [openingCash, setOpeningCash] = useState(500000)
  const [openNotes, setOpenNotes] = useState("")

  const [showCloseModal, setShowCloseModal] = useState(false)
  const [actualCash, setActualCash] = useState(0)
  const [closeNotes, setCloseNotes] = useState("")
  const [reconciliationResult, setReconciliationResult] = useState<BlindCloseSummary | null>(null)
  const [inspectedShiftId, setInspectedShiftId] = useState<string | null>(null)

  const userMap = useMemo(
    () => new Map(state.users.map((u) => [u.id, u.full_name])),
    [state.users]
  )

  const branchShifts = useMemo(
    () =>
      state.shifts
        .filter((s) => (activeBranch ? s.branch_id === activeBranch.id : true))
        .sort((a, b) => new Date(b.opened_at).getTime() - new Date(a.opened_at).getTime()),
    [state.shifts, activeBranch]
  )

  const activeShiftMetrics = useMemo(() => {
    if (!activeShift) return null
    const shiftOrders = state.orders.filter(
      (o) => o.shift_id === activeShift.id && o.status !== "HOLD" && o.status !== "VOID"
    )
    const voidOrders = state.orders.filter(
      (o) => o.shift_id === activeShift.id && o.status === "VOID"
    )
    const nonCashTotal = shiftOrders.reduce((sum, o) => {
      if (o.split_payments && o.split_payments.length > 0) {
        return (
          sum +
          o.split_payments
            .filter((p) => p.method !== "CASH")
            .reduce((s, p) => s + p.amount, 0)
        )
      }
      return sum + (o.payment_method !== "CASH" ? o.total : 0)
    }, 0)

    return {
      orderCount: shiftOrders.length,
      voidCount: voidOrders.length,
      nonCashTotal,
    }
  }, [activeShift, state.orders])

  const handleOpenShift = (e: React.FormEvent) => {
    e.preventDefault()
    const res = openShift(openingCash, openNotes)
    if (!res.ok) {
      toast(res.error || "Gagal membuka shift.", "error")
      return
    }
    toast(`Shift dibuka dengan modal awal ${formatIDR(openingCash)}.`)
    setOpenNotes("")
  }

  const handleBlindClose = (e: React.FormEvent) => {
    e.preventDefault()
    if (!activeShift) return
    const res = closeShiftBlind(activeShift.id, actualCash, closeNotes)
    if (!res.ok || !res.data) {
      toast(res.error || "Gagal menutup shift.", "error")
      return
    }
    setShowCloseModal(false)
    setReconciliationResult(res.data)
    setActualCash(0)
    setCloseNotes("")
    toast("Shift ditutup. Laporan selisih kas tersedia.")
  }

  const inspectedShift = useMemo(() => {
    if (inspectedShiftId) {
      const found = branchShifts.find((s) => s.id === inspectedShiftId)
      if (found) return found
    }
    return activeShift ?? branchShifts[0] ?? null
  }, [inspectedShiftId, branchShifts, activeShift])

  return (
    <div className="mx-auto max-w-[1280px] p-4 sm:p-6">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[#8E8982]">
            KONTROL LACI &amp; ANTI-FRAUD · {activeBranch?.name.toUpperCase() ?? "KAFE KALA"}
          </p>
          <h2 className="mt-1 text-2xl font-semibold tracking-[-0.025em] text-[#18181B]">
            Manajemen Shift Kasir
          </h2>
          <p className="mt-1 text-xs text-[#77736D]">
            Kasir wajib membuka shift sebelum transaksi dan menutup dengan Blind Cash Reconciliation.
          </p>
        </div>

        <Link href="/pos">
          <Button variant="outline" size="md">
            Kembali ke Kasir POS
            <ArrowRight className="h-4 w-4" strokeWidth={1.5} />
          </Button>
        </Link>
      </div>

      {/* Latest Blind Reconciliation Result Banner */}
      {reconciliationResult && (
        <section className="mt-5 rounded-lg border border-[#18181B] bg-white p-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <Badge
                variant={
                  reconciliationResult.variance_cash === 0
                    ? "aman"
                    : reconciliationResult.variance_cash > 0
                    ? "info"
                    : "kritis"
                }
                dot
              >
                {reconciliationResult.variance_cash === 0
                  ? "Kas Sesuai (Rp 0)"
                  : reconciliationResult.variance_cash > 0
                  ? "Selisih Lebih"
                  : "Selisih Kurang"}
              </Badge>
              <h3 className="mt-2 text-lg font-semibold text-[#18181B]">
                Hasil Rekonsiliasi Shift Baru Saja Ditutup
              </h3>
              <p className="mt-0.5 text-xs text-[#77736D]">
                Sistem membuka angka kas target setelah hitungan fisik Anda disetorkan.
              </p>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setReconciliationResult(null)}
            >
              Tutup Ringkasan
            </Button>
          </div>

          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="rounded-md border border-[#EFECE7] bg-[#FAF9F7] p-3.5">
              <p className="text-[11px] text-[#77736D]">Kas Seharusnya (Sistem)</p>
              <p className="mt-1 font-mono text-lg font-semibold tabular-nums text-[#18181B]">
                {formatIDR(reconciliationResult.expected_cash)}
              </p>
            </div>
            <div className="rounded-md border border-[#EFECE7] bg-[#FAF9F7] p-3.5">
              <p className="text-[11px] text-[#77736D]">Kas Fisik Dihitung</p>
              <p className="mt-1 font-mono text-lg font-semibold tabular-nums text-[#18181B]">
                {formatIDR(reconciliationResult.actual_cash)}
              </p>
            </div>
            <div className="rounded-md border border-[#EFECE7] bg-[#FAF9F7] p-3.5">
              <p className="text-[11px] text-[#77736D]">Selisih (Variance)</p>
              <p
                className={cn(
                  "mt-1 font-mono text-lg font-semibold tabular-nums",
                  reconciliationResult.variance_cash === 0
                    ? "text-[#166534]"
                    : reconciliationResult.variance_cash > 0
                    ? "text-[#1E40AF]"
                    : "text-[#991B1B]"
                )}
              >
                {reconciliationResult.variance_cash > 0 ? "+" : ""}
                {formatIDR(reconciliationResult.variance_cash)}
              </p>
            </div>
          </div>
        </section>
      )}

      {/* Active Shift Card OR Open Shift Form */}
      <div className="mt-5">
        {activeShift ? (
          <section className="rounded-lg border border-[#E5E2DC] bg-white p-5 sm:p-6">
            <div className="flex flex-wrap items-start justify-between gap-4 border-b border-[#EFECE7] pb-4">
              <div>
                <div className="flex items-center gap-2">
                  <Badge variant="aman" dot>
                    Shift Sedang Berlangsung
                  </Badge>
                  <span className="font-mono text-xs text-[#8E8982]">
                    Dibuka {formatTimeWIB(activeShift.opened_at)}
                  </span>
                </div>
                <h3 className="mt-2 text-lg font-semibold text-[#18181B]">
                  Kasir: {userMap.get(activeShift.user_id) ?? "Staf"} · {activeBranch?.name}
                </h3>
                {activeShift.notes && (
                  <p className="mt-0.5 text-xs text-[#77736D]">Catatan: {activeShift.notes}</p>
                )}
              </div>

              <Button
                variant="destructiveSolid"
                size="lg"
                onClick={() => {
                  setActualCash(0)
                  setCloseNotes("")
                  setShowCloseModal(true)
                }}
              >
                <Lock className="h-4 w-4" strokeWidth={1.5} />
                Tutup Shift (Blind Reconciliation)
              </Button>
            </div>

            <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-4">
              <div className="rounded-md border border-[#EFECE7] bg-[#FAF9F7] p-4">
                <p className="text-[11px] text-[#77736D]">Modal Awal Laci</p>
                <p className="mt-1.5 font-mono text-lg font-semibold tabular-nums text-[#18181B]">
                  {formatIDR(activeShift.opening_cash)}
                </p>
              </div>

              <div className="rounded-md border border-[#EFECE7] bg-[#FAF9F7] p-4">
                <p className="text-[11px] text-[#77736D]">Transaksi Shift Ini</p>
                <p className="mt-1.5 font-mono text-lg font-semibold tabular-nums text-[#18181B]">
                  {activeShiftMetrics?.orderCount ?? 0}
                  <span className="ml-1 font-sans text-xs font-normal text-[#8E8982]">
                    ({activeShiftMetrics?.voidCount ?? 0} void)
                  </span>
                </p>
              </div>

              <div className="rounded-md border border-[#EFECE7] bg-[#FAF9F7] p-4">
                <p className="text-[11px] text-[#77736D]">Non-Tunai (QRIS &amp; Kartu)</p>
                <p className="mt-1.5 font-mono text-lg font-semibold tabular-nums text-[#18181B]">
                  {formatIDR(activeShiftMetrics?.nonCashTotal ?? 0)}
                </p>
              </div>

              <div className="rounded-md border border-dashed border-[#D6D2C9] bg-[#FAF9F7] p-4">
                <p className="flex items-center gap-1.5 text-[11px] text-[#77736D]">
                  <EyeOff className="h-3.5 w-3.5 text-[#C2572A]" strokeWidth={1.5} />
                  Target Kas Tunai Laci
                </p>
                <p className="mt-1.5 font-mono text-sm font-semibold text-[#8E8982]">
                  Disembunyikan (Blind Mode)
                </p>
                <p className="mt-0.5 text-[10px] text-[#9A958E]">
                  Terbuka otomatis setelah Tutup Shift
                </p>
              </div>
            </div>
          </section>
        ) : (
          <section className="rounded-lg border border-[#E5E2DC] bg-white p-5 sm:p-6">
            <div className="max-w-lg">
              <Badge variant="menipis" dot>
                Belum Ada Shift Aktif
              </Badge>
              <h3 className="mt-2 text-lg font-semibold text-[#18181B]">
                Buka Shift Baru · {activeBranch?.name}
              </h3>
              <p className="mt-1 text-xs leading-relaxed text-[#77736D]">
                Hitung uang kembalian awal yang tersedia di laci kasir lalu masukkan nominalnya di bawah untuk mengaktifkan terminal kasir POS.
              </p>

              <form onSubmit={handleOpenShift} className="mt-5 space-y-4">
                <div>
                  <FieldLabel htmlFor="opening-cash-input">Modal Awal Laci (Kasir)</FieldLabel>
                  <CurrencyInput
                    id="opening-cash-input"
                    value={openingCash}
                    onChange={setOpeningCash}
                  />
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {OPENING_PRESETS.map((amount) => (
                      <button
                        key={amount}
                        type="button"
                        onClick={() => setOpeningCash(amount)}
                        className={cn(
                          "rounded border px-2.5 py-1 font-mono text-xs tabular-nums cursor-pointer",
                          openingCash === amount
                            ? "border-[#18181B] bg-[#18181B] text-white"
                            : "border-[#E5E2DC] bg-[#FAF9F7] text-[#57534E] hover:border-[#C2572A]"
                        )}
                      >
                        {formatIDR(amount)}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <FieldLabel htmlFor="opening-notes" hint="Opsional">
                    Catatan Pembukaan Shift
                  </FieldLabel>
                  <Textarea
                    id="opening-notes"
                    value={openNotes}
                    onChange={(e) => setOpenNotes(e.target.value)}
                    placeholder="Contoh: Shift pagi, pecahan kecil Rp 2.000 & Rp 5.000 lengkap"
                  />
                </div>

                <Button
                  type="submit"
                  variant="default"
                  size="touch"
                  disabled={!activeBranch}
                  className="w-full sm:w-auto"
                >
                  <Wallet className="h-4 w-4" strokeWidth={1.5} />
                  {activeBranch ? "Buka Shift & Aktifkan Kasir" : "Tambahkan Cabang Terlebih Dahulu"}
                </Button>
              </form>
            </div>
          </section>
        )}
      </div>

      {/* Shift Stock Monitoring Panel */}
      <div className="mt-6">
        <ShiftStockReport
          state={state}
          shift={inspectedShift}
          title={
            inspectedShift?.status === "OPEN"
              ? "Pantauan Stok Shift Aktif"
              : "Rekap Stok Shift Terpilih"
          }
          emptyMessage="Buka shift terlebih dahulu untuk menangkap stok awal shift dan memantau mutasi stok masuk, keluar, opname, serta referensi resep."
        />
      </div>

      {/* Shift History Table */}
      <section className="mt-6 overflow-hidden rounded-lg border border-[#E5E2DC] bg-white">
        <div className="flex items-center justify-between px-5 py-4">
          <div>
            <h3 className="text-sm font-semibold text-[#18181B]">Riwayat Shift Cabang</h3>
            <p className="text-xs text-[#8E8982]">
              Klik baris shift untuk meninjau rekap stoknya di atas bersama catatan rekonsiliasi kas.
            </p>
          </div>
          <span className="font-mono text-xs text-[#8E8982]">{branchShifts.length} shift</span>
        </div>

        <TableContainer>
          <TableHeader>
            <tr>
              <TableHead>Waktu Buka / Tutup</TableHead>
              <TableHead>Kasir</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Modal Awal</TableHead>
              <TableHead className="text-right">Kas Sistem</TableHead>
              <TableHead className="text-right">Kas Fisik</TableHead>
              <TableHead className="text-right">Selisih</TableHead>
            </tr>
          </TableHeader>
          <TableBody>
            {branchShifts.map((s) => {
              const isOpen = s.status === "OPEN"
              const variance =
                !isOpen && s.actual_cash !== null ? s.actual_cash - s.expected_cash : null
              return (
                <TableRow
                  key={s.id}
                  onClick={() => setInspectedShiftId(s.id)}
                  className={cn(
                    "cursor-pointer",
                    inspectedShift?.id === s.id && "bg-[#FDF4F0]/60 hover:bg-[#FDF4F0]/80"
                  )}
                >
                  <TableCell>
                    <p className="font-mono text-[11px] font-medium tabular-nums text-[#18181B]">
                      {formatDateTimeID(s.opened_at)}
                    </p>
                    <p className="font-mono text-[10px] tabular-nums text-[#8E8982]">
                      {s.closed_at ? `Tutup: ${formatDateTimeID(s.closed_at)}` : "Sedang aktif"}
                    </p>
                  </TableCell>
                  <TableCell className="font-medium text-[#18181B]">
                    {userMap.get(s.user_id) ?? "Owner Kafe Kala"}
                  </TableCell>
                  <TableCell>
                    <Badge variant={isOpen ? "aman" : "default"} dot>
                      {isOpen ? "Aktif" : "Ditutup"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right font-mono tabular-nums">
                    {formatIDR(s.opening_cash)}
                  </TableCell>
                  <TableCell className="text-right font-mono tabular-nums text-[#67625B]">
                    {isOpen ? (
                      <span className="inline-flex items-center gap-1 text-[11px] text-[#9A958E]">
                        <EyeOff className="h-3 w-3" strokeWidth={1.5} /> Tersembunyi
                      </span>
                    ) : (
                      formatIDR(s.expected_cash)
                    )}
                  </TableCell>
                  <TableCell className="text-right font-mono tabular-nums font-medium text-[#18181B]">
                    {s.actual_cash !== null ? formatIDR(s.actual_cash) : "—"}
                  </TableCell>
                  <TableCell className="text-right">
                    {variance === null ? (
                      <span className="text-[#9A958E]">—</span>
                    ) : variance === 0 ? (
                      <Badge variant="aman">Sesuai</Badge>
                    ) : variance > 0 ? (
                      <Badge variant="info" className="font-mono tabular-nums">
                        +{formatIDR(variance)}
                      </Badge>
                    ) : (
                      <Badge variant="kritis" className="font-mono tabular-nums">
                        {formatIDR(variance)}
                      </Badge>
                    )}
                  </TableCell>
                </TableRow>
              )
            })}
            {branchShifts.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} className="py-10 text-center text-xs text-[#8E8982]">
                  Belum ada riwayat shift untuk cabang ini.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </TableContainer>
      </section>

      {/* Blind Cash Reconciliation Close Modal */}
      <Dialog
        open={showCloseModal}
        onClose={() => setShowCloseModal(false)}
        eyebrow="BLIND CASH RECONCILIATION"
        title="Tutup Shift & Setor Hitungan Fisik"
        description="Hitung seluruh uang tunai di laci (termasuk modal awal). Nominal target sistem sengaja disembunyikan hingga Anda mengirim laporan."
      >
        <form onSubmit={handleBlindClose} className="space-y-4">
          <div className="flex items-start gap-2.5 rounded-md border border-[#FDE68A] bg-[#FFFBEB] p-3 text-xs text-[#92400E]">
            <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-[#A16207]" strokeWidth={1.5} />
            <span>
              Mode Blind Aktif: Selisih lebih/kurang akan langsung dihitung dan dikunci dalam riwayat audit begitu shift ditutup.
            </span>
          </div>

          <div>
            <FieldLabel htmlFor="blind-actual-cash">Total Uang Fisik di Laci (Rp)</FieldLabel>
            <CurrencyInput
              id="blind-actual-cash"
              value={actualCash}
              onChange={setActualCash}
              placeholder="Masukkan hasil hitung fisik"
            />
          </div>

          <div>
            <FieldLabel htmlFor="blind-close-notes" hint="Opsional">
              Catatan Penutupan Shift
            </FieldLabel>
            <Textarea
              id="blind-close-notes"
              value={closeNotes}
              onChange={(e) => setCloseNotes(e.target.value)}
              placeholder="Contoh: Setoran tunai dimasukkan ke brankas cabang"
            />
          </div>

          <div className="flex gap-2 pt-1">
            <Button
              variant="outline"
              size="lg"
              className="flex-1"
              onClick={() => setShowCloseModal(false)}
            >
              Batal
            </Button>
            <Button type="submit" variant="destructiveSolid" size="lg" className="flex-1">
              <Check className="h-4 w-4" strokeWidth={1.5} />
              Tutup Shift &amp; Hitung Selisih
            </Button>
          </div>
        </form>
      </Dialog>
    </div>
  )
}
