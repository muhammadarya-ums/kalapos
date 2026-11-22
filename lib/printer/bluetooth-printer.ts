import {
  buildBaristaTicket,
  buildCustomerReceipt,
  buildTestPrint,
  formatBaristaTicketPreview,
  formatCustomerReceiptPreview,
  type PaperWidth,
  type PrintableOrder,
} from "./escpos-builder"
import {
  BrowserPrintTransport,
  CapacitorSerialAdapter,
  UsbWebSerialTransport,
  WebBluetoothTransport,
  type PrinterTransport,
  type TransportKind,
} from "./transport"

export interface PrinterSettings {
  paperWidth: PaperWidth
  autoPrintCustomer: boolean
  autoPrintBarista: boolean
  kickCashDrawer: boolean
  transportKind: TransportKind
}

export const DEFAULT_PRINTER_SETTINGS: PrinterSettings = {
  paperWidth: 58,
  autoPrintCustomer: false,
  autoPrintBarista: false,
  kickCashDrawer: false,
  transportKind: "BLUETOOTH",
}

const SETTINGS_KEY = "kalapos_printer_settings_v2"

export function loadPrinterSettings(): PrinterSettings {
  if (typeof window === "undefined") return DEFAULT_PRINTER_SETTINGS
  try {
    const raw = localStorage.getItem(SETTINGS_KEY)
    if (!raw) return DEFAULT_PRINTER_SETTINGS
    const parsed = JSON.parse(raw) as Partial<PrinterSettings>
    return {
      paperWidth: parsed.paperWidth === 80 ? 80 : 58,
      autoPrintCustomer: Boolean(parsed.autoPrintCustomer),
      autoPrintBarista: Boolean(parsed.autoPrintBarista),
      kickCashDrawer: Boolean(parsed.kickCashDrawer),
      transportKind: parsed.transportKind ?? "BLUETOOTH",
    }
  } catch {
    return DEFAULT_PRINTER_SETTINGS
  }
}

export function savePrinterSettings(settings: PrinterSettings): void {
  if (typeof window === "undefined") return
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings))
  } catch {
    /* ignore */
  }
}

export class ThermalPrinterEngine {
  private transports: Record<TransportKind, PrinterTransport>
  private activeKind: TransportKind = "BLUETOOTH"

  constructor() {
    this.transports = {
      BLUETOOTH: new WebBluetoothTransport(),
      USB_SERIAL: new UsbWebSerialTransport(),
      CAPACITOR_SPP: new CapacitorSerialAdapter(),
      BROWSER_PRINT: new BrowserPrintTransport(),
    }
  }

  getTransport(kind: TransportKind): PrinterTransport {
    return this.transports[kind]
  }

  listTransports(): PrinterTransport[] {
    return [
      this.transports.BLUETOOTH,
      this.transports.USB_SERIAL,
      this.transports.CAPACITOR_SPP,
      this.transports.BROWSER_PRINT,
    ]
  }

  get activeTransport(): PrinterTransport {
    return this.transports[this.activeKind]
  }

  setTransportKind(kind: TransportKind): void {
    this.activeKind = kind
  }

  get connected(): boolean {
    return this.activeTransport.connected
  }

  get deviceName(): string | null {
    return this.activeTransport.deviceName
  }

  async connect(kind: TransportKind, onDisconnect?: () => void): Promise<string> {
    this.activeKind = kind
    return this.transports[kind].connect(onDisconnect)
  }

  async disconnect(): Promise<void> {
    await this.activeTransport.disconnect()
  }

  async printCustomerReceipt(order: PrintableOrder, settings: PrinterSettings): Promise<void> {
    const transport = this.transports[settings.transportKind]
    const bytes = buildCustomerReceipt(order, {
      paperWidth: settings.paperWidth,
      kickDrawer: settings.kickCashDrawer && order.payment.toLowerCase().includes("tunai"),
    })
    const previewLines = formatCustomerReceiptPreview(order, settings.paperWidth)

    if (!transport.connected && settings.transportKind !== "BROWSER_PRINT") {
      // Graceful fallback to Browser Print if hardware isn't connected
      await this.transports.BROWSER_PRINT.write(bytes, {
        previewLines,
        paperWidth: settings.paperWidth,
        documentTitle: `Struk ${order.orderNumber}`,
      })
      return
    }

    await transport.write(bytes, {
      chunkSize: 80,
      delayMs: 20,
      previewLines,
      paperWidth: settings.paperWidth,
      documentTitle: `Struk ${order.orderNumber}`,
    })
  }

  async printBaristaTicket(order: PrintableOrder, settings: PrinterSettings): Promise<void> {
    const transport = this.transports[settings.transportKind]
    const bytes = buildBaristaTicket(order, { paperWidth: settings.paperWidth })
    const previewLines = formatBaristaTicketPreview(order, settings.paperWidth)

    if (!transport.connected && settings.transportKind !== "BROWSER_PRINT") {
      await this.transports.BROWSER_PRINT.write(bytes, {
        previewLines,
        paperWidth: settings.paperWidth,
        documentTitle: `Tiket Barista #${order.queueNumber}`,
      })
      return
    }

    await transport.write(bytes, {
      chunkSize: 80,
      delayMs: 20,
      previewLines,
      paperWidth: settings.paperWidth,
      documentTitle: `Tiket Barista #${order.queueNumber}`,
    })
  }

  async testPrint(branchName: string, settings: PrinterSettings): Promise<void> {
    const transport = this.transports[settings.transportKind]
    const bytes = buildTestPrint(branchName, settings.paperWidth)
    const width = settings.paperWidth === 80 ? 48 : 32
    const previewLines = [
      "KALAPOS TEST PRINT",
      branchName,
      `Kertas: ${settings.paperWidth}mm (${width} kolom)`,
      "-".repeat(width),
      "1x Item Test Print      Rp 25.000",
      "   + Uji cetak printer thermal",
      "-".repeat(width),
      "Koneksi ESC/POS berhasil.",
    ]

    if (!transport.connected && settings.transportKind !== "BROWSER_PRINT") {
      await this.transports.BROWSER_PRINT.write(bytes, {
        previewLines,
        paperWidth: settings.paperWidth,
        documentTitle: "Test Print KalaPOS",
      })
      return
    }

    await transport.write(bytes, {
      chunkSize: 80,
      delayMs: 20,
      previewLines,
      paperWidth: settings.paperWidth,
      documentTitle: "Test Print KalaPOS",
    })
  }
}

export { WebBluetoothTransport as BluetoothPrinter }
