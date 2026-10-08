import { NextResponse } from "next/server"

import {
  invalidIdResponse,
  readJson,
  requireMaskAccess,
  validationError,
} from "@/lib/api-auth"
import { MASK_ADRESSEN } from "@/lib/masks"
import { createClient as createServerClient } from "@/lib/supabase-server"

import {
  ADDRESS_NUMBER_TAKEN_MESSAGE,
  addressRow,
  addressSchema,
} from "../../adressen-shared"
import { dbErrorResponse } from "../../warenwirtschaft-shared"

// POST /api/tenants/:tenantId/addresses — Adresse anlegen.
// Schreibrecht auf die Maske Adressen; Adressnummer und Suchzeile berechnet der Datenbank-Trigger,
// Zyklen/inaktive Verweise lehnt er ab. Neue Adressen sind immer aktiv. Session-Client → RLS greift.
export async function POST(
  request: Request,
  { params }: { params: Promise<{ tenantId: string }> }
) {
  const { tenantId } = await params
  const invalid = invalidIdResponse(tenantId)
  if (invalid) return invalid

  const supabase = await createServerClient()
  const auth = await requireMaskAccess(supabase, tenantId, MASK_ADRESSEN, "write")
  if (!auth.ok) return auth.response

  const parsed = addressSchema.safeParse(await readJson(request))
  if (!parsed.success) return validationError(parsed.error)

  const { data, error } = await supabase
    .from("addresses")
    .insert({ tenant_id: tenantId, ...addressRow(parsed.data) })
    .select("id, address_number")
    .single()

  if (error || !data) {
    return dbErrorResponse(error ?? {}, {
      message: ADDRESS_NUMBER_TAKEN_MESSAGE,
      field: "suffix",
    })
  }

  return NextResponse.json({ id: data.id, addressNumber: data.address_number }, { status: 201 })
}
