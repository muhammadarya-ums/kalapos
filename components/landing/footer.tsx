import Link from "next/link"
import { BrandLogo } from "@/components/ui/brand-logo"

export function LandingFooter() {
  return (
    <footer className="border-t border-[#E5E2DC] bg-white">
      <div className="mx-auto flex max-w-6xl flex-col items-start justify-between gap-6 px-5 py-10 sm:flex-row sm:items-center sm:px-8">
        <div>
          <BrandLogo href="/" subtitle="KAFE KALA" />
          <p className="mt-2 text-xs text-[#8E8982]">
            Sistem operasional internal Kafe Kala.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-6 text-xs text-[#67625B]">
          <a href="#fitur" className="hover:text-[#18181B]">
            Alur Operasional
          </a>
          <a href="#multi-cabang" className="hover:text-[#18181B]">
            Kontrol Cabang
          </a>
          <Link href="/login" className="hover:text-[#18181B]">
            Masuk Portal
          </Link>
          <span className="text-[#9A958E]">© 2026 Kafe Kala</span>
        </div>
      </div>
    </footer>
  )
}
