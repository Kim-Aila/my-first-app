import { NextResponse } from "next/server"

import {
  FORBIDDEN_MESSAGE,
  SERVER_ERROR_MESSAGE,
  invalidIdResponse,
  isUniqueViolation,
  jsonError,
  readJson,
  requireCaller,
  validationError,
} from "@/lib/api-auth"
import { createClient as createServerClient } from "@/lib/supabase-server"

import { TENANT_NAME_TAKEN_MESSAGE, tenantNameSchema } from "../shared"

// PATCH /api/tenants/:tenantId — Mandant umbenennen (nur Super-Admin).
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ tenantId: string }> }
) {
  const { tenantId } = await params
  const invalid = invalidIdResponse(tenantId)
  if (invalid) return invalid

  const supabase = await createServerClient()
  const auth = await requireCaller(supabase)
  if (!auth.ok) return auth.response
  if (!auth.caller.isSuperAdmin) return jsonError(403, FORBIDDEN_MESSAGE)

  const parsed = tenantNameSchema.safeParse(await readJson(request))
  if (!parsed.success) return validationError(parsed.error)
  const { name } = parsed.data

  const { data, error } = await supabase
    .from("tenants")
    .update({ name })
    .eq("id", tenantId)
    .select("id, name")
    .maybeSingle()

  if (error) {
    if (isUniqueViolation(error)) return jsonError(409, TENANT_NAME_TAKEN_MESSAGE, "name")
    return jsonError(500, SERVER_ERROR_MESSAGE)
  }
  if (!data) return jsonError(404, "Mandant nicht gefunden.")

  return NextResponse.json(data)
}
