import { redirect } from "next/navigation"
import { OwnerSidebar } from "@/components/owner/owner-sidebar"
import { defaultRouteForRole } from "@/lib/kalapos/auth"
import { getAuthenticatedServerSession } from "@/lib/kalapos/auth-server"

export default async function OwnerLayout({ children }: { children: React.ReactNode }) {
  const session = await getAuthenticatedServerSession()
  if (!session) {
    redirect("/login?next=/owner")
  }
  if (session.role !== "OWNER") {
    redirect(defaultRouteForRole(session.role))
  }
  return <OwnerSidebar>{children}</OwnerSidebar>
}
