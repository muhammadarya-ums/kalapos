import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"
import { getAuthenticatedServerSession } from "@/lib/kalapos/auth-server"
import { findActiveBranchServer } from "@/lib/kalapos/branches-server"
import {
  createCategoryServer,
  createProductServer,
  deleteCategoryServer,
  deleteProductServer,
  getMenuCatalogServer,
  getScopedMenuCatalogServer,
  updateProductServer,
  upsertBranchProductOverrideServer,
  type ProductUpsertServerInput,
} from "@/lib/kalapos/menu-server"

function canManageMenu(role: string): role is "OWNER" | "MANAGER" {
  return role === "OWNER" || role === "MANAGER"
}

export async function GET() {
  const session = await getAuthenticatedServerSession()
  if (!session) {
    return NextResponse.json({ ok: false, error: "Autentikasi diperlukan." }, { status: 401 })
  }

  const catalog =
    session.role === "OWNER"
      ? getMenuCatalogServer()
      : getScopedMenuCatalogServer(session.branchId)

  return NextResponse.json({ ok: true, catalog }, { status: 200 })
}

export async function POST(request: NextRequest) {
  const session = await getAuthenticatedServerSession()
  if (!session) {
    return NextResponse.json({ ok: false, error: "Autentikasi diperlukan." }, { status: 401 })
  }
  if (!canManageMenu(session.role)) {
    return NextResponse.json(
      { ok: false, error: "Hanya Owner dan Manager Cabang yang dapat mengelola menu." },
      { status: 403 }
    )
  }

  try {
    const body = (await request.json()) as {
      entity?: "category" | "product"
      name?: string
      input?: ProductUpsertServerInput
    }

    if (body.entity === "category") {
      const res = createCategoryServer(body.name ?? "")
      if (!res.ok) return NextResponse.json({ ok: false, error: res.error }, { status: 400 })
      const catalog =
        session.role === "OWNER" ? res.catalog : getScopedMenuCatalogServer(session.branchId)
      return NextResponse.json({ ok: true, category: res.category, catalog }, { status: 201 })
    }

    if (body.entity === "product" && body.input) {
      let targetBranchId: string | null = null
      if (session.role === "MANAGER") {
        if (!session.branchId) {
          return NextResponse.json(
            { ok: false, error: "Akun Manager tidak terikat pada cabang aktif." },
            { status: 403 }
          )
        }
        targetBranchId = session.branchId
      } else {
        targetBranchId = body.input.branch_id ? body.input.branch_id.trim() : null
        if (targetBranchId && !findActiveBranchServer(targetBranchId)) {
          return NextResponse.json(
            { ok: false, error: "Cabang tujuan menu tidak ditemukan atau nonaktif." },
            { status: 400 }
          )
        }
      }

      const res = createProductServer({
        ...body.input,
        branch_id: targetBranchId,
      })
      if (!res.ok) return NextResponse.json({ ok: false, error: res.error }, { status: 400 })

      const catalog =
        session.role === "OWNER" ? res.catalog : getScopedMenuCatalogServer(session.branchId)
      return NextResponse.json({ ok: true, product: res.product, catalog }, { status: 201 })
    }

    return NextResponse.json({ ok: false, error: "Permintaan tidak valid." }, { status: 400 })
  } catch {
    return NextResponse.json({ ok: false, error: "Data menu tidak valid." }, { status: 400 })
  }
}

export async function PATCH(request: NextRequest) {
  const session = await getAuthenticatedServerSession()
  if (!session) {
    return NextResponse.json({ ok: false, error: "Autentikasi diperlukan." }, { status: 401 })
  }
  if (!canManageMenu(session.role)) {
    return NextResponse.json(
      { ok: false, error: "Hanya Owner dan Manager Cabang yang dapat mengubah menu." },
      { status: 403 }
    )
  }

  try {
    const body = (await request.json()) as {
      entity?: "product" | "branch_override"
      productId?: string
      input?: ProductUpsertServerInput
      branchId?: string
      isAvailable?: boolean
      customPrice?: number | null
    }

    if (body.entity === "branch_override") {
      const targetBranchId =
        session.role === "MANAGER" ? session.branchId ?? "" : (body.branchId ?? "").trim()

      if (!targetBranchId || !body.productId) {
        return NextResponse.json(
          { ok: false, error: "Cabang dan menu wajib ditentukan." },
          { status: 400 }
        )
      }

      const res = upsertBranchProductOverrideServer({
        branch_id: targetBranchId,
        product_id: body.productId,
        is_available: body.isAvailable !== false,
        custom_price: body.customPrice ?? null,
      })
      if (!res.ok) return NextResponse.json({ ok: false, error: res.error }, { status: 400 })

      const catalog =
        session.role === "OWNER" ? res.catalog : getScopedMenuCatalogServer(session.branchId)
      return NextResponse.json(
        { ok: true, branchProduct: res.branchProduct, catalog },
        { status: 200 }
      )
    }

    if (body.entity === "product" && body.productId && body.input) {
      const res = updateProductServer(body.productId, body.input, {
        role: session.role,
        branchId: session.branchId,
      })
      if (!res.ok) return NextResponse.json({ ok: false, error: res.error }, { status: 400 })

      const catalog =
        session.role === "OWNER" ? res.catalog : getScopedMenuCatalogServer(session.branchId)
      return NextResponse.json({ ok: true, product: res.product, catalog }, { status: 200 })
    }

    return NextResponse.json({ ok: false, error: "Permintaan pembaruan tidak valid." }, { status: 400 })
  } catch {
    return NextResponse.json({ ok: false, error: "Data pembaruan menu tidak valid." }, { status: 400 })
  }
}

export async function DELETE(request: NextRequest) {
  const session = await getAuthenticatedServerSession()
  if (!session) {
    return NextResponse.json({ ok: false, error: "Autentikasi diperlukan." }, { status: 401 })
  }
  if (!canManageMenu(session.role)) {
    return NextResponse.json(
      { ok: false, error: "Hanya Owner dan Manager Cabang yang dapat menghapus menu." },
      { status: 403 }
    )
  }

  const entity = request.nextUrl.searchParams.get("entity")
  const id = request.nextUrl.searchParams.get("id")
  if (!entity || !id) {
    return NextResponse.json({ ok: false, error: "Parameter penghapusan tidak lengkap." }, { status: 400 })
  }

  if (entity === "category") {
    const res = deleteCategoryServer(id)
    if (!res.ok) return NextResponse.json({ ok: false, error: res.error }, { status: 400 })
    const catalog =
      session.role === "OWNER" ? res.catalog : getScopedMenuCatalogServer(session.branchId)
    return NextResponse.json({ ok: true, catalog }, { status: 200 })
  }

  if (entity === "product") {
    const res = deleteProductServer(id, { role: session.role, branchId: session.branchId })
    if (!res.ok) return NextResponse.json({ ok: false, error: res.error }, { status: 400 })
    const catalog =
      session.role === "OWNER" ? res.catalog : getScopedMenuCatalogServer(session.branchId)
    return NextResponse.json({ ok: true, catalog }, { status: 200 })
  }

  return NextResponse.json({ ok: false, error: "Entitas tidak dikenal." }, { status: 400 })
}
