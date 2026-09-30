import { NextResponse } from "next/server"
import { z } from "zod"

import {
  SERVER_ERROR_MESSAGE,
  invalidIdResponse,
  jsonError,
  readJson,
  requireTenantAdmin,
  rolesBelongToTenant,
  validationError,
} from "@/lib/api-auth"
import { createClient as createServerClient } from "@/lib/supabase-server"

import { FOREIGN_ROLE_MESSAGE } from "../../../shared"

type Params = { params: Promise<{ tenantId: string; userId: string }> }

const USER_NOT_IN_TENANT_MESSAGE = "Dieser Benutzer ist diesem Mandanten nicht zugeordnet."

const updateRolesSchema = z.object({
  roleIds: z.array(z.uuid(FOREIGN_ROLE_MESSAGE), { error: "Rollen fehlen." }).max(100),
})

// PATCH /api/tenants/:tenantId/users/:userId — Rollen eines Users in diesem Mandanten ersetzen.
// Super-Admin ODER Mandanten-Admin; läuft über den Session-Client (RLS auf `user_roles`).
export async function PATCH(request: Request, { params }: Params) {
  const { tenantId, userId } = await params
  const invalid = invalidIdResponse(tenantId, userId)
  if (invalid) return invalid

  const supabase = await createServerClient()
  const auth = await requireTenantAdmin(supabase, tenantId)
  if (!auth.ok) return auth.response

  const parsed = updateRolesSchema.safeParse(await readJson(request))
  if (!parsed.success) return validationError(parsed.error)
  const roleIds = [...new Set(parsed.data.roleIds)]

  const rolesCheck = await rolesBelongToTenant(supabase, tenantId, roleIds)
  if (!rolesCheck.ok) {
    return rolesCheck.dbError
      ? jsonError(500, SERVER_ERROR_MESSAGE)
      : jsonError(400, FOREIGN_ROLE_MESSAGE, "roleIds")
  }

  const { data: access, error: accessError } = await supabase
    .from("user_tenant_access")
    .select("id")
    .eq("user_id", userId)
    .eq("tenant_id", tenantId)
    .maybeSingle()
  if (accessError) return jsonError(500, SERVER_ERROR_MESSAGE)
  if (!access) return jsonError(404, USER_NOT_IN_TENANT_MESSAGE)

  const { data: previous, error: previousError } = await supabase
    .from("user_roles")
    .select("role_id")
    .eq("user_id", userId)
    .eq("tenant_id", tenantId)
    .limit(1000)
  if (previousError) return jsonError(500, SERVER_ERROR_MESSAGE)

  // Diff statt "alles löschen, alles neu einfügen" (BUG-3): Zuweisungen, die bleiben, werden nie
  // angefasst. Sonst entzieht sich ein Mandanten-Admin beim Bearbeiten der eigenen Rollen kurz
  // selbst das Admin-Recht (`has_tenant_admin_access()` wird false) und RLS lehnt das folgende
  // Insert ab. Reihenfolge: erst hinzufügen, dann entfernen. Entfernt er sich bewusst selbst die
  // letzte Admin-Rolle (Spec EC-1: ohne Warnung erlaubt), greift das Delete trotzdem — RLS prüft
  // gegen den Datenbankstand zu Beginn des Statements.
  const previousIds = new Set((previous ?? []).map((row: { role_id: string }) => row.role_id))
  const target = new Set(roleIds)
  const toAdd = roleIds.filter((id) => !previousIds.has(id))
  const toRemove = [...previousIds].filter((id) => !target.has(id))

  if (toAdd.length > 0) {
    const { error: insertError } = await supabase
      .from("user_roles")
      .insert(toAdd.map((roleId) => ({ user_id: userId, tenant_id: tenantId, role_id: roleId })))
    // Noch nichts geändert → kein Rückbau nötig.
    if (insertError) return jsonError(500, SERVER_ERROR_MESSAGE)
  }

  if (toRemove.length > 0) {
    const { error: deleteError } = await supabase
      .from("user_roles")
      .delete()
      .eq("user_id", userId)
      .eq("tenant_id", tenantId)
      .in("role_id", toRemove)

    if (deleteError) {
      // Best-Effort: gerade hinzugefügte Zuweisungen zurücknehmen (Spec EC-5: nichts teilweise
      // speichern). Unkritisch für das eigene Admin-Recht — die alten Zeilen sind unverändert.
      if (toAdd.length > 0) {
        await supabase
          .from("user_roles")
          .delete()
          .eq("user_id", userId)
          .eq("tenant_id", tenantId)
          .in("role_id", toAdd)
      }
      return jsonError(500, SERVER_ERROR_MESSAGE)
    }
  }

  return NextResponse.json({ userId, tenantId, roleIds })
}

// DELETE /api/tenants/:tenantId/users/:userId — User aus diesem Mandanten entfernen.
// Löscht nur die `user_tenant_access`-Zeile; die `user_roles` dieses Mandanten fallen per
// zusammengesetztem Fremdschlüssel (ON DELETE CASCADE) automatisch weg. Andere Mandanten und
// der globale Account bleiben unverändert. Selbst-Entfernung ist erlaubt.
export async function DELETE(_request: Request, { params }: Params) {
  const { tenantId, userId } = await params
  const invalid = invalidIdResponse(tenantId, userId)
  if (invalid) return invalid

  const supabase = await createServerClient()
  const auth = await requireTenantAdmin(supabase, tenantId)
  if (!auth.ok) return auth.response

  const { data, error } = await supabase
    .from("user_tenant_access")
    .delete()
    .eq("user_id", userId)
    .eq("tenant_id", tenantId)
    .select("id")

  if (error) return jsonError(500, SERVER_ERROR_MESSAGE)
  if (!data || data.length === 0) return jsonError(404, USER_NOT_IN_TENANT_MESSAGE)

  return NextResponse.json({ success: true })
}
