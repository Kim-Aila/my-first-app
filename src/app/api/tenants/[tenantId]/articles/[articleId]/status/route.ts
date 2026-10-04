import { NextResponse } from "next/server"

import {
  invalidIdResponse,
  jsonError,
  readJson,
  requireMaskAccess,
  validationError,
} from "@/lib/api-auth"
import { MASK_ARTIKELSTAMM } from "@/lib/masks"
import { createClient as createServerClient } from "@/lib/supabase-server"

import {
  ARTICLE_NOT_FOUND_MESSAGE,
  ARTICLE_NUMBER_TAKEN_MESSAGE,
  articleStatusSchema,
  dbErrorResponse,
} from "../../../../warenwirtschaft-shared"

// PATCH /api/tenants/:tenantId/articles/:articleId/status — Aktivieren/Deaktivieren.
// Es gibt bewusst keine Löschroute. Ist der Artikel gerade von jemand anderem gesperrt, lehnt der
// Datenbank-Trigger mit 409 ab (Meldung nennt den Nutzer).
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ tenantId: string; articleId: string }> }
) {
  const { tenantId, articleId } = await params
  const invalid = invalidIdResponse(tenantId, articleId)
  if (invalid) return invalid

  const supabase = await createServerClient()
  const auth = await requireMaskAccess(supabase, tenantId, MASK_ARTIKELSTAMM, "write")
  if (!auth.ok) return auth.response

  const parsed = articleStatusSchema.safeParse(await readJson(request))
  if (!parsed.success) return validationError(parsed.error)

  const { data, error } = await supabase
    .from("articles")
    .update({ is_active: parsed.data.isActive })
    .eq("id", articleId)
    .eq("tenant_id", tenantId)
    .select("id, is_active")
    .maybeSingle()

  if (error) return dbErrorResponse(error, { message: ARTICLE_NUMBER_TAKEN_MESSAGE })
  if (!data) return jsonError(404, ARTICLE_NOT_FOUND_MESSAGE)

  return NextResponse.json({ id: data.id, isActive: data.is_active })
}
