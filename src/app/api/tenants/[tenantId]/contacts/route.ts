import { NextResponse } from "next/server"

import {
  invalidIdResponse,
  readJson,
  requireMaskAccess,
  validationError,
} from "@/lib/api-auth"
import { MASK_KONTAKTE } from "@/lib/masks"
import { createClient as createServerClient } from "@/lib/supabase-server"

import { contactCreateSchema, contactRow } from "../../adressen-shared"
import { dbErrorResponse } from "../../warenwirtschaft-shared"

// POST /api/tenants/:tenantId/contacts — Kontakt anlegen (gehört zu genau einer Adresse).
// Schreibrecht auf die Maske Kontakte. Die Adresse muss im selben Mandanten liegen (zusammen-
// gesetzter Fremdschlüssel) und aktiv sein. Neue Kontakte sind immer aktiv.
export async function POST(
  request: Request,
  { params }: { params: Promise<{ tenantId: string }> }
) {
  const { tenantId } = await params
  const invalid = invalidIdResponse(tenantId)
  if (invalid) return invalid

  const supabase = await createServerClient()
  const auth = await requireMaskAccess(supabase, tenantId, MASK_KONTAKTE, "write")
  if (!auth.ok) return auth.response

  const parsed = contactCreateSchema.safeParse(await readJson(request))
  if (!parsed.success) return validationError(parsed.error)
  const { addressId, ...values } = parsed.data

  const { data, error } = await supabase
    .from("contacts")
    .insert({ tenant_id: tenantId, address_id: addressId, ...contactRow(values) })
    .select("id")
    .single()

  if (error || !data) {
    return dbErrorResponse(error ?? {}, { message: "Der Kontakt existiert bereits." })
  }

  return NextResponse.json({ id: data.id }, { status: 201 })
}
