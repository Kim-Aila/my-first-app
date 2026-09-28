// Idempotent seed: creates the default tenant + the first super-admin account.
// Usage: node --env-file=.env.local scripts/seed.mjs
import { createClient } from "@supabase/supabase-js"

const required = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
  "SEED_ADMIN_USERNAME",
  "SEED_ADMIN_EMAIL",
  "SEED_ADMIN_PASSWORD",
]

const missing = required.filter((key) => !process.env[key])
if (missing.length > 0) {
  console.error(
    `Seed abgebrochen: folgende Umgebungsvariablen fehlen: ${missing.join(", ")}`
  )
  process.exit(1)
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
const adminUsername = process.env.SEED_ADMIN_USERNAME
const adminEmail = process.env.SEED_ADMIN_EMAIL
const adminPassword = process.env.SEED_ADMIN_PASSWORD

// Password policy (spec AC-4): min. 8 characters, upper + lower + digit + special character.
const passwordRules = [
  { test: (pw) => pw.length >= 8, message: "mindestens 8 Zeichen" },
  { test: (pw) => /[A-Z]/.test(pw), message: "einen Großbuchstaben" },
  { test: (pw) => /[a-z]/.test(pw), message: "einen Kleinbuchstaben" },
  { test: (pw) => /[0-9]/.test(pw), message: "eine Zahl" },
  { test: (pw) => /[^A-Za-z0-9]/.test(pw), message: "ein Sonderzeichen" },
]
const failedRules = passwordRules.filter((rule) => !rule.test(adminPassword))
if (failedRules.length > 0) {
  console.error(
    `Seed abgebrochen: SEED_ADMIN_PASSWORD erfüllt die Passwortrichtlinie nicht. Es fehlt: ${failedRules
      .map((r) => r.message)
      .join(", ")}.`
  )
  process.exit(1)
}
const tenantName = process.env.SEED_TENANT_NAME || "Default"

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
})

async function main() {
  let { data: tenant, error: tenantSelectError } = await supabase
    .from("tenants")
    .select("id")
    .eq("name", tenantName)
    .maybeSingle()

  if (tenantSelectError) {
    throw new Error(`Fehler beim Prüfen des Mandanten: ${tenantSelectError.message}`)
  }

  if (tenant) {
    console.log(`Mandant "${tenantName}" existiert bereits (${tenant.id}), überspringe.`)
  } else {
    const { data: createdTenant, error: tenantInsertError } = await supabase
      .from("tenants")
      .insert({ name: tenantName })
      .select("id")
      .single()

    if (tenantInsertError) {
      throw new Error(`Fehler beim Anlegen des Mandanten: ${tenantInsertError.message}`)
    }
    tenant = createdTenant
    console.log(`Mandant "${tenantName}" angelegt (${tenant.id}).`)
  }

  const { data: existingProfile, error: profileSelectError } = await supabase
    .from("user_profiles")
    .select("id")
    .eq("username", adminUsername)
    .maybeSingle()

  if (profileSelectError) {
    throw new Error(`Fehler beim Prüfen des Admin-Accounts: ${profileSelectError.message}`)
  }

  if (existingProfile) {
    console.log(`Super-Admin "${adminUsername}" existiert bereits, überspringe.`)
    console.log("Seed abgeschlossen (keine Änderungen nötig).")
    return
  }

  const { data: createdUser, error: createUserError } = await supabase.auth.admin.createUser({
    email: adminEmail,
    password: adminPassword,
    email_confirm: true,
  })

  if (createUserError) {
    throw new Error(`Fehler beim Anlegen des Auth-Accounts: ${createUserError.message}`)
  }

  const userId = createdUser.user.id

  const { error: profileInsertError } = await supabase.from("user_profiles").insert({
    id: userId,
    username: adminUsername,
    email: adminEmail,
    is_super_admin: true,
  })

  if (profileInsertError) {
    throw new Error(`Fehler beim Anlegen des Profils: ${profileInsertError.message}`)
  }

  const { error: accessInsertError } = await supabase.from("user_tenant_access").insert({
    user_id: userId,
    tenant_id: tenant.id,
  })

  if (accessInsertError) {
    throw new Error(`Fehler beim Verknüpfen von Admin und Mandant: ${accessInsertError.message}`)
  }

  console.log(`Super-Admin "${adminUsername}" angelegt und mit Mandant "${tenantName}" verknüpft.`)
  console.log("Seed abgeschlossen.")
}

main().catch((error) => {
  console.error(error.message)
  process.exit(1)
})
