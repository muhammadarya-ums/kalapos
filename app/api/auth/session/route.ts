import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"
import { findActiveUserById } from "@/lib/kalapos/auth-server"
import { findActiveBranchServer } from "@/lib/kalapos/branches-server"
import { SESSION_COOKIE_NAME, verifySessionToken } from "@/lib/kalapos/session-server"
import type { SessionUser } from "@/lib/kalapos/types"

function clearSessionResponse() {
  const response = NextResponse.json({ authenticated: false, session: null }, { status: 200 })
  response.cookies.set(SESSION_COOKIE_NAME, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  })
  return response
}

export async function GET(request: NextRequest) {
  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value
  const parsed = await verifySessionToken(token)
  if (!parsed) {
    return NextResponse.json({ authenticated: false, session: null }, { status: 200 })
  }

  // Re-validate user status against server-side Kafe Kala registry
  const activeUser = findActiveUserById(parsed.userId)
  if (!activeUser) {
    return clearSessionResponse()
  }

  if (activeUser.role !== "OWNER") {
    if (!activeUser.branch_id || !findActiveBranchServer(activeUser.branch_id)) {
      return clearSessionResponse()
    }
  }

  const session: SessionUser = {
    userId: activeUser.id,
    role: activeUser.role,
    branchId: activeUser.role === "OWNER" ? null : activeUser.branch_id,
    fullName: activeUser.full_name,
    email: activeUser.email,
  }

  return NextResponse.json({ authenticated: true, session }, { status: 200 })
}

export async function POST() {
  return NextResponse.json(
    { ok: false, error: "Autentikasi harus melalui /api/auth/login dengan kredensial valid." },
    { status: 405 }
  )
}
