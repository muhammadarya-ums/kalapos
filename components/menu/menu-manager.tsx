"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import {
  ArrowRight,
  BookOpen,
  Boxes,
  Edit3,
  FolderPlus,
  Info,
  Plus,
  Search,
  SlidersHorizontal,
  Store,
  Tag,
  Trash2,
  X,
} from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Dialog } from "@/components/ui/dialog"
import { CurrencyInput, FieldLabel, Input } from "@/components/ui/input"
import { Select } from "@/components/ui/select"
import {
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { useToast } from "@/components/ui/toast"
import { useKalaPOS } from "@/lib/kalapos/context"
import { formatIDR, formatQty, TONE_CLASSES } from "@/lib/kalapos/format"
import type { BranchProduct, Product, ProductTone } from "@/lib/kalapos/types"
import { cn } from "@/lib/utils"

interface RecipeDraftRow {
  ingredient_id: string
  qty_required: string
}

const TONE_OPTIONS: Array<{ value: ProductTone; label: string }> = [
  { value: "sand", label: "Sand (Kopi)" },
  { value: "rose", label: "Terracotta" },
  { value: "olive", label: "Olive (Matcha/Teh)" },
  { value: "tan", label: "Tan (Pastry)" },
  { value: "slate", label: "Slate (Dingin)" },
]

export function MenuManager({ scope }: { scope: "OWNER" | "BRANCH" }) {
  const { toast } = useToast()
  const {
    state,
    session,
    activeBranch,
    activeBranches,
    createCategory,
    deleteCategory,
    createProduct,
    updateProduct,
    deleteProduct,
    updateBranchProductOverride,
  } = useKalaPOS()

  const isOwner = scope === "OWNER" && session?.role === "OWNER"
  const [selectedBranchViewId, setSelectedBranchViewId] = useState<string>(
    scope === "BRANCH" ? activeBranch?.id ?? "" : "ALL"
  )
  const [selectedCategoryFilter, setSelectedCategoryFilter] = useState<string>("ALL")
  const [search, setSearch] = useState("")

  // Category modal
  const [catModalOpen, setCatModalOpen] = useState(false)
  const [newCatName, setNewCatName] = useState("")
  const [catError, setCatError] = useState<string | null>(null)
  const [catSaving, setCatSaving] = useState(false)

  // Product create/edit modal
  const [productModalOpen, setProductModalOpen] = useState(false)
  const [editingProduct, setEditingProduct] = useState<Product | null>(null)
  const [prodName, setProdName] = useState("")
  const [prodSku, setProdSku] = useState("")
  const [prodCategoryId, setProdCategoryId] = useState("")
  const [prodBranchScope, setProdBranchScope] = useState<string>("GLOBAL")
  const [prodBasePrice, setProdBasePrice] = useState(25000)
  const [prodMark, setProdMark] = useState("")
  const [prodTone, setProdTone] = useState<ProductTone>("sand")
  const [prodCustomizable, setProdCustomizable] = useState(true)
  const [prodActive, setProdActive] = useState(true)
  const [recipeRows, setRecipeRows] = useState<RecipeDraftRow[]>([])
  const [prodError, setProdError] = useState<string | null>(null)
  const [prodSaving, setProdSaving] = useState(false)

  // Branch override modal (availability & custom price)
  const [overrideTarget, setOverrideTarget] = useState<{
    product: Product
    branchId: string
  } | null>(null)
  const [overrideAvailable, setOverrideAvailable] = useState(true)
  const [overrideUseCustomPrice, setOverrideUseCustomPrice] = useState(false)
  const [overrideCustomPrice, setOverrideCustomPrice] = useState(0)
  const [overrideSaving, setOverrideSaving] = useState(false)

  // Delete confirmation modal
  const [deleteTarget, setDeleteTarget] = useState<Product | null>(null)
  const [deleting, setDeleting] = useState(false)

  const effectiveBranchId =
    scope === "BRANCH"
      ? activeBranch?.id ?? session?.branchId ?? ""
      : selectedBranchViewId !== "ALL" && selectedBranchViewId !== "GLOBAL"
      ? selectedBranchViewId
      : activeBranches[0]?.id ?? ""

  const categoryMap = useMemo(
    () => new Map(state.categories.map((c) => [c.id, c.name])),
    [state.categories]
  )
  const branchMap = useMemo(
    () => new Map(state.branches.map((b) => [b.id, b])),
    [state.branches]
  )
  const ingredientMap = useMemo(
    () => new Map(state.ingredients.map((i) => [i.id, i])),
    [state.ingredients]
  )

  const recipesByProduct = useMemo(() => {
    const m = new Map<string, Array<{ ingredient_id: string; qty_required: number }>>()
    for (const r of state.product_recipes) {
      const list = m.get(r.product_id) ?? []
      list.push({ ingredient_id: r.ingredient_id, qty_required: r.qty_required })
      m.set(r.product_id, list)
    }
    return m
  }, [state.product_recipes])

  const branchProdLookup = useMemo(() => {
    const m = new Map<string, BranchProduct>()
    for (const bp of state.branch_products) {
      m.set(`${bp.branch_id}:${bp.product_id}`, bp)
    }
    return m
  }, [state.branch_products])

  const visibleProducts = useMemo(() => {
    const q = search.trim().toLowerCase()
    return state.products.filter((p) => {
      if (scope === "BRANCH") {
        if (p.branch_id && p.branch_id !== effectiveBranchId) return false
      } else {
        if (selectedBranchViewId === "GLOBAL" && p.branch_id) return false
        if (
          selectedBranchViewId !== "ALL" &&
          selectedBranchViewId !== "GLOBAL" &&
          p.branch_id &&
          p.branch_id !== selectedBranchViewId
        ) {
          return false
        }
      }
      if (selectedCategoryFilter !== "ALL" && p.category_id !== selectedCategoryFilter) {
        return false
      }
      if (q && !p.name.toLowerCase().includes(q) && !p.sku.toLowerCase().includes(q)) {
        return false
      }
      return true
    })
  }, [state.products, scope, effectiveBranchId, selectedBranchViewId, selectedCategoryFilter, search])

  const computeProductRecipeCogs = (productId: string) => {
    const recs = recipesByProduct.get(productId) ?? []
    return recs.reduce((sum, r) => {
      const ing = ingredientMap.get(r.ingredient_id)
      return sum + Math.round((ing?.cost_per_unit ?? 0) * r.qty_required)
    }, 0)
  }

  const draftRecipeCogs = useMemo(() => {
    return recipeRows.reduce((sum, r) => {
      const ing = ingredientMap.get(r.ingredient_id)
      const qty = Number(r.qty_required) || 0
      return sum + Math.round((ing?.cost_per_unit ?? 0) * qty)
    }, 0)
  }, [recipeRows, ingredientMap])

  const draftMarginPct =
    prodBasePrice > 0
      ? Number((((prodBasePrice - draftRecipeCogs) / prodBasePrice) * 100).toFixed(1))
      : 0

  const canEditMaster = (product: Product) => {
    if (isOwner) return true
    return Boolean(product.branch_id && product.branch_id === effectiveBranchId)
  }

  const openCreateModal = () => {
    setEditingProduct(null)
    setProdName("")
    setProdSku("")
    setProdCategoryId(state.categories[0]?.id ?? "")
    setProdBranchScope(isOwner ? "GLOBAL" : effectiveBranchId)
    setProdBasePrice(28000)
    setProdMark("")
    setProdTone("sand")
    setProdCustomizable(true)
    setProdActive(true)
    setRecipeRows(
      state.ingredients.length > 0
        ? [{ ingredient_id: state.ingredients[0].id, qty_required: "1" }]
        : []
    )
    setProdError(null)
    setProductModalOpen(true)
  }

  const openEditModal = (product: Product) => {
    setEditingProduct(product)
    setProdName(product.name)
    setProdSku(product.sku)
    setProdCategoryId(product.category_id)
    setProdBranchScope(product.branch_id ?? "GLOBAL")
    setProdBasePrice(product.base_price)
    setProdMark(product.mark)
    setProdTone(product.tone)
    setProdCustomizable(product.is_customizable)
    setProdActive(product.is_active)
    const existingRecipes = recipesByProduct.get(product.id) ?? []
    setRecipeRows(
      existingRecipes.length > 0
        ? existingRecipes.map((r) => ({
            ingredient_id: r.ingredient_id,
            qty_required: String(r.qty_required),
          }))
        : []
    )
    setProdError(null)
    setProductModalOpen(true)
  }

  const openOverrideModal = (product: Product, branchId: string) => {
    const bp = branchProdLookup.get(`${branchId}:${product.id}`)
    setOverrideTarget({ product, branchId })
    setOverrideAvailable(bp ? bp.is_available : true)
    setOverrideUseCustomPrice(bp?.custom_price !== null && bp?.custom_price !== undefined)
    setOverrideCustomPrice(bp?.custom_price ?? product.base_price)
  }

  const handleSaveProduct = async (e: React.FormEvent) => {
    e.preventDefault()
    setProdError(null)

    if (!prodCategoryId) {
      setProdError("Buat atau pilih kategori menu terlebih dahulu.")
      return
    }

    const parsedRecipes = recipeRows
      .filter((r) => r.ingredient_id && Number(r.qty_required) > 0)
      .map((r) => ({
        ingredient_id: r.ingredient_id,
        qty_required: Number(r.qty_required),
      }))

    const payload = {
      category_id: prodCategoryId,
      branch_id: isOwner ? (prodBranchScope === "GLOBAL" ? null : prodBranchScope) : effectiveBranchId,
      name: prodName,
      base_price: prodBasePrice,
      sku: prodSku,
      mark: prodMark,
      tone: prodTone,
      is_customizable: prodCustomizable,
      is_active: prodActive,
      recipes: parsedRecipes,
    }

    setProdSaving(true)
    try {
      const res = editingProduct
        ? await updateProduct(editingProduct.id, payload)
        : await createProduct(payload)
      if (!res.ok) {
        setProdError(res.error || "Gagal menyimpan menu.")
        return
      }
      toast(
        editingProduct
          ? `Menu "${prodName}" berhasil diperbarui.`
          : `Menu "${prodName}" berhasil ditambahkan.`
      )
      setProductModalOpen(false)
    } finally {
      setProdSaving(false)
    }
  }

  const handleAddCategory = async (e: React.FormEvent) => {
    e.preventDefault()
    setCatError(null)
    if (!newCatName.trim()) {
      setCatError("Masukkan nama kategori.")
      return
    }
    setCatSaving(true)
    try {
      const res = await createCategory(newCatName)
      if (!res.ok) {
        setCatError(res.error || "Gagal menambah kategori.")
        return
      }
      toast(`Kategori "${newCatName.trim()}" ditambahkan.`)
      setNewCatName("")
    } finally {
      setCatSaving(false)
    }
  }

  const handleSaveOverride = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!overrideTarget) return
    setOverrideSaving(true)
    try {
      const res = await updateBranchProductOverride({
        branchId: overrideTarget.branchId,
        productId: overrideTarget.product.id,
        isAvailable: overrideAvailable,
        customPrice: overrideUseCustomPrice ? overrideCustomPrice : null,
      })
      if (!res.ok) {
        toast(res.error || "Gagal memperbarui pengaturan cabang.", "error")
        return
      }
      toast(`Pengaturan menu "${overrideTarget.product.name}" di cabang diperbarui.`)
      setOverrideTarget(null)
    } finally {
      setOverrideSaving(false)
    }
  }

  const stockPageHref = scope === "OWNER" ? "/owner/inventory" : "/pos/stock"

  return (
    <div className="mx-auto max-w-[1440px] space-y-5 p-5 sm:p-8">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[#8E8982]">
            {scope === "OWNER"
              ? "KATALOG PUSAT & LOKAL · KAFE KALA"
              : `MANAJEMEN MENU CABANG · ${activeBranch?.name.toUpperCase() ?? "KAFE KALA"}`}
          </p>
          <h2 className="mt-1 text-2xl font-semibold tracking-[-0.025em] text-[#18181B]">
            Manajemen Menu &amp; Resep ({visibleProducts.length})
          </h2>
          <p className="mt-1 text-xs text-[#77736D]">
            {scope === "OWNER"
              ? "Kelola kategori, menu pusat Kafe Kala, menu khusus cabang, dan resep HPP. Hanya Owner & Manager Cabang yang memiliki akses CRUD."
              : "Tambah, edit, dan hapus menu lokal cabang Anda, serta atur ketersediaan & harga khusus untuk menu pusat Kafe Kala."}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="md" onClick={() => setCatModalOpen(true)}>
            <FolderPlus className="h-4 w-4" strokeWidth={1.5} />
            Kategori ({state.categories.length})
          </Button>
          <Button
            variant="default"
            size="md"
            disabled={scope === "BRANCH" && !effectiveBranchId}
            onClick={openCreateModal}
          >
            <Plus className="h-4 w-4" strokeWidth={1.5} />
            {isOwner ? "Tambah Menu" : "Tambah Menu Cabang"}
          </Button>
        </div>
      </div>

      {/* Policy Banner: Recipe linked for HPP & shift estimates, NOT auto-deducting stock */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[#E5E2DC] bg-white px-4 py-3 text-xs">
        <div className="flex items-start gap-2.5">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-[#C2572A]" strokeWidth={1.75} />
          <p className="text-[#57534E]">
            <strong>Resep tanpa potong stok otomatis:</strong> Setiap menu terhubung ke resep bahan baku untuk menghitung HPP, Food Cost, dan estimasi pemakaian di laporan shift — <strong>tidak memotong stok fisik secara otomatis</strong> saat checkout kasir.
          </p>
        </div>
        <Link
          href={stockPageHref}
          className="inline-flex shrink-0 items-center gap-1 font-semibold text-[#18181B] hover:text-[#C2572A]"
        >
          <Boxes className="h-3.5 w-3.5" strokeWidth={1.5} />
          Kelola Bahan &amp; Stok ({state.ingredients.length})
          <ArrowRight className="h-3.5 w-3.5" strokeWidth={1.5} />
        </Link>
      </div>

      {/* Filters Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          {isOwner && (
            <div className="flex items-center gap-2">
              <Store className="h-4 w-4 text-[#8E8982]" strokeWidth={1.5} />
              <Select
                aria-label="Filter cabang menu"
                value={selectedBranchViewId}
                onChange={(e) => setSelectedBranchViewId(e.target.value)}
                className="h-9 min-w-[180px] text-xs"
                options={[
                  { value: "ALL", label: "Semua Menu (Pusat + Cabang)" },
                  { value: "GLOBAL", label: "Hanya Menu Pusat Kala" },
                  ...activeBranches.map((b) => ({
                    value: b.id,
                    label: `Cabang: ${b.name} (${b.code})`,
                  })),
                ]}
              />
            </div>
          )}

          <Select
            aria-label="Filter kategori"
            value={selectedCategoryFilter}
            onChange={(e) => setSelectedCategoryFilter(e.target.value)}
            className="h-9 min-w-[155px] text-xs"
            options={[
              { value: "ALL", label: "Semua Kategori" },
              ...state.categories.map((c) => ({ value: c.id, label: c.name })),
            ]}
          />
        </div>

        <label className="flex h-9 items-center gap-2 rounded-md border border-[#E5E2DC] bg-white px-3">
          <Search className="h-3.5 w-3.5 text-[#8E8982]" strokeWidth={1.5} />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Cari nama menu atau SKU…"
            className="w-48 bg-transparent text-xs text-[#18181B] placeholder:text-[#9A958E] outline-none"
          />
        </label>
      </div>

      {/* Menu Table */}
      <section className="overflow-hidden rounded-lg border border-[#E5E2DC] bg-white">
        <TableContainer>
          <TableHeader>
            <tr>
              <TableHead>Menu</TableHead>
              <TableHead>Kategori</TableHead>
              <TableHead>Cakupan</TableHead>
              <TableHead className="text-right">Harga</TableHead>
              <TableHead>Resep (HPP)</TableHead>
              {effectiveBranchId && <TableHead>Status Cabang</TableHead>}
              <TableHead className="text-right">Aksi</TableHead>
            </tr>
          </TableHeader>
          <TableBody>
            {visibleProducts.map((product) => {
              const recipes = recipesByProduct.get(product.id) ?? []
              const recipeCogs = computeProductRecipeCogs(product.id)
              const bp = effectiveBranchId
                ? branchProdLookup.get(`${effectiveBranchId}:${product.id}`)
                : undefined
              const effectivePrice = bp?.custom_price ?? product.base_price
              const isAvailable = bp ? bp.is_available : true
              const marginPct =
                effectivePrice > 0
                  ? Math.round(((effectivePrice - recipeCogs) / effectivePrice) * 100)
                  : 0
              const editable = canEditMaster(product)

              return (
                <TableRow key={product.id}>
                  <TableCell>
                    <div className="flex items-center gap-2.5">
                      <span
                        className={cn(
                          "flex h-9 w-9 shrink-0 items-center justify-center rounded-md font-mono text-[11px] font-semibold",
                          TONE_CLASSES[product.tone]
                        )}
                      >
                        {product.mark}
                      </span>
                      <div className="min-w-0">
                        <p className="font-semibold text-[#18181B]">{product.name}</p>
                        <p className="font-mono text-[10px] text-[#8E8982]">
                          {product.sku}
                          {product.is_customizable && " · Opsi Suhu & Gula"}
                        </p>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="text-xs text-[#57534E]">
                    {categoryMap.get(product.category_id) ?? "—"}
                  </TableCell>
                  <TableCell>
                    {product.branch_id ? (
                      <Badge variant="terracotta">
                        Lokal · {branchMap.get(product.branch_id)?.name ?? "Cabang"}
                      </Badge>
                    ) : (
                      <Badge variant="espresso">Pusat Kafe Kala</Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-right font-mono tabular-nums">
                    <p className="font-semibold text-[#18181B]">{formatIDR(effectivePrice)}</p>
                    {bp?.custom_price !== null && bp?.custom_price !== undefined && (
                      <p className="text-[10px] text-[#C2572A]">
                        Dasar {formatIDR(product.base_price)}
                      </p>
                    )}
                  </TableCell>
                  <TableCell>
                    {recipes.length > 0 ? (
                      <div>
                        <p className="font-mono text-xs font-medium tabular-nums text-[#18181B]">
                          HPP {formatIDR(recipeCogs)}{" "}
                          <span className="text-[10px] text-[#166534]">({marginPct}%)</span>
                        </p>
                        <p className="mt-0.5 max-w-[230px] truncate text-[10px] text-[#8E8982]">
                          {recipes
                            .map((r) => {
                              const ing = ingredientMap.get(r.ingredient_id)
                              return ing
                                ? `${ing.name} ${formatQty(r.qty_required, ing.unit)}`
                                : r.ingredient_id
                            })
                            .join(" · ")}
                        </p>
                      </div>
                    ) : (
                      <Badge variant="menipis">Resep belum diisi</Badge>
                    )}
                  </TableCell>
                  {effectiveBranchId && (
                    <TableCell>
                      <Badge variant={isAvailable && product.is_active ? "aman" : "kritis"} dot>
                        {!product.is_active
                          ? "Nonaktif"
                          : isAvailable
                          ? "Tersedia"
                          : "Habis"}
                      </Badge>
                    </TableCell>
                  )}
                  <TableCell className="text-right">
                    <div className="inline-flex items-center gap-1">
                      {effectiveBranchId && (
                        <Button
                          variant="outline"
                          size="xs"
                          onClick={() => openOverrideModal(product, effectiveBranchId)}
                          title="Atur ketersediaan & harga khusus cabang"
                        >
                          <SlidersHorizontal className="h-3 w-3" strokeWidth={1.5} />
                          Cabang
                        </Button>
                      )}
                      {editable && (
                        <>
                          <Button
                            variant="ghost"
                            size="iconSm"
                            aria-label={`Edit ${product.name}`}
                            title="Edit menu & resep"
                            onClick={() => openEditModal(product)}
                          >
                            <Edit3 className="h-3.5 w-3.5 text-[#67625B]" strokeWidth={1.5} />
                          </Button>
                          <Button
                            variant="ghost"
                            size="iconSm"
                            aria-label={`Hapus ${product.name}`}
                            title="Hapus menu"
                            onClick={() => setDeleteTarget(product)}
                          >
                            <Trash2
                              className="h-3.5 w-3.5 text-[#8E8982] hover:text-[#991B1B]"
                              strokeWidth={1.5}
                            />
                          </Button>
                        </>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              )
            })}
            {visibleProducts.length === 0 && (
              <TableRow>
                <TableCell
                  colSpan={effectiveBranchId ? 7 : 6}
                  className="py-12 text-center"
                >
                  <BookOpen className="mx-auto h-6 w-6 text-[#9A958E]" strokeWidth={1.5} />
                  <p className="mt-2.5 text-sm font-semibold text-[#18181B]">
                    Belum ada menu terdaftar
                  </p>
                  <p className="mt-1 text-xs text-[#8E8982]">
                    {state.categories.length === 0
                      ? "Mulai dengan membuat kategori menu, lalu tambahkan menu dan hubungkan ke resep bahan baku."
                      : "Klik tombol Tambah Menu untuk mulai menyusun daftar menu Kafe Kala."}
                  </p>
                  <div className="mt-4 flex justify-center gap-2">
                    {state.categories.length === 0 && (
                      <Button variant="outline" size="sm" onClick={() => setCatModalOpen(true)}>
                        <FolderPlus className="h-3.5 w-3.5" strokeWidth={1.5} />
                        Buat Kategori Dulu
                      </Button>
                    )}
                    <Button
                      variant="default"
                      size="sm"
                      disabled={scope === "BRANCH" && !effectiveBranchId}
                      onClick={openCreateModal}
                    >
                      <Plus className="h-3.5 w-3.5" strokeWidth={1.5} />
                      Tambah Menu
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </TableContainer>
      </section>

      {/* Category Management Dialog */}
      <Dialog
        open={catModalOpen}
        onClose={() => {
          setCatModalOpen(false)
          setCatError(null)
        }}
        eyebrow="KATALOG KAFE KALA"
        title="Kelola Kategori Menu"
        description="Kategori digunakan untuk mengelompokkan menu di terminal kasir POS."
        maxWidthClassName="max-w-md"
      >
        <div className="space-y-4">
          <form onSubmit={handleAddCategory} className="flex gap-2">
            <Input
              value={newCatName}
              onChange={(e) => {
                setNewCatName(e.target.value)
                if (catError) setCatError(null)
              }}
              placeholder="Contoh: Espresso, Manual Brew, Pastry"
              className="flex-1"
            />
            <Button type="submit" variant="default" size="md" disabled={catSaving}>
              <Plus className="h-4 w-4" strokeWidth={1.5} />
              Tambah
            </Button>
          </form>

          {catError && (
            <p className="rounded-md border border-[#FECACA] bg-[#FEF2F2] px-3 py-2 text-xs text-[#991B1B]">
              {catError}
            </p>
          )}

          <div className="divide-y divide-[#EFECE7] rounded-lg border border-[#E5E2DC]">
            {state.categories.map((cat) => {
              const usedCount = state.products.filter((p) => p.category_id === cat.id).length
              return (
                <div
                  key={cat.id}
                  className="flex items-center justify-between gap-2 px-3.5 py-2.5 text-xs"
                >
                  <div className="flex items-center gap-2">
                    <Tag className="h-3.5 w-3.5 text-[#8E8982]" strokeWidth={1.5} />
                    <span className="font-semibold text-[#18181B]">{cat.name}</span>
                    <span className="font-mono text-[10px] text-[#8E8982]">
                      ({usedCount} menu)
                    </span>
                  </div>
                  <Button
                    variant="ghost"
                    size="iconSm"
                    disabled={usedCount > 0}
                    title={
                      usedCount > 0
                        ? "Kategori masih dipakai oleh menu"
                        : `Hapus kategori ${cat.name}`
                    }
                    onClick={async () => {
                      const res = await deleteCategory(cat.id)
                      if (!res.ok) toast(res.error || "Gagal menghapus kategori.", "error")
                      else toast(`Kategori "${cat.name}" dihapus.`, "info")
                    }}
                  >
                    <Trash2 className="h-3.5 w-3.5 text-[#8E8982] hover:text-[#991B1B]" strokeWidth={1.5} />
                  </Button>
                </div>
              )
            })}
            {state.categories.length === 0 && (
              <p className="px-4 py-6 text-center text-xs text-[#8E8982]">
                Belum ada kategori menu. Tambahkan kategori pertama di atas.
              </p>
            )}
          </div>
        </div>
      </Dialog>

      {/* Product + Recipe Create/Edit Modal */}
      <Dialog
        open={productModalOpen}
        onClose={() => setProductModalOpen(false)}
        eyebrow={editingProduct ? "EDIT MENU & RESEP" : "MENU BARU KAFE KALA"}
        title={editingProduct ? `Edit Menu · ${editingProduct.name}` : "Tambah Menu & Resep"}
        description="Hubungkan komposisi resep bahan baku untuk menghitung HPP dan referensi pemakaian shift (tanpa potong stok otomatis)."
        maxWidthClassName="max-w-xl"
      >
        <form onSubmit={handleSaveProduct} className="space-y-4">
          {state.categories.length === 0 && (
            <div className="flex items-center justify-between gap-2 rounded-md border border-[#FDE68A] bg-[#FFFBEB] px-3 py-2.5 text-xs text-[#92400E]">
              <span>Belum ada kategori menu. Buat kategori terlebih dahulu.</span>
              <Button
                type="button"
                variant="outline"
                size="xs"
                onClick={() => {
                  setProductModalOpen(false)
                  setCatModalOpen(true)
                }}
              >
                Buat Kategori
              </Button>
            </div>
          )}

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="sm:col-span-2">
              <FieldLabel htmlFor="mn-name">Nama Menu</FieldLabel>
              <Input
                id="mn-name"
                required
                value={prodName}
                onChange={(e) => setProdName(e.target.value)}
                placeholder="Contoh: Kopi Susu Aren"
              />
            </div>
            <div>
              <FieldLabel htmlFor="mn-sku">Kode SKU</FieldLabel>
              <Input
                id="mn-sku"
                required
                value={prodSku}
                onChange={(e) => setProdSku(e.target.value.toUpperCase())}
                placeholder="ESP-01"
                className="font-mono uppercase"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <FieldLabel htmlFor="mn-cat">Kategori</FieldLabel>
              <Select
                id="mn-cat"
                value={prodCategoryId}
                onChange={(e) => setProdCategoryId(e.target.value)}
                options={
                  state.categories.length > 0
                    ? state.categories.map((c) => ({ value: c.id, label: c.name }))
                    : [{ value: "", label: "Belum ada kategori" }]
                }
              />
            </div>
            <div>
              <FieldLabel htmlFor="mn-price">Harga Jual Dasar (Rp)</FieldLabel>
              <CurrencyInput
                id="mn-price"
                value={prodBasePrice}
                onChange={setProdBasePrice}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {isOwner && (
              <div>
                <FieldLabel htmlFor="mn-scope">Cakupan Menu</FieldLabel>
                <Select
                  id="mn-scope"
                  value={prodBranchScope}
                  onChange={(e) => setProdBranchScope(e.target.value)}
                  options={[
                    { value: "GLOBAL", label: "Pusat (Semua Cabang)" },
                    ...activeBranches.map((b) => ({
                      value: b.id,
                      label: `Khusus ${b.name}`,
                    })),
                  ]}
                />
              </div>
            )}
            <div>
              <FieldLabel htmlFor="mn-mark" hint="Maks 3 huruf">
                Inisial Kartu
              </FieldLabel>
              <Input
                id="mn-mark"
                maxLength={3}
                value={prodMark}
                onChange={(e) => setProdMark(e.target.value.toUpperCase())}
                placeholder="KS"
                className="font-mono uppercase"
              />
            </div>
            <div>
              <FieldLabel htmlFor="mn-tone">Warna Kartu</FieldLabel>
              <Select
                id="mn-tone"
                value={prodTone}
                onChange={(e) => setProdTone(e.target.value as ProductTone)}
                options={TONE_OPTIONS}
              />
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-5 rounded-md border border-[#EFECE7] bg-[#FAF9F7] px-3.5 py-2.5 text-xs">
            <label className="inline-flex cursor-pointer items-center gap-2 text-[#4A4640]">
              <input
                type="checkbox"
                checked={prodCustomizable}
                onChange={(e) => setProdCustomizable(e.target.checked)}
                className="h-3.5 w-3.5 accent-[#18181B]"
              />
              <span>Aktifkan opsi kustomisasi (Suhu &amp; Level Gula)</span>
            </label>
            <label className="inline-flex cursor-pointer items-center gap-2 text-[#4A4640]">
              <input
                type="checkbox"
                checked={prodActive}
                onChange={(e) => setProdActive(e.target.checked)}
                className="h-3.5 w-3.5 accent-[#18181B]"
              />
              <span>Menu aktif</span>
            </label>
          </div>

          {/* Recipe (BOM) Builder */}
          <div className="space-y-2.5 rounded-lg border border-[#E5E2DC] bg-[#FAF9F7] p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-xs font-semibold text-[#18181B]">
                  Resep Bahan Baku (BOM — Referensi HPP &amp; Shift)
                </p>
                <p className="text-[10px] text-[#77736D]">
                  Digunakan untuk menghitung HPP &amp; estimasi pemakaian per shift; tidak memotong stok otomatis saat terjual.
                </p>
              </div>
              <Button
                type="button"
                variant="outline"
                size="xs"
                disabled={state.ingredients.length === 0}
                onClick={() =>
                  setRecipeRows((prev) => [
                    ...prev,
                    { ingredient_id: state.ingredients[0]?.id ?? "", qty_required: "1" },
                  ])
                }
              >
                <Plus className="h-3 w-3" strokeWidth={1.5} />
                Tambah Bahan
              </Button>
            </div>

            {state.ingredients.length === 0 ? (
              <div className="rounded-md border border-dashed border-[#D6D2C9] bg-white px-3 py-4 text-center text-xs text-[#77736D]">
                Belum ada bahan baku terdaftar.{" "}
                <Link
                  href={stockPageHref}
                  onClick={() => setProductModalOpen(false)}
                  className="font-semibold text-[#C2572A] hover:underline"
                >
                  Tambahkan bahan baku di menu Stok terlebih dahulu →
                </Link>
              </div>
            ) : recipeRows.length === 0 ? (
              <p className="rounded-md border border-dashed border-[#D6D2C9] bg-white px-3 py-3 text-center text-[11px] text-[#8E8982]">
                Klik &ldquo;Tambah Bahan&rdquo; untuk menghubungkan takaran resep menu ini.
              </p>
            ) : (
              <div className="space-y-2">
                {recipeRows.map((row, idx) => {
                  const ing = ingredientMap.get(row.ingredient_id)
                  const lineCost = Math.round((ing?.cost_per_unit ?? 0) * (Number(row.qty_required) || 0))
                  return (
                    <div
                      key={idx}
                      className="grid grid-cols-12 items-center gap-2 rounded-md border border-[#E5E2DC] bg-white p-2"
                    >
                      <div className="col-span-6">
                        <Select
                          value={row.ingredient_id}
                          onChange={(e) =>
                            setRecipeRows((prev) =>
                              prev.map((r, i) =>
                                i === idx ? { ...r, ingredient_id: e.target.value } : r
                              )
                            )
                          }
                          className="h-8 text-xs"
                          options={state.ingredients.map((i) => ({
                            value: i.id,
                            label: `${i.name} (${i.unit})`,
                          }))}
                        />
                      </div>
                      <div className="col-span-3">
                        <Input
                          type="number"
                          min={0.01}
                          step="any"
                          value={row.qty_required}
                          onChange={(e) =>
                            setRecipeRows((prev) =>
                              prev.map((r, i) =>
                                i === idx ? { ...r, qty_required: e.target.value } : r
                              )
                            )
                          }
                          className="h-8 font-mono text-xs tabular-nums"
                          placeholder="Takaran"
                        />
                      </div>
                      <div className="col-span-2 text-right font-mono text-[10px] tabular-nums text-[#67625B]">
                        {formatIDR(lineCost)}
                      </div>
                      <div className="col-span-1 text-right">
                        <button
                          type="button"
                          aria-label="Hapus baris resep"
                          onClick={() =>
                            setRecipeRows((prev) => prev.filter((_, i) => i !== idx))
                          }
                          className="rounded p-1 text-[#8E8982] hover:bg-[#FEF2F2] hover:text-[#991B1B] cursor-pointer"
                        >
                          <X className="h-3.5 w-3.5" strokeWidth={1.5} />
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}

            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[#E5E2DC] pt-2.5 text-xs">
              <span className="text-[#67625B]">
                Estimasi HPP Resep:{" "}
                <strong className="font-mono text-[#18181B]">{formatIDR(draftRecipeCogs)}</strong>
              </span>
              <span className="text-[#67625B]">
                Estimasi Margin:{" "}
                <strong
                  className={cn(
                    "font-mono",
                    draftMarginPct >= 60 ? "text-[#166534]" : "text-[#A16207]"
                  )}
                >
                  {draftMarginPct}%
                </strong>
              </span>
            </div>
          </div>

          {prodError && (
            <p className="rounded-md border border-[#FECACA] bg-[#FEF2F2] px-3 py-2 text-xs text-[#991B1B]">
              {prodError}
            </p>
          )}

          <div className="flex gap-2 pt-1">
            <Button
              variant="outline"
              size="md"
              className="flex-1"
              disabled={prodSaving}
              onClick={() => setProductModalOpen(false)}
            >
              Batal
            </Button>
            <Button
              type="submit"
              variant="default"
              size="md"
              className="flex-1"
              disabled={prodSaving || state.categories.length === 0}
            >
              {prodSaving
                ? "Menyimpan…"
                : editingProduct
                ? "Simpan Perubahan"
                : "Simpan Menu & Resep"}
            </Button>
          </div>
        </form>
      </Dialog>

      {/* Branch Override Modal (Availability & Custom Price) */}
      <Dialog
        open={Boolean(overrideTarget)}
        onClose={() => setOverrideTarget(null)}
        eyebrow="PENGATURAN MENU CABANG"
        title={overrideTarget ? `${overrideTarget.product.name}` : ""}
        description={
          overrideTarget
            ? `Atur ketersediaan & harga khusus di cabang ${branchMap.get(overrideTarget.branchId)?.name ?? ""}.`
            : ""
        }
        maxWidthClassName="max-w-sm"
      >
        <form onSubmit={handleSaveOverride} className="space-y-4">
          <div className="rounded-md border border-[#E5E2DC] bg-[#FAF9F7] p-3.5">
            <label className="flex cursor-pointer items-center justify-between text-xs font-semibold text-[#18181B]">
              <span>Status di Kasir Cabang</span>
              <input
                type="checkbox"
                checked={overrideAvailable}
                onChange={(e) => setOverrideAvailable(e.target.checked)}
                className="h-4 w-4 accent-[#166534]"
              />
            </label>
            <p className="mt-1 text-[11px] text-[#77736D]">
              {overrideAvailable
                ? "Tersedia — dapat dipesan di kasir cabang ini."
                : "Habis / Nonaktif — tombol produk dikunci di kasir cabang ini."}
            </p>
          </div>

          <div className="space-y-2.5">
            <label className="inline-flex cursor-pointer items-center gap-2 text-xs font-medium text-[#4A4640]">
              <input
                type="checkbox"
                checked={overrideUseCustomPrice}
                onChange={(e) => setOverrideUseCustomPrice(e.target.checked)}
                className="h-3.5 w-3.5 accent-[#18181B]"
              />
              <span>Gunakan harga khusus untuk cabang ini</span>
            </label>

            {overrideUseCustomPrice ? (
              <div>
                <FieldLabel htmlFor="override-price">Harga Khusus Cabang (Rp)</FieldLabel>
                <CurrencyInput
                  id="override-price"
                  value={overrideCustomPrice}
                  onChange={setOverrideCustomPrice}
                />
              </div>
            ) : (
              <p className="text-[11px] text-[#8E8982]">
                Mengikuti harga dasar:{" "}
                <strong className="font-mono text-[#18181B]">
                  {formatIDR(overrideTarget?.product.base_price ?? 0)}
                </strong>
              </p>
            )}
          </div>

          <div className="flex gap-2 pt-1">
            <Button
              variant="outline"
              size="md"
              className="flex-1"
              disabled={overrideSaving}
              onClick={() => setOverrideTarget(null)}
            >
              Batal
            </Button>
            <Button type="submit" variant="default" size="md" className="flex-1" disabled={overrideSaving}>
              {overrideSaving ? "Menyimpan…" : "Simpan"}
            </Button>
          </div>
        </form>
      </Dialog>

      {/* Delete Product Confirmation */}
      <Dialog
        open={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        eyebrow="HAPUS MENU"
        title={`Hapus "${deleteTarget?.name ?? ""}"?`}
        description="Menu dan tautan resepnya akan dihapus dari katalog. Riwayat transaksi omset lama tetap tersimpan utuh."
        maxWidthClassName="max-w-sm"
      >
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="md"
            className="flex-1"
            disabled={deleting}
            onClick={() => setDeleteTarget(null)}
          >
            Batal
          </Button>
          <Button
            variant="destructiveSolid"
            size="md"
            className="flex-1"
            disabled={deleting}
            onClick={async () => {
              if (!deleteTarget) return
              setDeleting(true)
              try {
                const res = await deleteProduct(deleteTarget.id)
                if (!res.ok) {
                  toast(res.error || "Gagal menghapus menu.", "error")
                  return
                }
                toast(`Menu "${deleteTarget.name}" dihapus.`, "info")
                setDeleteTarget(null)
              } finally {
                setDeleting(false)
              }
            }}
          >
            <Trash2 className="h-4 w-4" strokeWidth={1.5} />
            {deleting ? "Menghapus…" : "Hapus Menu"}
          </Button>
        </div>
      </Dialog>
    </div>
  )
}
