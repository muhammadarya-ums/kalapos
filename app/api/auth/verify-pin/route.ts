import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"
import {
  clearAuthFailures,
  getAuthenticatedServerSession,
  isRateLimited,
  recordAuthFailure,
  verifySupervisorPinServer,
} from "@/lib/kalapos/auth-server"

export async function POST(request: NextRequest) {
  const session = await getAuthenticatedServerSession()
  if (!session) {
    return NextResponse.json({ ok: false, error: "Sesi autentikasi tidak valid." }, { status: 401 })
  }

  const rateKey = `sup-pin:${session.userId}`
  const limit = isRateLimited(rateKey)
  if (limit.limited) {
    return NextResponse.json(
      {
        ok: false,
        error: `Terlalu banyak percobaan PIN gagal. Coba lagi dalam ${Math.ceil(limit.retryAfterSec / 60)} menit.`,
      },
      { status: 429 }
    )
  }

  try {
    const body = (await request.json()) as { pin?: string; branchId?: string | null }
    const pin = typeof body.pin === "string" ? body.pin : ""
    const branchId = typeof body.branchId === "string" ? body.branchId : session.branchId

    const res = await verifySupervisorPinServer(pin, branchId)
    if (!res.ok) {
      recordAuthFailure(rateKey)
      return NextResponse.json({ ok: false, error: res.error }, { status: 401 })
    }

    clearAuthFailures(rateKey)
    return NextResponse.json(
      {
        ok: true,
        supervisorId: res.supervisor.id,
        supervisorName: res.supervisor.full_name,
      },
      { status: 200 }
    )
  } catch {
    return NextResponse.json(
      { ok: false, error: "Permintaan verifikasi PIN tidak valid." },
      { status: 400 }
    )
  }
}
