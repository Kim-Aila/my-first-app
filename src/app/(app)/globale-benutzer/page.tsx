import type { Metadata } from "next"

import { Card, CardContent } from "@/components/ui/card"
import { GlobalUsersTable, type GlobalUser } from "@/components/globale-benutzer/global-users-table"
import { PageHeader } from "@/components/page-header"
import { EmptyState, LoadErrorAlert, NoAccessCard } from "@/components/state-messages"
import { isCurrentlyLocked } from "@/lib/format"
import { getSessionContext } from "@/lib/session-context"
import { createClient as createServerClient } from "@/lib/supabase-server"

export const metadata: Metadata = { title: "Globale Benutzerverwaltung · Manufaktur-ERP" }

interface ProfileRow {
  id: string
  username: string
  email: string
  is_super_admin: boolean
  is_active: boolean | null
  locked_until: string | null
  user_tenant_access: { tenants: { name: string } | null }[] | null
}

export default async function GlobaleBenutzerPage() {
  const session = await getSessionContext()

  if (!session.isSuperAdmin) {
    return (
      <NoAccessCard description="Die globale Benutzerverwaltung steht nur Super-Admins zur Verfügung." />
    )
  }

  const supabase = await createServerClient()
  // `is_active` ("global aktiv") wird von /backend als neue Spalte auf user_profiles angelegt.
  const { data, error } = await supabase
    .from("user_profiles")
    .select(
      "id, username, email, is_super_admin, is_active, locked_until, user_tenant_access(tenants(name))"
    )
    .order("username", { ascending: true })

  const users: GlobalUser[] = ((data ?? []) as unknown as ProfileRow[]).map((row) => ({
    id: row.id,
    username: row.username,
    email: row.email,
    isSuperAdmin: row.is_super_admin,
    isActive: row.is_active !== false,
    isLocked: isCurrentlyLocked(row.locked_until),
    tenantNames: (row.user_tenant_access ?? [])
      .map((a) => a.tenants?.name)
      .filter((n): n is string => Boolean(n))
      .sort((a, b) => a.localeCompare(b, "de")),
  }))

  return (
    <>
      <PageHeader
        title="Globale Benutzerverwaltung"
        description="Alle Benutzer systemweit: Super-Admin-Recht vergeben oder entziehen und Benutzer global (de)aktivieren."
      />

      {error ? (
        <LoadErrorAlert />
      ) : users.length === 0 ? (
        <EmptyState title="Keine Benutzer gefunden" />
      ) : (
        <Card>
          <CardContent className="p-0">
            <GlobalUsersTable users={users} currentUserId={session.userId} />
          </CardContent>
        </Card>
      )}
    </>
  )
}
