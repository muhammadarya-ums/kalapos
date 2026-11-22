"use client"

import * as React from "react"
import { X } from "lucide-react"
import { cn } from "@/lib/utils"

export interface DialogProps {
  open: boolean
  onClose: () => void
  title?: string
  eyebrow?: string
  description?: string
  maxWidthClassName?: string
  children: React.ReactNode
  footer?: React.ReactNode
  hideCloseButton?: boolean
}

export function Dialog({
  open,
  onClose,
  title,
  eyebrow,
  description,
  maxWidthClassName = "max-w-md",
  children,
  footer,
  hideCloseButton = false,
}: DialogProps) {
  React.useEffect(() => {
    if (!open) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation()
        onClose()
      }
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [open, onClose])

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#18181B]/45 p-4"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-label={title ?? "Dialog"}
        className={cn(
          "relative flex max-h-[92vh] w-full flex-col overflow-hidden rounded-lg border border-[#E5E2DC] bg-white text-[#18181B]",
          maxWidthClassName
        )}
      >
        {(title || eyebrow || !hideCloseButton) && (
          <header className="flex items-start justify-between gap-4 border-b border-[#EFECE7] px-5 py-4">
            <div className="min-w-0">
              {eyebrow && (
                <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[#8E8982]">
                  {eyebrow}
                </p>
              )}
              {title && (
                <h2 className="mt-0.5 text-base font-semibold tracking-tight text-[#18181B]">
                  {title}
                </h2>
              )}
              {description && (
                <p className="mt-1 text-xs text-[#77736D]">{description}</p>
              )}
            </div>
            {!hideCloseButton && (
              <button
                type="button"
                onClick={onClose}
                aria-label="Tutup dialog"
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-transparent text-[#77736D] transition-colors hover:bg-[#F1EFEB] hover:text-[#18181B]"
              >
                <X className="h-4 w-4" strokeWidth={1.5} />
              </button>
            )}
          </header>
        )}
        <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {footer && (
          <footer className="flex items-center justify-end gap-2 border-t border-[#EFECE7] bg-[#FAF9F7] px-5 py-3">
            {footer}
          </footer>
        )}
      </section>
    </div>
  )
}
