import { describe, expect, it } from "vitest"

import {
  MASKS,
  MASK_ADRESSEN,
  MASK_BENUTZERVERWALTUNG,
  MASK_KONTAKTE,
  MASK_MERKMAL_LAENDER,
  getMaskLabel,
  maskKey,
} from "./masks"

describe("masks registry", () => {
  it("contains the Benutzerverwaltung mask with the DB identifiers used by RLS", () => {
    // has_tenant_admin_access() in the PROJ-2 migration hard-codes 'basis' / 'benutzerverwaltung'
    expect(MASK_BENUTZERVERWALTUNG.module).toBe("basis")
    expect(MASK_BENUTZERVERWALTUNG.maske).toBe("benutzerverwaltung")
    expect(MASKS).toContain(MASK_BENUTZERVERWALTUNG)
  })

  it("has unique keys", () => {
    const keys = MASKS.map(maskKey)
    expect(new Set(keys).size).toBe(keys.length)
  })

  it("builds module:maske keys", () => {
    expect(maskKey({ module: "basis", maske: "benutzerverwaltung" })).toBe("basis:benutzerverwaltung")
  })

  it("returns the label for known masks", () => {
    expect(getMaskLabel({ module: "basis", maske: "benutzerverwaltung" })).toBe("Benutzerverwaltung")
  })

  it("falls back to the raw maske name for unknown masks", () => {
    expect(getMaskLabel({ module: "lager", maske: "bestand" })).toBe("bestand")
  })

  it("does not match a known maske under a different module", () => {
    expect(getMaskLabel({ module: "other", maske: "benutzerverwaltung" })).toBe("benutzerverwaltung")
  })

  it("registers the PROJ-4 masks and drops Markeninhaber", () => {
    const keys = MASKS.map(maskKey)
    expect(keys).toContain("warenwirtschaft:adressen")
    expect(keys).toContain("warenwirtschaft:kontakte")
    expect(keys).toContain("warenwirtschaft:merkmal_laender")
    expect(keys).not.toContain("warenwirtschaft:merkmal_markeninhaber")
    expect(MASKS).toEqual(expect.arrayContaining([MASK_ADRESSEN, MASK_KONTAKTE, MASK_MERKMAL_LAENDER]))
  })

  it("offers the activation right only on masks that support it (currently Adressen)", () => {
    expect(MASKS.filter((m) => m.supportsActivation).map(maskKey)).toEqual([
      "warenwirtschaft:adressen",
    ])
  })
})
