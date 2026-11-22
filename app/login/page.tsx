"use client"

import { Suspense, useEffect, useState } from "react"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import {
  Activity,
  ArrowLeft,
  ArrowRight,
  Eye,
  EyeOff,
  KeyRound,
  LayoutDashboard,
  Lock,
  LogOut,
  Mail,
  ShieldCheck,
  ShoppingCart,
  Store,
} from "lucide-react"
import { BrandLogo } from "@/components/ui/brand-logo"
import { Button } from "@/components/ui/button"
import { FieldLabel, Input } from "@/components/ui/input"
import { PinPad } from "@/components/ui/pin-pad"
import { Select } from "@/components/ui/select"
import { Tabs } from "@/components/ui/tabs"
import { useToast } from "@/components/ui/toast"
import { defaultRouteForRole, fetchPublicBranches } from "@/lib/kalapos/auth"
import { useKalaPOS } from "@/lib/kalapos/context"
import type { PublicBranchInfo, Role } from "@/lib/kalapos/types"

type LoginMethod = "EMAIL" | "PIN"

function LoginContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { toast } = useToast()
  const { session, loginWithEmail, loginWithPin, logout } = useKalaPOS()

  const nextParam = searchParams.get("next")

  const [loginMethod, setLoginMethod] = useState<LoginMethod>("EMAIL")
  const [publicBranches, setPublicBranches] = useState<PublicBranchInfo[]>([])
  const [branchesLoaded, setBranchesLoaded] = useState(false)
  const [selectedBranchId, setSelectedBranchId] = useState<string>("")

  // Email login state
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [rememberMe, setRememberMe] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  // PIN login state
  const [pin, setPin] = useState("")
  const [pinError, setPinError] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    void fetchPublicBranches().then((list) => {
      if (!active) return
      setPublicBranches(list)
      setBranchesLoaded(true)
      if (list.length > 0) {
        setSelectedBranchId((prev) => (list.some((b) => b.id === prev) ? prev : list[0].id))
      } else {
        setSelectedBranchId("")
      }
    })
    return () => {
      active = false
    }
  }, [])

  const redirectAfterAuth = (role: Role) => {
    if (nextParam) {
      if (nextParam.startsWith("/owner") && role !== "OWNER") {
        router.replace(defaultRouteForRole(role))
        router.refresh()
        return
      }
      if (nextParam === "/pos/shift" && role === "BARISTA") {
        router.replace("/pos/queue")
        router.refresh()
        return
      }
      router.replace(nextParam)
      router.refresh()
      return
    }
    router.replace(defaultRouteForRole(role))
    router.refresh()
  }

  const handleEmailSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    setFormError(null)

    if (!email.trim() || !password) {
      setFormError("Masukkan email dan kata sandi Anda.")
      return
    }

    setSubmitting(true)
    try {
      const res = await loginWithEmail(email, password, rememberMe)
      if (!res.ok || !res.session) {
        setFormError(res.error || "Email atau kata sandi tidak sesuai.")
        return
      }
      toast(`Selamat datang kembali, ${res.session.fullName}`)
      redirectAfterAuth(res.session.role)
    } finally {
      setSubmitting(false)
    }
  }

  const handlePinComplete = async (enteredPin: string) => {
    setPinError(null)
    const branchId = selectedBranchId || publicBranches[0]?.id || ""
    if (!branchId) {
      setPinError("Belum ada cabang aktif Kafe Kala yang tersedia.")
      setPin("")
      return
    }

    setSubmitting(true)
    try {
      const res = await loginWithPin(enteredPin, branchId)
      if (!res.ok || !res.session) {
        setPinError(res.error || "PIN tidak valid untuk cabang ini.")
        setPin("")
        return
      }
      toast(`Akses diterima · ${res.session.fullName}`)
      redirectAfterAuth(res.session.role)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="grid min-h-screen grid-cols-1 bg-[#F8F7F4] lg:grid-cols-12">
      {/* Left Architectural Brand Panel */}
      <aside className="flex flex-col justify-between border-b border-[#E5E2DC] bg-white p-6 sm:p-10 lg:col-span-5 lg:border-r lg:border-b-0">
        <div>
          <div className="flex items-center justify-between">
            <BrandLogo href="/" subtitle="KAFE KALA" />
            <Link
              href="/"
              className="inline-flex items-center gap-1.5 text-xs font-medium text-[#77736D] transition-colors hover:text-[#18181B]"
            >
              <ArrowLeft className="h-3.5 w-3.5" strokeWidth={1.5} />
              Beranda
            </Link>
          </div>

          <div className="mt-14 max-w-md">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#C2572A]">
              PORTAL INTERNAL · KAFE KALA
            </p>
            <h1 className="mt-3 text-3xl font-semibold leading-tight tracking-[-0.03em] text-[#18181B]">
              Akses tertutup khusus operasional Kafe Kala.
            </h1>
            <p className="mt-3 text-sm leading-relaxed text-[#67625B]">
              Masuk menggunakan akun resmi Owner atau akun staf cabang Kafe Kala yang telah didaftarkan oleh Owner.
            </p>
          </div>

          <div className="mt-10 space-y-3">
            {[
              {
                icon: LayoutDashboard,
                title: "Owner Kafe Kala",
                desc: "Kendali penuh penambahan, pembaruan, pengurangan cabang, akun tim, dan laporan omset.",
              },
              {
                icon: ShoppingCart,
                title: "Kasir & Manager Cabang",
                desc: "Akses terminal POS, open bill, dan rekonsiliasi shift terkunci pada cabang penugasan.",
              },
              {
                icon: Activity,
                title: "Barista Cabang",
                desc: "Layar antrean produksi KDS dan pemantauan bahan baku di cabang masing-masing.",
              },
            ].map((roleInfo) => {
              const Icon = roleInfo.icon
              return (
                <div
                  key={roleInfo.title}
                  className="flex items-start gap-3.5 rounded-lg border border-[#EFECE7] bg-[#FAF9F7] p-3.5"
                >
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-[#E5E2DC] bg-white text-[#18181B]">
                    <Icon className="h-4 w-4" strokeWidth={1.5} />
                  </span>
                  <div>
                    <p className="text-xs font-semibold text-[#18181B]">{roleInfo.title}</p>
                    <p className="mt-0.5 text-[11px] leading-relaxed text-[#77736D]">
                      {roleInfo.desc}
                    </p>
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        <p className="mt-10 flex items-center gap-2 border-t border-[#EFECE7] pt-5 text-[11px] text-[#8E8982]">
          <ShieldCheck className="h-4 w-4 shrink-0 text-[#166534]" strokeWidth={1.5} />
          Autentikasi diverifikasi server · Pendaftaran publik dinonaktifkan.
        </p>
      </aside>

      {/* Right Authentication Form Panel */}
      <main className="flex items-center justify-center p-6 sm:p-10 lg:col-span-7">
        <div className="w-full max-w-md space-y-5">
          {session && (
            <div className="flex items-center justify-between gap-3 rounded-lg border border-[#E5E2DC] bg-white px-4 py-3 text-xs">
              <div className="min-w-0">
                <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[#8E8982]">
                  SEDANG MASUK SEBAGAI
                </p>
                <p className="mt-0.5 truncate font-semibold text-[#18181B]">
                  {session.fullName} · {session.role}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-1.5">
                <Link href={defaultRouteForRole(session.role)}>
                  <Button variant="outline" size="sm">
                    Lanjutkan
                    <ArrowRight className="h-3.5 w-3.5" strokeWidth={1.5} />
                  </Button>
                </Link>
                <Button
                  variant="ghost"
                  size="iconSm"
                  title="Keluar sesi"
                  aria-label="Keluar sesi"
                  onClick={async () => {
                    await logout()
                    toast("Sesi ditutup.", "info")
                    router.refresh()
                  }}
                >
                  <LogOut className="h-3.5 w-3.5 text-[#8E8982] hover:text-[#991B1B]" strokeWidth={1.5} />
                </Button>
              </div>
            </div>
          )}

          <div className="rounded-xl border border-[#E5E2DC] bg-white p-6 sm:p-7">
            <div className="mb-5">
              <h2 className="text-xl font-semibold tracking-tight text-[#18181B]">
                Masuk ke Kafe Kala
              </h2>
              <p className="mt-1 text-xs text-[#77736D]">
                Gunakan kredensial resmi Owner atau PIN staf yang aktif di cabang Kafe Kala.
              </p>
            </div>

            <Tabs
              fullWidth
              value={loginMethod}
              onChange={(next) => {
                setLoginMethod(next)
                setFormError(null)
                setPinError(null)
                setPin("")
              }}
              options={[
                { value: "EMAIL", label: "Email & Sandi" },
                { value: "PIN", label: "PIN Staf Cabang" },
              ]}
            />

            {loginMethod === "EMAIL" ? (
              <form onSubmit={handleEmailSubmit} className="mt-5 space-y-4">
                <div>
                  <FieldLabel htmlFor="login-email">Alamat Email</FieldLabel>
                  <div className="relative">
                    <Mail
                      className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-[#8E8982]"
                      strokeWidth={1.5}
                    />
                    <Input
                      id="login-email"
                      type="email"
                      autoComplete="email"
                      required
                      value={email}
                      onChange={(e) => {
                        setEmail(e.target.value)
                        if (formError) setFormError(null)
                      }}
                      className="pl-9"
                      placeholder="owner@kala.id"
                    />
                  </div>
                </div>

                <div>
                  <FieldLabel htmlFor="login-password">Kata Sandi</FieldLabel>
                  <div className="relative">
                    <Lock
                      className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-[#8E8982]"
                      strokeWidth={1.5}
                    />
                    <Input
                      id="login-password"
                      type={showPassword ? "text" : "password"}
                      autoComplete="current-password"
                      required
                      value={password}
                      onChange={(e) => {
                        setPassword(e.target.value)
                        if (formError) setFormError(null)
                      }}
                      className="pr-10 pl-9"
                      placeholder="Masukkan kata sandi"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((v) => !v)}
                      aria-label={showPassword ? "Sembunyikan sandi" : "Tampilkan sandi"}
                      className="absolute top-1/2 right-2.5 -translate-y-1/2 rounded p-1 text-[#8E8982] hover:text-[#18181B] cursor-pointer"
                    >
                      {showPassword ? (
                        <EyeOff className="h-4 w-4" strokeWidth={1.5} />
                      ) : (
                        <Eye className="h-4 w-4" strokeWidth={1.5} />
                      )}
                    </button>
                  </div>
                </div>

                <div className="flex items-center justify-between pt-0.5 text-xs">
                  <label className="inline-flex cursor-pointer items-center gap-2 text-[#57534E] select-none">
                    <input
                      type="checkbox"
                      checked={rememberMe}
                      onChange={(e) => setRememberMe(e.target.checked)}
                      className="h-3.5 w-3.5 accent-[#18181B]"
                    />
                    <span>Ingat sesi selama 30 hari</span>
                  </label>
                </div>

                {formError && (
                  <p
                    role="alert"
                    className="rounded-md border border-[#FECACA] bg-[#FEF2F2] px-3 py-2.5 text-xs text-[#991B1B]"
                  >
                    {formError}
                  </p>
                )}

                <Button
                  type="submit"
                  variant="default"
                  size="lg"
                  className="w-full"
                  disabled={submitting}
                >
                  {submitting ? "Memverifikasi…" : "Masuk"}
                  {!submitting && <ArrowRight className="h-4 w-4" strokeWidth={1.5} />}
                </Button>
              </form>
            ) : !branchesLoaded ? (
              <div className="mt-5 py-10 text-center text-xs text-[#8E8982]">
                Memuat daftar cabang aktif Kafe Kala…
              </div>
            ) : publicBranches.length === 0 ? (
              <div className="mt-5 rounded-lg border border-dashed border-[#D6D2C9] bg-[#FAF9F7] p-6 text-center">
                <span className="mx-auto flex h-10 w-10 items-center justify-center rounded-full border border-[#E5E2DC] bg-white text-[#8E8982]">
                  <Store className="h-4 w-4" strokeWidth={1.5} />
                </span>
                <p className="mt-3 text-xs font-semibold text-[#18181B]">
                  Belum ada cabang aktif Kafe Kala
                </p>
                <p className="mt-1 text-[11px] leading-relaxed text-[#77736D]">
                  Owner perlu masuk lewat tab <strong>Email &amp; Sandi</strong> terlebih dahulu untuk menambahkan cabang dan akun staf.
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-4"
                  onClick={() => setLoginMethod("EMAIL")}
                >
                  Masuk sebagai Owner
                </Button>
              </div>
            ) : (
              <div className="mt-5 space-y-4">
                <div>
                  <FieldLabel htmlFor="pin-branch">Cabang Operasional Kafe Kala</FieldLabel>
                  <Select
                    id="pin-branch"
                    value={selectedBranchId}
                    onChange={(e) => {
                      setSelectedBranchId(e.target.value)
                      setPinError(null)
                    }}
                    options={publicBranches.map((b) => ({
                      value: b.id,
                      label: `${b.name} (${b.code})`,
                    }))}
                  />
                </div>

                <div className="flex items-center gap-2 rounded-md border border-[#EFECE7] bg-[#FAF9F7] px-3 py-2 text-xs text-[#67625B]">
                  <KeyRound className="h-3.5 w-3.5 shrink-0 text-[#C2572A]" strokeWidth={1.5} />
                  <span>Masukkan 4 digit PIN pribadi staf Anda.</span>
                </div>

                <PinPad
                  value={pin}
                  disabled={submitting}
                  onChange={(next) => {
                    setPin(next)
                    if (pinError) setPinError(null)
                  }}
                  onComplete={handlePinComplete}
                  error={pinError}
                />
              </div>
            )}

            <div className="mt-6 border-t border-[#EFECE7] pt-4 text-center text-[11px] leading-relaxed text-[#8E8982]">
              Akses terbatas hanya untuk tim internal <strong>Kafe Kala</strong>. Akun staf baru dibuat langsung oleh Owner di konsol manajemen.
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-[#F8F7F4] text-xs text-[#77736D]">
          Memuat halaman masuk…
        </div>
      }
    >
      <LoginContent />
    </Suspense>
  )
}
