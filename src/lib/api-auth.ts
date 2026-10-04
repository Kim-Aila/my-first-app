// Gemeinsame Berechtigungs-Helfer für Route Handler (server-only).
//
// `requireCaller` ermittelt den eingeloggten User + Super-Admin-Flag; `isTenantAdmin` spiegelt die
// SQL-Funktion `public.has_tenant_admin_access()` in Anwendungscode, damit Routen früh mit einer
// freundlichen 403 antworten können. Die eigentliche Durchsetzung bleibt RLS (zweite Ebene).
import { NextResponse } from "next/server"
import type { SupabaseClient } from "@supabase/supabase-js"
import { z } from "zod"

import { MASK_BENUTZERVERWALTUNG, type AccessLevel, type MaskDefinition } from "@/lib/masks"

export interface Caller {
  userId: string
  email: string | null
  isSuperAdmin: boolean
}

export type CallerResult = { ok: true; caller: Caller } | { ok: false; response: NextResponse }

export const FORBIDDEN_MESSAGE = "Dafür fehlt dir die Berechtigung."
export const SERVER_ERROR_MESSAGE = "Speichern fehlgeschlagen. Bitte versuche es erneut."
export const DEACTIVATED_MESSAGE = "Dieser Account wurde deaktiviert."

// GoTrue prüft Passwörter seit BUG-7 selbst (config.toml `password_requirements`). Sein
// Sonderzeichen-Satz ist nur ASCII-Interpunktion — die App-Richtlinie akzeptiert jedes
// Nicht-Alphanumerische (z.B. "§", "ä"). Solche Passwörter lehnt GoTrue mit `weak_password` ab.
export const GOTRUE_WEAK_PASSWORD_MESSAGE =
  "Das Passwort erfüllt die Richtlinie nicht. Bitte verwende mindestens eines dieser Sonderzeichen: ! @ # $ % ^ & * ( ) _ + - = [ ] { } ; ' \\ : \" | < > ? , . / ` ~"

export function isWeakPasswordError(error: { code?: string } | null | undefined) {
  return error?.code === "weak_password"
}

export function jsonError(status: number, error: string, field?: string) {
  return NextResponse.json(field ? { error, field } : { error }, { status })
}

export async function requireCaller(supabase: SupabaseClient): Promise<CallerResult> {
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { ok: false, response: jsonError(401, "Nicht angemeldet.") }
  }

  const { data: profile } = await supabase
    .from("user_profiles")
    .select("id, email, is_super_admin, is_active")
    .eq("id", user.id)
    .maybeSingle()

  // BUG-2 (Defense in Depth): RLS sperrt deaktivierte User bereits über die Helper-Funktionen aus;
  // hier bekommen sie zusätzlich eine klare 403, statt dass Routen auf dem (für den User selbst
  // weiterhin lesbaren) Super-Admin-Flag seines Profils aufbauen.
  if (profile?.is_active === false) {
    return { ok: false, response: jsonError(403, DEACTIVATED_MESSAGE) }
  }

  return {
    ok: true,
    caller: {
      userId: user.id,
      // Auth-E-Mail ist die kanonische Anmelde-E-Mail (GoTrue normalisiert sie).
      email: user.email ?? profile?.email ?? null,
      isSuperAdmin: Boolean(profile?.is_super_admin),
    },
  }
}

/** Super-Admin ODER Rolle mit Maske basis/benutzerverwaltung in genau diesem Mandanten. */
export async function isTenantAdmin(
  supabase: SupabaseClient,
  userId: string,
  tenantId: string,
  isSuperAdmin: boolean
): Promise<boolean> {
  if (isSuperAdmin) return true

  const { data, error } = await supabase
    .from("user_roles")
    .select("role_id, roles(role_permissions(module, maske))")
    .eq("user_id", userId)
    .eq("tenant_id", tenantId)
    .limit(100)

  if (error || !data) return false

  return (data as unknown as UserRoleWithPermissions[]).some((row) =>
    (row.roles?.role_permissions ?? []).some(
      (p) =>
        p.module === MASK_BENUTZERVERWALTUNG.module && p.maske === MASK_BENUTZERVERWALTUNG.maske
    )
  )
}

/** `requireCaller` + 403, falls der Caller in diesem Mandanten kein (Super-/Mandanten-)Admin ist. */
export async function requireTenantAdmin(
  supabase: SupabaseClient,
  tenantId: string
): Promise<CallerResult> {
  const auth = await requireCaller(supabase)
  if (!auth.ok) return auth

  const allowed = await isTenantAdmin(
    supabase,
    auth.caller.userId,
    tenantId,
    auth.caller.isSuperAdmin
  )
  if (!allowed) return { ok: false, response: jsonError(403, FORBIDDEN_MESSAGE) }
  return auth
}

/**
 * `requireCaller` + 403, falls der Caller die Maske im Mandanten nicht in der verlangten Stufe hat
 * (PROJ-3). Spiegelt die SQL-Funktion `public.mask_access_level()`; RLS bleibt die zweite Ebene.
 * Super-Admins haben überall "write".
 */
export async function requireMaskAccess(
  supabase: SupabaseClient,
  tenantId: string,
  mask: Pick<MaskDefinition, "module" | "maske">,
  level: AccessLevel
): Promise<CallerResult> {
  const auth = await requireCaller(supabase)
  if (!auth.ok) return auth
  if (auth.caller.isSuperAdmin) return auth

  const { data, error } = await supabase.rpc("mask_access_level", {
    p_tenant_id: tenantId,
    p_module: mask.module,
    p_maske: mask.maske,
  })
  if (error) return { ok: false, response: jsonError(500, SERVER_ERROR_MESSAGE) }

  const granted = data === "write" || (level === "read" && data === "read")
  if (!granted) return { ok: false, response: jsonError(403, FORBIDDEN_MESSAGE) }
  return auth
}

interface UserRoleWithPermissions {
  role_id: string
  roles: { role_permissions: { module: string; maske: string }[] | null } | null
}

export const uuidSchema = z.uuid()

/** Validiert dynamische Routen-Segmente (UUIDs), bevor sie in Abfragen landen. */
export function invalidIdResponse(...ids: string[]) {
  return ids.every((id) => uuidSchema.safeParse(id).success)
    ? null
    : jsonError(404, "Nicht gefunden.")
}

/**
 * Prüft, dass alle übergebenen Rollen-IDs zu genau diesem Mandanten gehören.
 * Liefert `true` auch für eine leere Liste.
 */
export async function rolesBelongToTenant(
  supabase: SupabaseClient,
  tenantId: string,
  roleIds: string[]
): Promise<{ ok: true } | { ok: false; dbError: boolean }> {
  const unique = [...new Set(roleIds)]
  if (unique.length === 0) return { ok: true }

  const { data, error } = await supabase
    .from("roles")
    .select("id")
    .eq("tenant_id", tenantId)
    .in("id", unique)
    .limit(unique.length)

  if (error) return { ok: false, dbError: true }
  return (data ?? []).length === unique.length ? { ok: true } : { ok: false, dbError: false }
}

/** 400 mit der ersten Zod-Meldung; `field` = betroffenes Formularfeld (erstes Pfadsegment). */
export function validationError(error: z.ZodError) {
  const issue = error.issues[0]
  const field = typeof issue?.path[0] === "string" ? issue.path[0] : undefined
  return jsonError(400, issue?.message ?? "Ungültige Eingabe.", field)
}

export async function readJson(request: Request): Promise<unknown> {
  return request.json().catch(() => null)
}

/** Postgres unique_violation (z.B. doppelter Mandanten-/Rollen-/Benutzername). */
export function isUniqueViolation(error: { code?: string } | null | undefined) {
  return error?.code === "23505"
}
