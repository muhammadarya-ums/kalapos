"use client"

import { useEffect, useState } from "react"
import { ArrowRight } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Dialog } from "@/components/ui/dialog"
import { CurrencyInput, FieldLabel, Input } from "@/components/ui/input"
import { Select } from "@/components/ui/select"
import type { Branch, Ingredient } from "@/lib/kalapos/types"

export interface IngredientCrudModalProps {
  open: boolean
  editingIngredient: Ingredient | null
  defaultMinThreshold?: number
  defaultBranchId?: string | null
  allowBranchSelect?: boolean
  branches?: Branch[]
  onClose: () => void
  onSubmit: (payload: {
    sku: string
    name: string
    unit: string
    cost_per_unit: number
    min_threshold: number
    initial_qty?: number
    branch_id?: string | null
  }) => Promise<{ ok: boolean; error?: string }>
}

const UNIT_OPTIONS = [
  { value: "g", label: "Gram (g)" },
  { value: "ml", label: "Mililiter (ml)" },
  { value: "pcs", label: "Pcs / Buah (pcs)" },
  { value: "kg", label: "Kilogram (kg)" },
  { value: "L", label: "Liter (L)" },
]

export function IngredientCrudModal({
  open,
  editingIngredient,
  defaultMinThreshold = 0,
  defaultBranchId = null,
  allowBranchSelect = false,
  branches = [],
  onClose,
  onSubmit,
}: IngredientCrudModalProps) {
  const [name, setName] = useState("")
  const [sku, setSku] = useState("")
  const [unit, setUnit] = useState("g")
  const [costPerUnit, setCostPerUnit] = useState(0)
  const [minThreshold, setMinThreshold] = useState("500")
  const [initialQty, setInitialQty] = useState("0")
  const [branchId, setBranchId] = useState<string>(defaultBranchId ?? "ALL")
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (!open) return
    if (editingIngredient) {
      setName(editingIngredient.name)
      setSku(editingIngredient.sku)
      setUnit(editingIngredient.unit)
      setCostPerUnit(editingIngredient.cost_per_unit)
      setMinThreshold(String(defaultMinThreshold))
      setInitialQty("0")
      setBranchId(defaultBranchId ?? "ALL")
    } else {
      setName("")
      setSku("")
      setUnit("g")
      setCostPerUnit(0)
      setMinThreshold("500")
      setInitialQty("0")
      setBranchId(defaultBranchId ?? "ALL")
    }
    setError(null)
    setSubmitting(false)
  }, [open, editingIngredient, defaultMinThreshold, defaultBranchId])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      const res = await onSubmit({
        sku,
        name,
        unit,
        cost_per_unit: costPerUnit,
        min_threshold: Math.max(0, Number(minThreshold) || 0),
        initial_qty: editingIngredient ? undefined : Math.max(0, Number(initialQty) || 0),
        branch_id: branchId === "ALL" ? null : branchId,
      })
      if (!res.ok) {
        setError(res.error || "Gagal menyimpan data bahan baku.")
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
      eyebrow="STOK & BAHAN BAKU KAFE KALA"
      title={editingIngredient ? `Edit Bahan · ${editingIngredient.name}` : "Tambah Bahan Baku Baru"}
      description={
        editingIngredient
          ? "Perbarui identitas bahan, satuan, HPP per satuan, dan batas peringatan stok minimum."
          : "Bahan baku dapat langsung dihubungkan ke resep menu dan dipantau mutasinya pada setiap shift."
      }
      maxWidthClassName="max-w-lg"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="sm:col-span-2">
            <FieldLabel htmlFor="ing-name">Nama Bahan Baku</FieldLabel>
            <Input
              id="ing-name"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Contoh: Biji Kopi House Blend"
            />
          </div>
          <div>
            <FieldLabel htmlFor="ing-sku">Kode SKU</FieldLabel>
            <Input
              id="ing-sku"
              required
              value={sku}
              onChange={(e) => setSku(e.target.value.toUpperCase())}
              placeholder="ING-001"
              className="font-mono uppercase"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <FieldLabel htmlFor="ing-unit">Satuan Hitung</FieldLabel>
            <Select
              id="ing-unit"
              value={unit}
              onChange={(e) => setUnit(e.target.value)}
              options={UNIT_OPTIONS}
            />
          </div>
          <div>
            <FieldLabel htmlFor="ing-cost" hint={`per 1 ${unit}`}>
              HPP / Biaya per Satuan (Rp)
            </FieldLabel>
            <CurrencyInput
              id="ing-cost"
              value={costPerUnit}
              onChange={setCostPerUnit}
            />
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <FieldLabel htmlFor="ing-min" hint={`dalam ${unit}`}>
              Batas Minimum (Peringatan)
            </FieldLabel>
            <Input
              id="ing-min"
              type="number"
              min={0}
              step="any"
              value={minThreshold}
              onChange={(e) => setMinThreshold(e.target.value)}
              className="font-mono tabular-nums"
            />
          </div>

          {!editingIngredient && (
            <div>
              <FieldLabel htmlFor="ing-init-qty" hint={`dalam ${unit}`}>
                Stok Awal Cabang
              </FieldLabel>
              <Input
                id="ing-init-qty"
                type="number"
                min={0}
                step="any"
                value={initialQty}
                onChange={(e) => setInitialQty(e.target.value)}
                className="font-mono tabular-nums"
              />
            </div>
          )}
        </div>

        {allowBranchSelect && branches.length > 0 && (
          <div>
            <FieldLabel htmlFor="ing-branch">
              {editingIngredient ? "Terapkan Batas Minimum ke" : "Terapkan Stok Awal ke"}
            </FieldLabel>
            <Select
              id="ing-branch"
              value={branchId}
              onChange={(e) => setBranchId(e.target.value)}
              options={[
                { value: "ALL", label: `Semua Cabang Aktif (${branches.length})` },
                ...branches.map((b) => ({
                  value: b.id,
                  label: `${b.name} (${b.code})`,
                })),
              ]}
            />
          </div>
        )}

        {error && (
          <p className="rounded-md border border-[#FECACA] bg-[#FEF2F2] px-3 py-2 text-xs text-[#991B1B]">
            {error}
          </p>
        )}

        <div className="flex gap-2 pt-1">
          <Button
            variant="outline"
            size="md"
            className="flex-1"
            disabled={submitting}
            onClick={onClose}
          >
            Batal
          </Button>
          <Button type="submit" variant="default" size="md" className="flex-1" disabled={submitting}>
            {submitting
              ? "Menyimpan…"
              : editingIngredient
              ? "Simpan Perubahan"
              : "Tambahkan Bahan"}
            {!submitting && <ArrowRight className="h-4 w-4" strokeWidth={1.5} />}
          </Button>
        </div>
      </form>
    </Dialog>
  )
}
