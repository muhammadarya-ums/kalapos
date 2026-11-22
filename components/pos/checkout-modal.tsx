"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import {
  ArrowRight,
  Check,
  CreditCard,
  FileText,
  Printer,
  QrCode,
  Split,
  Wallet,
} from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Dialog } from "@/components/ui/dialog"
import { CurrencyInput, FieldLabel } from "@/components/ui/input"
import { Tabs } from "@/components/ui/tabs"
import { useToast } from "@/components/ui/toast"
import { formatIDR } from "@/lib/kalapos/format"
import type { Branch, Order, PaymentMethod, SplitPaymentPart } from "@/lib/kalapos/types"
import { orderToPrintable, usePrinter } from "@/lib/printer/context"
import { cn } from "@/lib/utils"

export interface CheckoutModalProps {
  open: boolean
  onClose: () => void
  branch: Branch | undefined
  cashierName: string
  total: number
  nextQueuePreview: string
  onSubmitPayment: (payload: {
    paymentMethod: PaymentMethod
    tenderedAmount: number | null
    splitPayments: SplitPaymentPart[] | null
  }) => { ok: boolean; order?: Order; error?: string }
  onNewTransaction: () => void
}

const METHODS: Array<{ value: PaymentMethod; label: string; icon: typeof Wallet }> = [
  { value: "CASH", label: "Tunai", icon: Wallet },
  { value: "QRIS", label: "QRIS", icon: QrCode },
  { value: "CARD", label: "Debit / Kartu", icon: CreditCard },
]

export function CheckoutModal({
  open,
  onClose,
  branch,
  cashierName,
  total,
  nextQueuePreview,
  onSubmitPayment,
  onNewTransaction,
}: CheckoutModalProps) {
  const { toast } = useToast()
  const {
    settings,
    setLastPrintable,
    printCustomerReceipt,
    printBaristaTicket,
  } = usePrinter()

  const [mode, setMode] = useState<"FULL" | "SPLIT">("FULL")
  const [method, setMethod] = useState<PaymentMethod>("CASH")
  const [cashTendered, setCashTendered] = useState<number>(0)
  const [splitPeople, setSplitPeople] = useState<number>(2)
  const [splitParts, setSplitParts] = useState<SplitPaymentPart[]>([])
  const [completedOrder, setCompletedOrder] = useState<Order | null>(null)
  const [error, setError] = useState<string | null>(null)

  const buildEqualSplit = (count: number, amountTotal: number): SplitPaymentPart[] => {
    const base = Math.floor(amountTotal / count)
    const remainder = amountTotal - base * count
    return Array.from({ length: count }).map((_, idx) => ({
      id: `sp-${idx + 1}`,
      label: `Bagian ${idx + 1}`,
      method: idx === 0 ? "CASH" : "QRIS",
      amount: idx === 0 ? base + remainder : base,
    }))
  }

  useEffect(() => {
    if (open) {
      setMode("FULL")
      setMethod("CASH")
      setCashTendered(total)
      setSplitPeople(2)
      setSplitParts(buildEqualSplit(2, total))
      setCompletedOrder(null)
      setError(null)
    }
  }, [open, total])

  const quickCashOptions = useMemo(() => {
    const candidates = [total, 50000, 100000, 200000]
    const roundedUp50 = Math.ceil(total / 50000) * 50000
    if (roundedUp50 > total && !candidates.includes(roundedUp50)) {
      candidates.splice(1, 0, roundedUp50)
    }
    const unique: Array<{ label: string; amount: number }> = [
      { label: "Uang Pas", amount: total },
    ]
    const seen = new Set<number>([total])
    for (const val of candidates) {
      if (val > total && !seen.has(val) && unique.length < 4) {
        seen.add(val)
        unique.push({ label: formatIDR(val), amount: val })
      }
    }
    return unique
  }, [total])

  const splitSum = useMemo(
    () => splitParts.reduce((s, p) => s + Math.round(p.amount), 0),
    [splitParts]
  )
  const splitRemaining = total - splitSum

  const canConfirm =
    mode === "FULL"
      ? method !== "CASH" || cashTendered >= total
      : splitParts.length >= 2 && splitRemaining === 0 && splitParts.every((p) => p.amount > 0)

  const handleConfirm = async () => {
    setError(null)
    const primaryMethod: PaymentMethod =
      mode === "SPLIT" ? splitParts[0]?.method ?? "CASH" : method

    const result = onSubmitPayment({
      paymentMethod: primaryMethod,
      tenderedAmount: mode === "FULL" && method === "CASH" ? cashTendered : null,
      splitPayments: mode === "SPLIT" ? splitParts : null,
    })

    if (!result.ok || !result.order) {
      setError(result.error || "Gagal memproses pembayaran.")
      return
    }

    const order = result.order
    setCompletedOrder(order)
    const printable = orderToPrintable(order, branch, cashierName)
    setLastPrintable(printable)

    // Auto-print hooks when enabled in PrinterSettingsDrawer
    if (settings.autoPrintCustomer) {
      await printCustomerReceipt(printable)
    }
    if (settings.autoPrintBarista) {
      await printBaristaTicket(printable)
    }
  }

  const printableCompleted = useMemo(
    () => (completedOrder ? orderToPrintable(completedOrder, branch, cashierName) : null),
    [completedOrder, branch, cashierName]
  )

  if (completedOrder && printableCompleted) {
    return (
      <Dialog
        open={open}
        onClose={() => {
          onNewTransaction()
          onClose()
        }}
        maxWidthClassName="max-w-sm"
      >
        <div className="py-2 text-center">
          <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full border border-[#D1FAE5] bg-[#ECFDF5] text-[#166534]">
            <Check className="h-6 w-6" strokeWidth={1.75} />
          </span>
          <p className="mt-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-[#8E8982]">
            TRANSAKSI LUNAS · {completedOrder.order_number}
          </p>
          <h3 className="mt-1 text-lg font-semibold tracking-tight text-[#18181B]">
            Pesanan masuk antrean barista
          </h3>

          <div className="mt-4 rounded-lg border border-[#E5E2DC] bg-[#FAF9F7] px-4 py-4">
            <p className="text-[11px] text-[#77736D]">Nomor Antrean</p>
            <p className="mt-1 font-mono text-3xl font-semibold tracking-wide tabular-nums text-[#18181B]">
              {completedOrder.queue_number}
            </p>
            <div className="mt-3 flex items-center justify-center gap-2 text-xs text-[#67625B]">
              <span className="font-mono font-semibold tabular-nums text-[#18181B]">
                {formatIDR(completedOrder.total)}
              </span>
              <span>·</span>
              <span>{printableCompleted.payment}</span>
              {!completedOrder.synced && (
                <Badge variant="menipis">Antre Sinkron Offline</Badge>
              )}
            </div>
            {completedOrder.change_amount !== null && completedOrder.change_amount > 0 && (
              <p className="mt-2 font-mono text-xs tabular-nums text-[#166534]">
                Kembalian: {formatIDR(completedOrder.change_amount)}
              </p>
            )}
          </div>

          <div className="mt-4 grid grid-cols-2 gap-2">
            <Button
              variant="outline"
              size="touch"
              onClick={async () => {
                const res = await printCustomerReceipt(printableCompleted)
                toast(res.message, res.ok ? "success" : "error")
              }}
            >
              <Printer className="h-4 w-4" strokeWidth={1.5} />
              Cetak Struk
            </Button>
            <Button
              variant="outline"
              size="touch"
              onClick={async () => {
                const res = await printBaristaTicket(printableCompleted)
                toast(res.message, res.ok ? "success" : "error")
              }}
            >
              <FileText className="h-4 w-4" strokeWidth={1.5} />
              Tiket Barista
            </Button>
          </div>

          <div className="mt-2.5 flex flex-col gap-2">
            <Button
              variant="default"
              size="touch"
              className="w-full"
              onClick={() => {
                onNewTransaction()
                onClose()
              }}
            >
              Transaksi Baru
              <ArrowRight className="h-4 w-4" strokeWidth={1.5} />
            </Button>
            <Link href="/pos/queue" onClick={onClose} className="text-xs font-medium text-[#77736D] hover:text-[#C2572A]">
              Pantau di Layar Antrean KDS →
            </Link>
          </div>
        </div>
      </Dialog>
    )
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      eyebrow={`CHECKOUT · ANTREAN ${nextQueuePreview}`}
      title="Pembayaran Pesanan"
      maxWidthClassName="max-w-lg"
    >
      <div className="space-y-4">
        {/* Total Strip */}
        <div className="flex items-center justify-between rounded-lg border border-[#E5E2DC] bg-[#FAF9F7] px-4 py-3.5">
          <span className="text-xs font-medium text-[#67625B]">Total yang harus dibayar</span>
          <strong className="font-mono text-xl font-semibold tabular-nums text-[#18181B]">
            {formatIDR(total)}
          </strong>
        </div>

        <Tabs
          fullWidth
          value={mode}
          onChange={(next) => {
            setMode(next)
            setError(null)
            if (next === "SPLIT") setSplitParts(buildEqualSplit(splitPeople, total))
          }}
          options={[
            { value: "FULL", label: "Bayar Penuh" },
            { value: "SPLIT", label: "Split Bill" },
          ]}
        />

        {mode === "FULL" ? (
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-2">
              {METHODS.map((m) => {
                const Icon = m.icon
                const active = method === m.value
                return (
                  <button
                    key={m.value}
                    type="button"
                    onClick={() => {
                      setMethod(m.value)
                      if (m.value === "CASH" && cashTendered < total) setCashTendered(total)
                    }}
                    className={cn(
                      "flex min-h-[64px] flex-col items-center justify-center gap-1.5 rounded-md border text-xs font-semibold transition-colors cursor-pointer",
                      active
                        ? "border-[#C2572A] bg-[#FDF4F0] text-[#9A3E1A]"
                        : "border-[#E5E2DC] bg-white text-[#57534E] hover:bg-[#FAF9F7]"
                    )}
                  >
                    <Icon className="h-5 w-5" strokeWidth={1.5} />
                    <span>{m.label}</span>
                  </button>
                )
              })}
            </div>

            {method === "CASH" && (
              <div className="space-y-3">
                <div>
                  <FieldLabel htmlFor="checkout-cash-input">Uang Tunai Diterima</FieldLabel>
                  <CurrencyInput
                    id="checkout-cash-input"
                    value={cashTendered}
                    onChange={setCashTendered}
                  />
                </div>

                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {quickCashOptions.map((opt) => (
                    <button
                      key={opt.label}
                      type="button"
                      onClick={() => setCashTendered(opt.amount)}
                      className={cn(
                        "min-h-11 rounded-md border px-2 text-xs font-medium tabular-nums transition-colors cursor-pointer",
                        cashTendered === opt.amount
                          ? "border-[#18181B] bg-[#18181B] text-white"
                          : "border-[#E5E2DC] bg-white text-[#4A4640] hover:border-[#C2572A]"
                      )}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>

                <div className="flex items-center justify-between rounded-md border border-[#EFECE7] bg-[#FAF9F7] px-3.5 py-2.5 text-xs">
                  <span className="text-[#67625B]">Kembalian</span>
                  <strong
                    className={cn(
                      "font-mono text-sm font-semibold tabular-nums",
                      cashTendered < total ? "text-[#991B1B]" : "text-[#166534]"
                    )}
                  >
                    {cashTendered < total
                      ? `Kurang ${formatIDR(total - cashTendered)}`
                      : formatIDR(cashTendered - total)}
                  </strong>
                </div>
              </div>
            )}

            {method === "QRIS" && (
              <div className="flex flex-col items-center rounded-lg border border-[#E5E2DC] bg-[#FAF9F7] p-5 text-center">
                <div className="flex h-32 w-32 items-center justify-center rounded-md border border-[#18181B] bg-white p-2">
                  <QrCode className="h-24 w-24 text-[#18181B]" strokeWidth={1.25} />
                </div>
                <p className="mt-3 text-xs font-semibold text-[#18181B]">
                  QRIS Dinamis · {branch?.name}
                </p>
                <p className="mt-0.5 font-mono text-xs tabular-nums text-[#77736D]">
                  Nominal terkunci: {formatIDR(total)}
                </p>
              </div>
            )}

            {method === "CARD" && (
              <div className="rounded-lg border border-[#E5E2DC] bg-[#FAF9F7] p-4 text-xs text-[#57534E]">
                <p className="font-semibold text-[#18181B]">Mesin EDC Debit / Kredit</p>
                <p className="mt-1 leading-relaxed">
                  Pastikan slip persetujuan EDC berhasil tercetak sejumlah{" "}
                  <strong className="font-mono text-[#18181B]">{formatIDR(total)}</strong> sebelum mengonfirmasi.
                </p>
              </div>
            )}
          </div>
        ) : (
          /* SPLIT BILL MODE */
          <div className="space-y-3.5">
            <div className="flex items-center justify-between rounded-md border border-[#EFECE7] bg-[#FAF9F7] px-3 py-2.5">
              <span className="inline-flex items-center gap-1.5 text-xs font-medium text-[#4A4640]">
                <Split className="h-4 w-4 text-[#C2572A]" strokeWidth={1.5} />
                Bagi Rata Jumlah Pembayar
              </span>
              <div className="flex items-center gap-1">
                {[2, 3, 4].map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => {
                      setSplitPeople(n)
                      setSplitParts(buildEqualSplit(n, total))
                    }}
                    className={cn(
                      "h-8 w-9 rounded border font-mono text-xs font-semibold cursor-pointer",
                      splitPeople === n
                        ? "border-[#18181B] bg-[#18181B] text-white"
                        : "border-[#E5E2DC] bg-white text-[#57534E]"
                    )}
                  >
                    {n}×
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-2.5">
              {splitParts.map((part, idx) => (
                <div
                  key={part.id}
                  className="grid grid-cols-1 items-center gap-2 rounded-md border border-[#E5E2DC] bg-white p-3 sm:grid-cols-12"
                >
                  <div className="sm:col-span-3">
                    <p className="text-xs font-semibold text-[#18181B]">{part.label}</p>
                  </div>
                  <div className="flex gap-1 sm:col-span-4">
                    {(["CASH", "QRIS", "CARD"] as const).map((m) => (
                      <button
                        key={m}
                        type="button"
                        onClick={() =>
                          setSplitParts((prev) =>
                            prev.map((item, i) => (i === idx ? { ...item, method: m } : item))
                          )
                        }
                        className={cn(
                          "flex-1 rounded border py-1.5 text-[10px] font-semibold cursor-pointer",
                          part.method === m
                            ? "border-[#C2572A] bg-[#FDF4F0] text-[#9A3E1A]"
                            : "border-[#E5E2DC] text-[#67625B]"
                        )}
                      >
                        {m === "CASH" ? "Tunai" : m === "CARD" ? "Kartu" : "QRIS"}
                      </button>
                    ))}
                  </div>
                  <div className="sm:col-span-5">
                    <CurrencyInput
                      value={part.amount}
                      className="h-9"
                      onChange={(val) =>
                        setSplitParts((prev) =>
                          prev.map((item, i) => (i === idx ? { ...item, amount: val } : item))
                        )
                      }
                    />
                  </div>
                </div>
              ))}
            </div>

            <div className="flex items-center justify-between rounded-md border border-[#EFECE7] bg-[#FAF9F7] px-3.5 py-2 text-xs">
              <span className="text-[#67625B]">Selisih alokasi Split Bill</span>
              <strong
                className={cn(
                  "font-mono tabular-nums",
                  splitRemaining === 0 ? "text-[#166534]" : "text-[#991B1B]"
                )}
              >
                {splitRemaining === 0
                  ? "Pas (Rp 0)"
                  : splitRemaining > 0
                  ? `Kurang ${formatIDR(splitRemaining)}`
                  : `Lebih ${formatIDR(Math.abs(splitRemaining))}`}
              </strong>
            </div>
          </div>
        )}

        {error && (
          <p className="rounded-md border border-[#FECACA] bg-[#FEF2F2] px-3 py-2 text-xs text-[#991B1B]">
            {error}
          </p>
        )}

        <Button
          variant="default"
          size="touch"
          className="w-full"
          disabled={!canConfirm}
          onClick={handleConfirm}
        >
          Konfirmasi Pembayaran · {formatIDR(total)}
          <ArrowRight className="h-4 w-4" strokeWidth={1.5} />
        </Button>

        <p className="text-center text-[11px] text-[#8E8982]">
          Transaksi langsung masuk antrean Barista dan tercatat di estimasi resep shift (tanpa potong stok otomatis).
        </p>
      </div>
    </Dialog>
  )
}
