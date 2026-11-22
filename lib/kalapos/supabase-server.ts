import { createClient, type SupabaseClient } from "@supabase/supabase-js"
import type { Database } from "./database.types"

export type SupabaseAdminClient = SupabaseClient<Database>

interface GlobalSupabaseServer {
  client: SupabaseAdminClient | null
  keyFingerprint: string | null
}

const g = globalThis as unknown as { __kalaSupabaseServer?: GlobalSupabaseServer }
if (!g.__kalaSupabaseServer) {
  g.__kalaSupabaseServer = { client: null, keyFingerprint: null }
}

function getSupabaseServerConfig(): { url: string; secretKey: string } | null {
  const url = (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "").trim()
  const secretKey = (
    process.env.SUPABASE_SECRET_KEY ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    ""
  ).trim()

  if (!url || !secretKey) return null
  // Ignore unconfigured template placeholders
  if (secretKey.includes("PASTE_YOUR_") || secretKey.startsWith("your_")) return null

  return { url, secretKey }
}

export function isSupabaseServerConfigured(): boolean {
  return getSupabaseServerConfig() !== null
}

/**
 * Server-only Supabase admin client (service_role / sb_secret_...).
 * Returns null when SUPABASE_SECRET_KEY / SUPABASE_SERVICE_ROLE_KEY is not set,
 * allowing graceful local `.kala-data` fallback during offline development.
 */
export function getSupabaseAdmin(): SupabaseAdminClient | null {
  const cfg = getSupabaseServerConfig()
  if (!cfg) return null

  const fingerprint = `${cfg.url}::${cfg.secretKey.slice(0, 14)}`
  if (g.__kalaSupabaseServer!.client && g.__kalaSupabaseServer!.keyFingerprint === fingerprint) {
    return g.__kalaSupabaseServer!.client
  }

  const client = createClient<Database>(cfg.url, cfg.secretKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
  })

  g.__kalaSupabaseServer!.client = client
  g.__kalaSupabaseServer!.keyFingerprint = fingerprint
  return client
}
