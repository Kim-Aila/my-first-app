import { NextResponse } from "next/server"
import { z } from "zod"

import {
  FORBIDDEN_MESSAGE,
  SERVER_ERROR_MESSAGE,
  invalidIdResponse,
  jsonError,
  readJson,
  requireCaller,
  validationError,
} from "@/lib/api-auth"
import { createClient as createServerClient } from "@/lib/supabase-server"

export const LAST_SUPER_ADMIN_MESSAGE =
  "Mindestens ein Super-Admin muss bestehen bleiben. Ernenne zuerst einen weiteren Super-Admin."
export const SELF_DEACTIVATION_MESSAGE = "Du kannst dich nicht selbst deaktivieren."

const updateUserSchema = z
  .object({
    isSuperAdmin: z.boolean().optional(),
    isActive: z.boolean().optional(),
  })
  .refine((v) => v.isSuperAdmin !== undefined || v.isActive !== undefined, {
    message: "Keine Änderung angegeben.",
  })

// PATCH /api/users/:userId — Super-Admin-Flag setzen/entziehen, User global (de)aktivieren.
// Nur Super-Admin (globale Aktion, nicht an einen Mandanten gebunden). Läuft über den
// Session-Client — die PROJ-1-Policy "Only super-admins manage profiles (update)" deckt das ab.
//
// Bewusste Lücke (dokumentiert in der Spec): Das Deaktivieren des letzten *aktiven*
// Super-Admins durch einen anderen Super-Admin wird nicht zusätzlich verhindert (praktisch nur
// bei gleichzeitiger gegenseitiger Deaktivierung erreichbar, da Selbst-Deaktivierung blockiert ist).
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ userId: string }> }
) {
  const { userId } = await params
  const invalid = invalidIdResponse(userId)
  if (invalid) return invalid

  const supabase = await createServerClient()
  const auth = await requireCaller(supabase)
  if (!auth.ok) return auth.response
  if (!auth.caller.isSuperAdmin) return jsonError(403, FORBIDDEN_MESSAGE)

  const parsed = updateUserSchema.safeParse(await readJson(request))
  if (!parsed.success) return validationError(parsed.error)
  const { isSuperAdmin, isActive } = parsed.data

  if (isActive === false && userId === auth.caller.userId) {
    return jsonError(400, SELF_DEACTIVATION_MESSAGE)
  }

  const { data: target, error: targetError } = await supabase
    .from("user_profiles")
    .select("id, is_super_admin")
    .eq("id", userId)
    .maybeSingle()
  if (targetError) return jsonError(500, SERVER_ERROR_MESSAGE)
  if (!target) return jsonError(404, "Benutzer nicht gefunden.")

  const patch: { is_super_admin?: boolean; is_active?: boolean } = {}
  if (isSuperAdmin !== undefined) patch.is_super_admin = isSuperAdmin
  if (isActive !== undefined) patch.is_active = isActive

  if (isSuperAdmin === false && target.is_super_admin) {
    // BUG-4: Prüfung ("mindestens ein weiterer *aktiver* Super-Admin") und Entzug laufen atomar
    // in der SQL-Funktion `revoke_super_admin()` (serialisiert per Advisory-Lock) — kein
    // Check-then-Update mehr, zählt keine deaktivierten Super-Admins mehr mit.
    const { data: revoked, error: revokeError } = await supabase.rpc("revoke_super_admin", {
      target_id: userId,
    })
    if (revokeError) return jsonError(500, SERVER_ERROR_MESSAGE)
    if (revoked !== true) return jsonError(409, LAST_SUPER_ADMIN_MESSAGE)
    delete patch.is_super_admin
  }

  // Deaktivieren (is_active → false) beendet per DB-Trigger
  // `user_profiles_revoke_sessions_on_deactivation` sofort alle GoTrue-Sessions des Users
  // (BUG-2); zusätzlich sperrt RLS deaktivierte User über die Helper-Funktionen aus.
  const hasUpdate = Object.keys(patch).length > 0
  const { data: updated, error: updateError } = hasUpdate
    ? await supabase
        .from("user_profiles")
        .update(patch)
        .eq("id", userId)
        .select("id, is_super_admin, is_active")
        .maybeSingle()
    : await supabase
        .from("user_profiles")
        .select("id, is_super_admin, is_active")
        .eq("id", userId)
        .maybeSingle()
  if (updateError) return jsonError(500, SERVER_ERROR_MESSAGE)
  if (!updated) return jsonError(404, "Benutzer nicht gefunden.")

  return NextResponse.json({
    id: updated.id,
    isSuperAdmin: updated.is_super_admin,
    isActive: updated.is_active,
  })
}
