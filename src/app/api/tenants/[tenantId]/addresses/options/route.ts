import { NextResponse } from "next/server"

import {
  SERVER_ERROR_MESSAGE,
  invalidIdResponse,
  jsonError,
  requireAnyMaskAccess,
  validationError,
} from "@/lib/api-auth"
import { MASK_ADRESSEN, MASK_ARTIKELSTAMM } from "@/lib/masks"
import { createClient as createServerClient } from "@/lib/supabase-server"

import {
  optionFromRow,
  optionsQuerySchema,
  queryObject,
  type OptionRow,
} from "../../../adressen-shared"

const LIMIT = 25

// GET /api/tenants/:tenantId/addresses/options?q=&requireCode=true&excludeSubtreeOf=<id>
// Suche für Adress-Auswahlfelder: nur aktive Adressen, höchstens 25 Treffer. `requireCode` = nur mit
// Kürzel (Markeninhaber), `excludeSubtreeOf` blendet die Adresse und alle ihre Nachkommen aus
// (Zyklusschutz). Lesen darf, wer Adressen ODER den Artikelstamm lesen darf (wie RLS).
export async function GET(
  request: Request,
  { params }: { params: Promise<{ tenantId: string }> }
) {
  const { tenantId } = await params
  const invalid = invalidIdResponse(tenantId)
  if (invalid) return invalid

  const supabase = await createServerClient()
  const auth = await requireAnyMaskAccess(supabase, tenantId, [MASK_ADRESSEN, MASK_ARTIKELSTAMM], "read")
  if (!auth.ok) return auth.response

  const parsed = optionsQuerySchema.safeParse(queryObject(request))
  if (!parsed.success) return validationError(parsed.error)

  const { data, error } = await supabase.rpc("address_options", {
    p_tenant_id: tenantId,
    p_q: parsed.data.q || null,
    p_require_code: parsed.data.requireCode === "true",
    p_exclude_subtree_of: parsed.data.excludeSubtreeOf ?? null,
    p_limit: LIMIT,
  })
  if (error) return jsonError(500, SERVER_ERROR_MESSAGE)

  return NextResponse.json({ items: ((data ?? []) as OptionRow[]).map(optionFromRow) })
}
