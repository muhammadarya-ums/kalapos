"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import {
  Archive,
  ArrowRight,
  Edit3,
  MapPin,
  Phone,
  Plus,
  RotateCcw,
  ShieldAlert,
  Store,
  Trash2,
  UserPlus,
  Users,
} from "lucide-react"
import { BranchCrudModal } from "@/components/owner/branch-crud-modal"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Dialog } from "@/components/ui/dialog"
import { FieldLabel, Input } from "@/components/ui/input"
import { Select } from "@/components/ui/select"
import {
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Tabs } from "@/components/ui/tabs"
import { useToast } from "@/components/ui/toast"
import { computeBranchLeaderboard } from "@/lib/kalapos/analytics"
import { useKalaPOS } from "@/lib/kalapos/context"
import { formatDateShortID, formatIDR, getInitials } from "@/lib/kalapos/format"
import type { Branch, Role } from "@/lib/kalapos/types"

const ROLE_LABELS: Record<Role, string> = {
  OWNER: "Owner",
  MANAGER: "Manager",
  CASHIER: "Kasir",
  BARISTA: "Barista",
}

type StaffRole = Exclude<Role, "OWNER">

export default function OwnerBranchesPage() {
  const { toast } = useToast()
  const {
    state,
    session,
    setActiveBranchId,
    createBranch,
    updateBranch,
    archiveBranch,
    restoreBranch,
    deleteBranch,
    createStaff,
    toggleStaffActive,
    deleteStaff,
  } = useKalaPOS()

  const [sectionTab, setSectionTab] = useState<"BRANCHES" | "STAFF">("BRANCHES")
  const [modalOpen, setModalOpen] = useState(false)
  const [editingBranch, setEditingBranch] = useState<Branch | null>(null)
  const [removeTarget, setRemoveTarget] = useState<{
    branch: Branch
    mode: "ARCHIVE" | "DELETE"
  } | null>(null)
  const [busyAction, setBusyAction] = useState(false)

  // Staff creation modal
  const [staffModalOpen, setStaffModalOpen] = useState(false)
  const [staffName, setStaffName] = useState("")
  const [staffEmail, setStaffEmail] = useState("")
  const [staffPassword, setStaffPassword] = useState("")
  const [staffRole, setStaffRole] = useState<StaffRole>("CASHIER")
  const [staffBranchId, setStaffBranchId] = useState<string>("")
  const [staffPin, setStaffPin] = useState("")
  const [staffError, setStaffError] = useState<string | null>(null)
  const [staffSubmitting, setStaffSubmitting] = useState(false)

  const perfByBranch = useMemo(() => {
    const rows = computeBranchLeaderboard(state, "30D")
    return new Map(rows.map((r) => [r.branch.id, r]))
  }, [state])

  const orderCountByBranch = useMemo(() => {
    const m = new Map<string, number>()
    for (const o of state.orders) {
      m.set(o.branch_id, (m.get(o.branch_id) ?? 0) + 1)
    }
    return m
  }, [state.orders])

  const activeList = useMemo(
    () => state.branches.filter((b) => !b.deleted_at),
    [state.branches]
  )
  const archivedList = useMemo(
    () => state.branches.filter((b) => Boolean(b.deleted_at)),
    [state.branches]
  )
  const branchMap = useMemo(
    () => new Map(state.branches.map((b) => [b.id, b])),
    [state.branches]
  )

  const openStaffModal = () => {
    setStaffName("")
    setStaffEmail("")
    setStaffPassword("")
    setStaffRole("CASHIER")
    setStaffBranchId(activeList.find((b) => b.status !== "INACTIVE")?.id ?? activeList[0]?.id ?? "")
    setStaffPin("")
    setStaffError(null)
    setStaffModalOpen(true)
  }

  const handleCreateStaff = async (e: React.FormEvent) => {
    e.preventDefault()
    setStaffError(null)
    const targetBranch = staffBranchId || activeList[0]?.id || ""
    if (!targetBranch) {
      setStaffError("Tambahkan cabang aktif Kafe Kala terlebih dahulu.")
      return
    }
    setStaffSubmitting(true)
    try {
      const res = await createStaff({
        fullName: staffName,
        email: staffEmail,
        password: staffPassword,
        role: staffRole,
        branchId: targetBranch,
        pin: staffPin,
      })
      if (!res.ok) {
        setStaffError(res.error || "Gagal menambahkan akun staf.")
        return
      }
      toast(`Akun ${ROLE_LABELS[staffRole]} untuk ${staffName} berhasil ditambahkan.`)
      setStaffModalOpen(false)
    } finally {
      setStaffSubmitting(false)
    }
  }

  return (
    <div className="mx-auto max-w-[1440px] space-y-6 p-5 sm:p-8">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[#8E8982]">
            KAFE KALA · CABANG &amp; TIM INTERNAL
          </p>
          <h2 className="mt-1 text-2xl font-semibold tracking-[-0.025em] text-[#18181B]">
            {sectionTab === "BRANCHES"
              ? `Cabang Kafe Kala (${activeList.length})`
              : `Akun Staf & PIN (${state.users.length})`}
          </h2>
          <p className="mt-1 text-xs text-[#77736D]">
            {sectionTab === "BRANCHES"
              ? "Tambah, perbarui, arsipkan, atau hapus cabang operasional Kafe Kala langsung dari konsol Owner."
              : "Hanya Owner yang dapat menerbitkan, menonaktifkan, atau menghapus akun login dan PIN staf Kafe Kala."}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <Tabs
            value={sectionTab}
            onChange={setSectionTab}
            options={[
              { value: "BRANCHES", label: "Cabang", count: activeList.length },
              { value: "STAFF", label: "Staf & PIN", count: state.users.length },
            ]}
          />
          {sectionTab === "BRANCHES" ? (
            <Button
              variant="default"
              size="md"
              onClick={() => {
                setEditingBranch(null)
                setModalOpen(true)
              }}
            >
              <Plus className="h-4 w-4" strokeWidth={1.5} />
              Tambah Cabang
            </Button>
          ) : (
            <Button
              variant="default"
              size="md"
              disabled={activeList.length === 0}
              onClick={openStaffModal}
              title={
                activeList.length === 0
                  ? "Tambahkan cabang terlebih dahulu sebelum menambah staf"
                  : undefined
              }
            >
              <UserPlus className="h-4 w-4" strokeWidth={1.5} />
              Tambah Akun Staf
            </Button>
          )}
        </div>
      </div>

      {sectionTab === "BRANCHES" ? (
        <>
          {activeList.length === 0 ? (
            <section className="rounded-xl border border-dashed border-[#D6D2C9] bg-white px-6 py-14 text-center">
              <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full border border-[#E5E2DC] bg-[#FAF9F7] text-[#67625B]">
                <Store className="h-5 w-5" strokeWidth={1.5} />
              </span>
              <h3 className="mt-4 text-base font-semibold text-[#18181B]">
                Belum ada cabang Kafe Kala
              </h3>
              <p className="mx-auto mt-1.5 max-w-md text-xs leading-relaxed text-[#77736D]">
                Semua data cabang dummy sudah dibersihkan. Tambahkan cabang pertama Kafe Kala untuk mulai mengatur kasir, tarif PB1, dan akun staf cabang.
              </p>
              <Button
                variant="default"
                size="md"
                className="mt-5"
                onClick={() => {
                  setEditingBranch(null)
                  setModalOpen(true)
                }}
              >
                <Plus className="h-4 w-4" strokeWidth={1.5} />
                Tambah Cabang Pertama
              </Button>
            </section>
          ) : (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
              {activeList.map((branch) => {
                const perf = perfByBranch.get(branch.id)
                const totalOrders = orderCountByBranch.get(branch.id) ?? 0
                const alerts = (perf?.criticalStockCount ?? 0) + (perf?.lowStockCount ?? 0)

                return (
                  <article
                    key={branch.id}
                    className="flex flex-col justify-between rounded-lg border border-[#E5E2DC] bg-white p-5"
                  >
                    <div>
                      <div className="flex items-start justify-between gap-2">
                        <span className="flex h-10 w-10 items-center justify-center rounded-md bg-[#F1E8DC] font-mono text-xs font-semibold text-[#6B4E3D]">
                          {branch.code.slice(-2)}
                        </span>
                        <div className="flex items-center gap-1">
                          <Button
                            variant="ghost"
                            size="iconSm"
                            aria-label={`Edit ${branch.name}`}
                            title="Edit cabang"
                            onClick={() => {
                              setEditingBranch(branch)
                              setModalOpen(true)
                            }}
                          >
                            <Edit3 className="h-4 w-4 text-[#67625B]" strokeWidth={1.5} />
                          </Button>
                          <Button
                            variant="ghost"
                            size="iconSm"
                            aria-label={`Arsipkan ${branch.name}`}
                            title="Arsipkan sementara"
                            onClick={() => setRemoveTarget({ branch, mode: "ARCHIVE" })}
                          >
                            <Archive
                              className="h-4 w-4 text-[#8E8982] hover:text-[#A16207]"
                              strokeWidth={1.5}
                            />
                          </Button>
                          <Button
                            variant="ghost"
                            size="iconSm"
                            aria-label={`Hapus ${branch.name}`}
                            title="Hapus permanen"
                            onClick={() => setRemoveTarget({ branch, mode: "DELETE" })}
                          >
                            <Trash2
                              className="h-4 w-4 text-[#8E8982] hover:text-[#991B1B]"
                              strokeWidth={1.5}
                            />
                          </Button>
                        </div>
                      </div>

                      <p className="mt-4 font-mono text-[11px] text-[#8E8982]">{branch.code}</p>
                      <h3 className="mt-0.5 text-lg font-semibold tracking-tight text-[#18181B]">
                        {branch.name}
                      </h3>

                      <div className="mt-2 space-y-1 text-xs text-[#67625B]">
                        <p className="flex items-start gap-1.5">
                          <MapPin
                            className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#9A958E]"
                            strokeWidth={1.5}
                          />
                          <span>{branch.address}</span>
                        </p>
                        <p className="flex items-center gap-1.5 font-mono text-[11px]">
                          <Phone
                            className="h-3.5 w-3.5 shrink-0 text-[#9A958E]"
                            strokeWidth={1.5}
                          />
                          <span>{branch.phone}</span>
                        </p>
                      </div>

                      <div className="mt-3.5 flex flex-wrap items-center justify-between gap-2">
                        <Badge
                          variant={
                            branch.status === "ACTIVE"
                              ? "aman"
                              : branch.status === "RENOVATION"
                              ? "menipis"
                              : "kritis"
                          }
                          dot
                        >
                          {branch.status === "ACTIVE"
                            ? "Beroperasi"
                            : branch.status === "RENOVATION"
                            ? "Renovasi"
                            : "Nonaktif"}
                        </Badge>
                        <span className="font-mono text-[11px] text-[#8E8982]">
                          PB1 {branch.tax_rate}%
                          {branch.service_charge_rate > 0 && ` · SC ${branch.service_charge_rate}%`}
                        </span>
                      </div>
                    </div>

                    <div className="mt-4">
                      <div className="grid grid-cols-2 gap-3 border-y border-[#EFECE7] py-3.5">
                        <div>
                          <p className="text-[10px] text-[#8E8982]">Omset 30 Hari</p>
                          <p className="mt-1 font-mono text-sm font-semibold tabular-nums text-[#18181B]">
                            {formatIDR(perf?.revenue ?? 0)}
                          </p>
                        </div>
                        <div className="border-l border-[#EFECE7] pl-3">
                          <p className="text-[10px] text-[#8E8982]">Total Pesanan</p>
                          <p className="mt-1 font-mono text-sm font-semibold tabular-nums text-[#18181B]">
                            {totalOrders} transaksi
                          </p>
                        </div>
                      </div>

                      <div className="mt-3 flex items-center justify-between text-xs">
                        <span
                          className={alerts > 0 ? "font-medium text-[#A16207]" : "text-[#8E8982]"}
                        >
                          {alerts > 0 ? `${alerts} stok perlu perhatian` : "Siap beroperasi"}
                        </span>
                        <Link
                          href="/pos"
                          onClick={() => setActiveBranchId(branch.id)}
                          className="inline-flex items-center gap-1 font-semibold text-[#18181B] hover:text-[#C2572A]"
                        >
                          Buka POS
                          <ArrowRight className="h-3.5 w-3.5" strokeWidth={1.5} />
                        </Link>
                      </div>
                    </div>
                  </article>
                )
              })}
            </div>
          )}

          {/* Soft-Deleted / Archived Branches */}
          {archivedList.length > 0 && (
            <section className="rounded-lg border border-[#E5E2DC] bg-white p-5">
              <div className="mb-3">
                <h3 className="text-sm font-semibold text-[#18181B]">
                  Cabang Diarsipkan ({archivedList.length})
                </h3>
                <p className="text-xs text-[#8E8982]">
                  Cabang yang diarsipkan disembunyikan dari Login &amp; POS, namun dapat dipulihkan atau dihapus permanen.
                </p>
              </div>
              <div className="divide-y divide-[#EFECE7]">
                {archivedList.map((branch) => (
                  <div
                    key={branch.id}
                    className="flex flex-wrap items-center justify-between gap-3 py-3 text-xs"
                  >
                    <div>
                      <p className="font-semibold text-[#4A4640]">
                        {branch.name}{" "}
                        <span className="font-mono text-[11px] text-[#8E8982]">({branch.code})</span>
                      </p>
                      <p className="text-[11px] text-[#8E8982]">
                        Diarsipkan {branch.deleted_at ? formatDateShortID(branch.deleted_at) : ""} ·{" "}
                        {orderCountByBranch.get(branch.id) ?? 0} transaksi tercatat
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={async () => {
                          const res = await restoreBranch(branch.id)
                          if (res.ok) toast(`Cabang ${branch.name} diaktifkan kembali.`)
                          else toast(res.error || "Gagal memulihkan cabang.", "error")
                        }}
                      >
                        <RotateCcw className="h-3.5 w-3.5" strokeWidth={1.5} />
                        Aktifkan Kembali
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-[#991B1B] hover:bg-[#FEF2F2] hover:text-[#991B1B]"
                        onClick={() => setRemoveTarget({ branch, mode: "DELETE" })}
                      >
                        <Trash2 className="h-3.5 w-3.5" strokeWidth={1.5} />
                        Hapus
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}
        </>
      ) : (
        /* STAFF & PIN MANAGEMENT TABLE */
        <section className="overflow-hidden rounded-lg border border-[#E5E2DC] bg-white">
          <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
            <div className="flex items-center gap-2.5">
              <Users className="h-4 w-4 text-[#67625B]" strokeWidth={1.5} />
              <div>
                <h3 className="text-sm font-semibold text-[#18181B]">Daftar Akun Internal Kafe Kala</h3>
                <p className="text-xs text-[#8E8982]">
                  Kredensial staf disimpan &amp; diverifikasi di server. Staf hanya dapat mengakses cabang yang ditugaskan.
                </p>
              </div>
            </div>
            {activeList.length === 0 && (
              <Badge variant="menipis">Tambahkan minimal 1 cabang sebelum menambah staf</Badge>
            )}
          </div>

          <TableContainer>
            <TableHeader>
              <tr>
                <TableHead>Nama</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Peran</TableHead>
                <TableHead>Cabang Penugasan</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Aksi</TableHead>
              </tr>
            </TableHeader>
            <TableBody>
              {state.users.map((u) => {
                const isSelf = u.id === session?.userId || u.role === "OWNER"
                const assignedBranch = u.branch_id ? branchMap.get(u.branch_id) : null
                return (
                  <TableRow key={u.id}>
                    <TableCell>
                      <div className="flex items-center gap-2.5">
                        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[#F1E8DC] font-mono text-[10px] font-semibold text-[#6B4E3D]">
                          {getInitials(u.full_name)}
                        </span>
                        <span className="font-semibold text-[#18181B]">
                          {u.full_name}
                          {u.id === session?.userId && (
                            <span className="ml-1.5 text-[10px] font-normal text-[#8E8982]">
                              (Anda)
                            </span>
                          )}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="font-mono text-xs text-[#57534E]">{u.email}</TableCell>
                    <TableCell>
                      <Badge variant={u.role === "OWNER" ? "espresso" : "default"}>
                        {ROLE_LABELS[u.role]}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {u.role === "OWNER" ? (
                        <span className="text-xs text-[#67625B]">Seluruh Cabang Kala</span>
                      ) : assignedBranch ? (
                        <span className="text-xs font-medium text-[#18181B]">
                          {assignedBranch.name}{" "}
                          <span className="font-mono text-[10px] text-[#8E8982]">
                            ({assignedBranch.code})
                          </span>
                        </span>
                      ) : (
                        <span className="text-xs text-[#991B1B]">Cabang dihapus</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge variant={u.is_active ? "aman" : "kritis"} dot>
                        {u.is_active ? "Aktif" : "Nonaktif"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      {!isSelf && (
                        <div className="inline-flex items-center gap-1.5">
                          <Button
                            variant="outline"
                            size="xs"
                            onClick={async () => {
                              const res = await toggleStaffActive(u.id)
                              if (res.ok && res.data) {
                                toast(
                                  res.data.is_active
                                    ? `Akun ${u.full_name} diaktifkan.`
                                    : `Akun ${u.full_name} dinonaktifkan.`,
                                  "info"
                                )
                              } else {
                                toast(res.error || "Gagal mengubah status staf.", "error")
                              }
                            }}
                          >
                            {u.is_active ? "Nonaktifkan" : "Aktifkan"}
                          </Button>
                          <Button
                            variant="ghost"
                            size="xs"
                            className="text-[#991B1B] hover:bg-[#FEF2F2] hover:text-[#991B1B]"
                            onClick={async () => {
                              const res = await deleteStaff(u.id)
                              if (res.ok) toast(`Akun staf ${u.full_name} dihapus.`, "info")
                              else toast(res.error || "Gagal menghapus staf.", "error")
                            }}
                          >
                            Hapus
                          </Button>
                        </div>
                      )}
                    </TableCell>
                  </TableRow>
                )
              })}
              {state.users.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="py-10 text-center text-xs text-[#8E8982]">
                    Memuat daftar akun…
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </TableContainer>
        </section>
      )}

      {/* Add / Edit Branch Modal */}
      <BranchCrudModal
        open={modalOpen}
        editingBranch={editingBranch}
        onClose={() => setModalOpen(false)}
        onSubmit={async (input, branchId) => {
          const res = branchId ? await updateBranch(branchId, input) : await createBranch(input)
          if (res.ok) {
            toast(
              branchId
                ? `Perubahan cabang ${input.name} disimpan.`
                : `Cabang baru ${input.name} (${input.code}) ditambahkan ke Kafe Kala.`
            )
          }
          return res
        }}
      />

      {/* Add Staff Account Modal */}
      <Dialog
        open={staffModalOpen}
        onClose={() => setStaffModalOpen(false)}
        eyebrow="MANAJEMEN TIM KAFE KALA"
        title="Tambah Akun Staf Baru"
        description="Buat kredensial Email, Kata Sandi, dan PIN 4-digit untuk anggota tim cabang Kafe Kala."
        maxWidthClassName="max-w-md"
      >
        <form onSubmit={handleCreateStaff} className="space-y-3.5">
          <div>
            <FieldLabel htmlFor="st-name">Nama Lengkap</FieldLabel>
            <Input
              id="st-name"
              required
              value={staffName}
              onChange={(e) => setStaffName(e.target.value)}
              placeholder="Contoh: Reza Mahendra"
            />
          </div>

          <div>
            <FieldLabel htmlFor="st-email">Email Staf</FieldLabel>
            <Input
              id="st-email"
              type="email"
              required
              value={staffEmail}
              onChange={(e) => setStaffEmail(e.target.value)}
              placeholder="staf@kala.id"
            />
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <FieldLabel htmlFor="st-role">Peran</FieldLabel>
              <Select
                id="st-role"
                value={staffRole}
                onChange={(e) => setStaffRole(e.target.value as StaffRole)}
                options={[
                  { value: "CASHIER", label: "Kasir" },
                  { value: "BARISTA", label: "Barista" },
                  { value: "MANAGER", label: "Manager Cabang" },
                ]}
              />
            </div>

            <div>
              <FieldLabel htmlFor="st-branch">Cabang Penugasan</FieldLabel>
              <Select
                id="st-branch"
                value={staffBranchId}
                onChange={(e) => setStaffBranchId(e.target.value)}
                options={activeList.map((b) => ({
                  value: b.id,
                  label: `${b.name} (${b.code})`,
                }))}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <FieldLabel htmlFor="st-pass">Kata Sandi</FieldLabel>
              <Input
                id="st-pass"
                type="password"
                required
                minLength={8}
                value={staffPassword}
                onChange={(e) => setStaffPassword(e.target.value)}
                placeholder="Min. 8 karakter"
              />
            </div>

            <div>
              <FieldLabel htmlFor="st-pin">PIN Staf (4 Digit)</FieldLabel>
              <Input
                id="st-pin"
                type="password"
                inputMode="numeric"
                pattern="\d{4}"
                maxLength={4}
                required
                value={staffPin}
                onChange={(e) => setStaffPin(e.target.value.replace(/[^\d]/g, "").slice(0, 4))}
                className="font-mono tracking-[0.35em]"
                placeholder="••••"
              />
            </div>
          </div>

          {staffError && (
            <p className="rounded-md border border-[#FECACA] bg-[#FEF2F2] px-3 py-2 text-xs text-[#991B1B]">
              {staffError}
            </p>
          )}

          <div className="flex gap-2 pt-2">
            <Button
              variant="outline"
              size="md"
              className="flex-1"
              disabled={staffSubmitting}
              onClick={() => setStaffModalOpen(false)}
            >
              Batal
            </Button>
            <Button type="submit" variant="default" size="md" className="flex-1" disabled={staffSubmitting}>
              {staffSubmitting ? "Menyimpan…" : "Simpan Akun Staf"}
            </Button>
          </div>
        </form>
      </Dialog>

      {/* Archive or Permanent Delete Branch Confirmation Dialog */}
      <Dialog
        open={Boolean(removeTarget)}
        onClose={() => setRemoveTarget(null)}
        eyebrow={removeTarget?.mode === "DELETE" ? "HAPUS PERMANEN CABANG" : "ARSIPKAN CABANG"}
        title={
          removeTarget?.mode === "DELETE"
            ? `Hapus permanen ${removeTarget.branch.name}?`
            : `Nonaktifkan ${removeTarget?.branch.name ?? ""}?`
        }
        maxWidthClassName="max-w-md"
      >
        <div className="space-y-4">
          <div className="flex items-start gap-2.5 rounded-md border border-[#FDE68A] bg-[#FFFBEB] p-3 text-xs text-[#92400E]">
            <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-[#A16207]" strokeWidth={1.5} />
            {removeTarget?.mode === "DELETE" ? (
              <span>
                Cabang <strong>{removeTarget.branch.name}</strong> akan dihapus permanen dari daftar cabang Kafe Kala. Staf yang ditugaskan di cabang ini otomatis dinonaktifkan, sementara catatan omset historis tetap tersimpan pada ringkasan keuangan.
              </span>
            ) : (
              <span>
                Cabang ini memiliki{" "}
                <strong className="font-mono">
                  {removeTarget ? orderCountByBranch.get(removeTarget.branch.id) ?? 0 : 0} transaksi
                </strong>
                . Mengarsipkan cabang akan menyembunyikannya dari Login dan POS, dan masih dapat diaktifkan kembali kapan saja.
              </span>
            )}
          </div>

          <div className="flex gap-2">
            <Button
              variant="outline"
              size="md"
              className="flex-1"
              disabled={busyAction}
              onClick={() => setRemoveTarget(null)}
            >
              Batal
            </Button>
            <Button
              variant="destructiveSolid"
              size="md"
              className="flex-1"
              disabled={busyAction}
              onClick={async () => {
                if (!removeTarget) return
                setBusyAction(true)
                try {
                  if (removeTarget.mode === "DELETE") {
                    const res = await deleteBranch(removeTarget.branch.id)
                    if (!res.ok) {
                      toast(res.error || "Gagal menghapus cabang.", "error")
                      return
                    }
                    toast(`Cabang ${removeTarget.branch.name} berhasil dihapus.`, "info")
                  } else {
                    const res = await archiveBranch(removeTarget.branch.id)
                    if (!res.ok) {
                      toast(res.error || "Gagal mengarsipkan cabang.", "error")
                      return
                    }
                    toast(`Cabang ${removeTarget.branch.name} berhasil diarsipkan.`, "info")
                  }
                  setRemoveTarget(null)
                } finally {
                  setBusyAction(false)
                }
              }}
            >
              {removeTarget?.mode === "DELETE" ? (
                <>
                  <Trash2 className="h-4 w-4" strokeWidth={1.5} />
                  {busyAction ? "Menghapus…" : "Hapus Permanen"}
                </>
              ) : (
                <>
                  <Archive className="h-4 w-4" strokeWidth={1.5} />
                  {busyAction ? "Mengarsipkan…" : "Arsipkan Cabang"}
                </>
              )}
            </Button>
          </div>
        </div>
      </Dialog>
    </div>
  )
}
