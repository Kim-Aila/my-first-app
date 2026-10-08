import { NextResponse } from "next/server"

import {
  invalidIdResponse,
  jsonError,
  readJson,
  requireMaskAccess,
  validationError,
} from "@/lib/api-auth"
import { CONTACT_LOCK_RESOURCE } from "@/lib/addresses"
import { MASK_KONTAKTE } from "@/lib/masks"
import { createClient as createServerClient } from "@/lib/supabase-server"

import { CONTACT_NOT_FOUND_MESSAGE, contactRow, contactSchema } from "../../../adressen-shared"
import { dbErrorResponse } from "../../../warenwirtschaft-shared"

// PATCH /api/tenants/:tenantId/contacts/:contactId — Kontakt speichern (vollständiger Datensatz).
// Der Datenbank-Trigger verlangt die eigene, gültige Bearbeitungssperre (409 mit Nutzername, wenn
// jemand anderes sie hält). Die Adresse eines Kontakts ist nicht änderbar. Danach wird die Sperre
// freigegeben.
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

  const parsed = contactSchema.safeParse(await readJson(request))
  if (!parsed.success) return validationError(parsed.error)

  const { data, error } = await supabase
    .from("contacts")
    .update(contactRow(parsed.data))
    .eq("id", contactId)
    .eq("tenant_id", tenantId)
    .select("id")
    .maybeSingle()

  if (error) return dbErrorResponse(error, { message: "Der Kontakt existiert bereits." })
  if (!data) return jsonError(404, CONTACT_NOT_FOUND_MESSAGE)

  await supabase.rpc("release_edit_lock", {
    p_tenant_id: tenantId,
    p_resource_type: CONTACT_LOCK_RESOURCE,
    p_resource_id: contactId,
  })

  return NextResponse.json({ id: data.id })
}
