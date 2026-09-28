import { test, expect } from "@playwright/test"
import { TEST_USERNAME, TEST_PASSWORD } from "./fixtures"

// The test user is created once in tests/global-setup.ts (shared across all projects/browsers)
// and removed in tests/global-teardown.ts — not per-file, which would race when multiple
// projects (chromium, Mobile Safari, ...) run in parallel and both try to create it.
test.describe("PROJ-1: Supabase-Infrastruktur — Login", () => {
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
