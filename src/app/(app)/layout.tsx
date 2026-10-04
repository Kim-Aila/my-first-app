import { cookies } from "next/headers"

import { AppSidebar } from "@/components/app-sidebar"
import { Separator } from "@/components/ui/separator"
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar"
import { Toaster } from "@/components/ui/sonner"
import { UnsavedChangesProvider } from "@/components/unsaved-changes-provider"
import { MASK_ARTIKELSTAMM } from "@/lib/masks"
import { MERKMALE, merkmalHref } from "@/lib/merkmale"
import { getSessionContext } from "@/lib/session-context"
import { tenantsWithMask } from "@/lib/tenant-access"

export default async function AppLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  const [session, cookieStore] = await Promise.all([getSessionContext(), cookies()])
  const defaultOpen = cookieStore.get("sidebar_state")?.value !== "false"

  const canViewArticles = tenantsWithMask(session, MASK_ARTIKELSTAMM).length > 0
  const merkmalItems = MERKMALE.filter((m) => tenantsWithMask(session, m.mask).length > 0).map(
    (m) => ({ title: m.plural, href: merkmalHref(m) })
  )

  return (
    <UnsavedChangesProvider>
      <SidebarProvider defaultOpen={defaultOpen}>
        <AppSidebar
          username={session.username}
          isSuperAdmin={session.isSuperAdmin}
          canManageUsers={session.userAdminTenants.length > 0}
          canViewArticles={canViewArticles}
          merkmalItems={merkmalItems}
        />
        <SidebarInset>
          <header className="sticky top-0 z-10 flex h-14 shrink-0 items-center gap-2 border-b bg-background/95 px-4 backdrop-blur supports-[backdrop-filter]:bg-background/80 md:px-6">
            <SidebarTrigger className="-ml-1" aria-label="Navigation ein-/ausblenden" />
            <Separator orientation="vertical" className="h-5" />
            <span className="text-sm text-muted-foreground">Manufaktur-ERP</span>
          </header>
          <div className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 md:px-8 md:py-8">{children}</div>
        </SidebarInset>
        <Toaster theme="light" position="top-right" richColors={false} />
      </SidebarProvider>
    </UnsavedChangesProvider>
  )
}
