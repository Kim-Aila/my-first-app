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
  dbErrorResponse,
  merkmalDuplicateMessage,
  merkmalRow,
  merkmalSchema,
  merkmalUniqueField,
} from "../../../warenwirtschaft-shared"

// POST /api/tenants/:tenantId/merkmale/:slug — Eintrag einer Merkmal-Tabelle anlegen.
// Schreibrecht auf die zugehörige Merkmal-Maske; Kürzel/Name sind je Mandant case-insensitive
// eindeutig (Datenbank-Index → 409).
export async function POST(
  request: Request,
  { params }: { params: Promise<{ tenantId: string; slug: string }> }
) {
  const { tenantId, slug } = await params
  const invalid = invalidIdResponse(tenantId)
  if (invalid) return invalid

  const config = getMerkmalConfig(slug)
  if (!config) return jsonError(404, "Nicht gefunden.")

  const supabase = await createServerClient()
  const auth = await requireMaskAccess(supabase, tenantId, config.mask, "write")
  if (!auth.ok) return auth.response

  const parsed = merkmalSchema(config).safeParse(await readJson(request))
  if (!parsed.success) return validationError(parsed.error)
  const { isActive, ...values } = parsed.data as Record<string, unknown> & { isActive?: boolean }

  const { data, error } = await supabase
    .from(config.table)
    .insert({
      tenant_id: tenantId,
      ...merkmalRow(config, values),
      ...(isActive === undefined ? {} : { is_active: isActive }),
    })
    .select("id")
    .single()

  if (error || !data) {
    return dbErrorResponse(error ?? {}, {
      message: merkmalDuplicateMessage(config),
      field: merkmalUniqueField(config),
    })
  }

  return NextResponse.json({ id: data.id }, { status: 201 })
}
