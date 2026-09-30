import { NextResponse } from "next/server"

import {
  FORBIDDEN_MESSAGE,
  SERVER_ERROR_MESSAGE,
  isUniqueViolation,
  jsonError,
  readJson,
  requireCaller,
  validationError,
} from "@/lib/api-auth"
import { createClient as createServerClient } from "@/lib/supabase-server"

import { TENANT_NAME_TAKEN_MESSAGE, tenantNameSchema } from "./shared"

// POST /api/tenants — Mandant anlegen (nur Super-Admin).
export async function POST(request: Request) {
  const supabase = await createServerClient()
  const auth = await requireCaller(supabase)
  if (!auth.ok) return auth.response
  if (!auth.caller.isSuperAdmin) return jsonError(403, FORBIDDEN_MESSAGE)

  const parsed = tenantNameSchema.safeParse(await readJson(request))
  if (!parsed.success) return validationError(parsed.error)
  const { name } = parsed.data

  // Session-Client: die PROJ-1-Policy "Only super-admins manage tenants (insert)" erlaubt das.
  const { data, error } = await supabase
    .from("tenants")
    .insert({ name })
    .select("id, name")
    .single()

  if (error) {
    if (isUniqueViolation(error)) return jsonError(409, TENANT_NAME_TAKEN_MESSAGE, "name")
    return jsonError(500, SERVER_ERROR_MESSAGE)
  }

  return NextResponse.json(data, { status: 201 })
}
