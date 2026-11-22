import { NextResponse } from "next/server"
import { isSupabaseServerConfigured } from "@/lib/kalapos/supabase-server"

export async function GET() {
  return NextResponse.json(
    {
      ok: true,
      storage: isSupabaseServerConfigured() ? "supabase" : "local-fallback",
      projectRef: process.env.NEXT_PUBLIC_SUPABASE_URL ? "configured" : "unset",
    },
    { status: 200 }
  )
}
