"use client"

import * as React from "react"
import { Delete, ShieldCheck } from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "./button"
import { Dialog } from "./dialog"
import { FieldLabel, Input } from "./input"

export interface PinPadProps {
  value: string
  onChange: (value: string) => void
  maxLength?: number
  onComplete?: (pin: string) => void
  error?: string | null
  disabled?: boolean
}

export function PinPad({
  value,
  onChange,
  maxLength = 4,
  onComplete,
  error,
  disabled = false,
}: PinPadProps) {
  const handleDigit = (digit: string) => {
    if (disabled || value.length >= maxLength) return
    const next = `${value}${digit}`
    onChange(next)
    if (next.length === maxLength) {
      onComplete?.(next)
    }
  }

  const handleBackspace = () => {
    if (disabled || value.length === 0) return
    onChange(value.slice(0, -1))
  }

  const handleClear = () => {
    if (disabled) return
    onChange("")
  }

  const keys = ["1", "2", "3", "4", "5", "6", "7", "8", "9"]

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-center gap-3" aria-label="Indikator PIN">
        {Array.from({ length: maxLength }).map((_, idx) => {
          const filled = idx < value.length
          return (
            <div
              key={idx}
              className={cn(
                "flex h-12 w-12 items-center justify-center rounded-md border font-mono text-lg font-semibold transition-colors",
                filled
                  ? "border-[#18181B] bg-[#18181B] text-white"
                  : "border-[#E5E2DC] bg-[#FAF9F7] text-[#C5C0B8]",
                error && "border-[#991B1B]"
              )}
            >
              {filled ? "•" : ""}
            </div>
          )
        })}
      </div>

      {error && (
        <p className="text-center text-xs font-medium text-[#991B1B]" role="alert">
          {error}
        </p>
      )}

      <div className="grid grid-cols-3 gap-2">
        {keys.map((k) => (
          <button
            key={k}
            type="button"
            disabled={disabled}
            onClick={() => handleDigit(k)}
            className="flex h-13 min-h-[52px] items-center justify-center rounded-md border border-[#E5E2DC] bg-white font-mono text-base font-semibold tabular-nums text-[#18181B] transition-colors hover:border-[#C2572A] hover:bg-[#FAF9F7] active:bg-[#F1EFEB] disabled:opacity-45 cursor-pointer"
          >
            {k}
          </button>
        ))}
        <button
          type="button"
          disabled={disabled}
          onClick={handleClear}
          className="flex h-13 min-h-[52px] items-center justify-center rounded-md border border-[#E5E2DC] bg-[#FAF9F7] text-xs font-semibold text-[#77736D] transition-colors hover:bg-[#F1EFEB] hover:text-[#18181B] cursor-pointer"
        >
          Hapus
        </button>
        <button
          type="button"
          disabled={disabled}
          onClick={() => handleDigit("0")}
          className="flex h-13 min-h-[52px] items-center justify-center rounded-md border border-[#E5E2DC] bg-white font-mono text-base font-semibold tabular-nums text-[#18181B] transition-colors hover:border-[#C2572A] hover:bg-[#FAF9F7] active:bg-[#F1EFEB] disabled:opacity-45 cursor-pointer"
        >
          0
        </button>
        <button
          type="button"
          disabled={disabled}
          onClick={handleBackspace}
          aria-label="Hapus satu digit"
          className="flex h-13 min-h-[52px] items-center justify-center rounded-md border border-[#E5E2DC] bg-[#FAF9F7] text-[#57534E] transition-colors hover:bg-[#F1EFEB] hover:text-[#18181B] cursor-pointer"
        >
          <Delete className="h-4 w-4" strokeWidth={1.5} />
        </button>
      </div>
    </div>
  )
}

export interface SupervisorPinModalProps {
  open: boolean
  onClose: () => void
  title: string
  description: string
  actionLabel?: string
  requireReason?: boolean
  reasonLabel?: string
  reasonPlaceholder?: string
  defaultReason?: string
  onConfirm: (payload: {
    pin: string
    reason: string
  }) => Promise<{ ok: boolean; error?: string } | void> | { ok: boolean; error?: string } | void
}

export function SupervisorPinModal({
  open,
  onClose,
  title,
  description,
  actionLabel = "Otorisasi & Lanjutkan",
  requireReason = true,
  reasonLabel = "Alasan Audit",
  reasonPlaceholder = "Contoh: Pelanggan membatalkan pesanan",
  defaultReason = "",
  onConfirm,
}: SupervisorPinModalProps) {
  const [pin, setPin] = React.useState("")
  const [reason, setReason] = React.useState(defaultReason)
  const [error, setError] = React.useState<string | null>(null)
  const [submitting, setSubmitting] = React.useState(false)

  React.useEffect(() => {
    if (open) {
      setPin("")
      setReason(defaultReason)
      setError(null)
      setSubmitting(false)
    }
  }, [open, defaultReason])

  const submit = async () => {
    if (requireReason && !reason.trim()) {
      setError("Alasan audit wajib diisi.")
      return
    }
    if (pin.length < 4) {
      setError("Masukkan 4 digit PIN Supervisor.")
      return
    }
    setSubmitting(true)
    try {
      const result = await onConfirm({ pin, reason: reason.trim() })
      if (result && !result.ok) {
        setError(result.error || "PIN Supervisor tidak valid.")
        setPin("")
        return
      }
      onClose()
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      eyebrow="OTORISASI SUPERVISOR"
      title={title}
      description={description}
      maxWidthClassName="max-w-sm"
    >
      <div className="space-y-4">
        <div className="flex items-center gap-2.5 rounded-md border border-[#E5E2DC] bg-[#FAF9F7] px-3 py-2.5 text-xs text-[#57534E]">
          <ShieldCheck className="h-4 w-4 shrink-0 text-[#C2572A]" strokeWidth={1.5} />
          <span>
            Masukkan 4 digit PIN Supervisor atau Owner untuk mengonfirmasi tindakan ini.
          </span>
        </div>

        {requireReason && (
          <div>
            <FieldLabel htmlFor="supervisor-audit-reason">{reasonLabel}</FieldLabel>
            <Input
              id="supervisor-audit-reason"
              value={reason}
              onChange={(e) => {
                setReason(e.target.value)
                if (error) setError(null)
              }}
              placeholder={reasonPlaceholder}
              maxLength={140}
            />
          </div>
        )}

        <PinPad
          value={pin}
          disabled={submitting}
          onChange={(next) => {
            setPin(next)
            if (error) setError(null)
          }}
          error={error}
        />

        <div className="flex items-center gap-2 pt-1">
          <Button variant="outline" size="lg" className="flex-1" onClick={onClose} disabled={submitting}>
            Batal
          </Button>
          <Button
            variant="default"
            size="lg"
            className="flex-1"
            onClick={submit}
            disabled={pin.length < 4 || submitting}
          >
            {submitting ? "Memverifikasi…" : actionLabel}
          </Button>
        </div>
      </div>
    </Dialog>
  )
}
