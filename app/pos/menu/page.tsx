import { redirect } from "next/navigation"
import { MenuManager } from "@/components/menu/menu-manager"
import { defaultRouteForRole } from "@/lib/kalapos/auth"
import { getAuthenticatedServerSession } from "@/lib/kalapos/auth-server"

export default async function PosMenuPage() {
  const session = await getAuthenticatedServerSession()
  if (!session) {
    redirect("/login?next=/pos/menu")
  }
  if (session.role !== "OWNER" && session.role !== "MANAGER") {
    redirect(defaultRouteForRole(session.role))
  }
  return <MenuManager scope="BRANCH" />
}
