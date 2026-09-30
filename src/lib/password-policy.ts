import { z } from "zod"

// Passwortrichtlinie aus PROJ-1 (AC-4) — dieselben Regeln wie in scripts/seed.mjs:
// mindestens 8 Zeichen, Groß- und Kleinbuchstabe, Zahl, Sonderzeichen.
// Wird in PROJ-2 für das Initial-Passwort (Admin legt User an) und für "Passwort ändern"
// verwendet. Die API-Routen müssen dieselbe Prüfung serverseitig wiederholen.
export const PASSWORD_RULES = [
  { test: (pw: string) => pw.length >= 8, message: "mindestens 8 Zeichen" },
  { test: (pw: string) => /[A-Z]/.test(pw), message: "einen Großbuchstaben" },
  { test: (pw: string) => /[a-z]/.test(pw), message: "einen Kleinbuchstaben" },
  { test: (pw: string) => /[0-9]/.test(pw), message: "eine Zahl" },
  { test: (pw: string) => /[^A-Za-z0-9]/.test(pw), message: "ein Sonderzeichen" },
] as const

export const PASSWORD_POLICY_HINT =
  "Mindestens 8 Zeichen, mit Groß- und Kleinbuchstabe, Zahl und Sonderzeichen."

export function getMissingPasswordRules(password: string): string[] {
  return PASSWORD_RULES.filter((rule) => !rule.test(password)).map((rule) => rule.message)
}

export const passwordSchema = z.string().superRefine((value, ctx) => {
  if (value.length === 0) {
    ctx.addIssue({ code: "custom", message: "Bitte gib ein Passwort ein" })
    return
  }
  const missing = getMissingPasswordRules(value)
  if (missing.length > 0) {
    ctx.addIssue({
      code: "custom",
      message: `Das Passwort erfüllt die Richtlinie nicht. Es fehlt: ${missing.join(", ")}.`,
    })
  }
})
