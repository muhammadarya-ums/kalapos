"use client"

import { useEffect, useMemo, useState } from "react"
import { Minus, Plus } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Dialog } from "@/components/ui/dialog"
import { FieldLabel, Input } from "@/components/ui/input"
import { formatIDR } from "@/lib/kalapos/format"
import type {
  ModifierGroup,
  ModifierOption,
  OrderModifierSnapshot,
  Product,
  ProductModifierGroup,
} from "@/lib/kalapos/types"
import { cn } from "@/lib/utils"

const QUICK_NOTES = ["Es sedikit", "Ekstra panas", "Pisah gula", "Foam tipis"]

export interface ModifierModalProps {
  product: Product | null
  effectivePrice: number
  modifierGroups: ModifierGroup[]
  modifierOptions: ModifierOption[]
  productModifierGroups: ProductModifierGroup[]
  onClose: () => void
  onConfirm: (payload: {
    modifiers: OrderModifierSnapshot[]
    qty: number
    baristaNotes: string
  }) => void
}

export function ModifierModal({
  product,
  effectivePrice,
  modifierGroups,
  modifierOptions,
  productModifierGroups,
  onClose,
  onConfirm,
}: ModifierModalProps) {
  const linkedGroups = useMemo(() => {
    if (!product) return []
    const groupIds = productModifierGroups
      .filter((pmg) => pmg.product_id === product.id)
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((pmg) => pmg.group_id)

    return groupIds
      .map((gid) => {
        const group = modifierGroups.find((g) => g.id === gid)
        if (!group) return null
        const options = modifierOptions.filter((o) => o.group_id === gid)
        return { group, options }
      })
      .filter((entry): entry is { group: ModifierGroup; options: ModifierOption[] } => Boolean(entry))
  }, [product, modifierGroups, modifierOptions, productModifierGroups])

  const [selectedByGroup, setSelectedByGroup] = useState<Record<string, string | null>>({})
  const [baristaNotes, setBaristaNotes] = useState("")
  const [qty, setQty] = useState(1)

  useEffect(() => {
    if (!product) return
    const defaults: Record<string, string | null> = {}
    for (const { group, options } of linkedGroups) {
      if (group.required || group.id === "mg-milk") {
        defaults[group.id] = options[0]?.id ?? null
      } else {
        defaults[group.id] = null
      }
    }
    setSelectedByGroup(defaults)
    setBaristaNotes("")
    setQty(1)
  }, [product, linkedGroups])

  const selectedSnapshots = useMemo<OrderModifierSnapshot[]>(() => {
    const out: OrderModifierSnapshot[] = []
    for (const { group, options } of linkedGroups) {
      const optId = selectedByGroup[group.id]
      if (!optId) continue
      const opt = options.find((o) => o.id === optId)
      if (!opt) continue
      out.push({
        group_name: group.name,
        option_id: opt.id,
        option_name: opt.name,
        price_delta: opt.price_delta,
        ingredient_id: opt.ingredient_id,
        qty_required: opt.qty_required,
      })
    }
    return out
  }, [linkedGroups, selectedByGroup])

  const unitTotal =
    effectivePrice + selectedSnapshots.reduce((sum, m) => sum + m.price_delta, 0)

  const handleToggleOption = (group: ModifierGroup, optionId: string) => {
    setSelectedByGroup((prev) => {
      const current = prev[group.id]
      if (!group.required && current === optionId) {
        return { ...prev, [group.id]: null }
      }
      return { ...prev, [group.id]: optionId }
    })
  }

  return (
    <Dialog
      open={Boolean(product)}
      onClose={onClose}
      eyebrow="KUSTOMISASI MENU"
      title={product?.name ?? ""}
      description={`Harga dasar ${formatIDR(effectivePrice)} · Resep terhubung ke estimasi HPP (tidak memotong stok otomatis)`}
      maxWidthClassName="max-w-md"
    >
      <div className="space-y-5">
        {linkedGroups.map(({ group, options }) => (
          <fieldset key={group.id} className="space-y-2 border-0 p-0">
            <legend className="flex w-full items-center justify-between text-xs font-semibold text-[#18181B]">
              <span>{group.name}</span>
              <span className="text-[10px] font-medium text-[#8E8982]">
                {group.required ? "Wajib pilih 1" : "Opsional"}
              </span>
            </legend>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {options.map((opt) => {
                const active = selectedByGroup[group.id] === opt.id
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => handleToggleOption(group, opt.id)}
                    className={cn(
                      "flex min-h-12 flex-col items-center justify-center rounded-md border px-2.5 py-2 text-center transition-colors cursor-pointer",
                      active
                        ? "border-[#C2572A] bg-[#FDF4F0] text-[#9A3E1A]"
                        : "border-[#E5E2DC] bg-white text-[#4A4640] hover:border-[#C9C4BC] hover:bg-[#FAF9F7]"
                    )}
                  >
                    <span className="text-xs font-semibold">{opt.name}</span>
                    {opt.price_delta > 0 && (
                      <span className="mt-0.5 font-mono text-[10px] tabular-nums text-[#C2572A]">
                        +{formatIDR(opt.price_delta)}
                      </span>
                    )}
                  </button>
                )
              })}
            </div>
          </fieldset>
        ))}

        <div>
          <FieldLabel htmlFor="barista-note-input" hint="Tercetak di Tiket Barista">
            Catatan Barista
          </FieldLabel>
          <Input
            id="barista-note-input"
            value={baristaNotes}
            onChange={(e) => setBaristaNotes(e.target.value)}
            maxLength={120}
            placeholder="Contoh: Es sedikit, sajikan terakhir…"
          />
          <div className="mt-2 flex flex-wrap gap-1.5">
            {QUICK_NOTES.map((note) => (
              <button
                key={note}
                type="button"
                onClick={() =>
                  setBaristaNotes((prev) =>
                    prev.trim() ? `${prev.trim()}, ${note}` : note
                  )
                }
                className="rounded border border-[#E5E2DC] bg-[#FAF9F7] px-2.5 py-1 text-[11px] text-[#67625B] hover:border-[#C2572A] hover:text-[#18181B] cursor-pointer"
              >
                + {note}
              </button>
            ))}
          </div>
        </div>

        {/* Quantity & Confirm (>= 48px touch controls) */}
        <div className="flex items-center gap-3 border-t border-[#EFECE7] pt-4">
          <div className="flex items-center rounded-md border border-[#E5E2DC] bg-white">
            <button
              type="button"
              onClick={() => setQty((q) => Math.max(1, q - 1))}
              aria-label="Kurangi jumlah"
              className="flex h-12 w-12 items-center justify-center text-[#57534E] hover:bg-[#F8F7F4] cursor-pointer"
            >
              <Minus className="h-4 w-4" strokeWidth={1.5} />
            </button>
            <span className="w-10 text-center font-mono text-sm font-semibold tabular-nums">
              {qty}
            </span>
            <button
              type="button"
              onClick={() => setQty((q) => q + 1)}
              aria-label="Tambah jumlah"
              className="flex h-12 w-12 items-center justify-center text-[#57534E] hover:bg-[#F8F7F4] cursor-pointer"
            >
              <Plus className="h-4 w-4" strokeWidth={1.5} />
            </button>
          </div>

          <Button
            variant="default"
            size="touch"
            className="flex-1"
            onClick={() => {
              onConfirm({ modifiers: selectedSnapshots, qty, baristaNotes })
              onClose()
            }}
          >
            <span>Tambahkan ·</span>
            <span className="font-mono tabular-nums">{formatIDR(unitTotal * qty)}</span>
          </Button>
        </div>
      </div>
    </Dialog>
  )
}
