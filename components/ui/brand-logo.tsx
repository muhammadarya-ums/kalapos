import Link from "next/link"
import { Coffee } from "lucide-react"
import { cn } from "@/lib/utils"

export function BrandLogo({
  href = "/",
  subtitle = "OPERATIONS SUITE",
  compact = false,
  className,
}: {
  href?: string
  subtitle?: string
  compact?: boolean
  className?: string
}) {
  return (
    <Link
      href={href}
      className={cn("inline-flex items-center gap-2.5 text-[#18181B] no-underline", className)}
    >
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#18181B] text-white">
        <Coffee className="h-[18px] w-[18px]" strokeWidth={1.5} />
      </span>
      {!compact && (
        <span className="leading-none">
          <strong className="block text-[20px] font-bold tracking-[-0.04em] text-[#18181B]">
            kala<span className="text-[#C2572A]">pos</span>
          </strong>
          {subtitle && (
            <small className="mt-1 block text-[9px] font-semibold uppercase tracking-[0.16em] text-[#8E8982]">
              {subtitle}
            </small>
          )}
        </span>
      )}
    </Link>
  )
}
