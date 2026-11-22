"use client"

import {
  ArrowRight,
  Bookmark,
  Minus,
  Percent,
  Plus,
  ShoppingBag,
  Trash2,
  User,
  X,
} from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { formatIDR, TONE_CLASSES } from "@/lib/kalapos/format"
import type { Branch, CartDraftItem, OrderType, Shift } from "@/lib/kalapos/types"
import { cn } from "@/lib/utils"

export interface OrderSlipProps {
  branch: Branch | undefined
  activeShift: Shift | null
  items: CartDraftItem[]
  orderType: OrderType
  onOrderTypeChange: (type: OrderType) => void
  tableNumber: string
  onTableNumberChange: (val: string) => void
  customerName: string
  onCustomerNameChange: (val: string) => void
  discount: number
  discountReason: string | null
  onRequestDiscount: () => void
  onClearDiscount: () => void
  resumingHoldLabel: string | null
  heldOrdersCount: number
  onOpenHoldDrawer: () => void
  onChangeQty: (draftId: string, delta: number) => void
  onClearCart: () => void
  onHoldOrder: () => void
  onOpenCheckout: () => void
  totals: {
    subtotal: number
    discount: number
    serviceCharge: number
    taxAmount: number
    total: number
  }
}

export function OrderSlip({
  branch,
  activeShift,
  items,
  orderType,
  onOrderTypeChange,
  tableNumber,
  onTableNumberChange,
  customerName,
  onCustomerNameChange,
  discount,
  discountReason,
  onRequestDiscount,
  onClearDiscount,
  resumingHoldLabel,
  heldOrdersCount,
  onOpenHoldDrawer,
  onChangeQty,
  onClearCart,
  onHoldOrder,
  onOpenCheckout,
  totals,
}: OrderSlipProps) {
  return (
    <aside className="flex w-full flex-col border-t border-[#E5E2DC] bg-white lg:sticky lg:top-14 lg:h-[calc(100vh-3.5rem)] lg:w-[36%] lg:max-w-[430px] lg:min-w-[340px] lg:border-t-0 lg:border-l">
      {/* Header */}
      <div className="flex items-center justify-between gap-2 border-b border-[#EFECE7] px-4 py-3.5">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[#8E8982]">
            {resumingHoldLabel ? `LANJUTKAN OPEN BILL · ${resumingHoldLabel}` : "PESANAN BARU"}
          </p>
          <h2 className="mt-0.5 text-base font-semibold tracking-tight text-[#18181B]">
            Struk Pesanan
          </h2>
        </div>

        <div className="flex items-center gap-1.5">
          <Button variant="outline" size="sm" onClick={onOpenHoldDrawer}>
            <Bookmark className="h-3.5 w-3.5 text-[#C2572A]" strokeWidth={1.5} />
            <span>Open Bill</span>
            {heldOrdersCount > 0 && (
              <span className="rounded bg-[#FDF4F0] px-1.5 font-mono text-[10px] font-semibold tabular-nums text-[#C2572A]">
                {heldOrdersCount}
              </span>
            )}
          </Button>

          {items.length > 0 && (
            <Button
              variant="ghost"
              size="iconSm"
              onClick={onClearCart}
              aria-label="Kosongkan pesanan"
              title="Kosongkan keranjang"
            >
              <Trash2 className="h-4 w-4 text-[#8E8982] hover:text-[#991B1B]" strokeWidth={1.5} />
            </Button>
          )}
        </div>
      </div>

      {/* Order Type & Customer Info */}
      <div className="space-y-2.5 border-b border-[#EFECE7] px-4 py-3">
        <div className="grid grid-cols-2 gap-1 rounded-md border border-[#E5E2DC] bg-[#F1EFEB] p-1">
          {(
            [
              { value: "DINE_IN", label: "Dine-In" },
              { value: "TAKEAWAY", label: "Takeaway" },
            ] as const
          ).map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => onOrderTypeChange(opt.value)}
              className={cn(
                "min-h-10 rounded text-xs font-semibold transition-colors cursor-pointer",
                orderType === opt.value
                  ? "bg-white text-[#18181B] shadow-[0_1px_2px_rgba(24,24,27,0.06)]"
                  : "text-[#77736D] hover:text-[#18181B]"
              )}
            >
              {opt.label}
            </button>
          ))}
        </div>

        <div className="flex gap-2">
          {orderType === "DINE_IN" && (
            <input
              type="text"
              value={tableNumber}
              onChange={(e) => onTableNumberChange(e.target.value)}
              placeholder="Meja, mis. 04"
              aria-label="Nomor meja"
              className="h-10 w-28 shrink-0 rounded-md border border-[#E5E2DC] bg-white px-3 font-mono text-xs text-[#18181B] placeholder:text-[#9A958E] outline-none focus:border-[#C2572A]"
            />
          )}
          <label className="flex h-10 flex-1 items-center gap-2 rounded-md border border-[#E5E2DC] bg-white px-3 focus-within:border-[#C2572A]">
            <User className="h-3.5 w-3.5 shrink-0 text-[#8E8982]" strokeWidth={1.5} />
            <input
              type="text"
              value={customerName}
              onChange={(e) => onCustomerNameChange(e.target.value)}
              placeholder="Nama pelanggan (opsional)"
              aria-label="Nama pelanggan"
              className="w-full bg-transparent text-xs text-[#18181B] placeholder:text-[#9A958E] outline-none"
            />
          </label>
        </div>
      </div>

      {/* Order Lines */}
      <div className="flex-1 overflow-y-auto px-4">
        {items.length === 0 ? (
          <div className="flex h-full min-h-[200px] flex-col items-center justify-center py-10 text-center">
            <span className="flex h-11 w-11 items-center justify-center rounded-full border border-[#EFECE7] bg-[#FAF9F7] text-[#8E8982]">
              <ShoppingBag className="h-5 w-5" strokeWidth={1.5} />
            </span>
            <p className="mt-3 text-xs font-semibold text-[#4A4640]">Belum ada menu dipilih</p>
            <p className="mt-1 text-[11px] text-[#8E8982]">
              Ketuk produk di sebelah kiri untuk memulai pesanan.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-[#EFECE7]">
            {items.map((item) => {
              const modDelta = item.modifiers.reduce((s, m) => s + m.price_delta, 0)
              const lineTotal = (item.base_price + modDelta) * item.qty
              return (
                <div key={item.draft_id} className="flex items-start gap-2.5 py-3">
                  <span
                    className={cn(
                      "mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded font-mono text-[10px] font-semibold",
                      TONE_CLASSES[item.tone]
                    )}
                  >
                    {item.mark}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-xs font-semibold text-[#18181B]">{item.product_name}</p>
                      <span className="font-mono text-xs font-semibold tabular-nums text-[#18181B]">
                        {formatIDR(lineTotal)}
                      </span>
                    </div>
                    {item.modifiers.length > 0 && (
                      <p className="mt-0.5 text-[11px] leading-snug text-[#77736D]">
                        {item.modifiers
                          .map((m) =>
                            m.price_delta > 0
                              ? `${m.option_name} (+${formatIDR(m.price_delta)})`
                              : m.option_name
                          )
                          .join(" · ")}
                      </p>
                    )}
                    {item.barista_notes && (
                      <p className="mt-0.5 text-[11px] font-medium text-[#C2572A]">
                        Catatan: {item.barista_notes}
                      </p>
                    )}

                    {/* Touch-friendly stepper */}
                    <div className="mt-2 inline-flex items-center rounded-md border border-[#E5E2DC] bg-[#FAF9F7]">
                      <button
                        type="button"
                        onClick={() => onChangeQty(item.draft_id, -1)}
                        aria-label="Kurangi jumlah"
                        className="flex h-9 w-10 items-center justify-center text-[#57534E] hover:bg-white hover:text-[#18181B] cursor-pointer"
                      >
                        <Minus className="h-3.5 w-3.5" strokeWidth={1.5} />
                      </button>
                      <span className="w-8 text-center font-mono text-xs font-semibold tabular-nums text-[#18181B]">
                        {item.qty}
                      </span>
                      <button
                        type="button"
                        onClick={() => onChangeQty(item.draft_id, 1)}
                        aria-label="Tambah jumlah"
                        className="flex h-9 w-10 items-center justify-center text-[#57534E] hover:bg-white hover:text-[#18181B] cursor-pointer"
                      >
                        <Plus className="h-3.5 w-3.5" strokeWidth={1.5} />
                      </button>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Totals & Actions */}
      <div className="border-t border-[#E5E2DC] bg-[#FAF9F7] px-4 py-3.5">
        {/* Manual Discount Override (Supervisor PIN gated) */}
        <div className="mb-2.5 flex items-center justify-between">
          {discount > 0 ? (
            <div className="flex items-center gap-1.5">
              <Badge variant="terracotta">
                Diskon -{formatIDR(discount)}
              </Badge>
              {discountReason && (
                <span className="max-w-[140px] truncate text-[10px] text-[#77736D]">
                  {discountReason}
                </span>
              )}
              <button
                type="button"
                onClick={onClearDiscount}
                aria-label="Hapus diskon"
                className="text-[#8E8982] hover:text-[#991B1B] cursor-pointer"
              >
                <X className="h-3.5 w-3.5" strokeWidth={1.5} />
              </button>
            </div>
          ) : (
            <button
              type="button"
              disabled={items.length === 0}
              onClick={onRequestDiscount}
              className="inline-flex items-center gap-1.5 text-[11px] font-medium text-[#67625B] hover:text-[#C2572A] disabled:opacity-40 cursor-pointer"
            >
              <Percent className="h-3.5 w-3.5" strokeWidth={1.5} />
              Diskon Manual (PIN Supervisor)
            </button>
          )}
        </div>

        <div className="space-y-1 text-xs">
          <div className="flex justify-between text-[#77736D]">
            <span>Subtotal</span>
            <span className="font-mono tabular-nums text-[#18181B]">
              {formatIDR(totals.subtotal)}
            </span>
          </div>
          {totals.discount > 0 && (
            <div className="flex justify-between text-[#C2572A]">
              <span>Diskon</span>
              <span className="font-mono tabular-nums">-{formatIDR(totals.discount)}</span>
            </div>
          )}
          {totals.serviceCharge > 0 && (
            <div className="flex justify-between text-[#77736D]">
              <span>Service Charge ({branch?.service_charge_rate}%)</span>
              <span className="font-mono tabular-nums text-[#18181B]">
                {formatIDR(totals.serviceCharge)}
              </span>
            </div>
          )}
          <div className="flex justify-between text-[#77736D]">
            <span>PB1 ({branch?.tax_rate ?? 10}%)</span>
            <span className="font-mono tabular-nums text-[#18181B]">
              {formatIDR(totals.taxAmount)}
            </span>
          </div>
          <div className="flex items-baseline justify-between border-t border-[#E5E2DC] pt-2 text-sm font-semibold text-[#18181B]">
            <span>Total</span>
            <span className="font-mono text-lg font-semibold tabular-nums">
              {formatIDR(totals.total)}
            </span>
          </div>
        </div>

        {/* Action Buttons (>= 48px height) */}
        <div className="mt-3.5 flex gap-2">
          <Button
            variant="outline"
            size="touch"
            disabled={items.length === 0}
            onClick={onHoldOrder}
            className="px-4"
            title="Tahan sebagai Open Bill (F2)"
          >
            Tahan
          </Button>
          <Button
            variant="default"
            size="touch"
            disabled={items.length === 0}
            onClick={onOpenCheckout}
            className="flex-1"
            title="Lanjut ke Pembayaran (F8)"
          >
            <span>{activeShift ? "Bayar" : "Buka Shift & Bayar"}</span>
            <ArrowRight className="h-4 w-4" strokeWidth={1.5} />
          </Button>
        </div>
      </div>
    </aside>
  )
}
