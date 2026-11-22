"use client"

import * as React from "react"
import { ChevronDown } from "lucide-react"
import { cn } from "@/lib/utils"

export interface SelectOption {
  value: string
  label: string
  disabled?: boolean
}

export interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  options?: SelectOption[]
}

export const Select = React.forwardRef<HTMLSelectElement, SelectProps>(
  ({ className, options, children, ...props }, ref) => (
    <div className="relative">
      <select
        ref={ref}
        className={cn(
          "h-10 w-full appearance-none rounded-md border border-[#E5E2DC] bg-white py-2 pl-3 pr-9 text-sm text-[#18181B] transition-colors outline-none focus:border-[#C2572A] focus:ring-2 focus:ring-[#C2572A]/20 disabled:cursor-not-allowed disabled:bg-[#F8F7F4] disabled:opacity-60",
          className
        )}
        {...props}
      >
        {options
          ? options.map((opt) => (
              <option key={opt.value} value={opt.value} disabled={opt.disabled}>
                {opt.label}
              </option>
            ))
          : children}
      </select>
      <ChevronDown
        className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#8E8982]"
        strokeWidth={1.5}
      />
    </div>
  )
)
Select.displayName = "Select"
