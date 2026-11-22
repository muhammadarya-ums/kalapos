"use client"

import * as React from "react"
import { cn } from "@/lib/utils"

export const Input = React.forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement>
>(({ className, ...props }, ref) => (
  <input
    ref={ref}
    className={cn(
      "flex h-10 w-full rounded-md border border-[#E5E2DC] bg-white px-3 text-sm text-[#18181B] placeholder:text-[#9A958E] transition-colors outline-none focus:border-[#C2572A] focus:ring-2 focus:ring-[#C2572A]/20 disabled:cursor-not-allowed disabled:bg-[#F8F7F4] disabled:opacity-60",
      className
    )}
    {...props}
  />
))
Input.displayName = "Input"

export const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement>
>(({ className, ...props }, ref) => (
  <textarea
    ref={ref}
    className={cn(
      "flex min-h-[76px] w-full rounded-md border border-[#E5E2DC] bg-white px-3 py-2 text-sm text-[#18181B] placeholder:text-[#9A958E] transition-colors outline-none focus:border-[#C2572A] focus:ring-2 focus:ring-[#C2572A]/20 disabled:cursor-not-allowed disabled:opacity-60",
      className
    )}
    {...props}
  />
))
Textarea.displayName = "Textarea"

export function FieldLabel({
  children,
  htmlFor,
  hint,
  className,
}: {
  children: React.ReactNode
  htmlFor?: string
  hint?: string
  className?: string
}) {
  return (
    <div className={cn("mb-1.5 flex items-baseline justify-between gap-2", className)}>
      <label htmlFor={htmlFor} className="text-xs font-medium text-[#4A4640]">
        {children}
      </label>
      {hint && <span className="text-[11px] text-[#8E8982]">{hint}</span>}
    </div>
  )
}

export function CurrencyInput({
  value,
  onChange,
  placeholder = "0",
  id,
  className,
  disabled,
}: {
  value: number
  onChange: (value: number) => void
  placeholder?: string
  id?: string
  className?: string
  disabled?: boolean
}) {
  return (
    <div
      className={cn(
        "flex h-12 items-center gap-2 rounded-md border border-[#E5E2DC] bg-white px-3 focus-within:border-[#C2572A] focus-within:ring-2 focus-within:ring-[#C2572A]/20",
        disabled && "bg-[#F8F7F4] opacity-60",
        className
      )}
    >
      <span className="font-mono text-xs font-medium text-[#8E8982]">Rp</span>
      <input
        id={id}
        type="text"
        inputMode="numeric"
        disabled={disabled}
        value={value > 0 ? value.toLocaleString("id-ID") : ""}
        placeholder={placeholder}
        onChange={(event) => {
          const digits = event.target.value.replace(/[^\d]/g, "")
          onChange(digits ? parseInt(digits, 10) : 0)
        }}
        className="w-full bg-transparent text-right font-mono text-base font-semibold tabular-nums text-[#18181B] placeholder:text-[#C5C0B8] outline-none"
      />
    </div>
  )
}
