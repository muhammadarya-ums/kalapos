"use client"

import { useEffect, useState } from "react"
import { ArrowRight } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Dialog } from "@/components/ui/dialog"
import { FieldLabel, Input } from "@/components/ui/input"
import { Select } from "@/components/ui/select"
import type { BranchUpsertInput } from "@/lib/kalapos/store"
import type { Branch, BranchStatus } from "@/lib/kalapos/types"

export interface BranchCrudModalProps {
  open: boolean
  editingBranch: Branch | null
  onClose: () => void
  onSubmit: (
    input: BranchUpsertInput,
    branchId?: string
  ) => Promise<{ ok: boolean; error?: string }> | { ok: boolean; error?: string }
}

export function BranchCrudModal({
  open,
  editingBranch,
  onClose,
  onSubmit,
}: BranchCrudModalProps) {
  const [name, setName] = useState("")
  const [code, setCode] = useState("")
  const [address, setAddress] = useState("")
  const [phone, setPhone] = useState("")
  const [taxRate, setTaxRate] = useState("10")
  const [serviceRate, setServiceRate] = useState("0")
  const [footer, setFooter] = useState("Terima kasih telah singgah di Kafe Kala.")
  const [status, setStatus] = useState<BranchStatus>("ACTIVE")
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (!open) return
    if (editingBranch) {
      setName(editingBranch.name)
      setCode(editingBranch.code)
      setAddress(editingBranch.address)
      setPhone(editingBranch.phone)
      setTaxRate(String(editingBranch.tax_rate))
      setServiceRate(String(editingBranch.service_charge_rate))
      setFooter(editingBranch.receipt_footer)
      setStatus(editingBranch.status)
    } else {
      setName("")
      setCode("")
      setAddress("")
      setPhone("")
      setTaxRate("10")
      setServiceRate("0")
      setFooter("Terima kasih telah singgah di Kafe Kala.")
      setStatus("ACTIVE")
    }
    setError(null)
    setSubmitting(false)
  }, [open, editingBranch])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      const res = await onSubmit(
        {
          name,
          code,
          address,
          phone,
          tax_rate: Number(taxRate) || 0,
          service_charge_rate: Number(serviceRate) || 0,
          receipt_footer: footer,
          status,
        },
        editingBranch?.id
      )
      if (!res.ok) {
        setError(res.error || "Gagal menyimpan data cabang.")
        return
      }
      onClose()
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      eyebrow="CABANG KAFE KALA"
      title={editingBranch ? `Edit Cabang · ${editingBranch.name}` : "Tambah Cabang Kafe Kala"}
      description="Perubahan tersimpan di server dan langsung tersinkron ke Login PIN Staf, Terminal POS, dan Laporan Omset."
      maxWidthClassName="max-w-lg"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="sm:col-span-2">
            <FieldLabel htmlFor="br-name">Nama Cabang</FieldLabel>
            <Input
              id="br-name"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Contoh: Kala — Cabang Utama"
            />
          </div>
          <div>
            <FieldLabel htmlFor="br-code">Kode Cabang</FieldLabel>
            <Input
              id="br-code"
              required
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder="KLA-01"
              className="font-mono uppercase"
            />
          </div>
        </div>

        <div>
          <FieldLabel htmlFor="br-address">Alamat Lengkap</FieldLabel>
          <Input
            id="br-address"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            placeholder="Masukkan alamat lengkap cabang"
          />
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <FieldLabel htmlFor="br-phone">Nomor Telepon</FieldLabel>
            <Input
              id="br-phone"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="021-555-0100"
              className="font-mono"
            />
          </div>
          <div>
            <FieldLabel htmlFor="br-status">Status Operasional</FieldLabel>
            <Select
              id="br-status"
              value={status}
              onChange={(e) => setStatus(e.target.value as BranchStatus)}
              options={[
                { value: "ACTIVE", label: "Beroperasi (ACTIVE)" },
                { value: "RENOVATION", label: "Renovasi (RENOVATION)" },
                { value: "INACTIVE", label: "Nonaktif (INACTIVE)" },
              ]}
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <FieldLabel htmlFor="br-tax" hint="Persen">
              Tarif PB1 (%)
            </FieldLabel>
            <Input
              id="br-tax"
              type="number"
              min={0}
              max={100}
              value={taxRate}
              onChange={(e) => setTaxRate(e.target.value)}
              className="font-mono tabular-nums"
            />
          </div>
          <div>
            <FieldLabel htmlFor="br-service" hint="Persen">
              Service Charge (%)
            </FieldLabel>
            <Input
              id="br-service"
              type="number"
              min={0}
              max={100}
              value={serviceRate}
              onChange={(e) => setServiceRate(e.target.value)}
              className="font-mono tabular-nums"
            />
          </div>
        </div>

        <div>
          <FieldLabel htmlFor="br-footer">Footer Struk Thermal</FieldLabel>
          <Input
            id="br-footer"
            value={footer}
            onChange={(e) => setFooter(e.target.value)}
            maxLength={120}
          />
        </div>

        {error && (
          <p className="rounded-md border border-[#FECACA] bg-[#FEF2F2] px-3 py-2 text-xs text-[#991B1B]">
            {error}
          </p>
        )}

        <div className="flex gap-2 pt-2">
          <Button variant="outline" size="md" className="flex-1" onClick={onClose} disabled={submitting}>
            Batal
          </Button>
          <Button type="submit" variant="default" size="md" className="flex-1" disabled={submitting}>
            {submitting
              ? "Menyimpan…"
              : editingBranch
              ? "Simpan Perubahan"
              : "Tambahkan Cabang"}
            {!submitting && <ArrowRight className="h-4 w-4" strokeWidth={1.5} />}
          </Button>
        </div>
      </form>
    </Dialog>
  )
}
