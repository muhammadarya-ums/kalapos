// ============================================================================
// Dual-Ticket ESC/POS Thermal Encoder (58mm = 32 chars, 80mm = 48 chars)
// + 1:1 Monospace Preview Formatter for Live Thermal Preview UI
// ============================================================================

export type PaperWidth = 58 | 80

export interface PrintableReceiptItem {
  name: string
  quantity: number
  unitPrice: number // integer IDR
  modifiers?: string[]
  baristaNotes?: string
}

export interface PrintableOrder {
  branchName: string
  branchCode?: string
  address: string
  phone: string
  orderNumber: string
  queueNumber: string
  date: string
  cashier: string
  customerName?: string
  orderType: "DINE_IN" | "TAKEAWAY"
  table?: string | null
  items: PrintableReceiptItem[]
  subtotal: number
  discount?: number
  serviceCharge?: number
  taxRate?: number
  tax: number
  total: number
  payment: string
  tendered?: number | null
  change?: number | null
  footer: string
}

export interface ReceiptBuildOptions {
  paperWidth?: PaperWidth
  kickDrawer?: boolean
}

// ESC/POS Control Bytes
const INIT = [0x1b, 0x40]
const ALIGN_LEFT = [0x1b, 0x61, 0x00]
const ALIGN_CENTER = [0x1b, 0x61, 0x01]
const BOLD_ON = [0x1b, 0x45, 0x01]
const BOLD_OFF = [0x1b, 0x45, 0x00]
const DOUBLE_HEIGHT_ON = [0x1d, 0x21, 0x11] // 2x width & 2x height for bold queue header
const NORMAL_SIZE = [0x1d, 0x21, 0x00]
const PAPER_CUT = [0x1d, 0x56, 0x41, 0x03]
const CASH_DRAWER_KICK = [0x1b, 0x70, 0x00, 0x19, 0xfa]

const encoder = new TextEncoder()

const idr = (amount: number) => `Rp ${Math.round(amount).toLocaleString("id-ID")}`
const lineBytes = (text: string) => encoder.encode(`${text}\n`)
const cmd = (...parts: number[][]) => new Uint8Array(parts.flat())

function joinBytes(...chunks: Uint8Array[]): Uint8Array {
  const totalLen = chunks.reduce((sum, c) => sum + c.length, 0)
  const out = new Uint8Array(totalLen)
  let offset = 0
  for (const c of chunks) {
    out.set(c, offset)
    offset += c.length
  }
  return out
}

export function getCharWidth(paperWidth: PaperWidth): number {
  return paperWidth === 80 ? 48 : 32
}

function fit(text: string, maxWidth: number): string {
  return Array.from(text).slice(0, Math.max(0, maxWidth)).join("")
}

function wrapText(text: string, width: number): string[] {
  const words = text.trim().split(/\s+/)
  if (words.length === 0 || !words[0]) return []
  const lines: string[] = []
  let current = ""
  for (const w of words) {
    if (!current) {
      current = fit(w, width)
    } else if (current.length + 1 + w.length <= width) {
      current += ` ${w}`
    } else {
      lines.push(current)
      current = fit(w, width)
    }
  }
  if (current) lines.push(current)
  return lines
}

function row(left: string, right: string, width: number): string {
  const rightStr = fit(right, width)
  const maxLeft = Math.max(0, width - rightStr.length - 1)
  const leftStr = fit(left, maxLeft)
  const gap = Math.max(1, width - leftStr.length - rightStr.length)
  return `${leftStr}${" ".repeat(gap)}${rightStr}`
}

function centerLine(text: string, width: number): string {
  const clean = fit(text.trim(), width)
  const pad = Math.max(0, Math.floor((width - clean.length) / 2))
  return `${" ".repeat(pad)}${clean}`
}

/**
 * Build ESC/POS binary bytes for Customer Receipt (Struk Pelanggan)
 */
export function buildCustomerReceipt(
  order: PrintableOrder,
  options: ReceiptBuildOptions = {}
): Uint8Array {
  const paperWidth = options.paperWidth ?? 58
  const width = getCharWidth(paperWidth)
  const divider = "-".repeat(width)
  const doubleDivider = "=".repeat(width)

  const chunks: Uint8Array[] = [
    cmd(INIT, ALIGN_CENTER, BOLD_ON),
    lineBytes(`KALAPOS · ${order.branchName.toUpperCase()}`),
    cmd(BOLD_OFF),
  ]

  for (const addrLine of wrapText(order.address, width)) {
    chunks.push(lineBytes(addrLine))
  }
  if (order.phone) chunks.push(lineBytes(`Telp: ${order.phone}`))
  chunks.push(lineBytes(doubleDivider))

  chunks.push(
    cmd(ALIGN_LEFT),
    lineBytes(row("No. Struk", order.orderNumber, width)),
    lineBytes(row("Antrean", `#${order.queueNumber}`, width)),
    lineBytes(row("Waktu", order.date, width)),
    lineBytes(row("Kasir", order.cashier, width)),
    lineBytes(
      row(
        "Layanan",
        order.orderType === "DINE_IN"
          ? `Dine-In${order.table ? ` · Meja ${order.table}` : ""}`
          : "Takeaway",
        width
      )
    )
  )
  if (order.customerName) {
    chunks.push(lineBytes(row("Pelanggan", order.customerName, width)))
  }

  chunks.push(lineBytes(divider))

  for (const item of order.items) {
    chunks.push(
      lineBytes(row(`${item.quantity}x ${item.name}`, idr(item.unitPrice * item.quantity), width))
    )
    for (const mod of item.modifiers ?? []) {
      chunks.push(lineBytes(`   + ${fit(mod, width - 5)}`))
    }
    if (item.baristaNotes?.trim()) {
      chunks.push(lineBytes(`   * ${fit(item.baristaNotes.trim(), width - 5)}`))
    }
  }

  chunks.push(lineBytes(divider))
  chunks.push(lineBytes(row("Subtotal", idr(order.subtotal), width)))
  if (order.discount && order.discount > 0) {
    chunks.push(lineBytes(row("Diskon", `-${idr(order.discount)}`, width)))
  }
  if (order.serviceCharge && order.serviceCharge > 0) {
    chunks.push(lineBytes(row("Service", idr(order.serviceCharge), width)))
  }
  chunks.push(
    lineBytes(row(`PB1 (${order.taxRate ?? 10}%)`, idr(order.tax), width)),
    lineBytes(divider),
    cmd(BOLD_ON),
    lineBytes(row("TOTAL", idr(order.total), width)),
    cmd(BOLD_OFF),
    lineBytes(row("Pembayaran", order.payment, width))
  )

  if (order.tendered !== undefined && order.tendered !== null) {
    chunks.push(lineBytes(row("Tunai Diterima", idr(order.tendered), width)))
  }
  if (order.change !== undefined && order.change !== null) {
    chunks.push(lineBytes(row("Kembalian", idr(order.change), width)))
  }

  chunks.push(lineBytes(doubleDivider), cmd(ALIGN_CENTER))
  for (const footerLine of wrapText(order.footer, width)) {
    chunks.push(lineBytes(footerLine))
  }
  chunks.push(lineBytes("KalaPOS · Sistem Kasir Kafe"), lineBytes("\n\n"))

  if (options.kickDrawer) {
    chunks.push(cmd(CASH_DRAWER_KICK))
  }
  chunks.push(cmd(PAPER_CUT))

  return joinBytes(...chunks)
}

/**
 * Build ESC/POS binary bytes for Barista Ticket (Tiket Barista — NO prices)
 */
export function buildBaristaTicket(
  order: PrintableOrder,
  options: { paperWidth?: PaperWidth } = {}
): Uint8Array {
  const paperWidth = options.paperWidth ?? 58
  const width = getCharWidth(paperWidth)
  const divider = "-".repeat(width)

  const serviceLabel =
    order.orderType === "DINE_IN"
      ? `DINE-IN${order.table ? ` · MEJA ${order.table}` : ""}`
      : "TAKEAWAY"

  const chunks: Uint8Array[] = [
    cmd(INIT, ALIGN_CENTER, BOLD_ON),
    lineBytes("TIKET BARISTA"),
    cmd(DOUBLE_HEIGHT_ON),
    lineBytes(`#${order.queueNumber}`),
    cmd(NORMAL_SIZE, BOLD_ON),
    lineBytes(serviceLabel),
    cmd(BOLD_OFF),
    lineBytes(`${order.branchName} · ${order.date}`),
    lineBytes(divider),
    cmd(ALIGN_LEFT),
  ]

  if (order.customerName) {
    chunks.push(cmd(BOLD_ON), lineBytes(`PELANGGAN: ${fit(order.customerName, width - 11)}`), cmd(BOLD_OFF))
    chunks.push(lineBytes(divider))
  }

  for (const item of order.items) {
    chunks.push(cmd(BOLD_ON), lineBytes(`${item.quantity}x ${fit(item.name, width - 4)}`), cmd(BOLD_OFF))
    for (const mod of item.modifiers ?? []) {
      chunks.push(cmd(BOLD_ON), lineBytes(`   > ${fit(mod, width - 5)}`), cmd(BOLD_OFF))
    }
    if (item.baristaNotes?.trim()) {
      for (const noteLine of wrapText(`CATATAN: ${item.baristaNotes.trim()}`, width - 3)) {
        chunks.push(lineBytes(`   ${noteLine}`))
      }
    }
    chunks.push(lineBytes(""))
  }

  chunks.push(lineBytes(divider), cmd(ALIGN_CENTER), lineBytes(`Ref: ${order.orderNumber}`), lineBytes("\n\n"), cmd(PAPER_CUT))
  return joinBytes(...chunks)
}

export function buildTestPrint(branchName: string, paperWidth: PaperWidth = 58): Uint8Array {
  const width = getCharWidth(paperWidth)
  const divider = "-".repeat(width)
  return joinBytes(
    cmd(INIT, ALIGN_CENTER, BOLD_ON),
    lineBytes("KALAPOS TEST PRINT"),
    cmd(BOLD_OFF),
    lineBytes(branchName),
    lineBytes(`Lebar kertas: ${paperWidth}mm (${width} kolom)`),
    lineBytes(divider),
    cmd(ALIGN_LEFT),
    lineBytes(row("1x Item Test Print", idr(25000), width)),
    lineBytes("   + Uji cetak printer thermal"),
    lineBytes(divider),
    cmd(ALIGN_CENTER),
    lineBytes("Koneksi ESC/POS berhasil."),
    lineBytes("\n\n"),
    cmd(PAPER_CUT)
  )
}

/**
 * 1:1 Monospace Line Formatter for Live Thermal Receipt Preview & Browser Print Fallback
 */
export function formatCustomerReceiptPreview(
  order: PrintableOrder,
  paperWidth: PaperWidth = 58
): string[] {
  const width = getCharWidth(paperWidth)
  const divider = "-".repeat(width)
  const doubleDivider = "=".repeat(width)
  const lines: string[] = [
    centerLine(`KALAPOS · ${order.branchName.toUpperCase()}`, width),
    ...wrapText(order.address, width).map((l) => centerLine(l, width)),
  ]
  if (order.phone) lines.push(centerLine(`Telp: ${order.phone}`, width))
  lines.push(doubleDivider)
  lines.push(row("No. Struk", order.orderNumber, width))
  lines.push(row("Antrean", `#${order.queueNumber}`, width))
  lines.push(row("Waktu", order.date, width))
  lines.push(row("Kasir", order.cashier, width))
  lines.push(
    row(
      "Layanan",
      order.orderType === "DINE_IN"
        ? `Dine-In${order.table ? ` · Meja ${order.table}` : ""}`
        : "Takeaway",
      width
    )
  )
  if (order.customerName) lines.push(row("Pelanggan", order.customerName, width))
  lines.push(divider)

  for (const item of order.items) {
    lines.push(row(`${item.quantity}x ${item.name}`, idr(item.unitPrice * item.quantity), width))
    for (const mod of item.modifiers ?? []) {
      lines.push(`   + ${fit(mod, width - 5)}`)
    }
    if (item.baristaNotes?.trim()) {
      lines.push(`   * ${fit(item.baristaNotes.trim(), width - 5)}`)
    }
  }

  lines.push(divider)
  lines.push(row("Subtotal", idr(order.subtotal), width))
  if (order.discount && order.discount > 0) {
    lines.push(row("Diskon", `-${idr(order.discount)}`, width))
  }
  if (order.serviceCharge && order.serviceCharge > 0) {
    lines.push(row("Service", idr(order.serviceCharge), width))
  }
  lines.push(row(`PB1 (${order.taxRate ?? 10}%)`, idr(order.tax), width))
  lines.push(divider)
  lines.push(row("TOTAL", idr(order.total), width))
  lines.push(row("Pembayaran", order.payment, width))
  if (order.tendered !== undefined && order.tendered !== null) {
    lines.push(row("Tunai Diterima", idr(order.tendered), width))
  }
  if (order.change !== undefined && order.change !== null) {
    lines.push(row("Kembalian", idr(order.change), width))
  }
  lines.push(doubleDivider)
  for (const footerLine of wrapText(order.footer, width)) {
    lines.push(centerLine(footerLine, width))
  }
  lines.push(centerLine("KalaPOS · Sistem Kasir Kafe", width))
  return lines
}

export function formatBaristaTicketPreview(
  order: PrintableOrder,
  paperWidth: PaperWidth = 58
): string[] {
  const width = getCharWidth(paperWidth)
  const divider = "-".repeat(width)
  const serviceLabel =
    order.orderType === "DINE_IN"
      ? `DINE-IN${order.table ? ` · MEJA ${order.table}` : ""}`
      : "TAKEAWAY"

  const lines: string[] = [
    centerLine("TIKET BARISTA", width),
    centerLine(`[  #${order.queueNumber}  ]`, width),
    centerLine(serviceLabel, width),
    centerLine(`${order.branchName} · ${order.date}`, width),
    divider,
  ]
  if (order.customerName) {
    lines.push(`PELANGGAN: ${fit(order.customerName, width - 11)}`)
    lines.push(divider)
  }
  for (const item of order.items) {
    lines.push(`${item.quantity}x ${fit(item.name, width - 4)}`)
    for (const mod of item.modifiers ?? []) {
      lines.push(`   > ${fit(mod, width - 5)}`)
    }
    if (item.baristaNotes?.trim()) {
      for (const noteLine of wrapText(`CATATAN: ${item.baristaNotes.trim()}`, width - 3)) {
        lines.push(`   ${noteLine}`)
      }
    }
    lines.push("")
  }
  lines.push(divider)
  lines.push(centerLine(`Ref: ${order.orderNumber}`, width))
  return lines
}

// Backwards-compatible aliases
export const buildReceipt = buildCustomerReceipt
export const buildKitchenTicket = buildBaristaTicket
export type ReceiptOrder = PrintableOrder
