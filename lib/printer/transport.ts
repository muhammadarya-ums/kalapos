// ============================================================================
// Multi-Transport Thermal Printer Adapter Pattern
// Supports: Web Bluetooth BLE (chunked), USB Web Serial, Capacitor Native SPP,
// and Browser Print Fallback.
// ============================================================================

export type TransportKind = "BLUETOOTH" | "USB_SERIAL" | "CAPACITOR_SPP" | "BROWSER_PRINT"

export interface WriteOptions {
  chunkSize?: number
  delayMs?: number
  previewLines?: string[]
  paperWidth?: 58 | 80
  documentTitle?: string
}

export interface PrinterTransport {
  readonly kind: TransportKind
  readonly label: string
  readonly description: string
  readonly supported: boolean
  readonly connected: boolean
  readonly deviceName: string | null
  connect(onDisconnect?: () => void): Promise<string>
  disconnect(): Promise<void>
  write(bytes: Uint8Array, options?: WriteOptions): Promise<void>
}

const pause = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

// Common BLE GATT Service & Characteristic UUIDs for ESC/POS thermal printers
const BLE_SERVICE_UUIDS = [
  "000018f0-0000-1000-8000-00805f9b34fb",
  "e7810a71-73ae-499d-8c15-faa9aef0c3f2",
  "49535343-fe7d-4ae5-8fa9-9fafd205e455",
  "0000ff00-0000-1000-8000-00805f9b34fb",
]

const BLE_WRITE_UUIDS = [
  "00002af1-0000-1000-8000-00805f9b34fb",
  "0000ae01-0000-1000-8000-00805f9b34fb",
  "bef8d6c9-9c21-4c9e-b632-bd58c1009f9f",
  "49535343-8841-43f4-a8d4-ecbe34729bb3",
  "0000ff02-0000-1000-8000-00805f9b34fb",
]

type GattCharacteristic = {
  writeValue: (value: BufferSource) => Promise<void>
  writeValueWithResponse?: (value: BufferSource) => Promise<void>
  writeValueWithoutResponse?: (value: BufferSource) => Promise<void>
  properties?: { write?: boolean; writeWithoutResponse?: boolean }
}
type GattService = {
  getCharacteristic: (uuid: string) => Promise<GattCharacteristic>
  getCharacteristics?: () => Promise<GattCharacteristic[]>
}
type GattServer = {
  connected: boolean
  connect: () => Promise<GattServer>
  disconnect: () => void
  getPrimaryService: (uuid: string) => Promise<GattService>
  getPrimaryServices?: () => Promise<GattService[]>
}
type BleDevice = {
  name?: string
  gatt?: GattServer
  addEventListener: (type: string, cb: () => void) => void
}
type BleNavigator = Navigator & {
  bluetooth?: {
    requestDevice: (options: {
      filters?: { services: string[] }[]
      acceptAllDevices?: boolean
      optionalServices: string[]
    }) => Promise<BleDevice>
  }
}

/**
 * 1. Web Bluetooth BLE Transport with mandatory 20–100 byte packet chunking
 *    and 20ms inter-packet delay to prevent thermal printer buffer overflow.
 */
export class WebBluetoothTransport implements PrinterTransport {
  readonly kind = "BLUETOOTH" as const
  readonly label = "Bluetooth BLE"
  readonly description = "Printer thermal Bluetooth Low Energy (GATT + chunking 20-100B)"

  private device: BleDevice | null = null
  private characteristic: GattCharacteristic | null = null
  private onDisconnect?: () => void

  get supported(): boolean {
    return typeof navigator !== "undefined" && Boolean((navigator as BleNavigator).bluetooth)
  }

  get connected(): boolean {
    return Boolean(this.device?.gatt?.connected && this.characteristic)
  }

  get deviceName(): string | null {
    return this.device?.name ?? (this.connected ? "Printer Bluetooth" : null)
  }

  async connect(onDisconnect?: () => void): Promise<string> {
    const bluetooth = (navigator as BleNavigator).bluetooth
    if (!bluetooth) {
      throw new Error("Web Bluetooth tidak didukung browser ini. Gunakan Chrome/Edge atau cetak browser.")
    }
    this.onDisconnect = onDisconnect

    let device: BleDevice
    try {
      device = await bluetooth.requestDevice({
        filters: BLE_SERVICE_UUIDS.map((service) => ({ services: [service] })),
        optionalServices: [...BLE_SERVICE_UUIDS],
      })
    } catch (error) {
      // User cancelled picker
      if (error instanceof DOMException && error.name === "NotFoundError") {
        throw new Error("Pemilihan printer Bluetooth dibatalkan.")
      }
      // Fallback to acceptAllDevices for non-standard printer firmware
      device = await bluetooth.requestDevice({
        acceptAllDevices: true,
        optionalServices: [...BLE_SERVICE_UUIDS],
      })
    }

    if (!device.gatt) {
      throw new Error("Perangkat tidak mendukung profil GATT.")
    }

    this.device = device
    device.addEventListener("gattserverdisconnected", () => {
      this.characteristic = null
      this.onDisconnect?.()
    })

    const server = await device.gatt.connect()

    // Discover known thermal services first, then scan all primary services
    for (const serviceUuid of BLE_SERVICE_UUIDS) {
      try {
        const service = await server.getPrimaryService(serviceUuid)
        for (const charUuid of BLE_WRITE_UUIDS) {
          try {
            this.characteristic = await service.getCharacteristic(charUuid)
            return device.name ?? "Printer Thermal BLE"
          } catch {
            /* try next write UUID */
          }
        }
        const chars = await service.getCharacteristics?.()
        this.characteristic =
          chars?.find((c) => c.properties?.writeWithoutResponse || c.properties?.write) ?? null
        if (this.characteristic) return device.name ?? "Printer Thermal BLE"
      } catch {
        /* try next service UUID */
      }
    }

    if (server.getPrimaryServices) {
      try {
        const allServices = await server.getPrimaryServices()
        for (const svc of allServices) {
          const chars = await svc.getCharacteristics?.()
          const writable = chars?.find(
            (c) => c.properties?.writeWithoutResponse || c.properties?.write
          )
          if (writable) {
            this.characteristic = writable
            return device.name ?? "Printer Thermal BLE"
          }
        }
      } catch {
        /* ignore */
      }
    }

    throw new Error("Printer terhubung, tetapi karakteristik tulis ESC/POS tidak ditemukan.")
  }

  async disconnect(): Promise<void> {
    this.device?.gatt?.disconnect()
    this.characteristic = null
    this.device = null
  }

  async write(bytes: Uint8Array, options?: WriteOptions): Promise<void> {
    const char = this.characteristic
    if (!this.connected || !char) {
      throw new Error("Printer Bluetooth belum terhubung.")
    }
    // Strictly clamp chunk size to 20–100 bytes with default 20ms pacing
    const chunkSize = Math.max(20, Math.min(100, options?.chunkSize ?? 80))
    const delayMs = Math.max(20, options?.delayMs ?? 20)

    for (let offset = 0; offset < bytes.length; offset += chunkSize) {
      const packet = bytes.slice(offset, Math.min(offset + chunkSize, bytes.length))
      if (char.writeValueWithoutResponse && char.properties?.writeWithoutResponse) {
        await char.writeValueWithoutResponse(packet)
      } else if (char.writeValueWithResponse && char.properties?.write) {
        await char.writeValueWithResponse(packet)
      } else {
        await char.writeValue(packet)
      }
      if (offset + chunkSize < bytes.length) {
        await pause(delayMs)
      }
    }
  }
}

// Web Serial types
type SerialWritable = WritableStream<Uint8Array>
type SerialPortLike = {
  open: (options: { baudRate: number }) => Promise<void>
  close: () => Promise<void>
  writable: SerialWritable | null
  getInfo?: () => { usbVendorId?: number; usbProductId?: number }
  addEventListener?: (event: string, cb: () => void) => void
}
type SerialNavigator = Navigator & {
  serial?: {
    requestPort: () => Promise<SerialPortLike>
  }
}

/**
 * 2. USB Web Serial Transport for desktop USB thermal printers (Epson TM, Star, Xprinter USB)
 */
export class UsbWebSerialTransport implements PrinterTransport {
  readonly kind = "USB_SERIAL" as const
  readonly label = "USB Web Serial"
  readonly description = "Printer thermal kabel USB pada kasir desktop (Chrome / Edge)"

  private port: SerialPortLike | null = null
  private isConnected = false
  private labelName: string | null = null

  get supported(): boolean {
    return typeof navigator !== "undefined" && Boolean((navigator as SerialNavigator).serial)
  }

  get connected(): boolean {
    return this.isConnected && Boolean(this.port?.writable)
  }

  get deviceName(): string | null {
    return this.labelName
  }

  async connect(onDisconnect?: () => void): Promise<string> {
    const serial = (navigator as SerialNavigator).serial
    if (!serial) {
      throw new Error("Web Serial API tidak tersedia pada browser ini.")
    }
    const port = await serial.requestPort()
    await port.open({ baudRate: 9600 })
    const info = port.getInfo?.()
    this.port = port
    this.isConnected = true
    this.labelName = info?.usbVendorId
      ? `USB Thermal (${info.usbVendorId.toString(16).toUpperCase()})`
      : "USB Thermal Printer"

    port.addEventListener?.("disconnect", () => {
      this.isConnected = false
      this.port = null
      this.labelName = null
      onDisconnect?.()
    })
    return this.labelName
  }

  async disconnect(): Promise<void> {
    try {
      await this.port?.close()
    } catch {
      /* ignore close errors */
    }
    this.port = null
    this.isConnected = false
    this.labelName = null
  }

  async write(bytes: Uint8Array, options?: WriteOptions): Promise<void> {
    if (!this.port?.writable || !this.isConnected) {
      throw new Error("Printer USB belum terhubung.")
    }
    const writer = this.port.writable.getWriter()
    try {
      const chunkSize = Math.max(64, Math.min(512, options?.chunkSize ?? 256))
      const delayMs = options?.delayMs ?? 10
      for (let offset = 0; offset < bytes.length; offset += chunkSize) {
        const packet = bytes.slice(offset, Math.min(offset + chunkSize, bytes.length))
        await writer.write(packet)
        if (offset + chunkSize < bytes.length && delayMs > 0) {
          await pause(delayMs)
        }
      }
    } finally {
      writer.releaseLock()
    }
  }
}

/**
 * 3. Capacitor Native Bluetooth Classic SPP Adapter Stub
 *    Ready to bridge native Android/iOS tablet Bluetooth Classic (RFCOMM/SPP) plugins.
 */
interface CapacitorBluetoothBridge {
  isEnabled?: () => Promise<boolean>
  connect?: (macAddress: string) => Promise<void>
  disconnect?: () => Promise<void>
  write?: (data: Uint8Array) => Promise<void>
}

export class CapacitorSerialAdapter implements PrinterTransport {
  readonly kind = "CAPACITOR_SPP" as const
  readonly label = "Capacitor Bluetooth SPP"
  readonly description = "Bridge native Bluetooth Classic SPP untuk tablet Android / iOS"

  private isConnected = false
  private name: string | null = null

  private get nativeBridge(): CapacitorBluetoothBridge | null {
    if (typeof window === "undefined") return null
    const win = window as unknown as {
      Capacitor?: { isNativePlatform?: () => boolean }
      bluetoothSerial?: CapacitorBluetoothBridge
    }
    if (win.Capacitor?.isNativePlatform?.() && win.bluetoothSerial) {
      return win.bluetoothSerial
    }
    return null
  }

  get supported(): boolean {
    return Boolean(this.nativeBridge)
  }

  get connected(): boolean {
    return this.isConnected
  }

  get deviceName(): string | null {
    return this.name
  }

  async connect(): Promise<string> {
    const bridge = this.nativeBridge
    if (!bridge || !bridge.connect) {
      throw new Error(
        "Adapter Capacitor SPP hanya aktif pada build tablet native Android/iOS dengan plugin Bluetooth Classic."
      )
    }
    await bridge.connect("DEFAULT_PAIRED_PRINTER")
    this.isConnected = true
    this.name = "Native SPP Thermal Printer"
    return this.name
  }

  async disconnect(): Promise<void> {
    await this.nativeBridge?.disconnect?.()
    this.isConnected = false
    this.name = null
  }

  async write(bytes: Uint8Array): Promise<void> {
    if (!this.nativeBridge?.write || !this.isConnected) {
      throw new Error("Koneksi Capacitor SPP belum aktif.")
    }
    await this.nativeBridge.write(bytes)
  }
}

/**
 * 4. Browser Print Fallback Transport
 *    Opens a clean isolated thermal-formatted print frame so cashiers can always print.
 */
export class BrowserPrintTransport implements PrinterTransport {
  readonly kind = "BROWSER_PRINT" as const
  readonly label = "Cetak Browser (Fallback)"
  readonly description = "Gunakan dialog cetak sistem (58mm / 80mm) tanpa pairing Bluetooth"

  private active = true

  get supported(): boolean {
    return typeof window !== "undefined"
  }

  get connected(): boolean {
    return this.active
  }

  get deviceName(): string | null {
    return "Dialog Cetak Sistem"
  }

  async connect(): Promise<string> {
    this.active = true
    return "Dialog Cetak Sistem"
  }

  async disconnect(): Promise<void> {
    this.active = false
  }

  async write(_bytes: Uint8Array, options?: WriteOptions): Promise<void> {
    if (typeof document === "undefined") {
      throw new Error("Cetak browser hanya tersedia pada sisi klien.")
    }
    const widthMm = options?.paperWidth === 80 ? 80 : 58
    const text = (options?.previewLines ?? ["(Data ESC/POS biner)"]).join("\n")
    const escaped = text
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")

    const iframe = document.createElement("iframe")
    iframe.style.position = "fixed"
    iframe.style.right = "0"
    iframe.style.bottom = "0"
    iframe.style.width = "0"
    iframe.style.height = "0"
    iframe.style.border = "0"
    document.body.appendChild(iframe)

    const doc = iframe.contentWindow?.document
    if (!doc || !iframe.contentWindow) {
      document.body.removeChild(iframe)
      throw new Error("Gagal menyiapkan frame cetak.")
    }

    doc.open()
    doc.write(`<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>${options?.documentTitle ?? "Struk KalaPOS"}</title>
  <style>
    @page { size: ${widthMm}mm auto; margin: 2mm; }
    body {
      margin: 0;
      padding: 4mm 2mm;
      width: ${widthMm - 4}mm;
      font-family: 'JetBrains Mono', 'Courier New', monospace;
      font-size: ${widthMm === 80 ? "11px" : "10px"};
      line-height: 1.38;
      color: #111;
      white-space: pre;
    }
  </style>
</head>
<body>${escaped}</body>
</html>`)
    doc.close()

    await pause(120)
    iframe.contentWindow.focus()
    iframe.contentWindow.print()
    window.setTimeout(() => {
      if (iframe.parentNode) iframe.parentNode.removeChild(iframe)
    }, 1500)
  }
}
