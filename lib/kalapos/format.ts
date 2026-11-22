import { hashPinSecure } from "./crypto"
import type { ProductTone, StockHealth } from "./types"

/** Format integer IDR strictly without decimals, e.g. "Rp 28.000" */
export function formatIDR(amount: number): string {
  const rounded = Math.round(amount)
  const sign = rounded < 0 ? "-" : ""
  const abs = Math.abs(rounded).toLocaleString("id-ID")
  return `${sign}Rp ${abs}`
}

/** Compact Indonesian currency display for chart axes / dense badges */
export function formatIDRCompact(amount: number): string {
  const abs = Math.abs(amount)
  const sign = amount < 0 ? "-" : ""
  if (abs >= 1_000_000_000) {
    return `${sign}Rp ${(abs / 1_000_000_000).toFixed(1).replace(".", ",")} M`
  }
  if (abs >= 1_000_000) {
    return `${sign}Rp ${(abs / 1_000_000).toFixed(1).replace(".", ",")} jt`
  }
  if (abs >= 1_000) {
    return `${sign}Rp ${Math.round(abs / 1_000)} rb`
  }
  return formatIDR(amount)
}

export function formatNumberID(value: number): string {
  return Math.round(value).toLocaleString("id-ID")
}

export function formatQty(value: number, unit: string): string {
  const formatted = Number.isInteger(value)
    ? value.toLocaleString("id-ID")
    : value.toLocaleString("id-ID", { maximumFractionDigits: 1 })
  return `${formatted} ${unit}`
}

export function formatTimeWIB(iso: string): string {
  const date = new Date(iso)
  const hh = String(date.getHours()).padStart(2, "0")
  const mm = String(date.getMinutes()).padStart(2, "0")
  return `${hh}.${mm} WIB`
}

export function formatDateShortID(iso: string): string {
  return new Intl.DateTimeFormat("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(iso))
}

export function formatDateTimeID(iso: string): string {
  return `${formatDateShortID(iso)} · ${formatTimeWIB(iso)}`
}

export function formatLongDateID(date: Date = new Date()): string {
  return new Intl.DateTimeFormat("id-ID", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(date)
}

export function computeStockHealth(currentQty: number, minThreshold: number): StockHealth {
  if (minThreshold <= 0) return currentQty > 0 ? "Aman" : "Kritis"
  if (currentQty <= minThreshold * 0.5) return "Kritis"
  if (currentQty < minThreshold) return "Menipis"
  return "Aman"
}

/** Deterministic SHA-256 PIN hash matching User.pin_hash */
export function hashPin(pin: string): string {
  return hashPinSecure(pin)
}

export function getInitials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .map((part) => part[0] ?? "")
    .join("")
    .toUpperCase()
    .slice(0, 2)
}

export const TONE_CLASSES: Record<ProductTone, string> = {
  sand: "bg-[#F1E8DC] text-[#6B4E3D]",
  rose: "bg-[#F3E4DF] text-[#7A4435]",
  olive: "bg-[#E7EBE1] text-[#4A5D41]",
  tan: "bg-[#EEE4D4] text-[#6E5438]",
  slate: "bg-[#E4E9E8] text-[#435654]",
}

export function generateIdempotencyKey(branchCode: string): string {
  const rand =
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID().slice(0, 8)
      : Math.random().toString(36).slice(2, 10)
  return `IDEMP-${branchCode.replace(/[^A-Z0-9]/gi, "")}-${Date.now()}-${rand}`
}

export function generateId(prefix: string): string {
  const rand =
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID().slice(0, 8)
      : Math.random().toString(36).slice(2, 10)
  return `${prefix}-${Date.now().toString(36)}-${rand}`
}
