import { NextResponse } from "next/server"

import {
  invalidIdResponse,
  jsonError,
  readJson,
  requireMaskAccess,
  validationError,
} from "@/lib/api-auth"
import { ADDRESS_LOCK_RESOURCE } from "@/lib/addresses"
import { MASK_ADRESSEN } from "@/lib/masks"
import { createClient as createServerClient } from "@/lib/supabase-server"

import {
  ADDRESS_NOT_FOUND_MESSAGE,
  ADDRESS_NUMBER_TAKEN_MESSAGE,
  addressRow,
  addressSchema,
} from "../../../adressen-shared"
import { dbErrorResponse } from "../../../warenwirtschaft-shared"

// PATCH /api/tenants/:tenantId/addresses/:addressId — Adresse speichern (vollständiger Datensatz).
// Der Datenbank-Trigger verlangt dafür die eigene, gültige Bearbeitungssperre (sonst 409 mit
// Meldung, die den sperrenden Nutzer nennt). Der Status ist nicht Teil dieses Bodys: er ändert
// sich nur über /status. Nach dem Speichern wird die Sperre freigegeben.
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

  const parsed = addressSchema.safeParse(await readJson(request))
  if (!parsed.success) return validationError(parsed.error)

  const { data, error } = await supabase
    .from("addresses")
    .update(addressRow(parsed.data))
    .eq("id", addressId)
    .eq("tenant_id", tenantId)
    .select("id, address_number")
    .maybeSingle()

  if (error) {
    return dbErrorResponse(error, { message: ADDRESS_NUMBER_TAKEN_MESSAGE, field: "suffix" })
  }
  if (!data) return jsonError(404, ADDRESS_NOT_FOUND_MESSAGE)

  // Best effort: ein Fehler beim Freigeben ist unkritisch, die Sperre läuft nach 15 Min. ab.
  await supabase.rpc("release_edit_lock", {
    p_tenant_id: tenantId,
    p_resource_type: ADDRESS_LOCK_RESOURCE,
    p_resource_id: addressId,
  })

  return NextResponse.json({ id: data.id, addressNumber: data.address_number })
}
