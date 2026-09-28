import { test, expect } from "@playwright/test"
import { createClient } from "@supabase/supabase-js"

// Standard local Supabase CLI dev credentials — identical on every machine running
// `npx supabase start` locally (fixed JWT_SECRET), not a secret. Never used against a
// real/remote project.
const LOCAL_SUPABASE_URL = "http://127.0.0.1:54321"
const LOCAL_SERVICE_ROLE_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU"

const TEST_USERNAME = "e2e_proj1_test_user"
const TEST_EMAIL = "e2e-proj1@verification.local"
const TEST_PASSWORD = "E2E-Test-Pw9!"

test.describe("PROJ-1: Supabase-Infrastruktur — Login", () => {
  // Serial: beforeAll creates one shared test user via the admin API. Running tests in
  // parallel workers would call createUser() concurrently for the same email and race.
  test.describe.configure({ mode: "serial" })

  let testUserId: string

  test.beforeAll(async () => {
    const admin = createClient(LOCAL_SUPABASE_URL, LOCAL_SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    })

    const { data: tenant } = await admin.from("tenants").select("id").eq("name", "Default").single()

    const { data: created, error } = await admin.auth.admin.createUser({
      email: TEST_EMAIL,
      password: TEST_PASSWORD,
      email_confirm: true,
    })
    if (error) throw error
    testUserId = created.user.id

    await admin
      .from("user_profiles")
      .insert({ id: testUserId, username: TEST_USERNAME, email: TEST_EMAIL, is_super_admin: false })
    await admin.from("user_tenant_access").insert({ user_id: testUserId, tenant_id: tenant!.id })
  })

  test.afterAll(async () => {
    const admin = createClient(LOCAL_SUPABASE_URL, LOCAL_SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    })
    if (testUserId) await admin.auth.admin.deleteUser(testUserId)
  })

  test("AC: unauthenticated access to the home page redirects to /login", async ({ page }) => {
    await page.goto("/")
    await expect(page).toHaveURL(/\/login$/)
  })

  test("AC: login page shows username and password fields", async ({ page }) => {
    await page.goto("/login")
    await expect(page.getByLabel("Benutzername")).toBeVisible()
    await expect(page.getByLabel("Passwort")).toBeVisible()
  })

  test("AC: wrong password shows an error with remaining attempts", async ({ page }) => {
    await page.goto("/login")
    await page.getByLabel("Benutzername").fill(TEST_USERNAME)
    await page.getByLabel("Passwort").fill("definitely-wrong")
    await page.getByRole("button", { name: "Anmelden" }).click()

    await expect(page.getByRole("alert")).toContainText("Noch")
    await expect(page.getByRole("alert")).toContainText("Versuch")
    await expect(page).toHaveURL(/\/login$/)
  })

  test("AC: correct username/password logs in and reaches the protected home page", async ({ page }) => {
    await page.goto("/login")
    await page.getByLabel("Benutzername").fill(TEST_USERNAME)
    await page.getByLabel("Passwort").fill(TEST_PASSWORD)
    await page.getByRole("button", { name: "Anmelden" }).click()

    await expect(page).toHaveURL("/")
    await expect(page.getByText(TEST_USERNAME)).toBeVisible()
  })

  test("AC: logging out returns to the login page and blocks the home page again", async ({ page }) => {
    await page.goto("/login")
    await page.getByLabel("Benutzername").fill(TEST_USERNAME)
    await page.getByLabel("Passwort").fill(TEST_PASSWORD)
    await page.getByRole("button", { name: "Anmelden" }).click()
    await expect(page).toHaveURL("/")

    await page.getByRole("button", { name: "Abmelden" }).click()
    await expect(page).toHaveURL(/\/login$/)

    await page.goto("/")
    await expect(page).toHaveURL(/\/login$/)
  })
})
