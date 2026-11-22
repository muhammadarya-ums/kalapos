"use client"

import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react"
import { formatDateTimeID } from "@/lib/kalapos/format"
import type { Branch, Order } from "@/lib/kalapos/types"
import {
  DEFAULT_PRINTER_SETTINGS,
  loadPrinterSettings,
  savePrinterSettings,
  ThermalPrinterEngine,
  type PrinterSettings,
} from "./bluetooth-printer"
import type { PaperWidth, PrintableOrder } from "./escpos-builder"
import type { TransportKind } from "./transport"

export function orderToPrintable(
  order: Order,
  branch: Branch | undefined,
  cashierName: string
): PrintableOrder {
  const paymentLabel =
    order.split_payments && order.split_payments.length > 0
      ? `Split (${order.split_payments.map((p) => p.method).join(" + ")})`
      : order.payment_method === "CASH"
      ? "Tunai"
      : order.payment_method === "CARD"
      ? "Debit / Kartu"
      : "QRIS"

  return {
    branchName: branch?.name ?? "Kafe Kala",
    branchCode: branch?.code ?? "KLA-01",
    address: branch?.address ?? "Kafe Kala",
    phone: branch?.phone ?? "-",
    orderNumber: order.order_number,
    queueNumber: order.queue_number,
    date: formatDateTimeID(order.created_at),
    cashier: cashierName,
    customerName: order.customer_name,
    orderType: order.order_type,
    table: order.table_number,
    items: order.items.map((it) => ({
      name: it.product_name_snapshot,
      quantity: it.qty,
      unitPrice: it.unit_price_snapshot,
      modifiers: it.modifiers_snapshot.map((m) =>
        m.price_delta > 0
          ? `${m.option_name} (+Rp ${m.price_delta.toLocaleString("id-ID")})`
          : m.option_name
      ),
      baristaNotes: it.barista_notes,
    })),
    subtotal: order.subtotal,
    discount: order.discount,
    serviceCharge: order.service_charge,
    taxRate: branch?.tax_rate ?? 10,
    tax: order.tax_amount,
    total: order.total,
    payment: paymentLabel,
    tendered: order.tendered_amount,
    change: order.change_amount,
    footer: branch?.receipt_footer ?? "Terima kasih, sampai jumpa kembali.",
  }
}

export interface PrinterContextValue {
  engine: ThermalPrinterEngine
  settings: PrinterSettings
  connected: boolean
  deviceName: string | null
  connecting: boolean
  lastPrintable: PrintableOrder | null
  drawerOpen: boolean
  setDrawerOpen: (open: boolean) => void
  setLastPrintable: (order: PrintableOrder) => void
  updateSettings: (partial: Partial<PrinterSettings>) => void
  setPaperWidth: (width: PaperWidth) => void
  connect: (kind?: TransportKind) => Promise<{ ok: boolean; message: string }>
  disconnect: () => Promise<void>
  printCustomerReceipt: (order?: PrintableOrder) => Promise<{ ok: boolean; message: string }>
  printBaristaTicket: (order?: PrintableOrder) => Promise<{ ok: boolean; message: string }>
  testPrint: (branchName: string) => Promise<{ ok: boolean; message: string }>
}

const PrinterContext = createContext<PrinterContextValue | null>(null)

export function PrinterProvider({ children }: { children: React.ReactNode }) {
  const engineRef = useRef<ThermalPrinterEngine | null>(null)
  if (!engineRef.current) {
    engineRef.current = new ThermalPrinterEngine()
  }

  const [settings, setSettings] = useState<PrinterSettings>(DEFAULT_PRINTER_SETTINGS)
  const [connected, setConnected] = useState(false)
  const [deviceName, setDeviceName] = useState<string | null>(null)
  const [connecting, setConnecting] = useState(false)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [lastPrintable, setLastPrintable] = useState<PrintableOrder | null>(null)

  useEffect(() => {
    const loaded = loadPrinterSettings()
    setSettings(loaded)
    engineRef.current?.setTransportKind(loaded.transportKind)
    if (loaded.transportKind === "BROWSER_PRINT") {
      setConnected(true)
      setDeviceName("Dialog Cetak Sistem")
    }
  }, [])

  const updateSettings = useCallback((partial: Partial<PrinterSettings>) => {
    setSettings((prev) => {
      const next = { ...prev, ...partial }
      savePrinterSettings(next)
      if (partial.transportKind) {
        engineRef.current?.setTransportKind(partial.transportKind)
        const t = engineRef.current?.getTransport(partial.transportKind)
        setConnected(Boolean(t?.connected))
        setDeviceName(t?.deviceName ?? null)
      }
      return next
    })
  }, [])

  const setPaperWidth = useCallback(
    (paperWidth: PaperWidth) => updateSettings({ paperWidth }),
    [updateSettings]
  )

  const connect = useCallback(
    async (kind?: TransportKind) => {
      const targetKind = kind ?? settings.transportKind
      setConnecting(true)
      try {
        const name = await engineRef.current!.connect(targetKind, () => {
          setConnected(false)
          setDeviceName(null)
        })
        updateSettings({ transportKind: targetKind })
        setConnected(true)
        setDeviceName(name)
        return { ok: true, message: `Printer "${name}" terhubung.` }
      } catch (error) {
        setConnected(false)
        setDeviceName(null)
        return {
          ok: false,
          message: error instanceof Error ? error.message : "Gagal menghubungkan printer.",
        }
      } finally {
        setConnecting(false)
      }
    },
    [settings.transportKind, updateSettings]
  )

  const disconnect = useCallback(async () => {
    await engineRef.current?.disconnect()
    setConnected(false)
    setDeviceName(null)
  }, [])

  const printCustomerReceipt = useCallback(
    async (order?: PrintableOrder) => {
      const target = order ?? lastPrintable
      if (!target) {
        return { ok: false, message: "Belum ada transaksi untuk dicetak." }
      }
      try {
        await engineRef.current!.printCustomerReceipt(target, settings)
        const modeNote =
          !connected && settings.transportKind !== "BROWSER_PRINT"
            ? " (via dialog cetak browser)"
            : ""
        return { ok: true, message: `Struk pelanggan ${target.orderNumber} dicetak${modeNote}.` }
      } catch (error) {
        return {
          ok: false,
          message: error instanceof Error ? error.message : "Gagal mencetak struk.",
        }
      }
    },
    [lastPrintable, settings, connected]
  )

  const printBaristaTicket = useCallback(
    async (order?: PrintableOrder) => {
      const target = order ?? lastPrintable
      if (!target) {
        return { ok: false, message: "Belum ada tiket barista untuk dicetak." }
      }
      try {
        await engineRef.current!.printBaristaTicket(target, settings)
        const modeNote =
          !connected && settings.transportKind !== "BROWSER_PRINT"
            ? " (via dialog cetak browser)"
            : ""
        return { ok: true, message: `Tiket barista #${target.queueNumber} dicetak${modeNote}.` }
      } catch (error) {
        return {
          ok: false,
          message: error instanceof Error ? error.message : "Gagal mencetak tiket barista.",
        }
      }
    },
    [lastPrintable, settings, connected]
  )

  const testPrint = useCallback(
    async (branchName: string) => {
      try {
        await engineRef.current!.testPrint(branchName, settings)
        return { ok: true, message: "Test print berhasil dikirim ke printer." }
      } catch (error) {
        return {
          ok: false,
          message: error instanceof Error ? error.message : "Test print gagal.",
        }
      }
    },
    [settings]
  )

  const value = useMemo<PrinterContextValue>(
    () => ({
      engine: engineRef.current!,
      settings,
      connected,
      deviceName,
      connecting,
      lastPrintable,
      drawerOpen,
      setDrawerOpen,
      setLastPrintable,
      updateSettings,
      setPaperWidth,
      connect,
      disconnect,
      printCustomerReceipt,
      printBaristaTicket,
      testPrint,
    }),
    [
      settings,
      connected,
      deviceName,
      connecting,
      lastPrintable,
      drawerOpen,
      updateSettings,
      setPaperWidth,
      connect,
      disconnect,
      printCustomerReceipt,
      printBaristaTicket,
      testPrint,
    ]
  )

  return <PrinterContext.Provider value={value}>{children}</PrinterContext.Provider>
}

export function usePrinter(): PrinterContextValue {
  const ctx = useContext(PrinterContext)
  if (!ctx) throw new Error("usePrinter must be used inside <PrinterProvider>")
  return ctx
}
