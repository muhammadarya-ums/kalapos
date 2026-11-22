import { redirect } from "next/navigation"
import { PosRail } from "@/components/pos/pos-rail"
import { PrinterSettingsDrawer } from "@/components/pos/printer-settings-drawer"
import { getAuthenticatedServerSession } from "@/lib/kalapos/auth-server"
import { findActiveBranchServer } from "@/lib/kalapos/branches-server"

export default async function PosLayout({ children }: { children: React.ReactNode }) {
  const session = await getAuthenticatedServerSession()
  if (!session) {
    redirect("/login?next=/pos")
  }
  if (session.role !== "OWNER") {
    if (!session.branchId || !findActiveBranchServer(session.branchId)) {
      redirect("/login")
    }
  }
  return (
    <PosRail>
      {children}
      <PrinterSettingsDrawer />
    </PosRail>
  )
}
