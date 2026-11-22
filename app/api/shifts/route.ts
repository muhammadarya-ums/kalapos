import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"
import { getAuthenticatedServerSession } from "@/lib/kalapos/auth-server"
import {
  closeShiftBlindServer,
  getOperationsSnapshotServer,
  openShiftServer,
} from "@/lib/kalapos/operations-server"

export async function GET() {
  const session = await getAuthenticatedServerSession()
  if (!session) {
    return NextResponse.json({ ok: false, error: "Autentikasi diperlukan." }, { status: 401 })
  }

  const ops = await getOperationsSnapshotServer(
    session.role === "OWNER" ? null : session.branchId
  )
  return NextResponse.json({ ok: true, shifts: ops.shifts }, { status: 200 })
}

export async function POST(request: NextRequest) {
  const session = await getAuthenticatedServerSession()
  if (!session) {
    return NextResponse.json({ ok: false, error: "Autentikasi diperlukan." }, { status: 401 })
  }

  try {
    const body = (await request.json()) as {
      branchId?: string
      openingCash?: number
      notes?: string
    }

    const targetBranchId =
      session.role === "OWNER" ? (body.branchId ?? "").trim() : session.branchId ?? ""

    if (!targetBranchId) {
      return NextResponse.json(
        { ok: false, error: "Cabang aktif wajib ditentukan untuk membuka shift." },
        { status: 400 }
      )
    }

    const res = await openShiftServer({
      branchId: targetBranchId,
      userId: session.userId,
      openingCash: Number(body.openingCash ?? 0),
      notes: body.notes ?? "",
    })

    if (!res.ok) {
      return NextResponse.json({ ok: false, error: res.error }, { status: 400 })
    }

    const scopedShifts =
      session.role === "OWNER"
        ? res.shifts
        : res.shifts.filter((s) => s.branch_id === session.branchId)

    return NextResponse.json(
      { ok: true, shift: res.shift, shifts: scopedShifts },
      { status: 201 }
    )
  } catch {
    return NextResponse.json({ ok: false, error: "Data pembukaan shift tidak valid." }, { status: 400 })
  }
}

export async function PATCH(request: NextRequest) {
  const session = await getAuthenticatedServerSession()
  if (!session) {
    return NextResponse.json({ ok: false, error: "Autentikasi diperlukan." }, { status: 401 })
  }

  try {
    const body = (await request.json()) as {
      shiftId?: string
      actualCash?: number
      notes?: string
    }

    if (!body.shiftId) {
      return NextResponse.json({ ok: false, error: "ID shift wajib diisi." }, { status: 400 })
    }

    const res = await closeShiftBlindServer({
      shiftId: body.shiftId,
      actualCash: Number(body.actualCash ?? 0),
      notes: body.notes ?? "",
      actor: { role: session.role, branchId: session.branchId },
    })

    if (!res.ok) {
      return NextResponse.json({ ok: false, error: res.error }, { status: 400 })
    }

    const scopedShifts =
      session.role === "OWNER"
        ? res.shifts
        : res.shifts.filter((s) => s.branch_id === session.branchId)

    return NextResponse.json(
      { ok: true, summary: res.summary, shifts: scopedShifts },
      { status: 200 }
    )
  } catch {
    return NextResponse.json({ ok: false, error: "Data penutupan shift tidak valid." }, { status: 400 })
  }
}
