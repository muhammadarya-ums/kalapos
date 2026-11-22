import fs from "node:fs"
import path from "node:path"
import { cookies } from "next/headers"
import { hashPassword, hashPinSecure } from "./crypto"
import { generateId } from "./format"
import { SESSION_COOKIE_NAME, verifySessionToken } from "./session-server"
import { getSupabaseAdmin } from "./supabase-server"
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
  ownerSyncedFingerprint: string | null
}

const g = globalThis as unknown as { __kalaAuthStore?: GlobalAuthStore }
if (!g.__kalaAuthStore) {
  g.__kalaAuthStore = {
    staffCache: null,
    rateLimits: new Map(),
    ownerSyncedFingerprint: null,
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
 * Configurable via KALA_OWNER_* environment variables for production deployment.
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

async function ensureOwnerSyncedInSupabase(): Promise<void> {
  const supabase = getSupabaseAdmin()
  if (!supabase) return
  const owner = getOwnerRecord()
  const fp = `${owner.email}|${owner.password_hash}|${owner.pin_hash}|${owner.full_name}`
  if (g.__kalaAuthStore!.ownerSyncedFingerprint === fp) return

  const { error } = await supabase.from("kala_users").upsert(
    {
      id: owner.id,
      branch_id: null,
      full_name: owner.full_name,
      email: owner.email,
      password_hash: owner.password_hash,
      role: "OWNER",
      pin_hash: owner.pin_hash,
      is_active: true,
      created_at: owner.created_at,
    },
    { onConflict: "id" }
  )
  if (!error) {
    g.__kalaAuthStore!.ownerSyncedFingerprint = fp
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

export async function listAllServerUsers(): Promise<ServerUserRecord[]> {
  const owner = getOwnerRecord()
  const supabase = getSupabaseAdmin()
  if (supabase) {
    await ensureOwnerSyncedInSupabase()
    const { data, error } = await supabase
      .from("kala_users")
      .select("*")
      .neq("role", "OWNER")
      .order("created_at", { ascending: true })

    if (!error && data) {
      return [
        owner,
        ...data.map((row) => ({
          id: row.id,
          branch_id: row.branch_id,
          full_name: row.full_name,
          email: row.email,
          password_hash: row.password_hash,
          role: row.role as Role,
          pin_hash: row.pin_hash,
          is_active: row.is_active,
          created_at: row.created_at,
        })),
      ]
    }
  }
  return [owner, ...readStaffFromDisk()]
}

export async function listAllUsersSanitized(): Promise<User[]> {
  const users = await listAllServerUsers()
  return users.map(sanitizeUser)
}

export async function findServerUserById(userId: string): Promise<ServerUserRecord | null> {
  if (userId === KALA_OWNER_ID) {
    await ensureOwnerSyncedInSupabase()
    return getOwnerRecord()
  }
  const supabase = getSupabaseAdmin()
  if (supabase) {
    const { data, error } = await supabase
      .from("kala_users")
      .select("*")
      .eq("id", userId)
      .maybeSingle()

    if (!error && data) {
      return {
        id: data.id,
        branch_id: data.branch_id,
        full_name: data.full_name,
        email: data.email,
        password_hash: data.password_hash,
        role: data.role as Role,
        pin_hash: data.pin_hash,
        is_active: data.is_active,
        created_at: data.created_at,
      }
    }
    if (!error) return null
  }
  const all = await listAllServerUsers()
  return all.find((u) => u.id === userId) ?? null
}

export async function findActiveUserById(userId: string): Promise<ServerUserRecord | null> {
  const found = await findServerUserById(userId)
  return found && found.is_active ? found : null
}

/**
 * Verifies the HttpOnly signed session cookie AND confirms the user still exists
 * and remains active in Kafe Kala's database registry.
 */
export async function getAuthenticatedServerSession(): Promise<SessionUser | null> {
  const cookieStore = await cookies()
  const rawToken = cookieStore.get(SESSION_COOKIE_NAME)?.value
  const parsed = await verifySessionToken(rawToken)
  if (!parsed) return null

  const activeUser = await findActiveUserById(parsed.userId)
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

export async function verifyEmailCredentials(
  email: string,
  password: string
): Promise<{ ok: true; user: ServerUserRecord } | { ok: false; error: string }> {
  const normalized = email.trim().toLowerCase()
  const allUsers = await listAllServerUsers()
  const user = allUsers.find((u) => u.email.toLowerCase() === normalized)
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

export async function verifyPinCredentials(
  pin: string,
  branchId: string
): Promise<{ ok: true; user: ServerUserRecord } | { ok: false; error: string }> {
  const cleanPin = pin.trim()
  if (!/^\d{4}$/.test(cleanPin)) {
    return { ok: false, error: "PIN harus terdiri dari 4 digit angka." }
  }
  const providedHash = hashPinSecure(cleanPin)
  const allUsers = await listAllServerUsers()
  const activeUsers = allUsers.filter(
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

export async function verifySupervisorPinServer(
  pin: string,
  branchId?: string | null
): Promise<{ ok: true; supervisor: User } | { ok: false; error: string }> {
  const cleanPin = pin.trim()
  if (!/^\d{4}$/.test(cleanPin)) {
    return { ok: false, error: "PIN Supervisor harus 4 digit angka." }
  }
  const providedHash = hashPinSecure(cleanPin)
  const allUsers = await listAllServerUsers()
  const candidates = allUsers.filter(
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

export async function createStaffAccountServer(
  input: CreateStaffServerInput
): Promise<{ ok: true; user: User; users: User[] } | { ok: false; error: string }> {
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

  const allUsers = await listAllServerUsers()
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

  const supabase = getSupabaseAdmin()
  if (supabase) {
    const { error } = await supabase.from("kala_users").insert(newRecord)
    if (error) {
      return { ok: false, error: `Gagal menyimpan akun staf ke Supabase: ${error.message}` }
    }
    return {
      ok: true,
      user: sanitizeUser(newRecord),
      users: await listAllUsersSanitized(),
    }
  }

  const nextStaff = [...readStaffFromDisk(), newRecord]
  writeStaffToDisk(nextStaff)

  return {
    ok: true,
    user: sanitizeUser(newRecord),
    users: await listAllUsersSanitized(),
  }
}

export async function toggleStaffActiveServer(
  userId: string
): Promise<{ ok: true; user: User; users: User[] } | { ok: false; error: string }> {
  if (userId === KALA_OWNER_ID) {
    return { ok: false, error: "Akun Owner utama Kafe Kala tidak dapat dinonaktifkan." }
  }

  const supabase = getSupabaseAdmin()
  if (supabase) {
    const { data: existing, error: fetchErr } = await supabase
      .from("kala_users")
      .select("*")
      .eq("id", userId)
      .neq("role", "OWNER")
      .maybeSingle()

    if (fetchErr || !existing) {
      return { ok: false, error: "Akun staf tidak ditemukan." }
    }

    const nextActive = !existing.is_active
    const { data: updated, error: updateErr } = await supabase
      .from("kala_users")
      .update({ is_active: nextActive })
      .eq("id", userId)
      .select("*")
      .single()

    if (updateErr || !updated) {
      return { ok: false, error: "Gagal mengubah status akun staf di Supabase." }
    }

    return {
      ok: true,
      user: sanitizeUser({
        ...updated,
        role: updated.role as Role,
      }),
      users: await listAllUsersSanitized(),
    }
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
    users: await listAllUsersSanitized(),
  }
}

export async function deleteStaffAccountServer(
  userId: string
): Promise<{ ok: true; users: User[] } | { ok: false; error: string }> {
  if (userId === KALA_OWNER_ID) {
    return { ok: false, error: "Akun Owner utama Kafe Kala tidak dapat dihapus." }
  }

  const supabase = getSupabaseAdmin()
  if (supabase) {
    const { data, error } = await supabase
      .from("kala_users")
      .delete()
      .eq("id", userId)
      .neq("role", "OWNER")
      .select("id")

    if (error) {
      return { ok: false, error: `Gagal menghapus akun staf di Supabase: ${error.message}` }
    }
    if (!data || data.length === 0) {
      return { ok: false, error: "Akun staf tidak ditemukan." }
    }
    return { ok: true, users: await listAllUsersSanitized() }
  }

  const staff = readStaffFromDisk()
  if (!staff.some((u) => u.id === userId)) {
    return { ok: false, error: "Akun staf tidak ditemukan." }
  }
  const nextStaff = staff.filter((u) => u.id !== userId)
  writeStaffToDisk(nextStaff)
  return { ok: true, users: await listAllUsersSanitized() }
}

export async function unassignBranchFromStaffServer(branchId: string): Promise<void> {
  const supabase = getSupabaseAdmin()
  if (supabase) {
    await supabase
      .from("kala_users")
      .update({ branch_id: null, is_active: false })
      .eq("branch_id", branchId)
      .neq("role", "OWNER")
    return
  }

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
