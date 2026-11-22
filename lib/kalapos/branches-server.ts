import fs from "node:fs"
import path from "node:path"
import { unassignBranchFromStaffServer } from "./auth-server"
import { generateId } from "./format"
import { initBranchStocksForNewBranchServer, removeBranchStocksServer } from "./inventory-server"
import { removeBranchFromMenuServer } from "./menu-server"
import type { BranchUpsertInput } from "./store"
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

export function listBranchesServer(): Branch[] {
  return readBranchesFromDisk()
}

export function listPublicActiveBranchesServer(): PublicBranchInfo[] {
  return readBranchesFromDisk()
    .filter((b) => !b.deleted_at && b.status !== "INACTIVE")
    .map((b) => ({
      id: b.id,
      code: b.code,
      name: b.name,
      status: b.status,
    }))
}

export function findActiveBranchServer(branchId: string): Branch | null {
  return (
    readBranchesFromDisk().find(
      (b) => b.id === branchId && !b.deleted_at && b.status !== "INACTIVE"
    ) ?? null
  )
}

export function createBranchServer(
  input: BranchUpsertInput
): { ok: true; branch: Branch; branches: Branch[] } | { ok: false; error: string } {
  const branches = readBranchesFromDisk()
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

  const next = [...branches, newBranch]
  writeBranchesToDisk(next)
  initBranchStocksForNewBranchServer(newBranch.id)
  return { ok: true, branch: newBranch, branches: next }
}

export function updateBranchServer(
  branchId: string,
  input: BranchUpsertInput
): { ok: true; branch: Branch; branches: Branch[] } | { ok: false; error: string } {
  const branches = readBranchesFromDisk()
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

  const next = branches.map((b) => (b.id === branchId ? updated : b))
  writeBranchesToDisk(next)
  return { ok: true, branch: updated, branches: next }
}

export function archiveBranchServer(
  branchId: string
): { ok: true; branch: Branch; branches: Branch[] } | { ok: false; error: string } {
  const branches = readBranchesFromDisk()
  const existing = branches.find((b) => b.id === branchId)
  if (!existing) return { ok: false, error: "Cabang tidak ditemukan." }

  const archived: Branch = {
    ...existing,
    status: "INACTIVE",
    deleted_at: new Date().toISOString(),
  }

  const next = branches.map((b) => (b.id === branchId ? archived : b))
  writeBranchesToDisk(next)
  return { ok: true, branch: archived, branches: next }
}

export function restoreBranchServer(
  branchId: string
): { ok: true; branch: Branch; branches: Branch[] } | { ok: false; error: string } {
  const branches = readBranchesFromDisk()
  const existing = branches.find((b) => b.id === branchId)
  if (!existing) return { ok: false, error: "Cabang tidak ditemukan." }

  const restored: Branch = {
    ...existing,
    status: "ACTIVE",
    deleted_at: null,
  }

  const next = branches.map((b) => (b.id === branchId ? restored : b))
  writeBranchesToDisk(next)
  return { ok: true, branch: restored, branches: next }
}

export function deleteBranchServer(
  branchId: string
): { ok: true; branches: Branch[] } | { ok: false; error: string } {
  const branches = readBranchesFromDisk()
  if (!branches.some((b) => b.id === branchId)) {
    return { ok: false, error: "Cabang tidak ditemukan." }
  }
  const next = branches.filter((b) => b.id !== branchId)
  writeBranchesToDisk(next)
  unassignBranchFromStaffServer(branchId)
  removeBranchFromMenuServer(branchId)
  removeBranchStocksServer(branchId)
  return { ok: true, branches: next }
}
