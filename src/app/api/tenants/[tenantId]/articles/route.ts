import { NextResponse } from "next/server"

import {
  invalidIdResponse,
  readJson,
  requireMaskAccess,
  validationError,
} from "@/lib/api-auth"
import { MASK_ARTIKELSTAMM } from "@/lib/masks"
import { createClient as createServerClient } from "@/lib/supabase-server"

import {
  ARTICLE_NUMBER_TAKEN_MESSAGE,
  articleRow,
  articleSchema,
  dbErrorResponse,
} from "../../warenwirtschaft-shared"

// POST /api/tenants/:tenantId/articles — Artikel anlegen.
// Schreibrecht auf die Maske Artikelstamm; Artikelnummer, Matchcode, Warengruppe und Bruttogewicht berechnet
// der Datenbank-Trigger. Session-Client → RLS greift als zweite Ebene.
export async function POST(
  request: Request,
  { params }: { params: Promise<{ tenantId: string }> }
) {
  const { tenantId } = await params
  const invalid = invalidIdResponse(tenantId)
  if (invalid) return invalid

  const supabase = await createServerClient()
  const auth = await requireMaskAccess(supabase, tenantId, MASK_ARTIKELSTAMM, "write")
  if (!auth.ok) return auth.response

  const parsed = articleSchema.safeParse(await readJson(request))
  if (!parsed.success) return validationError(parsed.error)

  const { data, error } = await supabase
    .from("articles")
    .insert({ tenant_id: tenantId, ...articleRow(parsed.data) })
    .select("id, article_number, match_code")
    .single()

  if (error || !data) {
    return dbErrorResponse(error ?? {}, {
      message: ARTICLE_NUMBER_TAKEN_MESSAGE,
      field: "kennziffer",
    })
  }

  return NextResponse.json(
    { id: data.id, articleNumber: data.article_number, matchCode: data.match_code },
    { status: 201 }
  )
}
