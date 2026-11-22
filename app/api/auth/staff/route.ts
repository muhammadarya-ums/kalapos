import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"
import {
  createStaffAccountServer,
  deleteStaffAccountServer,
  getAuthenticatedServerSession,
  listAllUsersSanitized,
  toggleStaffActiveServer,
} from "@/lib/kalapos/auth-server"
import { findActiveBranchServer } from "@/lib/kalapos/branches-server"
import type { Role } from "@/lib/kalapos/types"

export async function GET() {
  const session = await getAuthenticatedServerSession()
  if (!session) {
    return NextResponse.json({ ok: false, error: "Autentikasi diperlukan." }, { status: 401 })
  }

  const all = listAllUsersSanitized()
  if (session.role === "OWNER") {
    return NextResponse.json({ ok: true, users: all }, { status: 200 })
  }

  // Non-owner staff only see minimal directory entries for their own branch + Owner label
  const scoped = all
    .filter((u) => u.role === "OWNER" || u.branch_id === session.branchId)
    .map((u) => ({
      ...u,
      email: u.id === session.userId ? u.email : "",
    }))
  return NextResponse.json({ ok: true, users: scoped }, { status: 200 })
}

export async function POST(request: NextRequest) {
  const session = await getAuthenticatedServerSession()
  if (!session) {
    return NextResponse.json({ ok: false, error: "Autentikasi diperlukan." }, { status: 401 })
  }
  if (session.role !== "OWNER") {
    return NextResponse.json(
      { ok: false, error: "Hanya Owner Kafe Kala yang dapat menambahkan akun staf." },
      { status: 403 }
    )
  }

  try {
    const body = (await request.json()) as {
      fullName?: string
      email?: string
      password?: string
      role?: Role
      branchId?: string
      pin?: string
    }

    if (!body.branchId || !findActiveBranchServer(body.branchId)) {
      return NextResponse.json(
        { ok: false, error: "Cabang penugasan tidak ditemukan atau belum aktif." },
        { status: 400 }
      )
    }

    if (body.role === "OWNER") {
      return NextResponse.json(
        { ok: false, error: "Kafe Kala hanya memiliki satu akun Owner utama." },
        { status: 400 }
      )
    }

    const res = createStaffAccountServer({
      fullName: body.fullName ?? "",
      email: body.email ?? "",
      password: body.password ?? "",
      role: (body.role ?? "CASHIER") as Exclude<Role, "OWNER">,
      branchId: body.branchId,
      pin: body.pin ?? "",
    })

    if (!res.ok) {
      return NextResponse.json({ ok: false, error: res.error }, { status: 400 })
    }

    return NextResponse.json({ ok: true, user: res.user, users: res.users }, { status: 201 })
  } catch {
    return NextResponse.json(
      { ok: false, error: "Data akun staf tidak valid." },
      { status: 400 }
    )
  }
}

export async function PATCH(request: NextRequest) {
  const session = await getAuthenticatedServerSession()
  if (!session) {
    return NextResponse.json({ ok: false, error: "Autentikasi diperlukan." }, { status: 401 })
  }
  if (session.role !== "OWNER") {
    return NextResponse.json(
      { ok: false, error: "Hanya Owner Kafe Kala yang dapat mengubah status staf." },
      { status: 403 }
    )
  }

  try {
    const body = (await request.json()) as { userId?: string }
    if (!body.userId) {
      return NextResponse.json({ ok: false, error: "ID staf wajib diisi." }, { status: 400 })
    }
    const res = toggleStaffActiveServer(body.userId)
    if (!res.ok) {
      return NextResponse.json({ ok: false, error: res.error }, { status: 400 })
    }
    return NextResponse.json({ ok: true, user: res.user, users: res.users }, { status: 200 })
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
      { ok: false, error: "Hanya Owner Kafe Kala yang dapat menghapus akun staf." },
      { status: 403 }
    )
  }

  const userId = request.nextUrl.searchParams.get("userId")
  if (!userId) {
    return NextResponse.json({ ok: false, error: "ID staf wajib diisi." }, { status: 400 })
  }

  const res = deleteStaffAccountServer(userId)
  if (!res.ok) {
    return NextResponse.json({ ok: false, error: res.error }, { status: 400 })
  }
  return NextResponse.json({ ok: true, users: res.users }, { status: 200 })
}
