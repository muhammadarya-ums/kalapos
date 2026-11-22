"use client"

import * as React from "react"
import { X } from "lucide-react"
import { cn } from "@/lib/utils"

export interface DrawerProps {
  open: boolean
  onClose: () => void
  title: string
  eyebrow?: string
  description?: string
  widthClassName?: string
  children: React.ReactNode
  footer?: React.ReactNode
}

export function Drawer({
  open,
  onClose,
  title,
  eyebrow,
  description,
  widthClassName = "max-w-md",
  children,
  footer,
}: DrawerProps) {
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
      className="fixed inset-0 z-50 flex justify-end bg-[#18181B]/40"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <aside
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={cn(
          "flex h-full w-full flex-col border-l border-[#E5E2DC] bg-white text-[#18181B]",
          widthClassName
        )}
      >
        <header className="flex items-start justify-between gap-4 border-b border-[#E5E2DC] px-5 py-4">
          <div className="min-w-0">
            {eyebrow && (
              <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[#8E8982]">
                {eyebrow}
              </p>
            )}
            <h2 className="mt-0.5 text-base font-semibold tracking-tight text-[#18181B]">
              {title}
            </h2>
            {description && <p className="mt-1 text-xs text-[#77736D]">{description}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Tutup panel"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-[#77736D] hover:bg-[#F1EFEB] hover:text-[#18181B]"
          >
            <X className="h-4 w-4" strokeWidth={1.5} />
          </button>
        </header>
        <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {footer && (
          <footer className="border-t border-[#E5E2DC] bg-[#FAF9F7] px-5 py-3.5">{footer}</footer>
        )}
      </aside>
    </div>
  )
}
