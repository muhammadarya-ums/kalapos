import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"
import { getAuthenticatedServerSession } from "@/lib/kalapos/auth-server"
import {
  archiveBranchServer,
  createBranchServer,
  deleteBranchServer,
  listBranchesServer,
  restoreBranchServer,
  updateBranchServer,
} from "@/lib/kalapos/branches-server"
import type { BranchUpsertInput } from "@/lib/kalapos/store"

export async function GET() {
  const session = await getAuthenticatedServerSession()
  if (!session) {
    return NextResponse.json({ ok: false, error: "Autentikasi diperlukan." }, { status: 401 })
  }

  const all = await listBranchesServer()
  if (session.role === "OWNER") {
    return NextResponse.json({ ok: true, branches: all }, { status: 200 })
  }

  const scoped = all.filter(
    (b) => b.id === session.branchId && !b.deleted_at && b.status !== "INACTIVE"
  )
  return NextResponse.json({ ok: true, branches: scoped }, { status: 200 })
}

export async function POST(request: NextRequest) {
  const session = await getAuthenticatedServerSession()
  if (!session) {
    return NextResponse.json({ ok: false, error: "Autentikasi diperlukan." }, { status: 401 })
  }
  if (session.role !== "OWNER") {
    return NextResponse.json(
      { ok: false, error: "Hanya Owner Kafe Kala yang dapat menambahkan cabang." },
      { status: 403 }
    )
  }

  try {
    const body = (await request.json()) as BranchUpsertInput
    const res = await createBranchServer(body)
    if (!res.ok) {
      return NextResponse.json({ ok: false, error: res.error }, { status: 400 })
    }
    return NextResponse.json(
      { ok: true, branch: res.branch, branches: res.branches },
      { status: 201 }
    )
  } catch {
    return NextResponse.json({ ok: false, error: "Data cabang tidak valid." }, { status: 400 })
  }
}

export async function PATCH(request: NextRequest) {
  const session = await getAuthenticatedServerSession()
  if (!session) {
    return NextResponse.json({ ok: false, error: "Autentikasi diperlukan." }, { status: 401 })
  }
  if (session.role !== "OWNER") {
    return NextResponse.json(
      { ok: false, error: "Hanya Owner Kafe Kala yang dapat memperbarui cabang." },
      { status: 403 }
    )
  }

  try {
    const body = (await request.json()) as {
      action?: "update" | "archive" | "restore"
      branchId?: string
      input?: BranchUpsertInput
    }
    if (!body.branchId) {
      return NextResponse.json({ ok: false, error: "ID cabang wajib diisi." }, { status: 400 })
    }

    if (body.action === "archive") {
      const res = await archiveBranchServer(body.branchId)
      if (!res.ok) return NextResponse.json({ ok: false, error: res.error }, { status: 400 })
      return NextResponse.json({ ok: true, branch: res.branch, branches: res.branches }, { status: 200 })
    }

    if (body.action === "restore") {
      const res = await restoreBranchServer(body.branchId)
      if (!res.ok) return NextResponse.json({ ok: false, error: res.error }, { status: 400 })
      return NextResponse.json({ ok: true, branch: res.branch, branches: res.branches }, { status: 200 })
    }

    if (!body.input) {
      return NextResponse.json({ ok: false, error: "Data pembaruan cabang wajib diisi." }, { status: 400 })
    }
    const res = await updateBranchServer(body.branchId, body.input)
    if (!res.ok) return NextResponse.json({ ok: false, error: res.error }, { status: 400 })
    return NextResponse.json({ ok: true, branch: res.branch, branches: res.branches }, { status: 200 })
  } catch {
    return NextResponse.json({ ok: false, error: "Permintaan tidak valid." }, { status: 400 })
  }
}

export async function DELETE(request: NextRequest) {
  const session = await getAuthenticatedServerSession()
  if (!session) {
    return NextResponse.json({ ok: false, error: "Autentikasi diperlukan." }, { status: 401 })
  }
  if (session.role !== "OWNER") {
    return NextResponse.json(
      { ok: false, error: "Hanya Owner Kafe Kala yang dapat menghapus cabang." },
      { status: 403 }
    )
  }

  const branchId = request.nextUrl.searchParams.get("branchId")
  if (!branchId) {
    return NextResponse.json({ ok: false, error: "ID cabang wajib diisi." }, { status: 400 })
  }

  const res = await deleteBranchServer(branchId)
  if (!res.ok) {
    return NextResponse.json({ ok: false, error: res.error }, { status: 400 })
  }
  return NextResponse.json({ ok: true, branches: res.branches }, { status: 200 })
}
