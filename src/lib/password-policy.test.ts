import { describe, expect, it } from "vitest"

import { PASSWORD_RULES, getMissingPasswordRules, passwordSchema } from "./password-policy"

describe("password-policy (PROJ-1 AC-4 / PROJ-2 AC-5, AC-7)", () => {
  it("accepts a password meeting all rules", () => {
    expect(getMissingPasswordRules("Abcdefg1!")).toEqual([])
    expect(passwordSchema.safeParse("Abcdefg1!").success).toBe(true)
  })

  it.each([
    ["Ab1!xyz", ["mindestens 8 Zeichen"]],
    ["abcdefg1!", ["einen Großbuchstaben"]],
    ["ABCDEFG1!", ["einen Kleinbuchstaben"]],
    ["Abcdefgh!", ["eine Zahl"]],
    ["Abcdefg12", ["ein Sonderzeichen"]],
    ["abcdefgh", ["einen Großbuchstaben", "eine Zahl", "ein Sonderzeichen"]],
  ])("reports missing rules for %s", (pw, missing) => {
    expect(getMissingPasswordRules(pw)).toEqual(missing)
  })

  it("treats exactly 8 characters as long enough (boundary)", () => {
    expect(getMissingPasswordRules("Abcdef1!")).toEqual([])
  })

  it("counts whitespace and umlauts as special characters", () => {
    expect(getMissingPasswordRules("Abcdef1 x")).toEqual([])
    expect(getMissingPasswordRules("Abcdef1ä")).toEqual([])
  })

  it("rejects an empty password with a dedicated message", () => {
    const result = passwordSchema.safeParse("")
    expect(result.success).toBe(false)
    expect(result.error?.issues[0].message).toBe("Bitte gib ein Passwort ein")
  })

  it("lists all missing rules in the schema error message", () => {
    const result = passwordSchema.safeParse("abc")
    expect(result.success).toBe(false)
    expect(result.error?.issues[0].message).toBe(
      "Das Passwort erfüllt die Richtlinie nicht. Es fehlt: mindestens 8 Zeichen, einen Großbuchstaben, eine Zahl, ein Sonderzeichen."
    )
  })

  it("has exactly the five documented rules", () => {
    expect(PASSWORD_RULES).toHaveLength(5)
  })
})
