import { NextResponse } from "next/server"
import { z } from "zod"

import {
  SERVER_ERROR_MESSAGE,
  invalidIdResponse,
  jsonError,
  readJson,
  requireCaller,
  validationError,
} from "@/lib/api-auth"
import { LOCK_INACTIVITY_MS } from "@/lib/edit-lock"
import { createClient as createServerClient } from "@/lib/supabase-server"

// Generische Bearbeitungssperre (PROJ-3). Die eigentliche Logik (atomare Vergabe, Ablauf nach
// 15 Minuten, Rechteprüfung je Datensatztyp) liegt in den SQL-Funktionen acquire_edit_lock /
// release_edit_lock; die Routen validieren nur und übersetzen Ergebnisse in HTTP.

const NOUNS: Record<string, string> = { article: "Artikel" }

const lockSchema = z.object({
  resourceType: z.string({ error: "Datensatztyp fehlt." }).trim().min(1, "Datensatztyp fehlt.").max(50),
  resourceId: z.uuid({ error: "Ungültige Datensatz-ID." }),
})

interface AcquireRow {
  out_acquired: boolean
  out_holder_username: string | null
  out_expires_at: string | null
}

// POST /api/tenants/:tenantId/locks — Sperre setzen bzw. die eigene verlängern.
//   200 { expiresAt }   |   409 { error, lockedBy: { username, expiresAt } }
export async function POST(
  request: Request,
  { params }: { params: Promise<{ tenantId: string }> }
) {
  const { tenantId } = await params
  const invalid = invalidIdResponse(tenantId)
  if (invalid) return invalid

  const supabase = await createServerClient()
  const auth = await requireCaller(supabase)
  if (!auth.ok) return auth.response

  const parsed = lockSchema.safeParse(await readJson(request))
  if (!parsed.success) return validationError(parsed.error)
  const { resourceType, resourceId } = parsed.data

  const { data, error } = await supabase.rpc("acquire_edit_lock", {
    p_tenant_id: tenantId,
    p_resource_type: resourceType,
    p_resource_id: resourceId,
  })

  if (error) {
    if (error.code === "42501") return jsonError(403, "Dafür fehlt dir die Berechtigung.")
    if (error.code === "22023") return jsonError(400, "Unbekannter Datensatztyp.")
    return jsonError(500, SERVER_ERROR_MESSAGE)
  }

  const row = ((data ?? []) as AcquireRow[])[0]
  if (!row) return jsonError(500, SERVER_ERROR_MESSAGE)

  if (row.out_acquired) {
    return NextResponse.json({ expiresAt: row.out_expires_at })
  }

  const username = row.out_holder_username ?? "einem anderen Nutzer"
  const noun = NOUNS[resourceType] ?? "Datensatz"
  const minutes = Math.round(LOCK_INACTIVITY_MS / 60000)
  return NextResponse.json(
    {
      error: `Der ${noun} wird gerade von ${username} bearbeitet. Du hast nur Lesezugriff (die Sperre läuft spätestens nach ${minutes} Minuten ohne Aktivität ab).`,
      lockedBy: { username, expiresAt: row.out_expires_at },
    },
    { status: 409 }
  )
}

// DELETE /api/tenants/:tenantId/locks?resourceType=…&resourceId=… — eigene Sperre freigeben
// (idempotent; fremde Sperren bleiben unberührt). 204 ohne Body.
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ tenantId: string }> }
) {
  const { tenantId } = await params
  const invalid = invalidIdResponse(tenantId)
  if (invalid) return invalid

  const supabase = await createServerClient()
  const auth = await requireCaller(supabase)
  if (!auth.ok) return auth.response

  const search = new URL(request.url).searchParams
  const parsed = lockSchema.safeParse({
    resourceType: search.get("resourceType") ?? undefined,
    resourceId: search.get("resourceId") ?? undefined,
  })
  if (!parsed.success) return validationError(parsed.error)

  const { error } = await supabase.rpc("release_edit_lock", {
    p_tenant_id: tenantId,
    p_resource_type: parsed.data.resourceType,
    p_resource_id: parsed.data.resourceId,
  })
  if (error) return jsonError(500, SERVER_ERROR_MESSAGE)

  return new NextResponse(null, { status: 204 })
}
