import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"
import { defaultRouteForRole } from "@/lib/kalapos/auth"
import { SESSION_COOKIE_NAME, verifySessionToken } from "@/lib/kalapos/session-server"

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl
  const rawToken = request.cookies.get(SESSION_COOKIE_NAME)?.value
  const session = await verifySessionToken(rawToken)

  const isPosRoute = pathname === "/pos" || pathname.startsWith("/pos/")
  const isOwnerRoute = pathname === "/owner" || pathname.startsWith("/owner/")

  // Protect /pos/* and /owner/* from unauthenticated or tampered sessions
  if ((isPosRoute || isOwnerRoute) && !session) {
    const loginUrl = new URL("/login", request.url)
    loginUrl.searchParams.set("next", pathname)
    return NextResponse.redirect(loginUrl)
  }

  // Strictly enforce Owner role on /owner/*
  if (isOwnerRoute && session && session.role !== "OWNER") {
    const fallback = new URL(defaultRouteForRole(session.role), request.url)
    fallback.searchParams.set("denied", "owner")
    return NextResponse.redirect(fallback)
  }

  // Barista cannot access cash shift closing controls
  if (pathname === "/pos/shift" && session && session.role === "BARISTA") {
    return NextResponse.redirect(new URL("/pos/queue", request.url))
  }

  // Only Owner and Branch Manager can access /pos/menu CRUD
  if (
    pathname === "/pos/menu" &&
    session &&
    session.role !== "OWNER" &&
    session.role !== "MANAGER"
  ) {
    return NextResponse.redirect(new URL(defaultRouteForRole(session.role), request.url))
  }

  return NextResponse.next()
}

export const config = {
  matcher: ["/pos/:path*", "/owner/:path*"],
}
