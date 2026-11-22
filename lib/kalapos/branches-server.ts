import fs from "node:fs"
import path from "node:path"
import { unassignBranchFromStaffServer } from "./auth-server"
import { generateId } from "./format"
import { initBranchStocksForNewBranchServer, removeBranchStocksServer } from "./inventory-server"
import { removeBranchFromMenuServer } from "./menu-server"
import type { BranchUpsertInput } from "./store"
import { getSupabaseAdmin } from "./supabase-server"
import type { Branch, BranchStatus, PublicBranchInfo } from "./types"

const DATA_DIR = path.join(process.cwd(), ".kala-data")
const BRANCHES_FILE = path.join(DATA_DIR, "kala-branches.json")

interface GlobalBranchStore {
  branchesCache: Branch[] | null
}

const g = globalThis as unknown as { __kalaBranchStore?: GlobalBranchStore }
if (!g.__kalaBranchStore) {
  g.__kalaBranchStore = { branchesCache: null }
}

function readBranchesFromDisk(): Branch[] {
  if (g.__kalaBranchStore!.branchesCache) {
    return g.__kalaBranchStore!.branchesCache
  }
  try {
    if (fs.existsSync(BRANCHES_FILE)) {
      const raw = fs.readFileSync(BRANCHES_FILE, "utf8")
      const parsed = JSON.parse(raw) as unknown
      if (Array.isArray(parsed)) {
        g.__kalaBranchStore!.branchesCache = parsed as Branch[]
        return g.__kalaBranchStore!.branchesCache
      }
    }
  } catch {
    /* fallback to empty list */
  }
  g.__kalaBranchStore!.branchesCache = []
  return []
}

function writeBranchesToDisk(branches: Branch[]): void {
  g.__kalaBranchStore!.branchesCache = branches
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true })
    }
    fs.writeFileSync(BRANCHES_FILE, JSON.stringify(branches, null, 2), "utf8")
  } catch {
    /* read-only filesystem fallback: stays in memory cache */
  }
}

export async function listBranchesServer(): Promise<Branch[]> {
  const supabase = getSupabaseAdmin()
  if (supabase) {
    const { data, error } = await supabase
      .from("branches")
      .select("*")
      .order("created_at", { ascending: true })

    if (!error && data) {
      return data.map((b) => ({
        ...b,
        status: b.status as BranchStatus,
      }))
    }
  }
  return readBranchesFromDisk()
}

export async function listPublicActiveBranchesServer(): Promise<PublicBranchInfo[]> {
  const branches = await listBranchesServer()
  return branches
    .filter((b) => !b.deleted_at && b.status !== "INACTIVE")
    .map((b) => ({
      id: b.id,
      code: b.code,
      name: b.name,
      status: b.status,
    }))
}

export async function findActiveBranchServer(branchId: string): Promise<Branch | null> {
  const supabase = getSupabaseAdmin()
  if (supabase) {
    const { data, error } = await supabase
      .from("branches")
      .select("*")
      .eq("id", branchId)
      .is("deleted_at", null)
      .neq("status", "INACTIVE")
      .maybeSingle()

    if (!error) {
      return data ? { ...data, status: data.status as BranchStatus } : null
    }
  }
  const branches = await listBranchesServer()
  return (
    branches.find((b) => b.id === branchId && !b.deleted_at && b.status !== "INACTIVE") ?? null
  )
}

export async function createBranchServer(
  input: BranchUpsertInput
): Promise<{ ok: true; branch: Branch; branches: Branch[] } | { ok: false; error: string }> {
  const branches = await listBranchesServer()
  const name = input.name.trim()
  const code = input.code.trim().toUpperCase()
  if (!name || !code) {
    return { ok: false, error: "Nama dan kode cabang wajib diisi." }
  }
  if (branches.some((b) => b.code.toUpperCase() === code && !b.deleted_at)) {
    return { ok: false, error: `Kode cabang ${code} sudah digunakan.` }
  }

  const validStatus: BranchStatus =
    input.status === "RENOVATION" || input.status === "INACTIVE" ? input.status : "ACTIVE"

  const newBranch: Branch = {
    id: generateId("br"),
    code,
    name,
    address: input.address?.trim() || "Alamat belum dilengkapi",
    phone: input.phone?.trim() || "-",
    tax_rate: Math.max(0, Math.min(100, Math.round(Number(input.tax_rate) || 0))),
    service_charge_rate: Math.max(
      0,
      Math.min(100, Math.round(Number(input.service_charge_rate) || 0))
    ),
    receipt_footer: input.receipt_footer?.trim() || "Terima kasih telah singgah di Kafe Kala.",
    status: validStatus,
    deleted_at: null,
    created_at: new Date().toISOString(),
  }

  const supabase = getSupabaseAdmin()
  if (supabase) {
    const { error } = await supabase.from("branches").insert(newBranch)
    if (error) {
      return { ok: false, error: `Gagal menyimpan cabang ke Supabase: ${error.message}` }
    }
    await initBranchStocksForNewBranchServer(newBranch.id)
    return { ok: true, branch: newBranch, branches: await listBranchesServer() }
  }

  const next = [...branches, newBranch]
  writeBranchesToDisk(next)
  await initBranchStocksForNewBranchServer(newBranch.id)
  return { ok: true, branch: newBranch, branches: next }
}

export async function updateBranchServer(
  branchId: string,
  input: BranchUpsertInput
): Promise<{ ok: true; branch: Branch; branches: Branch[] } | { ok: false; error: string }> {
  const branches = await listBranchesServer()
  const existing = branches.find((b) => b.id === branchId)
  if (!existing) return { ok: false, error: "Cabang tidak ditemukan." }

  const code = input.code.trim().toUpperCase() || existing.code
  if (branches.some((b) => b.id !== branchId && b.code.toUpperCase() === code && !b.deleted_at)) {
    return { ok: false, error: `Kode cabang ${code} sudah digunakan cabang lain.` }
  }

  const validStatus: BranchStatus =
    input.status === "RENOVATION" || input.status === "INACTIVE" ? input.status : "ACTIVE"

  const updated: Branch = {
    ...existing,
    name: input.name.trim() || existing.name,
    code,
    address: input.address.trim(),
    phone: input.phone.trim(),
    tax_rate: Math.max(0, Math.min(100, Math.round(Number(input.tax_rate) || 0))),
    service_charge_rate: Math.max(
      0,
      Math.min(100, Math.round(Number(input.service_charge_rate) || 0))
    ),
    receipt_footer: input.receipt_footer.trim() || existing.receipt_footer,
    status: validStatus,
    deleted_at: validStatus === "INACTIVE" ? existing.deleted_at : null,
  }

  const supabase = getSupabaseAdmin()
  if (supabase) {
    const { error } = await supabase
      .from("branches")
      .update({
        name: updated.name,
        code: updated.code,
        address: updated.address,
        phone: updated.phone,
        tax_rate: updated.tax_rate,
        service_charge_rate: updated.service_charge_rate,
        receipt_footer: updated.receipt_footer,
        status: updated.status,
        deleted_at: updated.deleted_at,
      })
      .eq("id", branchId)

    if (error) {
      return { ok: false, error: `Gagal memperbarui cabang di Supabase: ${error.message}` }
    }
    return { ok: true, branch: updated, branches: await listBranchesServer() }
  }

  const next = branches.map((b) => (b.id === branchId ? updated : b))
  writeBranchesToDisk(next)
  return { ok: true, branch: updated, branches: next }
}

export async function archiveBranchServer(
  branchId: string
): Promise<{ ok: true; branch: Branch; branches: Branch[] } | { ok: false; error: string }> {
  const branches = await listBranchesServer()
  const existing = branches.find((b) => b.id === branchId)
  if (!existing) return { ok: false, error: "Cabang tidak ditemukan." }

  const archived: Branch = {
    ...existing,
    status: "INACTIVE",
    deleted_at: new Date().toISOString(),
  }

  const supabase = getSupabaseAdmin()
  if (supabase) {
    const { error } = await supabase
      .from("branches")
      .update({ status: "INACTIVE", deleted_at: archived.deleted_at })
      .eq("id", branchId)

    if (error) {
      return { ok: false, error: `Gagal mengarsipkan cabang di Supabase: ${error.message}` }
    }
    return { ok: true, branch: archived, branches: await listBranchesServer() }
  }

  const next = branches.map((b) => (b.id === branchId ? archived : b))
  writeBranchesToDisk(next)
  return { ok: true, branch: archived, branches: next }
}

export async function restoreBranchServer(
  branchId: string
): Promise<{ ok: true; branch: Branch; branches: Branch[] } | { ok: false; error: string }> {
  const branches = await listBranchesServer()
  const existing = branches.find((b) => b.id === branchId)
  if (!existing) return { ok: false, error: "Cabang tidak ditemukan." }

  const restored: Branch = {
    ...existing,
    status: "ACTIVE",
    deleted_at: null,
  }

  const supabase = getSupabaseAdmin()
  if (supabase) {
    const { error } = await supabase
      .from("branches")
      .update({ status: "ACTIVE", deleted_at: null })
      .eq("id", branchId)

    if (error) {
      return { ok: false, error: `Gagal memulihkan cabang di Supabase: ${error.message}` }
    }
    return { ok: true, branch: restored, branches: await listBranchesServer() }
  }

  const next = branches.map((b) => (b.id === branchId ? restored : b))
  writeBranchesToDisk(next)
  return { ok: true, branch: restored, branches: next }
}

export async function deleteBranchServer(
  branchId: string
): Promise<{ ok: true; branches: Branch[] } | { ok: false; error: string }> {
  const branches = await listBranchesServer()
  if (!branches.some((b) => b.id === branchId)) {
    return { ok: false, error: "Cabang tidak ditemukan." }
  }

  // Deactivate & unassign staff BEFORE deleting branch so FK set-null doesn't leave staff active
  await unassignBranchFromStaffServer(branchId)

  const supabase = getSupabaseAdmin()
  if (supabase) {
    const { error } = await supabase.from("branches").delete().eq("id", branchId)
    if (error) {
      return { ok: false, error: `Gagal menghapus cabang di Supabase: ${error.message}` }
    }
    return { ok: true, branches: await listBranchesServer() }
  }

  const next = branches.filter((b) => b.id !== branchId)
  writeBranchesToDisk(next)
  await removeBranchFromMenuServer(branchId)
  await removeBranchStocksServer(branchId)
  return { ok: true, branches: next }
}
