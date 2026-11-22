"use client"

import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "inline-flex shrink-0 items-center justify-center gap-2 rounded-md border font-medium whitespace-nowrap transition-colors outline-none select-none cursor-pointer disabled:pointer-events-none disabled:opacity-45 focus-visible:ring-2 focus-visible:ring-[#C2572A]/40 focus-visible:border-[#C2572A] [&_svg]:pointer-events-none [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default:
          "border-[#18181B] bg-[#18181B] text-white hover:bg-[#2C2C31]",
        terracotta:
          "border-[#C2572A] bg-[#C2572A] text-white hover:bg-[#AA4922]",
        outline:
          "border-[#E5E2DC] bg-white text-[#18181B] hover:bg-[#F8F7F4] hover:border-[#D6D2C9]",
        secondary:
          "border-transparent bg-[#F1EFEB] text-[#2D2B28] hover:bg-[#E7E4DD]",
        ghost:
          "border-transparent bg-transparent text-[#67625B] hover:bg-[#F1EFEB] hover:text-[#18181B]",
        destructive:
          "border-[#FECACA] bg-[#FEF2F2] text-[#991B1B] hover:bg-[#FEE2E2]",
        destructiveSolid:
          "border-[#991B1B] bg-[#991B1B] text-white hover:bg-[#7F1D1D]",
        success:
          "border-[#D1FAE5] bg-[#ECFDF5] text-[#166534] hover:bg-[#D1FAE5]",
      },
      size: {
        xs: "h-7 px-2.5 text-xs",
        sm: "h-8 px-3 text-xs",
        default: "h-9 px-3.5 text-xs",
        md: "h-10 px-4 text-sm",
        lg: "h-12 px-5 text-sm",
        touch: "min-h-12 min-w-12 px-4 text-sm",
        icon: "h-9 w-9 p-0",
        iconSm: "h-8 w-8 p-0",
        iconTouch: "h-12 w-12 p-0",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, type = "button", ...props }, ref) => {
    return (
      <button
        ref={ref}
        type={type}
        className={cn(buttonVariants({ variant, size, className }))}
        {...props}
      />
    )
  }
)
Button.displayName = "Button"

export { buttonVariants }
