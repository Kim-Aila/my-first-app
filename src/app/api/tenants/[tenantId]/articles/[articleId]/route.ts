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
import { ARTICLE_LOCK_RESOURCE } from "@/lib/articles"

import {
  ARTICLE_NOT_FOUND_MESSAGE,
  ARTICLE_NUMBER_TAKEN_MESSAGE,
  articleRow,
  articleSchema,
  dbErrorResponse,
} from "../../../warenwirtschaft-shared"

// PATCH /api/tenants/:tenantId/articles/:articleId — Artikel speichern (vollständiger Datensatz).
// Der Datenbank-Trigger verlangt dafür die eigene, gültige Bearbeitungssperre (sonst 409 mit
// Meldung, die den sperrenden Nutzer nennt). Nach dem Speichern wird die Sperre freigegeben.
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

  const parsed = articleSchema.safeParse(await readJson(request))
  if (!parsed.success) return validationError(parsed.error)

  const { data, error } = await supabase
    .from("articles")
    .update(articleRow(parsed.data))
    .eq("id", articleId)
    .eq("tenant_id", tenantId)
    .select("id, article_number, match_code")
    .maybeSingle()

  if (error) {
    return dbErrorResponse(error, { message: ARTICLE_NUMBER_TAKEN_MESSAGE, field: "kennziffer" })
  }
  if (!data) return jsonError(404, ARTICLE_NOT_FOUND_MESSAGE)

  // Best effort: ein Fehler beim Freigeben ist unkritisch, die Sperre läuft nach 15 Min. ab.
  await supabase.rpc("release_edit_lock", {
    p_tenant_id: tenantId,
    p_resource_type: ARTICLE_LOCK_RESOURCE,
    p_resource_id: articleId,
  })

  return NextResponse.json({
    id: data.id,
    articleNumber: data.article_number,
    matchCode: data.match_code,
  })
}
