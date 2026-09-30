import { NextResponse } from "next/server"

import {
  SERVER_ERROR_MESSAGE,
  invalidIdResponse,
  isUniqueViolation,
  jsonError,
  readJson,
  requireTenantAdmin,
  validationError,
} from "@/lib/api-auth"
import { maskKey } from "@/lib/masks"
import { createClient as createServerClient } from "@/lib/supabase-server"

import { ROLE_NAME_TAKEN_MESSAGE, roleSchema } from "../../../shared"

type Params = { params: Promise<{ tenantId: string; roleId: string }> }

const ROLE_NOT_FOUND_MESSAGE = "Rolle nicht gefunden."

interface ExistingRole {
  id: string
  name: string
  role_permissions: { id: string; module: string; maske: string }[] | null
}

// PATCH /api/tenants/:tenantId/roles/:roleId — Rolle umbenennen + Masken ersetzen (last-write-wins).
export async function PATCH(request: Request, { params }: Params) {
  const { tenantId, roleId } = await params
  const invalid = invalidIdResponse(tenantId, roleId)
  if (invalid) return invalid

  const supabase = await createServerClient()
  const auth = await requireTenantAdmin(supabase, tenantId)
  if (!auth.ok) return auth.response

  const parsed = roleSchema.safeParse(await readJson(request))
  if (!parsed.success) return validationError(parsed.error)
  const { name, masks } = parsed.data

  // Rolle muss zu genau diesem Mandanten gehören (keine mandantenfremden Rollen-IDs).
  const { data: existingData, error: existingError } = await supabase
    .from("roles")
    .select("id, name, role_permissions(id, module, maske)")
    .eq("id", roleId)
    .eq("tenant_id", tenantId)
    .maybeSingle()
  if (existingError) return jsonError(500, SERVER_ERROR_MESSAGE)
  if (!existingData) return jsonError(404, ROLE_NOT_FOUND_MESSAGE)
  const existing = existingData as unknown as ExistingRole

  if (existing.name !== name) {
    const { error: renameError } = await supabase
      .from("roles")
      .update({ name })
      .eq("id", roleId)
      .eq("tenant_id", tenantId)
    if (renameError) {
      if (isUniqueViolation(renameError)) return jsonError(409, ROLE_NAME_TAKEN_MESSAGE, "name")
      return jsonError(500, SERVER_ERROR_MESSAGE)
    }
  }

  // Diff statt "alle Masken löschen, alle neu einfügen" (BUG-3): Masken, die bleiben, werden nie
  // angefasst. Sonst verliert ein Mandanten-Admin, der seine eigene Admin-Rolle bearbeitet, kurz
  // die Maske basis/benutzerverwaltung — und RLS lehnt das folgende Insert ab. Reihenfolge: erst
  // hinzufügen, dann entfernen.
  const previous = existing.role_permissions ?? []
  const previousKeys = new Set(previous.map(maskKey))
  const targetKeys = new Set(masks.map(maskKey))
  const toAdd = masks.filter((m) => !previousKeys.has(maskKey(m)))
  const toRemove = previous.filter((m) => !targetKeys.has(maskKey(m)))

  let addedIds: string[] = []
  if (toAdd.length > 0) {
    const { data: added, error: insertError } = await supabase
      .from("role_permissions")
      .insert(toAdd.map((m) => ({ role_id: roleId, module: m.module, maske: m.maske })))
      .select("id")
    // Masken noch unverändert → kein Rückbau nötig (eine evtl. Umbenennung bleibt bestehen,
    // wie bisher).
    if (insertError) return jsonError(500, SERVER_ERROR_MESSAGE)
    addedIds = ((added ?? []) as { id: string }[]).map((row) => row.id)
  }

  if (toRemove.length > 0) {
    const { error: deleteError } = await supabase
      .from("role_permissions")
      .delete()
      .eq("role_id", roleId)
      .in(
        "id",
        toRemove.map((m) => m.id)
      )

    if (deleteError) {
      // Best-Effort: gerade hinzugefügte Masken zurücknehmen (Spec EC-5). Unkritisch für das
      // eigene Admin-Recht — die bisherigen Masken sind unverändert.
      if (addedIds.length > 0) {
        await supabase.from("role_permissions").delete().eq("role_id", roleId).in("id", addedIds)
      }
      return jsonError(500, SERVER_ERROR_MESSAGE)
    }
  }

  return NextResponse.json({ id: roleId, name, masks })
}

// DELETE /api/tenants/:tenantId/roles/:roleId — Rolle löschen, auch wenn noch zugewiesen.
// `role_permissions` und `user_roles` fallen per ON DELETE CASCADE weg; betroffene User
// verlieren nur die Maskenrechte, ihr Login bleibt unberührt.
export async function DELETE(_request: Request, { params }: Params) {
  const { tenantId, roleId } = await params
  const invalid = invalidIdResponse(tenantId, roleId)
  if (invalid) return invalid

  const supabase = await createServerClient()
  const auth = await requireTenantAdmin(supabase, tenantId)
  if (!auth.ok) return auth.response

  const { data, error } = await supabase
    .from("roles")
    .delete()
    .eq("id", roleId)
    .eq("tenant_id", tenantId)
    .select("id")

  if (error) return jsonError(500, SERVER_ERROR_MESSAGE)
  if (!data || data.length === 0) return jsonError(404, ROLE_NOT_FOUND_MESSAGE)

  return NextResponse.json({ success: true })
}
