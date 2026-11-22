"use client"

import * as React from "react"
import Link from "next/link"
import { AlertCircle, Plus, Search, SlidersHorizontal, X } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { formatIDR, TONE_CLASSES } from "@/lib/kalapos/format"
import type { Branch, BranchProduct, Category, Product, Shift } from "@/lib/kalapos/types"
import { cn } from "@/lib/utils"

export interface ProductGridProps {
  branch: Branch | undefined
  activeShift: Shift | null
  categories: Category[]
  products: Product[]
  branchProducts: BranchProduct[]
  searchQuery: string
  onSearchChange: (q: string) => void
  selectedCategoryId: string
  onSelectCategory: (catId: string) => void
  onSelectProduct: (product: Product, effectivePrice: number) => void
  onQuickOpenShift: () => void
  searchInputRef: React.RefObject<HTMLInputElement | null>
  canManageMenu?: boolean
}

export function ProductGrid({
  branch,
  activeShift,
  categories,
  products,
  branchProducts,
  searchQuery,
  onSearchChange,
  selectedCategoryId,
  onSelectCategory,
  onSelectProduct,
  onQuickOpenShift,
  searchInputRef,
  canManageMenu = false,
}: ProductGridProps) {
  const categoryNameById = React.useMemo(
    () => new Map(categories.map((c) => [c.id, c.name])),
    [categories]
  )

  const branchProdMap = React.useMemo(() => {
    const m = new Map<string, BranchProduct>()
    for (const bp of branchProducts) {
      if (bp.branch_id === branch?.id) m.set(bp.product_id, bp)
    }
    return m
  }, [branchProducts, branch?.id])

  const branchScopedProducts = React.useMemo(
    () =>
      products.filter(
        (p) => p.is_active && (!p.branch_id || (branch ? p.branch_id === branch.id : false))
      ),
    [products, branch]
  )

  const filtered = React.useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    return branchScopedProducts.filter((p) => {
      if (selectedCategoryId !== "ALL" && p.category_id !== selectedCategoryId) return false
      if (q && !p.name.toLowerCase().includes(q) && !p.sku.toLowerCase().includes(q)) return false
      return true
    })
  }, [branchScopedProducts, selectedCategoryId, searchQuery])

  return (
    <section className="flex min-w-0 flex-1 flex-col p-4 sm:p-6">
      {/* Branch or Shift Gate Banner */}
      {!branch ? (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[#E5E2DC] bg-white px-4 py-3">
          <div className="flex items-start gap-2.5">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-[#C2572A]" strokeWidth={1.75} />
            <div>
              <p className="text-xs font-semibold text-[#18181B]">
                Belum ada cabang aktif Kafe Kala
              </p>
              <p className="mt-0.5 text-[11px] text-[#77736D]">
                Tambahkan cabang Kafe Kala di Manajemen Cabang terlebih dahulu sebelum membuka shift dan menerima transaksi.
              </p>
            </div>
          </div>
          <Link href="/owner/branches">
            <Button variant="default" size="sm">
              Tambah Cabang
            </Button>
          </Link>
        </div>
      ) : !activeShift ? (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[#FDE68A] bg-[#FFFBEB] px-4 py-3">
          <div className="flex items-start gap-2.5">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-[#A16207]" strokeWidth={1.75} />
            <div>
              <p className="text-xs font-semibold text-[#92400E]">
                Shift kasir belum dibuka di {branch.name}
              </p>
              <p className="mt-0.5 text-[11px] text-[#A16207]">
                Input modal awal laci terlebih dahulu sebelum memproses pembayaran pelanggan.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="default" size="sm" onClick={onQuickOpenShift}>
              Buka Shift Sekarang
            </Button>
            <Link href="/pos/shift">
              <Button variant="outline" size="sm">
                Ke Halaman Shift
              </Button>
            </Link>
          </div>
        </div>
      ) : null}

      {/* Search Bar */}
      <div className="flex items-center gap-2.5">
        <label className="flex h-12 flex-1 items-center gap-2.5 rounded-md border border-[#E5E2DC] bg-white px-3.5 transition-colors focus-within:border-[#C2572A] focus-within:ring-2 focus-within:ring-[#C2572A]/15">
          <Search className="h-4 w-4 shrink-0 text-[#8E8982]" strokeWidth={1.5} />
          <input
            ref={searchInputRef}
            type="text"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Cari menu atau kode SKU…"
            aria-label="Cari menu"
            className="w-full bg-transparent text-sm text-[#18181B] placeholder:text-[#9A958E] outline-none"
          />
          {searchQuery ? (
            <button
              type="button"
              onClick={() => onSearchChange("")}
              aria-label="Bersihkan pencarian"
              className="flex h-7 w-7 items-center justify-center rounded text-[#8E8982] hover:bg-[#F1EFEB] hover:text-[#18181B] cursor-pointer"
            >
              <X className="h-3.5 w-3.5" strokeWidth={1.5} />
            </button>
          ) : (
            <kbd className="hidden rounded border border-[#E5E2DC] bg-[#FAF9F7] px-1.5 py-0.5 font-mono text-[10px] text-[#8E8982] sm:inline">
              /
            </kbd>
          )}
        </label>
      </div>

      {/* Category Chips (>= 44px touch comfort) */}
      <div className="no-scrollbar mt-3.5 flex items-center gap-2 overflow-x-auto pb-1">
        <button
          type="button"
          onClick={() => onSelectCategory("ALL")}
          className={cn(
            "min-h-11 shrink-0 rounded-md border px-4 text-xs font-medium transition-colors cursor-pointer",
            selectedCategoryId === "ALL"
              ? "border-[#18181B] bg-[#18181B] text-white"
              : "border-[#E5E2DC] bg-white text-[#67625B] hover:border-[#C2572A] hover:text-[#18181B]"
          )}
        >
          Semua Menu
        </button>
        {categories.map((cat) => (
          <button
            key={cat.id}
            type="button"
            onClick={() => onSelectCategory(cat.id)}
            className={cn(
              "min-h-11 shrink-0 rounded-md border px-4 text-xs font-medium transition-colors cursor-pointer",
              selectedCategoryId === cat.id
                ? "border-[#18181B] bg-[#18181B] text-white"
                : "border-[#E5E2DC] bg-white text-[#67625B] hover:border-[#C2572A] hover:text-[#18181B]"
            )}
          >
            {cat.name}
          </button>
        ))}
      </div>

      {/* Product Grid */}
      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
        {filtered.map((product) => {
          const bp = branchProdMap.get(product.id)
          const available = bp ? bp.is_available : true
          const effectivePrice = bp?.custom_price ?? product.base_price
          const categoryLabel = categoryNameById.get(product.category_id) ?? "Menu"

          return (
            <button
              key={product.id}
              type="button"
              disabled={!available}
              onClick={() => onSelectProduct(product, effectivePrice)}
              className={cn(
                "group relative flex min-h-[132px] flex-col justify-between rounded-lg border border-[#E5E2DC] bg-white p-3.5 text-left transition-colors cursor-pointer",
                available
                  ? "hover:border-[#C2572A] active:bg-[#FAF9F7]"
                  : "cursor-not-allowed opacity-50"
              )}
            >
              <div className="flex w-full items-start justify-between gap-2">
                <span
                  className={cn(
                    "flex h-10 w-10 items-center justify-center rounded-md font-mono text-xs font-semibold",
                    TONE_CLASSES[product.tone]
                  )}
                >
                  {product.mark}
                </span>
                {product.is_customizable && (
                  <span className="inline-flex items-center gap-1 rounded border border-[#EFECE7] bg-[#FAF9F7] px-1.5 py-0.5 text-[10px] font-medium text-[#77736D]">
                    <SlidersHorizontal className="h-2.5 w-2.5" strokeWidth={1.5} />
                    Opsi
                  </span>
                )}
              </div>

              <div className="mt-3 pr-8">
                <p className="line-clamp-2 text-xs font-semibold leading-snug text-[#18181B] sm:text-[13px]">
                  {product.name}
                </p>
                <p className="mt-0.5 text-[11px] text-[#8E8982]">{categoryLabel}</p>
                <p className="mt-2 font-mono text-xs font-semibold tabular-nums text-[#18181B]">
                  {formatIDR(effectivePrice)}
                </p>
              </div>

              <span
                aria-hidden="true"
                className="absolute right-3 bottom-3 flex h-8 w-8 items-center justify-center rounded-md border border-[#E5E2DC] bg-[#FAF9F7] text-[#67625B] transition-colors group-hover:border-[#C2572A] group-hover:bg-[#C2572A] group-hover:text-white"
              >
                <Plus className="h-4 w-4" strokeWidth={1.5} />
              </span>
            </button>
          )
        })}
      </div>

      {filtered.length === 0 && (
        <div className="mt-8 rounded-lg border border-dashed border-[#D6D2C9] bg-white p-10 text-center">
          <p className="text-sm font-semibold text-[#18181B]">
            {branchScopedProducts.length === 0 ? "Belum ada data menu" : "Menu tidak ditemukan"}
          </p>
          <p className="mt-1 text-xs text-[#8E8982]">
            {branchScopedProducts.length === 0
              ? "Katalog menu untuk cabang ini masih kosong."
              : "Coba kata kunci lain atau pilih kategori Semua Menu."}
          </p>
          {branchScopedProducts.length === 0 && canManageMenu && (
            <Link href="/pos/menu" className="mt-4 inline-block">
              <Button variant="default" size="sm">
                <Plus className="h-3.5 w-3.5" strokeWidth={1.5} />
                Kelola &amp; Tambah Menu
              </Button>
            </Link>
          )}
        </div>
      )}

      <div className="mt-auto flex flex-wrap items-center justify-between gap-2 pt-5 text-[11px] text-[#8E8982]">
        <div className="flex items-center gap-2">
          <Badge variant="aman" dot>
            {filtered.length} menu tersedia
          </Badge>
          <span>PB1 {branch?.tax_rate ?? 10}%</span>
          {(branch?.service_charge_rate ?? 0) > 0 && (
            <span>· Service {branch?.service_charge_rate}%</span>
          )}
        </div>
        <span className="font-mono text-[10px]">
          / Cari · F2 Tahan · F8 Bayar · Esc Tutup
        </span>
      </div>
    </section>
  )
}
