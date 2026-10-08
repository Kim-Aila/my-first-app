import { NextResponse } from "next/server"

import {
  SERVER_ERROR_MESSAGE,
  invalidIdResponse,
  jsonError,
  requireMaskAccess,
  validationError,
} from "@/lib/api-auth"
import { MASK_ADRESSEN } from "@/lib/masks"
import { createClient as createServerClient } from "@/lib/supabase-server"

import { nextSuffixQuerySchema, queryObject } from "../../../adressen-shared"

interface SuffixRow {
  out_exists: boolean
  out_suffix: string | null
}

// GET /api/tenants/:tenantId/addresses/next-suffix?base=4711 — Vorschlag der nächsten freien
// Kennziffer. { exists: false, suffix: null }, wenn die Basis noch nicht vergeben ist. Nur ein
// Hinweis (kein Zähler): bei gleichzeitigem Anlegen entscheidet der Unique-Index.
export async function GET(
  request: Request,
  { params }: { params: Promise<{ tenantId: string }> }
) {
  const { tenantId } = await params
  const invalid = invalidIdResponse(tenantId)
  if (invalid) return invalid

  const supabase = await createServerClient()
  const auth = await requireMaskAccess(supabase, tenantId, MASK_ADRESSEN, "write")
  if (!auth.ok) return auth.response

  const parsed = nextSuffixQuerySchema.safeParse(queryObject(request))
  if (!parsed.success) return validationError(parsed.error)

  const { data, error } = await supabase.rpc("next_address_suffix", {
    p_tenant_id: tenantId,
    p_base: parsed.data.base,
  })
  if (error) return jsonError(500, SERVER_ERROR_MESSAGE)

  const row = ((data ?? []) as SuffixRow[])[0]
  return NextResponse.json({ exists: row?.out_exists ?? false, suffix: row?.out_suffix ?? null })
}
