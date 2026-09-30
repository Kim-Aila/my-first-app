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
import { createClient as createServerClient } from "@/lib/supabase-server"

import { ROLE_NAME_TAKEN_MESSAGE, roleSchema } from "../../shared"

// POST /api/tenants/:tenantId/roles — Rolle mit Masken anlegen.
// Super-Admin ODER Mandanten-Admin; Session-Client (RLS auf `roles`/`role_permissions`).
export async function POST(
  request: Request,
  { params }: { params: Promise<{ tenantId: string }> }
) {
  const { tenantId } = await params
  const invalid = invalidIdResponse(tenantId)
  if (invalid) return invalid

  const supabase = await createServerClient()
  const auth = await requireTenantAdmin(supabase, tenantId)
  if (!auth.ok) return auth.response

  const parsed = roleSchema.safeParse(await readJson(request))
  if (!parsed.success) return validationError(parsed.error)
  const { name, masks } = parsed.data

  const { data: role, error: roleError } = await supabase
    .from("roles")
    .insert({ tenant_id: tenantId, name })
    .select("id, name")
    .single()

  if (roleError || !role) {
    if (isUniqueViolation(roleError)) return jsonError(409, ROLE_NAME_TAKEN_MESSAGE, "name")
    return jsonError(500, SERVER_ERROR_MESSAGE)
  }

  if (masks.length > 0) {
    const { error: permError } = await supabase
      .from("role_permissions")
      .insert(masks.map((m) => ({ role_id: role.id, module: m.module, maske: m.maske })))

    if (permError) {
      // Rolle wieder entfernen, damit nichts teilweise gespeichert bleibt.
      await supabase.from("roles").delete().eq("id", role.id)
      return jsonError(500, SERVER_ERROR_MESSAGE)
    }
  }

  return NextResponse.json({ id: role.id, name: role.name, masks }, { status: 201 })
}
