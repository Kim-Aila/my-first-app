import { NextResponse } from "next/server"
import { z } from "zod"

import {
  GOTRUE_WEAK_PASSWORD_MESSAGE,
  SERVER_ERROR_MESSAGE,
  invalidIdResponse,
  isUniqueViolation,
  isWeakPasswordError,
  jsonError,
  readJson,
  requireTenantAdmin,
  rolesBelongToTenant,
  validationError,
} from "@/lib/api-auth"
import { passwordSchema } from "@/lib/password-policy"
import { createAdminClient } from "@/lib/supabase-admin"
import { createClient as createServerClient } from "@/lib/supabase-server"

import { FOREIGN_ROLE_MESSAGE } from "../../shared"

export const USERNAME_TAKEN_MESSAGE = "Dieser Benutzername ist bereits vergeben."
export const EMAIL_TAKEN_MESSAGE = "Diese E-Mail-Adresse ist bereits registriert."

const createUserSchema = z.object({
  username: z
    .string({ error: "Bitte gib einen Benutzernamen ein" })
    .trim()
    .min(1, "Bitte gib einen Benutzernamen ein")
    .max(100, "Der Benutzername darf höchstens 100 Zeichen lang sein"),
  email: z
    .string({ error: "Bitte gib eine E-Mail-Adresse ein" })
    .trim()
    .pipe(z.email("Bitte gib eine gültige E-Mail-Adresse ein")),
  password: passwordSchema,
  roleIds: z.array(z.uuid(FOREIGN_ROLE_MESSAGE)).max(100).default([]),
})

function isEmailTaken(error: { message?: string; code?: string; status?: number }) {
  return (
    error.code === "email_exists" ||
    error.code === "user_already_exists" ||
    /already (been )?registered|already exists/i.test(error.message ?? "")
  )
}

// POST /api/tenants/:tenantId/users — neuen User anlegen und diesem Mandanten zuordnen.
// Super-Admin ODER Mandanten-Admin dieses Mandanten.
//
// Schreibzugriffe laufen bewusst über den Service-Role-Client: `auth.admin.createUser()` gibt es
// nur mit Service-Role-Key, und für `user_tenant_access` existiert absichtlich keine
// Insert-Policy für Mandanten-Admins (sie dürfen nie bestehende fremde User anhängen — dieser
// Endpunkt legt immer einen *neuen* Auth-User an). Die Berechtigung wird vorher über den
// Session-Client des Callers geprüft.
export async function POST(
  request: Request,
  { params }: { params: Promise<{ tenantId: string }> }
) {
  const { tenantId } = await params
  const invalid = invalidIdResponse(tenantId)
  if (invalid) return invalid

  const supabase = await createServerClient()
  const auth = await requireTenantAdmin(supabase, tenantId)
  if (!auth.ok) return auth.response

  const parsed = createUserSchema.safeParse(await readJson(request))
  if (!parsed.success) return validationError(parsed.error)
  const { username, email, password } = parsed.data
  const roleIds = [...new Set(parsed.data.roleIds)]

  const { data: tenant, error: tenantError } = await supabase
    .from("tenants")
    .select("id")
    .eq("id", tenantId)
    .maybeSingle()
  if (tenantError) return jsonError(500, SERVER_ERROR_MESSAGE)
  if (!tenant) return jsonError(404, "Mandant nicht gefunden.")

  const rolesCheck = await rolesBelongToTenant(supabase, tenantId, roleIds)
  if (!rolesCheck.ok) {
    return rolesCheck.dbError
      ? jsonError(500, SERVER_ERROR_MESSAGE)
      : jsonError(400, FOREIGN_ROLE_MESSAGE, "roleIds")
  }

  const admin = createAdminClient()

  const { data: existing, error: existingError } = await admin
    .from("user_profiles")
    .select("id")
    .eq("username", username)
    .maybeSingle()
  if (existingError) return jsonError(500, SERVER_ERROR_MESSAGE)
  if (existing) return jsonError(409, USERNAME_TAKEN_MESSAGE, "username")

  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  })
  if (createError || !created?.user) {
    if (createError && isEmailTaken(createError)) {
      return jsonError(409, EMAIL_TAKEN_MESSAGE, "email")
    }
    if (isWeakPasswordError(createError)) {
      return jsonError(400, GOTRUE_WEAK_PASSWORD_MESSAGE, "password")
    }
    return jsonError(500, SERVER_ERROR_MESSAGE)
  }

  const newUserId = created.user.id
  // Rollback: Auth-User löschen — `user_profiles`/`user_tenant_access`/`user_roles` hängen per
  // ON DELETE CASCADE daran, es bleibt also nichts teilweise gespeichert.
  const rollback = async () => {
    await admin.auth.admin.deleteUser(newUserId)
  }

  const { error: profileError } = await admin.from("user_profiles").insert({
    id: newUserId,
    username,
    email: created.user.email ?? email,
    is_super_admin: false,
    is_active: true,
  })
  if (profileError) {
    await rollback()
    return isUniqueViolation(profileError)
      ? jsonError(409, USERNAME_TAKEN_MESSAGE, "username")
      : jsonError(500, SERVER_ERROR_MESSAGE)
  }

  const { error: accessError } = await admin
    .from("user_tenant_access")
    .insert({ user_id: newUserId, tenant_id: tenantId })
  if (accessError) {
    await rollback()
    return jsonError(500, SERVER_ERROR_MESSAGE)
  }

  if (roleIds.length > 0) {
    const { error: rolesError } = await admin
      .from("user_roles")
      .insert(roleIds.map((roleId) => ({ user_id: newUserId, tenant_id: tenantId, role_id: roleId })))
    if (rolesError) {
      await rollback()
      return jsonError(500, SERVER_ERROR_MESSAGE)
    }
  }

  return NextResponse.json({ id: newUserId, username, email, roleIds }, { status: 201 })
}
