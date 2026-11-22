"use client"

import Link from "next/link"
import { ArrowRight, Lock } from "lucide-react"
import { BrandLogo } from "@/components/ui/brand-logo"
import { Button } from "@/components/ui/button"
import { defaultRouteForRole } from "@/lib/kalapos/auth"
import { useKalaPOS } from "@/lib/kalapos/context"

export function LandingNavbar() {
  const { session } = useKalaPOS()

  return (
    <header className="sticky top-0 z-30 border-b border-[#E5E2DC] bg-[#F8F7F4]/95 backdrop-blur-[2px]">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5 sm:px-8">
        <BrandLogo href="/" subtitle="KAFE KALA" />

        <nav className="hidden items-center gap-8 text-xs font-medium text-[#67625B] md:flex">
          <a href="#fitur" className="transition-colors hover:text-[#18181B]">
            Alur Operasional
          </a>
          <a href="#multi-cabang" className="transition-colors hover:text-[#18181B]">
            Kontrol Cabang
          </a>
        </nav>

        <div className="flex items-center gap-2.5">
          {session ? (
            <Link href={defaultRouteForRole(session.role)}>
              <Button variant="default" size="default">
                Buka Workspace
                <ArrowRight className="h-3.5 w-3.5" strokeWidth={1.5} />
              </Button>
            </Link>
          ) : (
            <Link href="/login">
              <Button variant="default" size="default">
                <Lock className="h-3.5 w-3.5" strokeWidth={1.5} />
                Masuk Portal
              </Button>
            </Link>
          )}
        </div>
      </div>
    </header>
  )
}
