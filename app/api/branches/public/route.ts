import { NextResponse } from "next/server"
import { listPublicActiveBranchesServer } from "@/lib/kalapos/branches-server"

export async function GET() {
  const branches = await listPublicActiveBranchesServer()
  return NextResponse.json({ branches }, { status: 200 })
}
