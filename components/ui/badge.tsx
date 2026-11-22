import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"

const badgeVariants = cva(
  "inline-flex items-center gap-1.5 rounded border px-2 py-0.5 text-[11px] font-medium leading-4 whitespace-nowrap",
  {
    variants: {
      variant: {
        default: "border-[#E5E2DC] bg-[#F8F7F4] text-[#57534E]",
        aman: "border-[#D1FAE5] bg-[#ECFDF5] text-[#166534]",
        menipis: "border-[#FDE68A] bg-[#FFFBEB] text-[#A16207]",
        kritis: "border-[#FECACA] bg-[#FEF2F2] text-[#991B1B]",
        info: "border-[#D9E2EC] bg-[#F0F4F8] text-[#334E68]",
        terracotta: "border-[#E8C5B5] bg-[#FDF4F0] text-[#C2572A]",
        espresso: "border-[#18181B] bg-[#18181B] text-white",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {
  dot?: boolean
}

export function Badge({ className, variant, dot = false, children, ...props }: BadgeProps) {
  return (
    <span className={cn(badgeVariants({ variant }), className)} {...props}>
      {dot && <span className="h-1.5 w-1.5 rounded-full bg-current shrink-0" aria-hidden="true" />}
      {children}
    </span>
  )
}
