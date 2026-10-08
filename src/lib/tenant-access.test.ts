import { describe, expect, it } from "vitest"

import { MASK_ADRESSEN, MASK_ARTIKELSTAMM, MASK_MERKMAL_SAISON } from "./masks"
import {
  canToggleActive,
  getAccessLevel,
  maintenanceAccessFor,
  resolveTenant,
  tenantsWithMask,
} from "./tenant-access"

const tenants = [
  { id: "t1", name: "Amstiel" },
  { id: "t2", name: "Zweig" },
]

const user = {
  isSuperAdmin: false,
  tenants,
  maskAccess: { t1: { "warenwirtschaft:artikelstamm": "read" as const }, t2: {} },
}

describe("tenant access helpers", () => {
  it("returns the access level per tenant and mask", () => {
    expect(getAccessLevel(user, "t1", MASK_ARTIKELSTAMM)).toBe("read")
    expect(getAccessLevel(user, "t2", MASK_ARTIKELSTAMM)).toBeNull()
    expect(getAccessLevel(user, "t1", MASK_MERKMAL_SAISON)).toBeNull()
  })

  it("gives super admins write access everywhere", () => {
    const admin = { isSuperAdmin: true, tenants, maskAccess: {} }
    expect(getAccessLevel(admin, "t2", MASK_ARTIKELSTAMM)).toBe("write")
    expect(tenantsWithMask(admin, MASK_ARTIKELSTAMM)).toHaveLength(2)
  })

  it("lists only tenants where the mask is granted", () => {
    expect(tenantsWithMask(user, MASK_ARTIKELSTAMM)).toEqual([tenants[0]])
  })

  it("resolves the requested tenant, else the first one", () => {
    expect(resolveTenant(tenants, "t2")).toEqual(tenants[1])
    expect(resolveTenant(tenants, "unknown")).toEqual(tenants[0])
    expect(resolveTenant([], undefined)).toBeNull()
  })

  it("marks which Merkmal maintenance masks may be opened", () => {
    const access = maintenanceAccessFor(
      { ...user, maskAccess: { t1: { "warenwirtschaft:merkmal_saison": "write" as const } } },
      "t1"
    )
    expect(access.saisons).toBe(true)
    expect(access.formDesign).toBeUndefined()
    expect(access["form-design"]).toBe(false)
  })

  it("includes the Länder maintenance mask", () => {
    const access = maintenanceAccessFor(
      { ...user, maskAccess: { t1: { "warenwirtschaft:merkmal_laender": "read" as const } } },
      "t1"
    )
    expect(access.laender).toBe(true)
  })
})

describe("canToggleActive", () => {
  const withRights = (level: "read" | "write", toggle: boolean | undefined) => ({
    isSuperAdmin: false,
    tenants,
    maskAccess: { t1: { "warenwirtschaft:adressen": level } },
    maskToggle: toggle === undefined ? undefined : { t1: { "warenwirtschaft:adressen": toggle } },
  })

  it("needs write access plus the additional right", () => {
    expect(canToggleActive(withRights("write", true), "t1", MASK_ADRESSEN)).toBe(true)
    expect(canToggleActive(withRights("write", false), "t1", MASK_ADRESSEN)).toBe(false)
    expect(canToggleActive(withRights("write", undefined), "t1", MASK_ADRESSEN)).toBe(false)
  })

  it("is not granted with read access only, even if the flag is set", () => {
    expect(canToggleActive(withRights("read", true), "t1", MASK_ADRESSEN)).toBe(false)
  })

  it("does not carry over to other tenants and always applies to super admins", () => {
    expect(canToggleActive(withRights("write", true), "t2", MASK_ADRESSEN)).toBe(false)
    expect(canToggleActive({ isSuperAdmin: true, tenants, maskAccess: {} }, "t2", MASK_ADRESSEN)).toBe(true)
  })
})
