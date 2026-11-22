import * as React from "react"
import { cn } from "@/lib/utils"

export function TableContainer({
  className,
  children,
}: {
  className?: string
  children: React.ReactNode
}) {
  return (
    <div className={cn("overflow-x-auto", className)}>
      <table className="w-full border-collapse text-left text-xs">{children}</table>
    </div>
  )
}

export function TableHeader({
  className,
  children,
}: {
  className?: string
  children: React.ReactNode
}) {
  return (
    <thead
      className={cn(
        "border-y border-[#EFECE7] bg-[#FAF9F7] text-[11px] font-semibold uppercase tracking-[0.04em] text-[#858079]",
        className
      )}
    >
      {children}
    </thead>
  )
}

export function TableBody({
  className,
  children,
}: {
  className?: string
  children: React.ReactNode
}) {
  return <tbody className={cn("divide-y divide-[#F0EEE9]", className)}>{children}</tbody>
}

export function TableRow({
  className,
  ...props
}: React.HTMLAttributes<HTMLTableRowElement>) {
  return (
    <tr
      className={cn("transition-colors hover:bg-[#FCFBF9]", className)}
      {...props}
    />
  )
}

export function TableHead({
  className,
  ...props
}: React.ThHTMLAttributes<HTMLTableCellElement>) {
  return (
    <th
      className={cn("whitespace-nowrap px-4 py-2.5 font-semibold", className)}
      {...props}
    />
  )
}

export function TableCell({
  className,
  ...props
}: React.TdHTMLAttributes<HTMLTableCellElement>) {
  return (
    <td
      className={cn("whitespace-nowrap px-4 py-3 text-[#4A4640]", className)}
      {...props}
    />
  )
}
