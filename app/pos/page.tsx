"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Wallet } from "lucide-react"
import { CheckoutModal } from "@/components/pos/checkout-modal"
import { HoldOrderDrawer } from "@/components/pos/hold-order-drawer"
import { ModifierModal } from "@/components/pos/modifier-modal"
import { OrderSlip } from "@/components/pos/order-slip"
import { ProductGrid } from "@/components/pos/product-grid"
import { Button } from "@/components/ui/button"
import { Dialog } from "@/components/ui/dialog"
import { CurrencyInput, FieldLabel } from "@/components/ui/input"
import { SupervisorPinModal } from "@/components/ui/pin-pad"
import { useToast } from "@/components/ui/toast"
import { useKalaPOS } from "@/lib/kalapos/context"
import { formatIDR, generateId } from "@/lib/kalapos/format"
import { computeOrderTotals } from "@/lib/kalapos/store"
import type {
  CartDraftItem,
  Order,
  OrderModifierSnapshot,
  OrderType,
  Product,
} from "@/lib/kalapos/types"

export default function PosPage() {
  const { toast } = useToast()
  const {
    state,
    session,
    activeBranch,
    activeShift,
    openShift,
    checkoutOrder,
    holdOrder,
    voidOrder,
    verifySupervisorPin,
  } = useKalaPOS()

  const searchInputRef = useRef<HTMLInputElement | null>(null)
  const [searchQuery, setSearchQuery] = useState("")
  const [selectedCategoryId, setSelectedCategoryId] = useState("ALL")

  // Active Order Cart State
  const [cart, setCart] = useState<CartDraftItem[]>([])
  const [orderType, setOrderType] = useState<OrderType>("DINE_IN")
  const [tableNumber, setTableNumber] = useState("")
  const [customerName, setCustomerName] = useState("")
  const [discount, setDiscount] = useState(0)
  const [discountReason, setDiscountReason] = useState<string | null>(null)
  const [resumingHoldId, setResumingHoldId] = useState<string | null>(null)
  const [resumingHoldLabel, setResumingHoldLabel] = useState<string | null>(null)

  // Modals & Drawers
  const [customizing, setCustomizing] = useState<{
    product: Product
    effectivePrice: number
  } | null>(null)
  const [checkoutOpen, setCheckoutOpen] = useState(false)
  const [holdDrawerOpen, setHoldDrawerOpen] = useState(false)
  const [quickShiftOpen, setQuickShiftOpen] = useState(false)
  const [quickOpeningCash, setQuickOpeningCash] = useState(500000)

  // Discount override flow (amount input -> Supervisor PIN)
  const [discountAmountModal, setDiscountAmountModal] = useState(false)
  const [draftDiscountAmount, setDraftDiscountAmount] = useState(0)
  const [discountPinModal, setDiscountPinModal] = useState(false)

  // Void Held Order PIN modal
  const [voidHoldTarget, setVoidHoldTarget] = useState<Order | null>(null)

  const heldOrders = useMemo(
    () =>
      state.orders
        .filter((o) => o.branch_id === activeBranch?.id && o.status === "HOLD")
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()),
    [state.orders, activeBranch?.id]
  )

  const nextQueuePreview = useMemo(() => {
    const todayStr = new Date().toISOString().slice(0, 10)
    const countToday = state.orders.filter(
      (o) =>
        o.branch_id === activeBranch?.id &&
        o.status !== "HOLD" &&
        o.created_at.slice(0, 10) === todayStr
    ).length
    return `A-${String(countToday + 1).padStart(3, "0")}`
  }, [state.orders, activeBranch?.id])

  const totals = useMemo(
    () => computeOrderTotals(cart, activeBranch, discount),
    [cart, activeBranch, discount]
  )

  const resetCart = useCallback(() => {
    setCart([])
    setTableNumber("")
    setCustomerName("")
    setDiscount(0)
    setDiscountReason(null)
    setResumingHoldId(null)
    setResumingHoldLabel(null)
  }, [])

  const addProductDirect = useCallback(
    (
      product: Product,
      effectivePrice: number,
      modifiers: OrderModifierSnapshot[] = [],
      qty = 1,
      baristaNotes = ""
    ) => {
      const modKey = modifiers
        .map((m) => m.option_id)
        .sort()
        .join("|")
      const cleanNote = baristaNotes.trim()

      setCart((prev) => {
        const matchIdx = prev.findIndex(
          (it) =>
            it.product_id === product.id &&
            it.barista_notes === cleanNote &&
            it.modifiers
              .map((m) => m.option_id)
              .sort()
              .join("|") === modKey
        )
        if (matchIdx >= 0) {
          return prev.map((it, idx) =>
            idx === matchIdx ? { ...it, qty: it.qty + qty } : it
          )
        }
        return [
          ...prev,
          {
            draft_id: generateId("line"),
            product_id: product.id,
            product_name: product.name,
            mark: product.mark,
            tone: product.tone,
            base_price: effectivePrice,
            modifiers,
            qty,
            barista_notes: cleanNote,
          },
        ]
      })
      toast(`${product.name} ditambahkan ke struk`)
    },
    [toast]
  )

  const handleSelectProduct = useCallback(
    (product: Product, effectivePrice: number) => {
      if (product.is_customizable) {
        setCustomizing({ product, effectivePrice })
      } else {
        addProductDirect(product, effectivePrice)
      }
    },
    [addProductDirect]
  )

  const handleChangeQty = useCallback((draftId: string, delta: number) => {
    setCart((prev) =>
      prev
        .map((it) => (it.draft_id === draftId ? { ...it, qty: it.qty + delta } : it))
        .filter((it) => it.qty > 0)
    )
  }, [])

  const handleHoldOrder = useCallback(() => {
    if (cart.length === 0) return
    const res = holdOrder({
      customer_name: customerName,
      order_type: orderType,
      table_number: orderType === "DINE_IN" ? tableNumber || null : null,
      discount,
      discount_reason: discountReason,
      items: cart,
      existing_hold_id: resumingHoldId,
    })
    if (!res.ok || !res.data) {
      toast(res.error || "Gagal menyimpan Open Bill.", "error")
      return
    }
    toast(`Open Bill ${res.data.queue_number} berhasil ditahan.`)
    resetCart()
  }, [
    cart,
    holdOrder,
    customerName,
    orderType,
    tableNumber,
    discount,
    discountReason,
    resumingHoldId,
    toast,
    resetCart,
  ])

  const handleResumeHeldOrder = useCallback(
    (order: Order) => {
      const productMap = new Map(state.products.map((p) => [p.id, p]))
      const draftItems: CartDraftItem[] = order.items.map((it) => {
        const prod = it.product_id ? productMap.get(it.product_id) : undefined
        const modDelta = it.modifiers_snapshot.reduce((s, m) => s + m.price_delta, 0)
        return {
          draft_id: generateId("line"),
          product_id: it.product_id || it.id,
          product_name: it.product_name_snapshot,
          mark: prod?.mark ?? it.product_name_snapshot.slice(0, 2).toUpperCase(),
          tone: prod?.tone ?? "sand",
          base_price: Math.max(0, it.unit_price_snapshot - modDelta),
          modifiers: it.modifiers_snapshot,
          qty: it.qty,
          barista_notes: it.barista_notes,
        }
      })
      setCart(draftItems)
      setOrderType(order.order_type)
      setTableNumber(order.table_number ?? "")
      setCustomerName(order.customer_name)
      setDiscount(order.discount)
      setDiscountReason(order.discount_reason)
      setResumingHoldId(order.id)
      setResumingHoldLabel(order.queue_number)
      toast(`Open Bill ${order.queue_number} dimuat ke kasir.`)
    },
    [state.products, toast]
  )

  const handleOpenCheckout = useCallback(() => {
    if (cart.length === 0) return
    if (!activeShift) {
      setQuickShiftOpen(true)
      toast("Buka shift terlebih dahulu untuk memproses pembayaran.", "info")
      return
    }
    setCheckoutOpen(true)
  }, [cart.length, activeShift, toast])

  // Desktop keyboard shortcuts: '/' focus search, F2 hold order, F8 open checkout, Esc close modals
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      const isTyping =
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.tagName === "SELECT" ||
          target.isContentEditable)

      if (event.key === "/" && !isTyping) {
        event.preventDefault()
        searchInputRef.current?.focus()
        return
      }
      if (event.key === "F2") {
        event.preventDefault()
        handleHoldOrder()
        return
      }
      if (event.key === "F8") {
        event.preventDefault()
        handleOpenCheckout()
        return
      }
      if (event.key === "Escape") {
        setCustomizing(null)
        setCheckoutOpen(false)
        setHoldDrawerOpen(false)
        setQuickShiftOpen(false)
        setDiscountAmountModal(false)
        setDiscountPinModal(false)
      }
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [handleHoldOrder, handleOpenCheckout])

  return (
    <div className="flex flex-col lg:flex-row">
      {/* 65% Tablet-First Catalog Grid */}
      <ProductGrid
        branch={activeBranch}
        activeShift={activeShift}
        categories={state.categories}
        products={state.products}
        branchProducts={state.branch_products}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        selectedCategoryId={selectedCategoryId}
        onSelectCategory={setSelectedCategoryId}
        onSelectProduct={handleSelectProduct}
        onQuickOpenShift={() => setQuickShiftOpen(true)}
        searchInputRef={searchInputRef}
        canManageMenu={session?.role === "OWNER" || session?.role === "MANAGER"}
      />

      {/* 35% Order Slip */}
      <OrderSlip
        branch={activeBranch}
        activeShift={activeShift}
        items={cart}
        orderType={orderType}
        onOrderTypeChange={setOrderType}
        tableNumber={tableNumber}
        onTableNumberChange={setTableNumber}
        customerName={customerName}
        onCustomerNameChange={setCustomerName}
        discount={discount}
        discountReason={discountReason}
        onRequestDiscount={() => {
          setDraftDiscountAmount(discount || 5000)
          setDiscountAmountModal(true)
        }}
        onClearDiscount={() => {
          setDiscount(0)
          setDiscountReason(null)
        }}
        resumingHoldLabel={resumingHoldLabel}
        heldOrdersCount={heldOrders.length}
        onOpenHoldDrawer={() => setHoldDrawerOpen(true)}
        onChangeQty={handleChangeQty}
        onClearCart={resetCart}
        onHoldOrder={handleHoldOrder}
        onOpenCheckout={handleOpenCheckout}
        totals={totals}
      />

      {/* Drink Modifier Modal */}
      <ModifierModal
        product={customizing?.product ?? null}
        effectivePrice={customizing?.effectivePrice ?? 0}
        modifierGroups={state.modifier_groups}
        modifierOptions={state.modifier_options}
        productModifierGroups={state.product_modifier_groups}
        onClose={() => setCustomizing(null)}
        onConfirm={({ modifiers, qty, baristaNotes }) => {
          if (!customizing) return
          addProductDirect(
            customizing.product,
            customizing.effectivePrice,
            modifiers,
            qty,
            baristaNotes
          )
        }}
      />

      {/* Checkout & Split Bill Modal */}
      <CheckoutModal
        open={checkoutOpen}
        onClose={() => setCheckoutOpen(false)}
        branch={activeBranch}
        cashierName={session?.fullName ?? "Kasir"}
        total={totals.total}
        nextQueuePreview={nextQueuePreview}
        onSubmitPayment={({ paymentMethod, tenderedAmount, splitPayments }) => {
          const res = checkoutOrder({
            customer_name: customerName,
            order_type: orderType,
            table_number: orderType === "DINE_IN" ? tableNumber || null : null,
            payment_method: paymentMethod,
            tendered_amount: tenderedAmount,
            discount,
            discount_reason: discountReason,
            items: cart,
            split_payments: splitPayments,
            held_order_id: resumingHoldId,
          })
          if (!res.ok || !res.data) {
            return { ok: false, error: res.error }
          }
          toast(`Pembayaran ${res.data.order_number} lunas · Antrean #${res.data.queue_number}`)
          return { ok: true, order: res.data }
        }}
        onNewTransaction={resetCart}
      />

      {/* Open Bill / Held Orders Drawer */}
      <HoldOrderDrawer
        open={holdDrawerOpen}
        onClose={() => setHoldDrawerOpen(false)}
        heldOrders={heldOrders}
        onResume={handleResumeHeldOrder}
        onRequestVoid={(order) => setVoidHoldTarget(order)}
      />

      {/* Quick Open Shift Dialog directly from POS */}
      <Dialog
        open={quickShiftOpen}
        onClose={() => setQuickShiftOpen(false)}
        eyebrow="SHIFT KASIR WAJIB"
        title={`Buka Shift · ${activeBranch?.name ?? ""}`}
        description="Masukkan nominal modal awal uang kembalian di laci untuk mengaktifkan pembayaran."
        maxWidthClassName="max-w-sm"
      >
        <form
          onSubmit={(e) => {
            e.preventDefault()
            const res = openShift(quickOpeningCash, "Pembukaan shift dari terminal kasir")
            if (!res.ok) {
              toast(res.error || "Gagal membuka shift.", "error")
              return
            }
            toast(`Shift dibuka (${formatIDR(quickOpeningCash)}). Kasir siap melayani!`)
            setQuickShiftOpen(false)
            if (cart.length > 0) setCheckoutOpen(true)
          }}
          className="space-y-4"
        >
          <div>
            <FieldLabel htmlFor="quick-opening-cash">Modal Awal Laci (Rp)</FieldLabel>
            <CurrencyInput
              id="quick-opening-cash"
              value={quickOpeningCash}
              onChange={setQuickOpeningCash}
            />
            <div className="mt-2 grid grid-cols-3 gap-1.5">
              {[300000, 500000, 1000000].map((v) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setQuickOpeningCash(v)}
                  className="rounded border border-[#E5E2DC] bg-[#FAF9F7] py-1.5 font-mono text-[11px] text-[#4A4640] hover:border-[#C2572A] cursor-pointer"
                >
                  {formatIDR(v)}
                </button>
              ))}
            </div>
          </div>

          <Button type="submit" variant="default" size="touch" className="w-full">
            <Wallet className="h-4 w-4" strokeWidth={1.5} />
            Buka Shift Sekarang
          </Button>
        </form>
      </Dialog>

      {/* Step 1: Enter Manual Discount Nominal */}
      <Dialog
        open={discountAmountModal}
        onClose={() => setDiscountAmountModal(false)}
        eyebrow="DISKON MANUAL"
        title="Nominal Diskon Pesanan"
        description={`Subtotal saat ini ${formatIDR(totals.subtotal)}. Otorisasi PIN Supervisor diperlukan setelah ini.`}
        maxWidthClassName="max-w-sm"
      >
        <div className="space-y-4">
          <div>
            <FieldLabel htmlFor="discount-nominal-input">Potongan Harga (Rp)</FieldLabel>
            <CurrencyInput
              id="discount-nominal-input"
              value={draftDiscountAmount}
              onChange={setDraftDiscountAmount}
            />
            <div className="mt-2 grid grid-cols-3 gap-1.5">
              {[5000, 10000, Math.round(totals.subtotal * 0.1)].map((val, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => setDraftDiscountAmount(val)}
                  className="rounded border border-[#E5E2DC] bg-[#FAF9F7] py-1.5 font-mono text-[11px] text-[#4A4640] hover:border-[#C2572A] cursor-pointer"
                >
                  {idx === 2 ? `10% (${formatIDR(val)})` : formatIDR(val)}
                </button>
              ))}
            </div>
          </div>
          <Button
            variant="default"
            size="touch"
            className="w-full"
            disabled={draftDiscountAmount <= 0 || draftDiscountAmount > totals.subtotal}
            onClick={() => {
              setDiscountAmountModal(false)
              setDiscountPinModal(true)
            }}
          >
            Lanjut Otorisasi PIN Supervisor
          </Button>
        </div>
      </Dialog>

      {/* Step 2: Supervisor PIN Modal for Manual Discount Override */}
      <SupervisorPinModal
        open={discountPinModal}
        onClose={() => setDiscountPinModal(false)}
        title={`Otorisasi Diskon ${formatIDR(draftDiscountAmount)}`}
        description="Override diskon manual dicatat bersama identitas supervisor dan alasan audit."
        actionLabel="Terapkan Diskon"
        reasonLabel="Alasan Diskon Manual"
        reasonPlaceholder="Contoh: Kompensasi tunggu / promo member komunitas"
        onConfirm={async ({ pin, reason }) => {
          const auth = await verifySupervisorPin(pin)
          if (!auth.ok) {
            return { ok: false, error: auth.error || "PIN Supervisor tidak valid." }
          }
          setDiscount(draftDiscountAmount)
          setDiscountReason(`${reason} (${auth.supervisorName})`)
          toast(`Diskon ${formatIDR(draftDiscountAmount)} diterapkan.`)
          return { ok: true }
        }}
      />

      {/* Supervisor PIN Modal for Voiding Held Open Bill */}
      <SupervisorPinModal
        open={Boolean(voidHoldTarget)}
        onClose={() => setVoidHoldTarget(null)}
        title={`Batalkan Open Bill ${voidHoldTarget?.queue_number ?? ""}`}
        description="Open Bill akan ditandai VOID pada catatan audit cabang."
        actionLabel="Konfirmasi VOID"
        reasonLabel="Alasan Pembatalan"
        reasonPlaceholder="Contoh: Pelanggan pindah lokasi"
        onConfirm={async ({ pin, reason }) => {
          if (!voidHoldTarget) return { ok: false, error: "Order tidak ditemukan." }
          const res = await voidOrder(voidHoldTarget.id, reason, pin)
          if (!res.ok) return { ok: false, error: res.error }
          if (resumingHoldId === voidHoldTarget.id) resetCart()
          toast(`Open Bill ${voidHoldTarget.queue_number} dibatalkan.`, "info")
          return { ok: true }
        }}
      />
    </div>
  )
}
