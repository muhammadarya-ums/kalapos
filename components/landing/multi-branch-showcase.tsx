import Link from "next/link"
import { ArrowRight, Check, KeyRound, Lock, ShieldCheck, Store, Users } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"

export function MultiBranchShowcase() {
  return (
    <section id="multi-cabang" className="bg-[#F8F7F4]">
      <div className="mx-auto max-w-6xl px-5 py-16 sm:px-8 lg:py-24">
        <div className="grid grid-cols-1 items-center gap-10 lg:grid-cols-12">
          {/* Left Editorial Column */}
          <div className="lg:col-span-5">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#C2572A]">
              KENDALI CABANG KAFE KALA
            </p>
            <h2 className="mt-3 text-2xl font-semibold leading-tight tracking-[-0.03em] text-[#18181B] sm:text-3xl">
              Tambah, perbarui, dan kelola seluruh cabang Kafe Kala dari satu pusat kendali.
            </h2>
            <p className="mt-3.5 text-sm leading-relaxed text-[#67625B]">
              Sistem ini dirancang khusus untuk Kafe Kala. Tidak ada pendaftaran publik — hanya Owner yang berwenang membuka cabang baru, memperbarui pengaturan, menonaktifkan cabang, dan menerbitkan akun staf.
            </p>

            <ul className="mt-6 space-y-3 text-xs text-[#4A4640]">
              <li className="flex items-center gap-2.5">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#18181B] text-white">
                  <Check className="h-3 w-3" strokeWidth={2} />
                </span>
                Akses Kasir dan Barista terkunci pada cabang penugasan masing-masing
              </li>
              <li className="flex items-center gap-2.5">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#18181B] text-white">
                  <Check className="h-3 w-3" strokeWidth={2} />
                </span>
                Owner dapat menambah, mengubah, mengarsipkan, atau menghapus cabang kapan saja
              </li>
              <li className="flex items-center gap-2.5">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#18181B] text-white">
                  <Check className="h-3 w-3" strokeWidth={2} />
                </span>
                Verifikasi sesi, kata sandi, dan PIN Supervisor berjalan ketat di sisi server
              </li>
            </ul>
          </div>

          {/* Right Access & Branch Control Architecture Card */}
          <div className="lg:col-span-7">
            <div className="overflow-hidden rounded-xl border border-[#E5E2DC] bg-white">
              <div className="flex items-center justify-between border-b border-[#E5E2DC] bg-[#FAF9F7] px-5 py-3.5">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="h-4 w-4 text-[#166534]" strokeWidth={1.5} />
                  <span className="text-xs font-semibold text-[#18181B]">
                    Tata Kelola Akses Internal · Kafe Kala
                  </span>
                </div>
                <Badge variant="aman" dot>
                  Private Single-Cafe
                </Badge>
              </div>

              <div className="divide-y divide-[#EFECE7] p-6">
                <div className="flex items-start gap-3.5 pb-4">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-[#18181B] text-white">
                    <Store className="h-4 w-4" strokeWidth={1.5} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-xs font-semibold text-[#18181B]">
                        1. Konsol Owner (Akses Global)
                      </p>
                      <span className="font-mono text-[10px] text-[#C2572A]">OWNER ONLY</span>
                    </div>
                    <p className="mt-1 text-xs leading-relaxed text-[#67625B]">
                      Satu akun Owner resmi Kafe Kala mengelola daftar cabang (tambah, edit, arsip, hapus), laporan omset &amp; arus kas, serta persediaan lintas lokasi.
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3.5 py-4">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-[#E5E2DC] bg-[#FAF9F7] text-[#18181B]">
                    <Users className="h-4 w-4" strokeWidth={1.5} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-xs font-semibold text-[#18181B]">
                        2. Penerbitan Akun Staf per Cabang
                      </p>
                      <span className="font-mono text-[10px] text-[#8E8982]">INVITE ONLY</span>
                    </div>
                    <p className="mt-1 text-xs leading-relaxed text-[#67625B]">
                      Akun Manager, Kasir, dan Barista hanya dapat dibuat dan dinonaktifkan oleh Owner. Setiap staf terikat pada cabang penugasannya.
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3.5 pt-4">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-[#E5E2DC] bg-[#FAF9F7] text-[#18181B]">
                    <KeyRound className="h-4 w-4" strokeWidth={1.5} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-xs font-semibold text-[#18181B]">
                        3. Otorisasi Sesi &amp; PIN di Server
                      </p>
                      <span className="font-mono text-[10px] text-[#166534]">HTTPONLY SIGNED</span>
                    </div>
                    <p className="mt-1 text-xs leading-relaxed text-[#67625B]">
                      Sesi login ditandatangani HMAC-SHA256 pada cookie HttpOnly, dilindungi pembatasan percobaan gagal, dan memverifikasi status aktif staf di server.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Clean Closing CTA Banner */}
        <div className="mt-16 flex flex-col items-start justify-between gap-6 rounded-xl border border-[#18181B] bg-[#18181B] p-8 text-white sm:flex-row sm:items-center sm:p-10">
          <div className="max-w-lg">
            <p className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-[#FDBA74]">
              <Lock className="h-3.5 w-3.5" strokeWidth={1.5} />
              PORTAL INTERNAL KAFE KALA
            </p>
            <h2 className="mt-2.5 text-2xl font-semibold tracking-[-0.025em]">
              Masuk untuk mengelola cabang, tim, dan operasional kasir Kafe Kala.
            </h2>
            <p className="mt-2 text-xs leading-relaxed text-[#D6D3CD]">
              Gunakan akun Owner atau kredensial staf cabang resmi yang telah diterbitkan.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2.5">
            <Link href="/login">
              <Button variant="terracotta" size="lg">
                Masuk ke Portal
                <ArrowRight className="h-4 w-4" strokeWidth={1.5} />
              </Button>
            </Link>
          </div>
        </div>
      </div>
    </section>
  )
}
