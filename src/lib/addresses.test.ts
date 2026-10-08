import { describe, expect, it } from "vitest"

import {
  ADDRESS_ROLES,
  EMPTY_ADDRESS_VALUES,
  addressFormSchema,
  addressLabel,
  addressRoleLabel,
  computeAddressNumber,
  rowToAddress,
  toAddressPayload,
} from "./addresses"

const valid = { ...EMPTY_ADDRESS_VALUES, addressBase: "4711", suffix: "0001", name: "Muster GmbH" }

describe("computeAddressNumber", () => {
  it("joins base and Kennziffer with a dot", () => {
    expect(computeAddressNumber("4711", "0001")).toBe("4711.0001")
    expect(computeAddressNumber("1234567890", "0042")).toBe("1234567890.0042")
  })

  it.each([
    ["", "0001"],
    ["47a1", "0001"],
    ["12345678901", "0001"],
    ["4711", ""],
    ["4711", "001"],
    ["4711", "00012"],
    ["4711", "00a1"],
  ])("returns null for base %j and Kennziffer %j", (base, suffix) => {
    expect(computeAddressNumber(base, suffix)).toBeNull()
  })

  it("handles missing base", () => {
    expect(computeAddressNumber(null, "0001")).toBeNull()
  })
})

describe("addressFormSchema", () => {
  it("accepts the minimal address (base, Kennziffer, name)", () => {
    expect(addressFormSchema.safeParse(valid).success).toBe(true)
  })

  it.each([
    ["addressBase", ""],
    ["addressBase", "47x"],
    ["addressBase", "12345678901"],
    ["suffix", ""],
    ["suffix", "123"],
    ["suffix", "12345"],
    ["suffix", "12a4"],
    ["name", ""],
    ["name", "   "],
    ["gln", "123"],
    ["gln", "123456789012a"],
    ["email", "kein-email"],
    ["code", "x".repeat(11)],
    ["postalCode", "x".repeat(11)],
    ["vatId", "x".repeat(16)],
  ])("rejects %s = %j", (field, value) => {
    const result = addressFormSchema.safeParse({ ...valid, [field]: value })
    expect(result.success).toBe(false)
    if (!result.success) expect(result.error.issues[0].path[0]).toBe(field)
  })

  it("accepts a 13-digit GLN and a valid e-mail", () => {
    const result = addressFormSchema.safeParse({ ...valid, gln: "4012345000009", email: "info@muster.de" })
    expect(result.success).toBe(true)
  })

  it("accepts several roles but only the fixed ones", () => {
    expect(addressFormSchema.safeParse({ ...valid, roles: ["customer", "delivery_address"] }).success).toBe(true)
    expect(addressFormSchema.safeParse({ ...valid, roles: ["markeninhaber"] }).success).toBe(false)
  })
})

describe("address roles", () => {
  it("has the six fixed roles with German labels", () => {
    expect(ADDRESS_ROLES.map((r) => r.label)).toEqual([
      "Kunde",
      "Lieferant",
      "Spediteur",
      "Dienstleister",
      "Lieferadresse",
      "Sonstige",
    ])
    expect(addressRoleLabel("carrier")).toBe("Spediteur")
    expect(addressRoleLabel("unknown")).toBe("unknown")
  })
})

describe("toAddressPayload", () => {
  it("turns empty optional fields into null and trims", () => {
    const payload = toAddressPayload({ ...valid, name: "  Muster GmbH ", code: " ", city: " Köln " })
    expect(payload.name).toBe("Muster GmbH")
    expect(payload.code).toBeNull()
    expect(payload.city).toBe("Köln")
    expect(payload.parentAddressId).toBeNull()
    expect(payload.roles).toEqual([])
  })

  it("keeps the links to other addresses", () => {
    const payload = toAddressPayload({ ...valid, parentAddressId: "p1", billingCompanyId: "b1" })
    expect(payload.parentAddressId).toBe("p1")
    expect(payload.billingCompanyId).toBe("b1")
    expect(payload.invoiceRecipientId).toBeNull()
  })
})

describe("rowToAddress", () => {
  it("maps a database row", () => {
    const address = rowToAddress({
      id: "a1",
      address_base: "4711",
      address_suffix: "0001",
      address_number: "4711.0001",
      name: "Muster GmbH",
      code: "MUS",
      roles: ["customer", "bogus"],
      parent_address_id: "p1",
      is_active: false,
      updated_at: "2026-10-08T10:00:00Z",
    })
    expect(address.addressNumber).toBe("4711.0001")
    expect(address.isActive).toBe(false)
    expect(address.values.roles).toEqual(["customer"])
    expect(address.values.parentAddressId).toBe("p1")
    expect(address.values.city).toBe("")
  })

  it("treats a missing is_active as active", () => {
    expect(rowToAddress({ id: "a1" }).isActive).toBe(true)
  })
})

describe("addressLabel", () => {
  it("shows number, name and optional Kürzel", () => {
    expect(addressLabel({ addressNumber: "4711.0001", name: "Muster", code: "MUS" })).toBe(
      "4711.0001 – Muster (MUS)"
    )
    expect(addressLabel({ addressNumber: "4711.0001", name: "Muster", code: null })).toBe(
      "4711.0001 – Muster"
    )
  })
})
