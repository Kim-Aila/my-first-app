import { NextResponse } from "next/server"

import {
  invalidIdResponse,
  jsonError,
  readJson,
  requireMaskAccess,
  validationError,
} from "@/lib/api-auth"
import { MASK_KONTAKTE } from "@/lib/masks"
import { createClient as createServerClient } from "@/lib/supabase-server"

import { CONTACT_NOT_FOUND_MESSAGE, contactStatusSchema } from "../../../../adressen-shared"
import { dbErrorResponse } from "../../../../warenwirtschaft-shared"

// PATCH /api/tenants/:tenantId/contacts/:contactId/status — Kontakt (de)aktivieren.
// Laut Spec genügt "Lesen + Bearbeiten" (kein Zusatzrecht). Ist der Kontakt gerade von jemand
// anderem gesperrt, lehnt der Datenbank-Trigger mit 409 ab. Es gibt keine Löschroute.
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ tenantId: string; contactId: string }> }
) {
  const { tenantId, contactId } = await params
  const invalid = invalidIdResponse(tenantId, contactId)
  if (invalid) return invalid

  const supabase = await createServerClient()
  const auth = await requireMaskAccess(supabase, tenantId, MASK_KONTAKTE, "write")
  if (!auth.ok) return auth.response

  const parsed = contactStatusSchema.safeParse(await readJson(request))
  if (!parsed.success) return validationError(parsed.error)

  const { data, error } = await supabase
    .from("contacts")
    .update({ is_active: parsed.data.isActive })
    .eq("id", contactId)
    .eq("tenant_id", tenantId)
    .select("id, is_active")
    .maybeSingle()

  if (error) return dbErrorResponse(error, { message: "Der Kontakt existiert bereits." })
  if (!data) return jsonError(404, CONTACT_NOT_FOUND_MESSAGE)

  return NextResponse.json({ id: data.id, isActive: data.is_active })
}
