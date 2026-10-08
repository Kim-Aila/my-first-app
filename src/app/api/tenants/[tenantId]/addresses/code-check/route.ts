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

import {
  codeCheckQuerySchema,
  optionFromRow,
  queryObject,
  type OptionRow,
} from "../../../adressen-shared"

// GET /api/tenants/:tenantId/addresses/code-check?code=MUS&excludeId=<id> — alle Adressen mit
// diesem Kürzel (auch inaktive). Nur ein Hinweis: Kürzel sind nicht eindeutig erzwungen.
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

  const parsed = codeCheckQuerySchema.safeParse(queryObject(request))
  if (!parsed.success) return validationError(parsed.error)

  const { data, error } = await supabase.rpc("address_code_matches", {
    p_tenant_id: tenantId,
    p_code: parsed.data.code,
    p_exclude_id: parsed.data.excludeId ?? null,
  })
  if (error) return jsonError(500, SERVER_ERROR_MESSAGE)

  return NextResponse.json({ items: ((data ?? []) as OptionRow[]).map(optionFromRow) })
}
