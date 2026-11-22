import { BentoFeatures } from "@/components/landing/bento-features"
import { LandingFooter } from "@/components/landing/footer"
import { LandingHero } from "@/components/landing/hero"
import { MultiBranchShowcase } from "@/components/landing/multi-branch-showcase"
import { LandingNavbar } from "@/components/landing/navbar"

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-[#F8F7F4] text-[#18181B]">
      <LandingNavbar />
      <main>
        <LandingHero />
        <BentoFeatures />
        <MultiBranchShowcase />
      </main>
      <LandingFooter />
    </div>
  )
}
