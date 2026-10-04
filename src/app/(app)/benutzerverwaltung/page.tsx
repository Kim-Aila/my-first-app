import type { Metadata } from "next"

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { RolesTab } from "@/components/benutzerverwaltung/roles-tab"
import { TenantSelector } from "@/components/benutzerverwaltung/tenant-selector"
import type { TenantRole, TenantUser } from "@/components/benutzerverwaltung/types"
import { UsersTab } from "@/components/benutzerverwaltung/users-tab"
import { PageHeader } from "@/components/page-header"
import { EmptyState, LoadErrorAlert, NoAccessCard } from "@/components/state-messages"
import { isCurrentlyLocked } from "@/lib/format"
import { normalizeAccessLevel } from "@/lib/masks"
import { getSessionContext } from "@/lib/session-context"
import { createClient as createServerClient } from "@/lib/supabase-server"

export const metadata: Metadata = { title: "Benutzerverwaltung · Manufaktur-ERP" }

interface AccessRow {
  user_id: string
  user_profiles: {
    id: string
    username: string
    email: string
    is_active: boolean | null
    locked_until: string | null
  } | null
}

interface UserRoleRow {
  user_id: string
  role_id: string
}

interface RoleRow {
  id: string
  name: string
  role_permissions: { module: string; maske: string; access_level?: string | null }[] | null
}

export default async function BenutzerverwaltungPage({
  searchParams,
}: {
  searchParams: Promise<{ mandant?: string | string[] }>
}) {
  const [session, params] = await Promise.all([getSessionContext(), searchParams])
  const manageableTenants = session.userAdminTenants

  if (manageableTenants.length === 0) {
    if (session.isSuperAdmin) {
      return (
        <>
          <PageHeader title="Benutzerverwaltung" />
          <EmptyState
            title="Noch keine Mandanten vorhanden"
            description="Lege zuerst unter „Mandanten“ einen Mandanten an."
          />
        </>
      )
    }
    return (
      <NoAccessCard description="Du hast in keinem Mandanten Zugriff auf die Benutzerverwaltung." />
    )
  }

  const requestedId = Array.isArray(params.mandant) ? params.mandant[0] : params.mandant
  const tenant =
    manageableTenants.find((t) => t.id === requestedId) ?? manageableTenants[0]

  const supabase = await createServerClient()
  // `user_roles`, `roles`, `role_permissions` und `user_profiles.is_active` werden von /backend
  // angelegt. Bis dahin schlagen diese Abfragen fehl → Fehlerzustand statt Absturz.
  // `role_permissions.access_level` (PROJ-3) fehlt bis zur Migration → dann ohne Stufe lesen
  // (alle Rechte gelten als "Lesen + Bearbeiten", wie bisher).
  async function loadRoles() {
    const withLevel = await supabase
      .from("roles")
      .select("id, name, role_permissions(module, maske, access_level)")
      .eq("tenant_id", tenant.id)
      .order("name", { ascending: true })
    if (!withLevel.error) return withLevel
    return supabase
      .from("roles")
      .select("id, name, role_permissions(module, maske)")
      .eq("tenant_id", tenant.id)
      .order("name", { ascending: true })
  }

  const [accessResult, userRolesResult, rolesResult] = await Promise.all([
    supabase
      .from("user_tenant_access")
      .select("user_id, user_profiles(id, username, email, is_active, locked_until)")
      .eq("tenant_id", tenant.id),
    supabase.from("user_roles").select("user_id, role_id").eq("tenant_id", tenant.id),
    loadRoles(),
  ])

  const loadError = accessResult.error || userRolesResult.error || rolesResult.error

  const userRoles = (userRolesResult.data ?? []) as UserRoleRow[]
  const roleIdsByUser = new Map<string, string[]>()
  const userCountByRole = new Map<string, number>()
  for (const row of userRoles) {
    roleIdsByUser.set(row.user_id, [...(roleIdsByUser.get(row.user_id) ?? []), row.role_id])
    userCountByRole.set(row.role_id, (userCountByRole.get(row.role_id) ?? 0) + 1)
  }

  const users: TenantUser[] = ((accessResult.data ?? []) as unknown as AccessRow[])
    .filter((row) => row.user_profiles !== null)
    .map((row) => {
      const profile = row.user_profiles!
      return {
        id: profile.id,
        username: profile.username,
        email: profile.email,
        isActive: profile.is_active !== false,
        isLocked: isCurrentlyLocked(profile.locked_until),
        roleIds: roleIdsByUser.get(profile.id) ?? [],
      }
    })
    .sort((a, b) => a.username.localeCompare(b.username, "de"))

  const roles: TenantRole[] = ((rolesResult.data ?? []) as unknown as RoleRow[]).map((row) => ({
    id: row.id,
    name: row.name,
    masks: (row.role_permissions ?? []).map((p) => ({
      module: p.module,
      maske: p.maske,
      accessLevel: normalizeAccessLevel(p.access_level),
    })),
    userCount: userCountByRole.get(row.id) ?? 0,
  }))

  return (
    <>
      <PageHeader
        title="Benutzerverwaltung"
        description={`Benutzer und Rollen des Mandanten „${tenant.name}“ verwalten`}
        actions={
          manageableTenants.length > 1 ? (
            <TenantSelector tenants={manageableTenants} selectedTenantId={tenant.id} />
          ) : undefined
        }
      />

      {loadError ? (
        <LoadErrorAlert />
      ) : (
        // key: Tab-Zustand beim Mandantenwechsel zurücksetzen
        <Tabs key={tenant.id} defaultValue="benutzer" className="space-y-4">
          <TabsList aria-label="Bereiche der Benutzerverwaltung">
            <TabsTrigger value="benutzer">Benutzer ({users.length})</TabsTrigger>
            <TabsTrigger value="rollen">Rollen ({roles.length})</TabsTrigger>
          </TabsList>
          <TabsContent value="benutzer">
            <UsersTab
              tenantId={tenant.id}
              tenantName={tenant.name}
              users={users}
              roles={roles}
              currentUserId={session.userId}
            />
          </TabsContent>
          <TabsContent value="rollen">
            <RolesTab tenantId={tenant.id} tenantName={tenant.name} roles={roles} />
          </TabsContent>
        </Tabs>
      )}
    </>
  )
}
