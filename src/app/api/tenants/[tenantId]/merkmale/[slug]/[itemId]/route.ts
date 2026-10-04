import { NextResponse } from "next/server"

import {
  invalidIdResponse,
  jsonError,
  readJson,
  requireMaskAccess,
  validationError,
} from "@/lib/api-auth"
import { getMerkmalConfig } from "@/lib/merkmale"
import { createClient as createServerClient } from "@/lib/supabase-server"

import {
  MERKMAL_NOT_FOUND_MESSAGE,
  dbErrorResponse,
  merkmalDuplicateMessage,
  merkmalRow,
  merkmalSchema,
  merkmalStatusSchema,
  merkmalUniqueField,
} from "../../../../warenwirtschaft-shared"

// PATCH /api/tenants/:tenantId/merkmale/:slug/:itemId — Eintrag ändern ODER (Body nur
// `{ isActive }`) aktivieren/deaktivieren. Es gibt keine Löschroute: Einträge werden nur
// deaktiviert, damit bestehende Artikel intakt bleiben.
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ tenantId: string; slug: string; itemId: string }> }
) {
  const { tenantId, slug, itemId } = await params
  const invalid = invalidIdResponse(tenantId, itemId)
  if (invalid) return invalid

  const config = getMerkmalConfig(slug)
  if (!config) return jsonError(404, "Nicht gefunden.")

  const supabase = await createServerClient()
  const auth = await requireMaskAccess(supabase, tenantId, config.mask, "write")
  if (!auth.ok) return auth.response

  const body = await readJson(request)
  const statusOnly =
    body !== null &&
    typeof body === "object" &&
    !Array.isArray(body) &&
    Object.keys(body).length === 1 &&
    "isActive" in body

  let update: Record<string, unknown>
  if (statusOnly) {
    const parsed = merkmalStatusSchema.safeParse(body)
    if (!parsed.success) return validationError(parsed.error)
    update = { is_active: parsed.data.isActive }
  } else {
    const parsed = merkmalSchema(config).safeParse(body)
    if (!parsed.success) return validationError(parsed.error)
    const { isActive, ...values } = parsed.data as Record<string, unknown> & { isActive?: boolean }
    update = {
      ...merkmalRow(config, values),
      ...(isActive === undefined ? {} : { is_active: isActive }),
    }
  }

  const { data, error } = await supabase
    .from(config.table)
    .update(update)
    .eq("id", itemId)
    .eq("tenant_id", tenantId)
    .select("id, is_active")
    .maybeSingle()

  if (error) {
    return dbErrorResponse(error, {
      message: merkmalDuplicateMessage(config),
      field: merkmalUniqueField(config),
    })
  }
  if (!data) return jsonError(404, MERKMAL_NOT_FOUND_MESSAGE)

  return NextResponse.json({ id: data.id, isActive: data.is_active })
}
