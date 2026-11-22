"use client"

import { useMemo, useState } from "react"
import { Bluetooth, Check, Printer, Smartphone, Usb, Globe } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Drawer } from "@/components/ui/drawer"
import { Tabs } from "@/components/ui/tabs"
import { useToast } from "@/components/ui/toast"
import { useKalaPOS } from "@/lib/kalapos/context"
import { usePrinter } from "@/lib/printer/context"
import {
  formatBaristaTicketPreview,
  formatCustomerReceiptPreview,
  type PrintableOrder,
} from "@/lib/printer/escpos-builder"
import type { TransportKind } from "@/lib/printer/transport"
import { cn } from "@/lib/utils"

const TRANSPORT_META: Array<{
  kind: TransportKind
  title: string
  subtitle: string
  icon: typeof Bluetooth
}> = [
  {
    kind: "BLUETOOTH",
    title: "Bluetooth BLE",
    subtitle: "GATT thermal · chunking 20–100B / 20ms",
    icon: Bluetooth,
  },
  {
    kind: "USB_SERIAL",
    title: "USB Web Serial",
    subtitle: "Kabel USB kasir desktop (9600 baud)",
    icon: Usb,
  },
  {
    kind: "CAPACITOR_SPP",
    title: "Capacitor SPP",
    subtitle: "Bridge native Android / iOS tablet",
    icon: Smartphone,
  },
  {
    kind: "BROWSER_PRINT",
    title: "Cetak Browser",
    subtitle: "Fallback dialog cetak 58mm / 80mm",
    icon: Globe,
  },
]

export function PrinterSettingsDrawer() {
  const { toast } = useToast()
  const { activeBranch, session } = useKalaPOS()
  const {
    engine,
    settings,
    connected,
    deviceName,
    connecting,
    lastPrintable,
    drawerOpen,
    setDrawerOpen,
    updateSettings,
    setPaperWidth,
    connect,
    disconnect,
    printCustomerReceipt,
    printBaristaTicket,
    testPrint,
  } = usePrinter()

  const [previewTab, setPreviewTab] = useState<"RECEIPT" | "BARISTA">("RECEIPT")

  const samplePrintable: PrintableOrder = useMemo(
    () =>
      lastPrintable ?? {
        branchName: activeBranch?.name ?? "Kafe Kala",
        branchCode: activeBranch?.code ?? "KLA-01",
        address: activeBranch?.address ?? "Kafe Kala",
        phone: activeBranch?.phone ?? "-",
        orderNumber: `${(activeBranch?.code ?? "KLA01").replace("-", "")}-0001`,
        queueNumber: "A-001",
        date: "21 Nov 2026 · 10.00 WIB",
        cashier: session?.fullName ?? "Kasir Kafe Kala",
        customerName: "Pelanggan",
        orderType: "DINE_IN",
        table: "01",
        items: [
          {
            name: "Item Contoh",
            quantity: 1,
            unitPrice: 25000,
          },
        ],
        subtotal: 25000,
        taxRate: activeBranch?.tax_rate ?? 10,
        tax: 2500,
        total: 27500,
        payment: "Tunai",
        tendered: 50000,
        change: 22500,
        footer: activeBranch?.receipt_footer ?? "Terima kasih telah singgah di Kafe Kala.",
      },
    [lastPrintable, activeBranch, session?.fullName]
  )

  const previewLines = useMemo(() => {
    return previewTab === "RECEIPT"
      ? formatCustomerReceiptPreview(samplePrintable, settings.paperWidth)
      : formatBaristaTicketPreview(samplePrintable, settings.paperWidth)
  }, [previewTab, samplePrintable, settings.paperWidth])

  const handleConnectToggle = async () => {
    if (connected && settings.transportKind !== "BROWSER_PRINT") {
      await disconnect()
      toast("Koneksi printer diputuskan.", "info")
      return
    }
    const res = await connect(settings.transportKind)
    toast(res.message, res.ok ? "success" : "error")
  }

  const handleTestPrint = async () => {
    const res = await testPrint(activeBranch?.name ?? "Kafe Kala")
    toast(res.message, res.ok ? "success" : "error")
  }

  return (
    <Drawer
      open={drawerOpen}
      onClose={() => setDrawerOpen(false)}
      eyebrow="PERANGKAT KASIR · ESC/POS"
      title="Printer Thermal & Pratinjau Struk"
      description="Konfigurasi Bluetooth BLE, USB Web Serial, lebar kertas, dan cetak otomatis dual-ticket."
      widthClassName="max-w-lg"
    >
      <div className="space-y-6">
        {/* Live Connection Card */}
        <div className="flex items-center justify-between gap-3 rounded-lg border border-[#E5E2DC] bg-[#FAF9F7] p-4">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-md border border-[#E5E2DC] bg-white text-[#18181B]">
              <Printer className="h-5 w-5" strokeWidth={1.5} />
            </span>
            <div>
              <p className="text-xs font-semibold text-[#18181B]">
                {connected ? deviceName ?? "Printer Terhubung" : "Belum Terhubung"}
              </p>
              <p className="mt-0.5 text-[11px] text-[#77736D]">
                Transport aktif: {engine.getTransport(settings.transportKind).label}
              </p>
            </div>
          </div>
          <Badge variant={connected ? "aman" : "menipis"} dot>
            {connected ? "Online" : "Offline"}
          </Badge>
        </div>

        {/* Transport Selector */}
        <div>
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.1em] text-[#8E8982]">
            PILIH ADAPTER KONEKSI
          </p>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {TRANSPORT_META.map((item) => {
              const Icon = item.icon
              const selected = settings.transportKind === item.kind
              const supported = engine.getTransport(item.kind).supported
              return (
                <button
                  key={item.kind}
                  type="button"
                  onClick={() => updateSettings({ transportKind: item.kind })}
                  className={cn(
                    "flex items-start gap-2.5 rounded-md border p-3 text-left transition-colors cursor-pointer",
                    selected
                      ? "border-[#C2572A] bg-[#FDF4F0]/55"
                      : "border-[#E5E2DC] bg-white hover:bg-[#FAF9F7]"
                  )}
                >
                  <Icon
                    className={cn(
                      "mt-0.5 h-4 w-4 shrink-0",
                      selected ? "text-[#C2572A]" : "text-[#67625B]"
                    )}
                    strokeWidth={1.5}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-1">
                      <span className="text-xs font-semibold text-[#18181B]">{item.title}</span>
                      {selected && <Check className="h-3.5 w-3.5 text-[#C2572A]" strokeWidth={1.75} />}
                    </div>
                    <p className="mt-0.5 text-[10px] leading-snug text-[#77736D]">{item.subtitle}</p>
                    {!supported && (
                      <p className="mt-1 text-[10px] font-medium text-[#A16207]">
                        Tidak tersedia di browser ini
                      </p>
                    )}
                  </div>
                </button>
              )
            })}
          </div>

          <div className="mt-3 flex gap-2">
            <Button
              variant={connected && settings.transportKind !== "BROWSER_PRINT" ? "outline" : "default"}
              size="md"
              className="flex-1"
              disabled={connecting}
              onClick={handleConnectToggle}
            >
              {connecting
                ? "Menghubungkan…"
                : connected && settings.transportKind !== "BROWSER_PRINT"
                ? "Putuskan Printer"
                : settings.transportKind === "BROWSER_PRINT"
                ? "Aktifkan Cetak Browser"
                : "Hubungkan Printer"}
            </Button>
            <Button variant="outline" size="md" onClick={handleTestPrint}>
              Test Print
            </Button>
          </div>
        </div>

        {/* Paper Width & Automation Toggles */}
        <div className="divide-y divide-[#EFECE7] rounded-lg border border-[#E5E2DC] bg-white px-4">
          <div className="flex items-center justify-between py-3.5">
            <div>
              <p className="text-xs font-semibold text-[#18181B]">Lebar Kertas Thermal</p>
              <p className="text-[11px] text-[#8E8982]">
                58mm (32 karakter) atau 80mm (48 karakter)
              </p>
            </div>
            <div className="inline-flex rounded-md border border-[#E5E2DC] bg-[#F1EFEB] p-0.5">
              {([58, 80] as const).map((w) => (
                <button
                  key={w}
                  type="button"
                  onClick={() => setPaperWidth(w)}
                  className={cn(
                    "rounded px-3 py-1 font-mono text-xs font-medium cursor-pointer",
                    settings.paperWidth === w
                      ? "bg-[#18181B] text-white"
                      : "text-[#67625B] hover:text-[#18181B]"
                  )}
                >
                  {w}mm
                </button>
              ))}
            </div>
          </div>

          <ToggleRow
            label="Auto-Print Struk Pelanggan"
            description="Otomatis mencetak struk pembayaran segera setelah transaksi lunas"
            checked={settings.autoPrintCustomer}
            onChange={(val) => updateSettings({ autoPrintCustomer: val })}
          />
          <ToggleRow
            label="Auto-Print Tiket Barista"
            description="Otomatis mencetak tiket produksi barista (tanpa harga) saat masuk antrean"
            checked={settings.autoPrintBarista}
            onChange={(val) => updateSettings({ autoPrintBarista: val })}
          />
          <ToggleRow
            label="Buka Laci Kasir (Cash Drawer Kick)"
            description="Kirim sinyal ESC/POS 0x1B 0x70 0x00 pada pembayaran Tunai"
            checked={settings.kickCashDrawer}
            onChange={(val) => updateSettings({ kickCashDrawer: val })}
          />
        </div>

        {/* Live Monospace Thermal Receipt & Barista Ticket Preview */}
        <div>
          <div className="mb-3 flex items-center justify-between gap-2">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-[#8E8982]">
                PRATINJAU THERMAL LANGSUNG
              </p>
              <p className="text-[11px] text-[#77736D]">
                {settings.paperWidth}mm · {settings.paperWidth === 80 ? "48" : "32"} karakter/baris
              </p>
            </div>
            <Tabs
              value={previewTab}
              onChange={setPreviewTab}
              options={[
                { value: "RECEIPT", label: "Struk Pelanggan" },
                { value: "BARISTA", label: "Tiket Barista" },
              ]}
            />
          </div>

          <div className="flex justify-center rounded-lg border border-[#E5E2DC] bg-[#F1EFEB] p-4">
            <div
              className={cn(
                "overflow-x-auto rounded border border-[#E5E2DC] bg-white px-4 py-5 shadow-[0_2px_8px_rgba(24,24,27,0.05)]",
                settings.paperWidth === 80 ? "w-full max-w-[390px]" : "w-full max-w-[280px]"
              )}
            >
              <pre className="m-0 font-mono text-[10.5px] leading-[1.45] tabular-nums text-[#18181B]">
                {previewLines.join("\n")}
              </pre>
            </div>
          </div>

          <div className="mt-3 flex gap-2">
            <Button
              variant="outline"
              size="sm"
              className="flex-1"
              onClick={async () => {
                const res = await printCustomerReceipt(samplePrintable)
                toast(res.message, res.ok ? "success" : "error")
              }}
            >
              Cetak Struk Pelanggan
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="flex-1"
              onClick={async () => {
                const res = await printBaristaTicket(samplePrintable)
                toast(res.message, res.ok ? "success" : "error")
              }}
            >
              Cetak Tiket Barista
            </Button>
          </div>
        </div>
      </div>
    </Drawer>
  )
}

function ToggleRow({
  label,
  description,
  checked,
  onChange,
}: {
  label: string
  description: string
  checked: boolean
  onChange: (value: boolean) => void
}) {
  return (
    <div className="flex items-center justify-between gap-4 py-3.5">
      <div>
        <p className="text-xs font-semibold text-[#18181B]">{label}</p>
        <p className="text-[11px] text-[#8E8982]">{description}</p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={cn(
          "relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors cursor-pointer",
          checked ? "bg-[#166534]" : "bg-[#D6D2C9]"
        )}
      >
        <span
          className={cn(
            "inline-block h-4 w-4 rounded-full bg-white transition-transform",
            checked ? "translate-x-6" : "translate-x-1"
          )}
        />
      </button>
    </div>
  )
}
