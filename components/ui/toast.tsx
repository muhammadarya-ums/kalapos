"use client"

import * as React from "react"
import { AlertTriangle, Check, Info, X } from "lucide-react"

export type ToastTone = "success" | "error" | "info"

interface ToastItem {
  id: string
  message: string
  tone: ToastTone
}

interface ToastContextValue {
  toast: (message: string, tone?: ToastTone) => void
}

const ToastContext = React.createContext<ToastContextValue | null>(null)

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = React.useState<ToastItem[]>([])

  const toast = React.useCallback((message: string, tone: ToastTone = "success") => {
    const id = `toast-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
    setItems((prev) => [...prev.slice(-2), { id, message, tone }])
    window.setTimeout(() => {
      setItems((prev) => prev.filter((item) => item.id !== id))
    }, 3200)
  }, [])

  const dismiss = (id: string) => {
    setItems((prev) => prev.filter((item) => item.id !== id))
  }

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      <div
        aria-live="polite"
        className="pointer-events-none fixed bottom-5 left-1/2 z-[70] flex -translate-x-1/2 flex-col items-center gap-2 px-4"
      >
        {items.map((item) => (
          <div
            key={item.id}
            className="pointer-events-auto flex items-center gap-2.5 rounded-md border border-[#2C2C31] bg-[#18181B] px-4 py-2.5 text-xs font-medium text-white shadow-[0_6px_20px_rgba(24,24,27,0.18)]"
          >
            {item.tone === "success" && (
              <Check className="h-4 w-4 shrink-0 text-[#86EFAC]" strokeWidth={1.75} />
            )}
            {item.tone === "error" && (
              <AlertTriangle className="h-4 w-4 shrink-0 text-[#FCA5A5]" strokeWidth={1.75} />
            )}
            {item.tone === "info" && (
              <Info className="h-4 w-4 shrink-0 text-[#FDBA74]" strokeWidth={1.75} />
            )}
            <span>{item.message}</span>
            <button
              type="button"
              onClick={() => dismiss(item.id)}
              aria-label="Tutup notifikasi"
              className="ml-1 text-[#9A958E] hover:text-white"
            >
              <X className="h-3.5 w-3.5" strokeWidth={1.5} />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}

export function useToast() {
  const ctx = React.useContext(ToastContext)
  if (!ctx) throw new Error("useToast must be used inside <ToastProvider>")
  return ctx
}
