import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"
import {
  getAuthenticatedServerSession,
  verifySupervisorPinServer,
} from "@/lib/kalapos/auth-server"
import { listBranchesServer } from "@/lib/kalapos/branches-server"
import {
  adjustBranchStockServer,
  createIngredientServer,
  deleteIngredientServer,
  getInventoryServer,
  getScopedInventoryServer,
  transferBranchStockServer,
  updateIngredientServer,
  type IngredientUpsertServerInput,
} from "@/lib/kalapos/inventory-server"

function canManageCatalog(role: string): role is "OWNER" | "MANAGER" {
  return role === "OWNER" || role === "MANAGER"
}

export async function GET() {
  const session = await getAuthenticatedServerSession()
  if (!session) {
    return NextResponse.json({ ok: false, error: "Autentikasi diperlukan." }, { status: 401 })
  }

  const inventory =
    session.role === "OWNER"
      ? getInventoryServer()
      : getScopedInventoryServer(session.branchId)

  return NextResponse.json({ ok: true, inventory }, { status: 200 })
}

export async function POST(request: NextRequest) {
  const session = await getAuthenticatedServerSession()
  if (!session) {
    return NextResponse.json({ ok: false, error: "Autentikasi diperlukan." }, { status: 401 })
  }

  try {
    const body = (await request.json()) as {
      action?: "create_ingredient" | "adjust_stock" | "transfer_stock"
      input?: IngredientUpsertServerInput
      branchId?: string
      shiftId?: string | null
      ingredientId?: string
      type?: "RESTOCK" | "MANUAL_OUT" | "WASTE" | "OPNAME"
      qty?: number
      notes?: string
      supervisorPin?: string
      fromBranchId?: string
      toBranchId?: string
    }

    if (body.action === "create_ingredient" && body.input) {
      if (!canManageCatalog(session.role)) {
        return NextResponse.json(
          { ok: false, error: "Hanya Owner dan Manager Cabang yang dapat menambah bahan baku." },
          { status: 403 }
        )
      }
      const allBranchIds = listBranchesServer()
        .filter((b) => !b.deleted_at)
        .map((b) => b.id)

      const targetBranchId =
        session.role === "MANAGER" ? session.branchId : body.input.branch_id ?? null

      const res = createIngredientServer(
        {
          ...body.input,
          branch_id: targetBranchId,
          user_id: session.userId,
          shift_id: body.shiftId ?? body.input.shift_id ?? null,
        },
        allBranchIds
      )
      if (!res.ok) return NextResponse.json({ ok: false, error: res.error }, { status: 400 })

      const inventory =
        session.role === "OWNER" ? res.inventory : getScopedInventoryServer(session.branchId)
      return NextResponse.json(
        { ok: true, ingredient: res.ingredient, inventory },
        { status: 201 }
      )
    }

    if (body.action === "adjust_stock") {
      const targetBranchId =
        session.role === "OWNER" ? (body.branchId ?? "").trim() : session.branchId ?? ""

      if (!targetBranchId || !body.ingredientId || !body.type) {
        return NextResponse.json(
          { ok: false, error: "Cabang, bahan baku, dan tipe mutasi wajib diisi." },
          { status: 400 }
        )
      }

      if (body.type === "OPNAME") {
        const pinCheck = verifySupervisorPinServer(body.supervisorPin ?? "", targetBranchId)
        if (!pinCheck.ok) {
          return NextResponse.json(
            { ok: false, error: pinCheck.error || "PIN Supervisor tidak valid." },
            { status: 401 }
          )
        }
      }

      const res = adjustBranchStockServer({
        branch_id: targetBranchId,
        shift_id: body.shiftId ?? null,
        ingredient_id: body.ingredientId,
        type: body.type,
        qty: Number(body.qty),
        notes: body.notes ?? "",
        user_id: session.userId,
      })
      if (!res.ok) return NextResponse.json({ ok: false, error: res.error }, { status: 400 })

      const inventory =
        session.role === "OWNER" ? res.inventory : getScopedInventoryServer(session.branchId)
      return NextResponse.json({ ok: true, movement: res.movement, inventory }, { status: 200 })
    }

    if (body.action === "transfer_stock") {
      if (session.role !== "OWNER") {
        return NextResponse.json(
          { ok: false, error: "Hanya Owner Kafe Kala yang dapat melakukan transfer stok antar cabang." },
          { status: 403 }
        )
      }
      const branches = listBranchesServer()
      const fromBranch = branches.find((b) => b.id === body.fromBranchId)
      const toBranch = branches.find((b) => b.id === body.toBranchId)
      if (!fromBranch || !toBranch || !body.ingredientId) {
        return NextResponse.json(
          { ok: false, error: "Cabang asal, cabang tujuan, dan bahan baku wajib valid." },
          { status: 400 }
        )
      }
      const res = transferBranchStockServer({
        from_branch_id: fromBranch.id,
        from_branch_name: fromBranch.name,
        to_branch_id: toBranch.id,
        to_branch_name: toBranch.name,
        ingredient_id: body.ingredientId,
        qty: Number(body.qty),
        notes: body.notes ?? "",
        user_id: session.userId,
      })
      if (!res.ok) return NextResponse.json({ ok: false, error: res.error }, { status: 400 })

      return NextResponse.json(
        { ok: true, transfer: res.transfer, inventory: res.inventory },
        { status: 200 }
      )
    }

    return NextResponse.json({ ok: false, error: "Aksi inventaris tidak dikenal." }, { status: 400 })
  } catch {
    return NextResponse.json({ ok: false, error: "Data inventaris tidak valid." }, { status: 400 })
  }
}

export async function PATCH(request: NextRequest) {
  const session = await getAuthenticatedServerSession()
  if (!session) {
    return NextResponse.json({ ok: false, error: "Autentikasi diperlukan." }, { status: 401 })
  }
  if (!canManageCatalog(session.role)) {
    return NextResponse.json(
      { ok: false, error: "Hanya Owner dan Manager Cabang yang dapat mengubah bahan baku." },
      { status: 403 }
    )
  }

  try {
    const body = (await request.json()) as {
      ingredientId?: string
      input?: {
        sku: string
        name: string
        unit: string
        cost_per_unit: number
        branch_id?: string | null
        min_threshold?: number
      }
    }

    if (!body.ingredientId || !body.input) {
      return NextResponse.json(
        { ok: false, error: "ID dan data bahan baku wajib diisi." },
        { status: 400 }
      )
    }

    const targetBranchId =
      session.role === "MANAGER" ? session.branchId : body.input.branch_id ?? null

    const res = updateIngredientServer(body.ingredientId, {
      ...body.input,
      branch_id: targetBranchId,
    })
    if (!res.ok) return NextResponse.json({ ok: false, error: res.error }, { status: 400 })

    const inventory =
      session.role === "OWNER" ? res.inventory : getScopedInventoryServer(session.branchId)
    return NextResponse.json(
      { ok: true, ingredient: res.ingredient, inventory },
      { status: 200 }
    )
  } catch {
    return NextResponse.json({ ok: false, error: "Data pembaruan bahan tidak valid." }, { status: 400 })
  }
}

export async function DELETE(request: NextRequest) {
  const session = await getAuthenticatedServerSession()
  if (!session) {
    return NextResponse.json({ ok: false, error: "Autentikasi diperlukan." }, { status: 401 })
  }
  if (!canManageCatalog(session.role)) {
    return NextResponse.json(
      { ok: false, error: "Hanya Owner dan Manager Cabang yang dapat menghapus bahan baku." },
      { status: 403 }
    )
  }

  const ingredientId = request.nextUrl.searchParams.get("ingredientId")
  if (!ingredientId) {
    return NextResponse.json({ ok: false, error: "ID bahan baku wajib diisi." }, { status: 400 })
  }

  const res = deleteIngredientServer(ingredientId)
  if (!res.ok) return NextResponse.json({ ok: false, error: res.error }, { status: 400 })

  const inventory =
    session.role === "OWNER" ? res.inventory : getScopedInventoryServer(session.branchId)
  return NextResponse.json({ ok: true, inventory }, { status: 200 })
}
