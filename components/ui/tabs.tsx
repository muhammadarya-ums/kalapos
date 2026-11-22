"use client"

import * as React from "react"
import { cn } from "@/lib/utils"

export interface TabOption<T extends string> {
  value: T
  label: string
  count?: number
}

export function Tabs<T extends string>({
  options,
  value,
  onChange,
  className,
  fullWidth = false,
}: {
  options: TabOption<T>[]
  value: T
  onChange: (value: T) => void
  className?: string
  fullWidth?: boolean
}) {
  return (
    <div
      role="tablist"
      className={cn(
        "inline-flex items-center gap-1 rounded-md border border-[#E5E2DC] bg-[#F1EFEB] p-1",
        fullWidth && "flex w-full",
        className
      )}
    >
      {options.map((opt) => {
        const selected = opt.value === value
        return (
          <button
            key={opt.value}
            role="tab"
            type="button"
            aria-selected={selected}
            onClick={() => onChange(opt.value)}
            className={cn(
              "inline-flex items-center justify-center gap-1.5 rounded px-3 py-1.5 text-xs font-medium transition-colors cursor-pointer",
              fullWidth && "flex-1",
              selected
                ? "bg-white text-[#18181B] shadow-[0_1px_2px_rgba(24,24,27,0.06)] font-semibold"
                : "text-[#77736D] hover:text-[#18181B]"
            )}
          >
            <span>{opt.label}</span>
            {opt.count !== undefined && (
              <span
                className={cn(
                  "rounded px-1.5 py-0.5 font-mono text-[10px] tabular-nums",
                  selected ? "bg-[#F1EFEB] text-[#18181B]" : "bg-[#E7E4DD] text-[#67625B]"
                )}
              >
                {opt.count}
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}
