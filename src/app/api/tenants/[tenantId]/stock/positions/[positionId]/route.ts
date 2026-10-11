import { NextResponse } from "next/server"

import { SERVER_ERROR_MESSAGE, invalidIdResponse, jsonError, requireMaskAccess } from "@/lib/api-auth"
import { MASK_LAGERBESTAND } from "@/lib/masks"
import { POSITION_DETAIL_COLUMNS, rowToPositionDetail } from "@/lib/stock"
import { createClient as createServerClient } from "@/lib/supabase-server"

import { STOCK_POSITION_NOT_FOUND_MESSAGE } from "../../../../stock-shared"

const IMPORT_HISTORY_LIMIT = 50

// GET /api/tenants/:tenantId/stock/positions/:positionId — Position mit Prüf-/Versandinformation
// und den Importen, in denen sie vorkam (neueste zuerst).
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ tenantId: string; positionId: string }> }
) {
  const { tenantId, positionId } = await params
  const invalid = invalidIdResponse(tenantId, positionId)
  if (invalid) return invalid

  const supabase = await createServerClient()
  const auth = await requireMaskAccess(supabase, tenantId, MASK_LAGERBESTAND, "read")
  if (!auth.ok) return auth.response

  const [positionResult, historyResult] = await Promise.all([
    supabase
      .from("stock_position_list")
      .select(POSITION_DETAIL_COLUMNS)
      .eq("tenant_id", tenantId)
      .eq("id", positionId)
      .maybeSingle(),
    supabase
      .from("stock_import_positions")
      .select("created_at, stock_imports(id, file_name, user_name, created_at)")
      .eq("tenant_id", tenantId)
      .eq("position_id", positionId)
      .order("created_at", { ascending: false })
      .limit(IMPORT_HISTORY_LIMIT),
  ])

  if (positionResult.error || historyResult.error) return jsonError(500, SERVER_ERROR_MESSAGE)
  if (!positionResult.data) return jsonError(404, STOCK_POSITION_NOT_FOUND_MESSAGE)

  type ImportEmbed = { id: string; file_name: string; user_name: string | null; created_at: string }
  const imports = ((historyResult.data ?? []) as unknown as { stock_imports: ImportEmbed | ImportEmbed[] | null }[])
    .map((row) => (Array.isArray(row.stock_imports) ? row.stock_imports[0] : row.stock_imports))
    .filter((row): row is ImportEmbed => Boolean(row))
    .map((row) => ({ id: row.id, fileName: row.file_name, userName: row.user_name, createdAt: row.created_at }))

  return NextResponse.json(
    rowToPositionDetail(positionResult.data as unknown as Record<string, unknown>, imports)
  )
}
