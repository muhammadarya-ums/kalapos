import fs from "node:fs"
import path from "node:path"
import { cookies } from "next/headers"
import { hashPassword, hashPinSecure } from "./crypto"
import { generateId } from "./format"
import { SESSION_COOKIE_NAME, verifySessionToken } from "./session-server"
import type { Role, SessionUser, User } from "./types"

export interface ServerUserRecord {
  id: string
  branch_id: string | null
  full_name: string
  email: string
  password_hash: string
  role: Role
  pin_hash: string
  is_active: boolean
  created_at: string
}

export const KALA_OWNER_ID = "usr-kala-owner"

const DATA_DIR = path.join(process.cwd(), ".kala-data")
const STAFF_FILE = path.join(DATA_DIR, "kala-auth.json")

interface GlobalAuthStore {
  staffCache: ServerUserRecord[] | null
  rateLimits: Map<string, { count: number; resetAt: number }>
}

const g = globalThis as unknown as { __kalaAuthStore?: GlobalAuthStore }
if (!g.__kalaAuthStore) {
  g.__kalaAuthStore = {
    staffCache: null,
    rateLimits: new Map(),
  }
}

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  }
  return diff === 0
}

/**
 * Single official Owner account for Kafe Kala.
 * Configurable via environment variables for production deployment.
 */
export function getOwnerRecord(): ServerUserRecord {
  const email = (process.env.KALA_OWNER_EMAIL?.trim() || "owner@kala.id").toLowerCase()
  const password = process.env.KALA_OWNER_PASSWORD || "KalaOwner2026!"
  const pin = process.env.KALA_OWNER_PIN || "1234"
  const fullName = process.env.KALA_OWNER_NAME?.trim() || "Owner Kafe Kala"

  return {
    id: KALA_OWNER_ID,
    branch_id: null,
    full_name: fullName,
    email,
    password_hash: hashPassword(password, email),
    role: "OWNER",
    pin_hash: hashPinSecure(pin),
    is_active: true,
    created_at: "2026-01-01T01:00:00.000Z",
  }
}

function readStaffFromDisk(): ServerUserRecord[] {
  if (g.__kalaAuthStore!.staffCache) {
    return g.__kalaAuthStore!.staffCache
  }
  try {
    if (fs.existsSync(STAFF_FILE)) {
      const raw = fs.readFileSync(STAFF_FILE, "utf8")
      const parsed = JSON.parse(raw) as unknown
      if (Array.isArray(parsed)) {
        const cleaned = parsed.filter(
          (item): item is ServerUserRecord =>
            Boolean(item) &&
            typeof item === "object" &&
            typeof (item as ServerUserRecord).id === "string" &&
            (item as ServerUserRecord).id !== KALA_OWNER_ID &&
            (item as ServerUserRecord).role !== "OWNER"
        )
        g.__kalaAuthStore!.staffCache = cleaned
        return cleaned
      }
    }
  } catch {
    /* fallback to empty list */
  }
  g.__kalaAuthStore!.staffCache = []
  return []
}

function writeStaffToDisk(staff: ServerUserRecord[]): void {
  g.__kalaAuthStore!.staffCache = staff
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true })
    }
    fs.writeFileSync(STAFF_FILE, JSON.stringify(staff, null, 2), "utf8")
  } catch {
    /* read-only filesystem fallback: stays in memory cache */
  }
}

export function sanitizeUser(record: ServerUserRecord): User {
  return {
    id: record.id,
    branch_id: record.branch_id,
    full_name: record.full_name,
    email: record.email,
    role: record.role,
    is_active: record.is_active,
    created_at: record.created_at,
  }
}

export function listAllServerUsers(): ServerUserRecord[] {
  return [getOwnerRecord(), ...readStaffFromDisk()]
}

export function listAllUsersSanitized(): User[] {
  return listAllServerUsers().map(sanitizeUser)
}

export function findServerUserById(userId: string): ServerUserRecord | null {
  return listAllServerUsers().find((u) => u.id === userId) ?? null
}

export function findActiveUserById(userId: string): ServerUserRecord | null {
  const found = findServerUserById(userId)
  return found && found.is_active ? found : null
}

/**
 * Verifies the HttpOnly signed session cookie AND confirms the user still exists
 * and remains active in the server-side Kafe Kala registry.
 */
export async function getAuthenticatedServerSession(): Promise<SessionUser | null> {
  const cookieStore = await cookies()
  const rawToken = cookieStore.get(SESSION_COOKIE_NAME)?.value
  const parsed = await verifySessionToken(rawToken)
  if (!parsed) return null

  const activeUser = findActiveUserById(parsed.userId)
  if (!activeUser) return null

  return {
    userId: activeUser.id,
    role: activeUser.role,
    branchId: activeUser.role === "OWNER" ? null : activeUser.branch_id,
    fullName: activeUser.full_name,
    email: activeUser.email,
  }
}

// Lightweight brute-force rate limiter (10 failed attempts / 10 minutes per key)
const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000
const RATE_LIMIT_MAX = 10

export function isRateLimited(key: string): { limited: boolean; retryAfterSec: number } {
  const store = g.__kalaAuthStore!.rateLimits
  const now = Date.now()
  const entry = store.get(key)
  if (!entry) return { limited: false, retryAfterSec: 0 }
  if (now > entry.resetAt) {
    store.delete(key)
    return { limited: false, retryAfterSec: 0 }
  }
  if (entry.count >= RATE_LIMIT_MAX) {
    return { limited: true, retryAfterSec: Math.max(1, Math.ceil((entry.resetAt - now) / 1000)) }
  }
  return { limited: false, retryAfterSec: 0 }
}

export function recordAuthFailure(key: string): void {
  const store = g.__kalaAuthStore!.rateLimits
  const now = Date.now()
  const existing = store.get(key)
  if (!existing || now > existing.resetAt) {
    store.set(key, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS })
  } else {
    store.set(key, { count: existing.count + 1, resetAt: existing.resetAt })
  }
}

export function clearAuthFailures(key: string): void {
  g.__kalaAuthStore!.rateLimits.delete(key)
}

export function verifyEmailCredentials(
  email: string,
  password: string
): { ok: true; user: ServerUserRecord } | { ok: false; error: string } {
  const normalized = email.trim().toLowerCase()
  const user = listAllServerUsers().find((u) => u.email.toLowerCase() === normalized)
  if (!user) {
    return { ok: false, error: "Email atau kata sandi tidak sesuai." }
  }
  if (!user.is_active) {
    return { ok: false, error: "Akun staf sedang dinonaktifkan oleh Owner Kafe Kala." }
  }

  const providedHash = hashPassword(password, normalized)
  if (!constantTimeEqual(user.password_hash, providedHash)) {
    return { ok: false, error: "Email atau kata sandi tidak sesuai." }
  }

  return { ok: true, user }
}

export function verifyPinCredentials(
  pin: string,
  branchId: string
): { ok: true; user: ServerUserRecord } | { ok: false; error: string } {
  const cleanPin = pin.trim()
  if (!/^\d{4}$/.test(cleanPin)) {
    return { ok: false, error: "PIN harus terdiri dari 4 digit angka." }
  }
  const providedHash = hashPinSecure(cleanPin)
  const activeUsers = listAllServerUsers().filter(
    (u) => u.is_active && constantTimeEqual(u.pin_hash, providedHash)
  )

  const matched =
    activeUsers.find((u) => u.branch_id === branchId) ||
    activeUsers.find((u) => u.role === "OWNER")

  if (!matched) {
    return { ok: false, error: "PIN tidak cocok untuk cabang Kafe Kala yang dipilih." }
  }

  return { ok: true, user: matched }
}

export function verifySupervisorPinServer(
  pin: string,
  branchId?: string | null
): { ok: true; supervisor: User } | { ok: false; error: string } {
  const cleanPin = pin.trim()
  if (!/^\d{4}$/.test(cleanPin)) {
    return { ok: false, error: "PIN Supervisor harus 4 digit angka." }
  }
  const providedHash = hashPinSecure(cleanPin)
  const candidates = listAllServerUsers().filter(
    (u) =>
      u.is_active &&
      (u.role === "OWNER" || u.role === "MANAGER") &&
      constantTimeEqual(u.pin_hash, providedHash)
  )

  const matched =
    candidates.find((u) => u.role === "OWNER") ||
    candidates.find((u) => !branchId || u.branch_id === branchId)

  if (!matched) {
    return { ok: false, error: "PIN Supervisor tidak valid." }
  }

  return { ok: true, supervisor: sanitizeUser(matched) }
}

export interface CreateStaffServerInput {
  fullName: string
  email: string
  password: string
  role: Exclude<Role, "OWNER">
  branchId: string
  pin: string
}

export function createStaffAccountServer(
  input: CreateStaffServerInput
): { ok: true; user: User; users: User[] } | { ok: false; error: string } {
  const fullName = input.fullName.trim()
  const email = input.email.trim().toLowerCase()
  const pin = input.pin.trim()
  const allowedStaffRoles: Role[] = ["MANAGER", "CASHIER", "BARISTA"]

  if (!fullName) return { ok: false, error: "Nama staf wajib diisi." }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { ok: false, error: "Format email staf tidak valid." }
  }
  if (!input.password || input.password.length < 8) {
    return { ok: false, error: "Kata sandi minimal 8 karakter." }
  }
  if (!/^\d{4}$/.test(pin)) {
    return { ok: false, error: "PIN staf harus terdiri dari 4 digit angka." }
  }
  if (!allowedStaffRoles.includes(input.role)) {
    return { ok: false, error: "Peran staf hanya boleh Manager, Kasir, atau Barista." }
  }
  if (!input.branchId || !input.branchId.trim()) {
    return { ok: false, error: "Pilih cabang operasional Kafe Kala untuk staf ini." }
  }

  const allUsers = listAllServerUsers()
  if (allUsers.some((u) => u.email.toLowerCase() === email)) {
    return { ok: false, error: "Email tersebut sudah digunakan akun lain." }
  }

  const pinHash = hashPinSecure(pin)
  if (
    allUsers.some(
      (u) =>
        u.is_active &&
        (u.role === "OWNER" || u.branch_id === input.branchId) &&
        constantTimeEqual(u.pin_hash, pinHash)
    )
  ) {
    return {
      ok: false,
      error: "PIN ini sudah dipakai oleh Owner atau staf lain di cabang yang sama.",
    }
  }

  const newRecord: ServerUserRecord = {
    id: generateId("usr"),
    branch_id: input.branchId.trim(),
    full_name: fullName,
    email,
    password_hash: hashPassword(input.password, email),
    role: input.role,
    pin_hash: pinHash,
    is_active: true,
    created_at: new Date().toISOString(),
  }

  const nextStaff = [...readStaffFromDisk(), newRecord]
  writeStaffToDisk(nextStaff)

  return {
    ok: true,
    user: sanitizeUser(newRecord),
    users: listAllUsersSanitized(),
  }
}

export function toggleStaffActiveServer(
  userId: string
): { ok: true; user: User; users: User[] } | { ok: false; error: string } {
  if (userId === KALA_OWNER_ID) {
    return { ok: false, error: "Akun Owner utama Kafe Kala tidak dapat dinonaktifkan." }
  }
  const staff = readStaffFromDisk()
  const idx = staff.findIndex((u) => u.id === userId)
  if (idx < 0) return { ok: false, error: "Akun staf tidak ditemukan." }

  const updated: ServerUserRecord = { ...staff[idx], is_active: !staff[idx].is_active }
  const nextStaff = staff.map((u, i) => (i === idx ? updated : u))
  writeStaffToDisk(nextStaff)

  return {
    ok: true,
    user: sanitizeUser(updated),
    users: listAllUsersSanitized(),
  }
}

export function deleteStaffAccountServer(
  userId: string
): { ok: true; users: User[] } | { ok: false; error: string } {
  if (userId === KALA_OWNER_ID) {
    return { ok: false, error: "Akun Owner utama Kafe Kala tidak dapat dihapus." }
  }
  const staff = readStaffFromDisk()
  if (!staff.some((u) => u.id === userId)) {
    return { ok: false, error: "Akun staf tidak ditemukan." }
  }
  const nextStaff = staff.filter((u) => u.id !== userId)
  writeStaffToDisk(nextStaff)
  return { ok: true, users: listAllUsersSanitized() }
}

export function unassignBranchFromStaffServer(branchId: string): void {
  const staff = readStaffFromDisk()
  let changed = false
  const nextStaff = staff.map((u) => {
    if (u.branch_id === branchId) {
      changed = true
      return { ...u, branch_id: null, is_active: false }
    }
    return u
  })
  if (changed) {
    writeStaffToDisk(nextStaff)
  }
}
