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

    // Next.js' route announcer also has role="alert" (empty) — only match the app's alert.
    const alert = page.getByRole("alert").filter({ hasText: /\S/ })
    await expect(alert).toContainText("Noch")
    await expect(alert).toContainText("Versuch")
    await expect(page).toHaveURL(/\/login$/)
  })

  test("AC: correct username/password logs in and reaches the protected home page", async ({ page }) => {
    await page.goto("/login")
    await page.getByLabel("Benutzername").fill(TEST_USERNAME)
    await page.getByLabel("Passwort").fill(TEST_PASSWORD)
    await page.getByRole("button", { name: "Anmelden" }).click()

    await expect(page).toHaveURL("/")
    // The username also appears in the sidebar user menu — assert on the page content only.
    await expect(page.getByRole("main").getByText(TEST_USERNAME)).toBeVisible()
  })

  test("AC: logging out returns to the login page and blocks the home page again", async ({ page }) => {
    await page.goto("/login")
    await page.getByLabel("Benutzername").fill(TEST_USERNAME)
    await page.getByLabel("Passwort").fill(TEST_PASSWORD)
    await page.getByRole("button", { name: "Anmelden" }).click()
    await expect(page).toHaveURL("/")

    // Logout lives in the sidebar user menu; on mobile the sidebar is an off-canvas sheet.
    // Retried because clicks right after navigation can land before React has hydrated.
    const userMenu = page.getByRole("button", { name: /^Benutzermenü/ })
    const logoutItem = page.getByRole("menuitem", { name: "Abmelden" })
    if (!(await userMenu.isVisible())) {
      // Mobile: open the navigation sheet (a dialog) first.
      const sheet = page.getByRole("dialog")
      await expect(async () => {
        if (!(await sheet.isVisible())) {
          await page.getByRole("button", { name: "Navigation ein-/ausblenden" }).click()
        }
        await expect(userMenu).toBeVisible({ timeout: 3_000 })
      }).toPass({ timeout: 15_000 })
    }
    await expect(async () => {
      if (!(await logoutItem.isVisible())) await userMenu.click()
      await expect(logoutItem).toBeVisible({ timeout: 3_000 })
    }).toPass({ timeout: 15_000 })
    await logoutItem.click()
    await expect(page).toHaveURL(/\/login$/)

    await page.goto("/")
    await expect(page).toHaveURL(/\/login$/)
  })
})
