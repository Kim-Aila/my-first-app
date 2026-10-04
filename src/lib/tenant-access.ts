// Reine Helfer rund um Maskenrechte (ohne Server-Abhängigkeiten, daher testbar).
// Nur UI-Sichtbarkeit — die Durchsetzung liegt serverseitig (Routen + RLS).
import { maskKey, type AccessLevel } from "@/lib/masks"
import { MERKMALE } from "@/lib/merkmale"
import type { SessionContext, TenantSummary } from "@/lib/session-context"

type AccessSession = Pick<SessionContext, "isSuperAdmin" | "tenants" | "maskAccess">

export function getAccessLevel(
  session: AccessSession,
  tenantId: string,
  mask: { module: string; maske: string }
): AccessLevel | null {
  if (session.isSuperAdmin) return "write"
  return session.maskAccess[tenantId]?.[maskKey(mask)] ?? null
}

/** Mandanten, in denen der User die Maske mindestens lesen darf. */
export function tenantsWithMask(
  session: AccessSession,
  mask: { module: string; maske: string }
): TenantSummary[] {
  return session.tenants.filter((tenant) => getAccessLevel(session, tenant.id, mask) !== null)
}

/** Gewünschten Mandanten (?mandant=) wählen, sonst den ersten mit Zugriff. */
export function resolveTenant(
  tenants: TenantSummary[],
  requestedId: string | undefined
): TenantSummary | null {
  return tenants.find((t) => t.id === requestedId) ?? tenants[0] ?? null
}

/** Merkmal-Slug → darf der User die Pflege-Maske in diesem Mandanten öffnen. */
export function maintenanceAccessFor(
  session: AccessSession,
  tenantId: string
): Record<string, boolean> {
  return Object.fromEntries(
    MERKMALE.map((m) => [m.slug, getAccessLevel(session, tenantId, m.mask) !== null])
  )
}
