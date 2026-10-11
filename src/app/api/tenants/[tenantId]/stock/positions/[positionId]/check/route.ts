import { invalidIdResponse, readJson, requireMaskAccess, validationError } from "@/lib/api-auth"
import { MASK_LAGERBESTAND } from "@/lib/masks"
import { createClient as createServerClient } from "@/lib/supabase-server"

import { dbErrorResponse } from "../../../../../warenwirtschaft-shared"
import { checkPositionSchema, positionActionResponse } from "../../../../../stock-shared"

// POST /api/tenants/:tenantId/stock/positions/:positionId/check — "Fehlt, ungeprüft" → "Fehlt,
// geprüft i.O." mit optionaler Bemerkung. Hat sich der Status inzwischen geändert → 409.
export async function POST(
  request: Request,
  { params }: { params: Promise<{ tenantId: string; positionId: string }> }
) {
  const { tenantId, positionId } = await params
  const invalid = invalidIdResponse(tenantId, positionId)
  if (invalid) return invalid

  const supabase = await createServerClient()
  const auth = await requireMaskAccess(supabase, tenantId, MASK_LAGERBESTAND, "write")
  if (!auth.ok) return auth.response

  const parsed = checkPositionSchema.safeParse(await readJson(request))
  if (!parsed.success) return validationError(parsed.error)

  const { data, error } = await supabase.rpc("stock_check_position", {
    p_tenant_id: tenantId,
    p_position_id: positionId,
    p_expected_status: parsed.data.expectedStatus,
    p_remark: parsed.data.remark,
  })
  if (error) return dbErrorResponse(error, { message: "Ungültige Eingabe." })

  return positionActionResponse(data, positionId, "missing_checked")
}
