import { Clock3, Lock, Printer } from "lucide-react"
import { Badge } from "@/components/ui/badge"

export function BentoFeatures() {
  return (
    <section id="fitur" className="border-b border-[#E5E2DC] bg-white">
      <div className="mx-auto max-w-6xl px-5 py-16 sm:px-8 lg:py-24">
        <div className="max-w-xl">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#C2572A]">
            DIRANCANG UNTUK BAR &amp; KASIR KAFE KALA
          </p>
          <h2 className="mt-3 text-2xl font-semibold leading-tight tracking-[-0.03em] text-[#18181B] sm:text-4xl">
            Setiap proses dari meja kasir hingga laporan akhir hari berjalan mulus.
          </h2>
        </div>

        <div className="mt-10 grid grid-cols-1 gap-4 lg:grid-cols-12">
          {/* Card 1: Kasir & Split Bill (7 cols) */}
          <article className="flex flex-col justify-between rounded-xl border border-[#E5E2DC] bg-[#F8F7F4]/60 p-6 sm:p-7 lg:col-span-7">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[#8E8982]">
                TERMINAL KASIR
              </p>
              <h3 className="mt-2 text-xl font-semibold tracking-tight text-[#18181B]">
                Open Bill per meja &amp; Split Bill tanpa hitung manual
              </h3>
              <p className="mt-2 max-w-lg text-xs leading-relaxed text-[#67625B]">
                Tahan pesanan pelanggan yang masih duduk, bagi tagihan secara rata maupun per nominal, dan terima pembayaran Tunai, QRIS, serta Kartu dengan kembalian otomatis.
              </p>
            </div>

            <div className="mt-6 grid grid-cols-1 gap-2.5 sm:grid-cols-3">
              <div className="rounded-lg border border-[#E5E2DC] bg-white p-3.5">
                <p className="text-[10px] text-[#8E8982]">Open Bill</p>
                <p className="mt-1 text-sm font-semibold text-[#18181B]">Tahan &amp; Lanjut</p>
                <p className="mt-0.5 text-[11px] text-[#77736D]">Tersimpan per nomor meja</p>
              </div>
              <div className="rounded-lg border border-[#E5E2DC] bg-white p-3.5">
                <p className="text-[10px] text-[#8E8982]">Split Bill</p>
                <p className="mt-1 text-sm font-semibold text-[#18181B]">Tunai + QRIS</p>
                <p className="mt-0.5 text-[11px] text-[#166534]">Kombinasi metode bayar</p>
              </div>
              <div className="rounded-lg border border-[#E5E2DC] bg-white p-3.5">
                <p className="text-[10px] text-[#8E8982]">Mode Koneksi</p>
                <p className="mt-1 text-sm font-semibold text-[#18181B]">Tetap Jalan</p>
                <p className="mt-0.5 text-[11px] text-[#77736D]">Antre sinkron otomatis</p>
              </div>
            </div>
          </article>

          {/* Card 2: Layar Barista KDS (5 cols) */}
          <article className="flex flex-col justify-between rounded-xl border border-[#E5E2DC] bg-[#F8F7F4]/60 p-6 sm:p-7 lg:col-span-5">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[#8E8982]">
                MEJA BARISTA
              </p>
              <h3 className="mt-2 text-xl font-semibold tracking-tight text-[#18181B]">
                Antrean pesanan langsung di layar bar
              </h3>
              <p className="mt-2 text-xs leading-relaxed text-[#67625B]">
                Barista langsung melihat detail pesanan, catatan khusus, dan pengingat waktu tunggu SLA secara real-time.
              </p>
            </div>

            <div className="mt-6 rounded-lg border border-[#E5E2DC] bg-white p-4">
              <div className="flex items-center justify-between">
                <strong className="font-mono text-xs font-semibold text-[#18181B]">
                  Alur Tiket KDS
                </strong>
                <span className="inline-flex items-center gap-1 rounded border border-[#E5E2DC] bg-[#FAF9F7] px-2 py-0.5 font-mono text-[10px] font-medium text-[#67625B]">
                  <Clock3 className="h-3 w-3" strokeWidth={1.5} />
                  SLA Timer
                </span>
              </div>
              <p className="mt-2.5 border-t border-[#EFECE7] pt-2.5 text-[11px] leading-relaxed text-[#77736D]">
                Pesanan yang lunas di kasir langsung masuk antrean bar tanpa kertas tambahan, lengkap dengan lonceng notifikasi.
              </p>
              <div className="mt-3 grid grid-cols-3 gap-1.5 text-center text-[10px] font-semibold">
                <span className="rounded bg-[#F1EFEB] py-1 text-[#77736D]">Menunggu</span>
                <span className="rounded bg-[#18181B] py-1 text-white">Dibuat</span>
                <span className="rounded bg-[#F1EFEB] py-1 text-[#77736D]">Siap</span>
              </div>
            </div>
          </article>

          {/* Card 3: Arus Kas & HPP (5 cols) */}
          <article className="flex flex-col justify-between rounded-xl border border-[#E5E2DC] bg-[#F8F7F4]/60 p-6 sm:p-7 lg:col-span-5">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[#8E8982]">
                OMSET &amp; ARUS KAS
              </p>
              <h3 className="mt-2 text-xl font-semibold tracking-tight text-[#18181B]">
                Pantau omset, laba kotor, &amp; Food Cost harian
              </h3>
              <p className="mt-2 text-xs leading-relaxed text-[#67625B]">
                Catatan keluar-masuk kas dan beban HPP terekap otomatis per periode harian, mingguan, hingga bulanan.
              </p>
            </div>

            <div className="mt-6 space-y-2.5 rounded-lg border border-[#E5E2DC] bg-white p-4 text-xs">
              {[
                { label: "Omset & Laba Kotor", note: "Terekap real-time", variant: "aman" as const },
                { label: "Beban HPP & Food Cost", note: "Terukur per transaksi", variant: "default" as const },
                { label: "Kontrol Stok Bahan", note: "Restok, waste & opname", variant: "menipis" as const },
              ].map((row) => (
                <div key={row.label} className="flex items-center justify-between gap-2">
                  <span className="font-medium text-[#18181B]">{row.label}</span>
                  <Badge variant={row.variant}>{row.note}</Badge>
                </div>
              ))}
            </div>
          </article>

          {/* Card 4: Shift & Printer Thermal (7 cols) */}
          <article className="flex flex-col justify-between rounded-xl border border-[#E5E2DC] bg-[#F8F7F4]/60 p-6 sm:p-7 lg:col-span-7">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[#8E8982]">
                KEAMANAN LACI &amp; PERANGKAT
              </p>
              <h3 className="mt-2 text-xl font-semibold tracking-tight text-[#18181B]">
                Tutup shift bebas manipulasi &amp; cetak struk nirkabel
              </h3>
              <p className="mt-2 max-w-lg text-xs leading-relaxed text-[#67625B]">
                Kasir menghitung uang fisik tanpa melihat target sistem, pembatalan membutuhkan PIN Supervisor terverifikasi server, dan struk pelanggan serta tiket bar tercetak otomatis via Bluetooth atau USB.
              </p>
            </div>

            <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="rounded-lg border border-[#E5E2DC] bg-white p-4">
                <div className="flex items-center justify-between">
                  <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#18181B]">
                    <Lock className="h-3.5 w-3.5 text-[#C2572A]" strokeWidth={1.5} />
                    Rekonsiliasi Kas
                  </span>
                  <Badge variant="aman">Terlindung</Badge>
                </div>
                <p className="mt-2.5 text-[11px] leading-relaxed text-[#77736D]">
                  Target kas tersembunyi saat penutupan shift. Selisih tercatat otomatis ke laporan Owner.
                </p>
              </div>

              <div className="rounded-lg border border-[#E5E2DC] bg-white p-4">
                <div className="flex items-center justify-between">
                  <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#18181B]">
                    <Printer className="h-3.5 w-3.5 text-[#18181B]" strokeWidth={1.5} />
                    Printer Thermal
                  </span>
                  <span className="font-mono text-[10px] text-[#8E8982]">58mm / 80mm</span>
                </div>
                <p className="mt-2.5 text-[11px] leading-relaxed text-[#77736D]">
                  Mendukung printer Bluetooth, USB desktop, pembuka laci kasir, dan tiket barista terpisah.
                </p>
              </div>
            </div>
          </article>
        </div>
      </div>
    </section>
  )
}
