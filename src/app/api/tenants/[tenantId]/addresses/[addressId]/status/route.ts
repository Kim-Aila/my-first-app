import { NextResponse } from "next/server"

import {
  SERVER_ERROR_MESSAGE,
  invalidIdResponse,
  jsonError,
  readJson,
  requireMaskAccess,
  validationError,
} from "@/lib/api-auth"
import { MASK_ADRESSEN } from "@/lib/masks"
import { createClient as createServerClient } from "@/lib/supabase-server"

import { ADDRESS_NOT_FOUND_MESSAGE, addressStatusSchema } from "../../../../adressen-shared"
import { dbErrorResponse } from "../../../../warenwirtschaft-shared"

interface StatusRow {
  out_addresses: number
  out_contacts: number
}

// PATCH /api/tenants/:tenantId/addresses/:addressId/status — Aktivieren/Deaktivieren.
// Body: { isActive, includeChildren }. Läuft als EIN unteilbarer Datenbankvorgang
// (`set_address_status`): vollständig oder gar nicht. Beim Deaktivieren werden die Kontakte der
// betroffenen Adressen mitdeaktiviert, auch ohne Kontakt-Recht des Nutzers; beim Aktivieren bleiben
// Kontakte inaktiv. Braucht das Zusatzrecht "aktivieren/deaktivieren" (403 ohne). Es gibt keine
// Löschroute.
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ tenantId: string; addressId: string }> }
) {
  const { tenantId, addressId } = await params
  const invalid = invalidIdResponse(tenantId, addressId)
  if (invalid) return invalid

  const supabase = await createServerClient()
  const auth = await requireMaskAccess(supabase, tenantId, MASK_ADRESSEN, "write")
  if (!auth.ok) return auth.response

  const parsed = addressStatusSchema.safeParse(await readJson(request))
  if (!parsed.success) return validationError(parsed.error)

  const { data, error } = await supabase.rpc("set_address_status", {
    p_tenant_id: tenantId,
    p_address_id: addressId,
    p_is_active: parsed.data.isActive,
    p_include_children: parsed.data.includeChildren,
  })

  if (error) {
    if (error.code === "P0002") return jsonError(404, ADDRESS_NOT_FOUND_MESSAGE)
    return dbErrorResponse(error, { message: SERVER_ERROR_MESSAGE })
  }

  const row = ((data ?? []) as StatusRow[])[0]
  if (!row) return jsonError(500, SERVER_ERROR_MESSAGE)

  return NextResponse.json({
    id: addressId,
    isActive: parsed.data.isActive,
    changedAddresses: row.out_addresses,
    changedContacts: row.out_contacts,
  })
}
