import type { Role, SessionUser } from "./types"

export const SESSION_COOKIE_NAME = "kalapos_session"

const VALID_ROLES: Role[] = ["OWNER", "MANAGER", "CASHIER", "BARISTA"]

function getSigningSecret(): string {
  return (
    process.env.KALAPOS_AUTH_SECRET ||
    process.env.NEXTAUTH_SECRET ||
    "kala-pos-internal-session-secret-2026-v4"
  )
}

function toBase64Url(bytes: Uint8Array): string {
  let binary = ""
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i])
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")
}

function fromBase64Url(str: string): Uint8Array {
  const padded = str.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (str.length % 4)) % 4)
  const binary = atob(padded)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i)
  }
  return bytes
}

async function hmacSign(message: string): Promise<string> {
  const enc = new TextEncoder()
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(getSigningSecret()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  )
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(message))
  return toBase64Url(new Uint8Array(sig))
}

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  }
  return diff === 0
}

interface SignedPayload extends SessionUser {
  exp: number
}

export async function signSessionToken(
  session: SessionUser,
  maxAgeSeconds = 60 * 60 * 24 * 7
): Promise<string> {
  const payload: SignedPayload = {
    ...session,
    exp: Math.floor(Date.now() / 1000) + maxAgeSeconds,
  }
  const encodedPayload = toBase64Url(new TextEncoder().encode(JSON.stringify(payload)))
  const signature = await hmacSign(encodedPayload)
  return `${encodedPayload}.${signature}`
}

export async function verifySessionToken(
  token: string | undefined | null
): Promise<SessionUser | null> {
  if (!token) return null
  const dotIdx = token.indexOf(".")
  if (dotIdx <= 0) return null

  const encodedPayload = token.slice(0, dotIdx)
  const providedSig = token.slice(dotIdx + 1)
  if (!providedSig) return null

  try {
    const expectedSig = await hmacSign(encodedPayload)
    if (!constantTimeEqual(providedSig, expectedSig)) return null

    const rawJson = new TextDecoder().decode(fromBase64Url(encodedPayload))
    const parsed = JSON.parse(rawJson) as Partial<SignedPayload>

    if (
      !parsed ||
      typeof parsed.userId !== "string" ||
      typeof parsed.fullName !== "string" ||
      typeof parsed.email !== "string" ||
      typeof parsed.exp !== "number" ||
      !parsed.role ||
      !VALID_ROLES.includes(parsed.role)
    ) {
      return null
    }

    if (parsed.exp < Math.floor(Date.now() / 1000)) {
      return null
    }

    return {
      userId: parsed.userId,
      role: parsed.role,
      branchId: typeof parsed.branchId === "string" ? parsed.branchId : null,
      fullName: parsed.fullName,
      email: parsed.email,
    }
  } catch {
    return null
  }
}
