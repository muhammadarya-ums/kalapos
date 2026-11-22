"use client"

import { useEffect, useMemo, useState } from "react"
import { ArrowLeftRight, ArrowRight } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Dialog } from "@/components/ui/dialog"
import { FieldLabel, Input } from "@/components/ui/input"
import { Select } from "@/components/ui/select"
import { useToast } from "@/components/ui/toast"
import { formatQty } from "@/lib/kalapos/format"
import type { Branch, BranchStock, Ingredient } from "@/lib/kalapos/types"

export interface StockTransferModalProps {
  open: boolean
  onClose: () => void
  branches: Branch[]
  ingredients: Ingredient[]
  branchStocks: BranchStock[]
  defaultIngredientId?: string
  defaultToBranchId?: string
  onSubmitTransfer: (payload: {
    from_branch_id: string
    to_branch_id: string
    ingredient_id: string
    qty: number
    notes: string
  }) => Promise<{ ok: boolean; error?: string }> | { ok: boolean; error?: string }
}

export function StockTransferModal({
  open,
  onClose,
  branches,
  ingredients,
  branchStocks,
  defaultIngredientId,
  defaultToBranchId,
  onSubmitTransfer,
}: StockTransferModalProps) {
  const { toast } = useToast()

  const [ingredientId, setIngredientId] = useState(defaultIngredientId || ingredients[0]?.id || "")
  const [fromBranchId, setFromBranchId] = useState(branches[0]?.id || "")
  const [toBranchId, setToBranchId] = useState(defaultToBranchId || branches[1]?.id || "")
  const [qty, setQty] = useState("")
  const [notes, setNotes] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (!open) return
    const ingId = defaultIngredientId || ingredients[0]?.id || ""
    const toId = defaultToBranchId || branches[1]?.id || branches[0]?.id || ""
    // Pick the branch with the highest stock of this ingredient as default source
    const candidates = branches.filter((b) => b.id !== toId)
    const bestFrom =
      candidates.sort((a, b) => {
        const qa =
          branchStocks.find((s) => s.branch_id === a.id && s.ingredient_id === ingId)
            ?.current_qty ?? 0
        const qb =
          branchStocks.find((s) => s.branch_id === b.id && s.ingredient_id === ingId)
            ?.current_qty ?? 0
        return qb - qa
      })[0]?.id ||
      branches[0]?.id ||
      ""

    setIngredientId(ingId)
    setToBranchId(toId)
    setFromBranchId(bestFrom)
    setQty("")
    setNotes("")
    setError(null)
  }, [open, defaultIngredientId, defaultToBranchId, branches, ingredients, branchStocks])

  const selectedIng = useMemo(
    () => ingredients.find((i) => i.id === ingredientId),
    [ingredients, ingredientId]
  )

  const fromBalance = useMemo(
    () =>
      branchStocks.find(
        (s) => s.branch_id === fromBranchId && s.ingredient_id === ingredientId
      )?.current_qty ?? 0,
    [branchStocks, fromBranchId, ingredientId]
  )

  const toBalance = useMemo(
    () =>
      branchStocks.find(
        (s) => s.branch_id === toBranchId && s.ingredient_id === ingredientId
      )?.current_qty ?? 0,
    [branchStocks, toBranchId, ingredientId]
  )

  const numericQty = Number(qty) || 0

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      const res = await onSubmitTransfer({
        from_branch_id: fromBranchId,
        to_branch_id: toBranchId,
        ingredient_id: ingredientId,
        qty: numericQty,
        notes,
      })
      if (!res.ok) {
        setError(res.error || "Gagal memproses transfer stok.")
        return
      }
      const fromName = branches.find((b) => b.id === fromBranchId)?.name ?? "Asal"
      const toName = branches.find((b) => b.id === toBranchId)?.name ?? "Tujuan"
      toast(
        `Transfer ${formatQty(numericQty, selectedIng?.unit ?? "")} ${selectedIng?.name ?? ""} (${fromName} → ${toName}) berhasil.`
      )
      onClose()
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      eyebrow="DISTRIBUSI MULTI-CABANG"
      title="Transfer Stok Antar Cabang"
      description="Memperbarui saldo kedua cabang secara atomik dan mencatat TRANSFER_OUT & TRANSFER_IN."
      maxWidthClassName="max-w-md"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <FieldLabel htmlFor="tr-ing">Bahan Baku</FieldLabel>
          <Select
            id="tr-ing"
            value={ingredientId}
            onChange={(e) => setIngredientId(e.target.value)}
            options={ingredients.map((i) => ({
              value: i.id,
              label: `${i.name} (${i.sku} · ${i.unit})`,
            }))}
          />
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <FieldLabel
              htmlFor="tr-from"
              hint={`Tersedia: ${formatQty(fromBalance, selectedIng?.unit ?? "")}`}
            >
              Cabang Asal
            </FieldLabel>
            <Select
              id="tr-from"
              value={fromBranchId}
              onChange={(e) => setFromBranchId(e.target.value)}
              options={branches.map((b) => ({
                value: b.id,
                label: `${b.name} (${b.code})`,
              }))}
            />
          </div>

          <div>
            <FieldLabel
              htmlFor="tr-to"
              hint={`Saat ini: ${formatQty(toBalance, selectedIng?.unit ?? "")}`}
            >
              Cabang Tujuan
            </FieldLabel>
            <Select
              id="tr-to"
              value={toBranchId}
              onChange={(e) => setToBranchId(e.target.value)}
              options={branches.map((b) => ({
                value: b.id,
                label: `${b.name} (${b.code})`,
              }))}
            />
          </div>
        </div>

        <div>
          <FieldLabel htmlFor="tr-qty" hint={`Maks ${formatQty(fromBalance, selectedIng?.unit ?? "")}`}>
            Jumlah Ditransfer ({selectedIng?.unit ?? ""})
          </FieldLabel>
          <Input
            id="tr-qty"
            type="number"
            min={1}
            max={fromBalance}
            step="any"
            required
            value={qty}
            onChange={(e) => setQty(e.target.value)}
            placeholder="0"
            className="font-mono tabular-nums"
          />
        </div>

        {/* Live Balance Preview */}
        {numericQty > 0 && fromBranchId !== toBranchId && (
          <div className="flex items-center justify-between gap-2 rounded-md border border-[#EFECE7] bg-[#FAF9F7] px-3.5 py-2.5 text-xs">
            <div>
              <p className="text-[10px] text-[#8E8982]">Saldo Asal Setelahnya</p>
              <p className="font-mono font-semibold tabular-nums text-[#18181B]">
                {formatQty(Math.max(0, fromBalance - numericQty), selectedIng?.unit ?? "")}
              </p>
            </div>
            <ArrowRight className="h-4 w-4 text-[#C2572A]" strokeWidth={1.5} />
            <div className="text-right">
              <p className="text-[10px] text-[#8E8982]">Saldo Tujuan Setelahnya</p>
              <p className="font-mono font-semibold tabular-nums text-[#166534]">
                {formatQty(toBalance + numericQty, selectedIng?.unit ?? "")}
              </p>
            </div>
          </div>
        )}

        <div>
          <FieldLabel htmlFor="tr-notes" hint="Opsional">
            Catatan Pengiriman
          </FieldLabel>
          <Input
            id="tr-notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Contoh: Dikirim via kurir internal shift siang"
          />
        </div>

        {error && (
          <p className="rounded-md border border-[#FECACA] bg-[#FEF2F2] px-3 py-2 text-xs text-[#991B1B]">
            {error}
          </p>
        )}

        <div className="flex gap-2 pt-1">
          <Button variant="outline" size="md" className="flex-1" disabled={submitting} onClick={onClose}>
            Batal
          </Button>
          <Button type="submit" variant="default" size="md" className="flex-1" disabled={submitting}>
            <ArrowLeftRight className="h-4 w-4" strokeWidth={1.5} />
            {submitting ? "Memproses…" : "Eksekusi Transfer"}
          </Button>
        </div>
      </form>
    </Dialog>
  )
}
