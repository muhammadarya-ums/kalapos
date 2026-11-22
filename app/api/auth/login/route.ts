import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"
import {
  clearAuthFailures,
  isRateLimited,
  recordAuthFailure,
  verifyEmailCredentials,
  verifyPinCredentials,
} from "@/lib/kalapos/auth-server"
import { findActiveBranchServer } from "@/lib/kalapos/branches-server"
import { SESSION_COOKIE_NAME, signSessionToken } from "@/lib/kalapos/session-server"
import type { SessionUser } from "@/lib/kalapos/types"

function getClientIp(request: NextRequest): string {
  const forwarded = request.headers.get("x-forwarded-for")
  if (forwarded) return forwarded.split(",")[0].trim()
  return request.headers.get("x-real-ip") || "local"
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as {
      method?: "email" | "pin"
      email?: string
      password?: string
      rememberMe?: boolean
      pin?: string
      branchId?: string
    }

    const ip = getClientIp(request)
    const method = body.method === "pin" ? "pin" : "email"
    const rateKey =
      method === "email"
        ? `email:${ip}:${(body.email ?? "").trim().toLowerCase()}`
        : `pin:${ip}:${body.branchId ?? ""}`

    const limit = isRateLimited(rateKey)
    if (limit.limited) {
      return NextResponse.json(
        {
          ok: false,
          error: `Terlalu banyak percobaan gagal. Coba lagi dalam ${Math.ceil(limit.retryAfterSec / 60)} menit.`,
        },
        { status: 429 }
      )
    }

    let matchedUser = null
    let rememberMe = false

    if (method === "email") {
      if (typeof body.email !== "string" || typeof body.password !== "string" || !body.email.trim() || !body.password) {
        return NextResponse.json(
          { ok: false, error: "Masukkan email dan kata sandi Anda." },
          { status: 400 }
        )
      }
      const res = verifyEmailCredentials(body.email, body.password)
      if (!res.ok) {
        recordAuthFailure(rateKey)
        return NextResponse.json({ ok: false, error: res.error }, { status: 401 })
      }
      matchedUser = res.user
      rememberMe = Boolean(body.rememberMe)
    } else {
      const branchId = typeof body.branchId === "string" ? body.branchId.trim() : ""
      if (!branchId) {
        return NextResponse.json(
          { ok: false, error: "Pilih cabang operasional Kafe Kala terlebih dahulu." },
          { status: 400 }
        )
      }
      const activeBranch = findActiveBranchServer(branchId)
      if (!activeBranch) {
        return NextResponse.json(
          { ok: false, error: "Cabang yang dipilih tidak ditemukan atau sedang nonaktif." },
          { status: 400 }
        )
      }
      const res = verifyPinCredentials(typeof body.pin === "string" ? body.pin : "", branchId)
      if (!res.ok) {
        recordAuthFailure(rateKey)
        return NextResponse.json({ ok: false, error: res.error }, { status: 401 })
      }
      matchedUser = res.user
      rememberMe = false
    }

    // Non-owner staff must belong to an active branch of Kafe Kala
    if (matchedUser.role !== "OWNER") {
      if (!matchedUser.branch_id || !findActiveBranchServer(matchedUser.branch_id)) {
        return NextResponse.json(
          {
            ok: false,
            error: "Cabang penugasan Anda belum aktif atau telah diarsipkan. Hubungi Owner Kafe Kala.",
          },
          { status: 403 }
        )
      }
    }

    clearAuthFailures(rateKey)

    const session: SessionUser = {
      userId: matchedUser.id,
      role: matchedUser.role,
      branchId: matchedUser.role === "OWNER" ? null : matchedUser.branch_id,
      fullName: matchedUser.full_name,
      email: matchedUser.email,
    }

    const maxAge = rememberMe ? 60 * 60 * 24 * 30 : 60 * 60 * 12
    const signedToken = await signSessionToken(session, maxAge)

    const response = NextResponse.json({ ok: true, session }, { status: 200 })
    response.cookies.set(SESSION_COOKIE_NAME, signedToken, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge,
    })
    return response
  } catch {
    return NextResponse.json(
      { ok: false, error: "Permintaan login tidak dapat diproses." },
      { status: 400 }
    )
  }
}
