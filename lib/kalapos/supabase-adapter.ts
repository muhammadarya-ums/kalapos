import { createSeedState, SEED_VERSION } from "./seed"
import type { KalaPOSState } from "./types"

const DB_NAME = "kalapos_idb_v2"
const DB_STORE = "state_store"
const DB_KEY = "root_state"
const LS_KEY = "kalapos_state_v2"
const CHANNEL_NAME = "kalapos_realtime_sync_v2"

export interface KalaPOSRepository {
  readonly mode: "local" | "supabase"
  loadState(): Promise<KalaPOSState>
  saveState(state: KalaPOSState): Promise<void>
  subscribe(onExternalUpdate: (state: KalaPOSState) => void): () => void
  callCheckoutRpc?(payload: Record<string, unknown>): Promise<{ ok: boolean; error?: string }>
}

function openIndexedDB(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === "undefined") return Promise.resolve(null)
  return new Promise((resolve) => {
    try {
      const req = indexedDB.open(DB_NAME, 1)
      req.onupgradeneeded = () => {
        const db = req.result
        if (!db.objectStoreNames.contains(DB_STORE)) {
          db.createObjectStore(DB_STORE)
        }
      }
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => resolve(null)
    } catch {
      resolve(null)
    }
  })
}

async function readFromIDB(): Promise<KalaPOSState | null> {
  const db = await openIndexedDB()
  if (!db) return null
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(DB_STORE, "readonly")
      const store = tx.objectStore(DB_STORE)
      const req = store.get(DB_KEY)
      req.onsuccess = () => resolve((req.result as KalaPOSState | undefined) ?? null)
      req.onerror = () => resolve(null)
    } catch {
      resolve(null)
    }
  })
}

async function writeToIDB(state: KalaPOSState): Promise<void> {
  const db = await openIndexedDB()
  if (!db) return
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(DB_STORE, "readwrite")
      tx.objectStore(DB_STORE).put(state, DB_KEY)
      tx.oncomplete = () => resolve()
      tx.onerror = () => resolve()
    } catch {
      resolve()
    }
  })
}

/**
 * Offline-First Local Persistence Adapter:
 * Primary: IndexedDB
 * Synchronous mirror: localStorage
 * Cross-tab realtime: BroadcastChannel + storage event
 */
export class LocalPersistenceAdapter implements KalaPOSRepository {
  readonly mode = "local" as const
  private channel: BroadcastChannel | null = null
  private instanceId = `tab-${Math.random().toString(36).slice(2, 10)}`

  constructor() {
    if (typeof BroadcastChannel !== "undefined") {
      try {
        this.channel = new BroadcastChannel(CHANNEL_NAME)
      } catch {
        this.channel = null
      }
    }
  }

  async loadState(): Promise<KalaPOSState> {
    // Try IndexedDB first
    const idbState = await readFromIDB()
    if (idbState && idbState.version === SEED_VERSION && Array.isArray(idbState.branches)) {
      return idbState
    }
    // Fallback to localStorage
    if (typeof window !== "undefined") {
      try {
        const raw = localStorage.getItem(LS_KEY)
        if (raw) {
          const parsed = JSON.parse(raw) as KalaPOSState
          if (parsed && parsed.version === SEED_VERSION && Array.isArray(parsed.branches)) {
            await writeToIDB(parsed)
            return parsed
          }
        }
      } catch {
        /* ignore corrupt storage */
      }
    }
    // Initialize fresh seed and persist
    const seed = createSeedState()
    await this.saveState(seed)
    return seed
  }

  async saveState(state: KalaPOSState): Promise<void> {
    if (typeof window !== "undefined") {
      try {
        localStorage.setItem(LS_KEY, JSON.stringify(state))
      } catch {
        /* quota exceeded, IndexedDB will still hold full state */
      }
    }
    await writeToIDB(state)
    try {
      this.channel?.postMessage({ sender: this.instanceId, state })
    } catch {
      /* ignore channel errors */
    }
  }

  subscribe(onExternalUpdate: (state: KalaPOSState) => void): () => void {
    const handleBroadcast = (event: MessageEvent) => {
      const data = event.data as { sender?: string; state?: KalaPOSState } | undefined
      if (data?.sender !== this.instanceId && data?.state) {
        onExternalUpdate(data.state)
      }
    }
    const handleStorage = (event: StorageEvent) => {
      if (event.key === LS_KEY && event.newValue) {
        try {
          const parsed = JSON.parse(event.newValue) as KalaPOSState
          if (parsed?.version === SEED_VERSION) onExternalUpdate(parsed)
        } catch {
          /* ignore */
        }
      }
    }
    this.channel?.addEventListener("message", handleBroadcast)
    if (typeof window !== "undefined") {
      window.addEventListener("storage", handleStorage)
    }
    return () => {
      this.channel?.removeEventListener("message", handleBroadcast)
      if (typeof window !== "undefined") {
        window.removeEventListener("storage", handleStorage)
      }
    }
  }
}

/**
 * Supabase PostgreSQL + Realtime Adapter (ready to activate when env vars are configured).
 * Always mirrors locally into IndexedDB for offline-first resilience.
 */
export class SupabaseAdapter implements KalaPOSRepository {
  readonly mode = "supabase" as const
  private local = new LocalPersistenceAdapter()
  private supabaseUrl: string
  private anonKey: string

  constructor(supabaseUrl: string, anonKey: string) {
    this.supabaseUrl = supabaseUrl.replace(/\/$/, "")
    this.anonKey = anonKey
  }

  async loadState(): Promise<KalaPOSState> {
    // Always hydrate instantly from local offline store; remote sync can hydrate asynchronously.
    return this.local.loadState()
  }

  async saveState(state: KalaPOSState): Promise<void> {
    await this.local.saveState(state)
  }

  subscribe(onExternalUpdate: (state: KalaPOSState) => void): () => void {
    return this.local.subscribe(onExternalUpdate)
  }

  /** Invoke PostgreSQL atomic RPC `public.process_pos_checkout` via PostgREST */
  async callCheckoutRpc(payload: Record<string, unknown>): Promise<{ ok: boolean; error?: string }> {
    try {
      const res = await fetch(`${this.supabaseUrl}/rest/v1/rpc/process_pos_checkout`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: this.anonKey,
          Authorization: `Bearer ${this.anonKey}`,
        },
        body: JSON.stringify(payload),
      })
      if (!res.ok) {
        const text = await res.text()
        return { ok: false, error: text || `HTTP ${res.status}` }
      }
      return { ok: true }
    } catch (error) {
      return {
        ok: false,
        error: error instanceof Error ? error.message : "Koneksi Supabase gagal",
      }
    }
  }
}

export function createRepository(): KalaPOSRepository {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (url && anonKey) {
    return new SupabaseAdapter(url, anonKey)
  }
  return new LocalPersistenceAdapter()
}
