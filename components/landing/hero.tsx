import Link from "next/link"
import { ArrowRight, ShieldCheck } from "lucide-react"
import { Button } from "@/components/ui/button"

export function LandingHero() {
  return (
    <section className="border-b border-[#E5E2DC] bg-[#F8F7F4]">
      <div className="mx-auto max-w-6xl px-5 pt-14 pb-16 sm:px-8 lg:pt-20 lg:pb-24">
        {/* Editorial Hero Header */}
        <div className="grid grid-cols-1 items-end gap-8 lg:grid-cols-12">
          <div className="lg:col-span-8">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#C2572A]">
              SISTEM OPERASIONAL INTERNAL · KAFE KALA
            </p>
            <h1 className="mt-4 text-4xl font-semibold leading-[1.1] tracking-[-0.035em] text-[#18181B] sm:text-5xl lg:text-[56px]">
              Satu kasir yang tenang untuk seluruh cabang Kafe Kala.
            </h1>
          </div>

          <div className="lg:col-span-4 lg:pb-1">
            <p className="text-sm leading-relaxed text-[#67625B]">
              Portal POS khusus internal Kafe Kala yang menyatukan kasir, antrean barista, persediaan bahan baku, dan laporan arus kas lintas cabang dalam satu kendali Owner.
            </p>
            <div className="mt-6 flex flex-wrap items-center gap-3">
              <Link href="/login">
                <Button variant="default" size="lg">
                  Masuk Portal Kala
                  <ArrowRight className="h-4 w-4" strokeWidth={1.5} />
                </Button>
              </Link>
              <span className="inline-flex items-center gap-1.5 text-[11px] text-[#77736D]">
                <ShieldCheck className="h-3.5 w-3.5 text-[#166534]" strokeWidth={1.5} />
                Khusus tim internal
              </span>
            </div>
          </div>
        </div>

        {/* Quiet Editorial Pillars */}
        <div className="mt-12 grid grid-cols-1 gap-6 border-y border-[#E5E2DC] py-6 sm:grid-cols-3 sm:gap-0 sm:divide-x sm:divide-[#E5E2DC]">
          <div className="sm:pr-6">
            <span className="font-mono text-[11px] font-medium text-[#C2572A]">01</span>
            <p className="mt-1.5 text-sm font-semibold text-[#18181B]">Kasir &amp; Open Bill</p>
            <p className="mt-1 text-xs leading-relaxed text-[#77736D]">
              Input cepat, kustomisasi minuman, split bill, hingga cetak struk.
            </p>
          </div>
          <div className="sm:px-6">
            <span className="font-mono text-[11px] font-medium text-[#C2572A]">02</span>
            <p className="mt-1.5 text-sm font-semibold text-[#18181B]">Arus Kas &amp; Stok Terpadu</p>
            <p className="mt-1 text-xs leading-relaxed text-[#77736D]">
              Pantau omset, beban HPP, rekonsiliasi shift, dan persediaan secara terukur.
            </p>
          </div>
          <div className="sm:pl-6">
            <span className="font-mono text-[11px] font-medium text-[#C2572A]">03</span>
            <p className="mt-1.5 text-sm font-semibold text-[#18181B]">Kendali Penuh Owner</p>
            <p className="mt-1 text-xs leading-relaxed text-[#77736D]">
              Hanya Owner Kafe Kala yang dapat menambah, memperbarui, mengurangi cabang, dan menerbitkan akses staf.
            </p>
          </div>
        </div>
      </div>
    </section>
  )
}
