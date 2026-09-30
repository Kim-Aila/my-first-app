// Server-seitiger Sitzungskontext für alle Seiten innerhalb der App-Shell (Route-Gruppe "(app)").
// Nur aus Server Components / Route Handlers verwenden.
//
// Ermittelt: eingeloggten User + Profil, sichtbare Mandanten und die Mandanten, in denen der
// User die Maske "Benutzerverwaltung" nutzen darf (= Mandanten-Admin laut PROJ-2-Spec).
//
// WICHTIG: Das hier ist nur die UI-Sichtbarkeit (Navigation ein-/ausblenden). Die eigentliche
// Berechtigungsprüfung für jede Schreibaktion passiert serverseitig in den /api-Routen + RLS.
import { cache } from "react"
import { redirect } from "next/navigation"

import { createClient as createServerClient } from "@/lib/supabase-server"
import { MASK_BENUTZERVERWALTUNG } from "@/lib/masks"

export interface TenantSummary {
  id: string
  name: string
}

export interface SessionContext {
  userId: string
  username: string
  email: string | null
  isSuperAdmin: boolean
  /** Mandanten, die der User sehen darf (Super-Admin: alle). */
  tenants: TenantSummary[]
  /** Mandanten, in denen der User die Maske "Benutzerverwaltung" hat (Super-Admin: alle). */
  userAdminTenants: TenantSummary[]
}

interface UserRoleRow {
  tenant_id: string
  roles: {
    role_permissions: { module: string; maske: string }[] | null
  } | null
}

export const getSessionContext = cache(async (): Promise<SessionContext> => {
  const supabase = await createServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect("/login")
  }

  const { data: profile } = await supabase
    .from("user_profiles")
    .select("id, username, email, is_super_admin")
    .eq("id", user.id)
    .maybeSingle()

  const isSuperAdmin = Boolean(profile?.is_super_admin)

  // RLS liefert Super-Admins alle Mandanten, regulären Usern nur ihre zugeordneten.
  const { data: tenantRows } = await supabase
    .from("tenants")
    .select("id, name")
    .order("name", { ascending: true })

  const tenants: TenantSummary[] = (tenantRows ?? []) as TenantSummary[]

  let userAdminTenants: TenantSummary[] = []

  if (isSuperAdmin) {
    userAdminTenants = tenants
  } else {
    // Best-Effort: Die Tabellen `user_roles`, `roles`, `role_permissions` werden erst von
    // /backend angelegt. Solange die Abfrage fehlschlägt oder leer ist, gilt "kein Zugriff".
    try {
      const { data: roleRows, error } = await supabase
        .from("user_roles")
        .select("tenant_id, roles(role_permissions(module, maske))")
        .eq("user_id", user.id)

      if (!error && roleRows) {
        const adminTenantIds = new Set(
          (roleRows as unknown as UserRoleRow[])
            .filter((row) =>
              (row.roles?.role_permissions ?? []).some(
                (p) =>
                  p.module === MASK_BENUTZERVERWALTUNG.module &&
                  p.maske === MASK_BENUTZERVERWALTUNG.maske
              )
            )
            .map((row) => row.tenant_id)
        )
        userAdminTenants = tenants.filter((t) => adminTenantIds.has(t.id))
      }
    } catch {
      userAdminTenants = []
    }
  }

  return {
    userId: user.id,
    username: profile?.username ?? user.email ?? "Unbekannt",
    email: profile?.email ?? user.email ?? null,
    isSuperAdmin,
    tenants,
    userAdminTenants,
  }
})
