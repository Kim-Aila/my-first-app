import { describe, expect, it } from "vitest"

import {
  EMPTY_CONTACT_VALUES,
  contactDisplayName,
  contactFormSchema,
  rowToContact,
  toContactPayload,
} from "./contacts"

const valid = { ...EMPTY_CONTACT_VALUES, lastName: "Meier" }

describe("contactFormSchema", () => {
  it("requires only the last name", () => {
    expect(contactFormSchema.safeParse(valid).success).toBe(true)
    expect(contactFormSchema.safeParse({ ...valid, lastName: "" }).success).toBe(false)
    expect(contactFormSchema.safeParse({ ...valid, lastName: "  " }).success).toBe(false)
  })

  it("validates the e-mail format only when filled", () => {
    expect(contactFormSchema.safeParse({ ...valid, email: "" }).success).toBe(true)
    expect(contactFormSchema.safeParse({ ...valid, email: "a@b.de" }).success).toBe(true)
    expect(contactFormSchema.safeParse({ ...valid, email: "a@" }).success).toBe(false)
  })
})

describe("toContactPayload", () => {
  it("turns empty optional fields into null", () => {
    expect(toContactPayload({ ...valid, firstName: " Anna " })).toEqual({
      salutation: null,
      firstName: "Anna",
      lastName: "Meier",
      functionTitle: null,
      phone: null,
      mobile: null,
      email: null,
      remark: null,
    })
  })
})

describe("rowToContact / contactDisplayName", () => {
  it("maps a row and defaults to active", () => {
    const contact = rowToContact({ id: "c1", address_id: "a1", last_name: "Meier", first_name: "Anna" })
    expect(contact.addressId).toBe("a1")
    expect(contact.isActive).toBe(true)
    expect(contactDisplayName(contact.values)).toBe("Meier, Anna")
  })

  it("shows only the last name when the first name is missing", () => {
    expect(contactDisplayName({ firstName: "", lastName: "Meier" })).toBe("Meier")
  })

  it("marks inactive contacts", () => {
    expect(rowToContact({ id: "c1", is_active: false }).isActive).toBe(false)
  })
})
