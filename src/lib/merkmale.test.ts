import { describe, expect, it } from "vitest"

import { MASKS, maskKey } from "./masks"
import {
  MERKMALE,
  buildMerkmalSchema,
  getMerkmalConfig,
  merkmalLabel,
  merkmalPayload,
  rowToMerkmalItem,
} from "./merkmale"

describe("MERKMALE registry", () => {
  it("has the 10 Merkmal tables with unique slugs, tables and article keys", () => {
    expect(MERKMALE).toHaveLength(10)
    for (const key of ["slug", "table", "articleKey"] as const) {
      expect(new Set(MERKMALE.map((m) => m[key])).size).toBe(10)
    }
  })

  it("registers one mask per Merkmal table", () => {
    for (const config of MERKMALE) {
      expect(MASKS.map(maskKey)).toContain(maskKey(config.mask))
    }
  })
})

describe("buildMerkmalSchema", () => {
  it("requires code, name and a single commodity digit for Artikeltypen", () => {
    const schema = buildMerkmalSchema(getMerkmalConfig("artikeltypen")!)
    expect(schema.safeParse({ code: "RO", name: "Rohstoff", commodityDigit: "1" }).success).toBe(true)
    expect(schema.safeParse({ code: "", name: "Rohstoff", commodityDigit: "1" }).success).toBe(false)
    expect(schema.safeParse({ code: "RO", name: "Rohstoff", commodityDigit: "10" }).success).toBe(false)
    expect(schema.safeParse({ code: "RO", name: "Rohstoff", commodityDigit: "" }).success).toBe(false)
  })

  it("accepts missing optional weights for Verpackungsgruppen and validates the 4 weight fields", () => {
    const schema = buildMerkmalSchema(getMerkmalConfig("verpackungsgruppen")!)
    const empty = {
      name: "Karton",
      foilSystemWeight: "",
      cardboardSystemWeight: "",
      foilTransportWeight: "",
      cardboardTransportWeight: "",
    }
    expect(schema.safeParse(empty).success).toBe(true)
    expect(
      schema.safeParse({ ...empty, foilSystemWeight: "1,5", cardboardTransportWeight: "20" }).success
    ).toBe(true)
    for (const key of Object.keys(empty).filter((k) => k !== "name")) {
      expect(schema.safeParse({ ...empty, [key]: "x" }).success).toBe(false)
    }
  })

  it("has only the field 'Klasse' for Palettenklassen", () => {
    const config = getMerkmalConfig("palettenklassen")!
    expect(config.fields.map((f) => f.key)).toEqual(["code"])
    expect(config.fields[0].label).toBe("Klasse")
    const schema = buildMerkmalSchema(config)
    expect(schema.safeParse({ code: "A" }).success).toBe(true)
    expect(schema.safeParse({ code: "" }).success).toBe(false)
    expect(merkmalLabel(config, rowToMerkmalItem(config, { id: "p1", code: "A" }))).toBe("A")
  })

  it("labels the Basisartikel code as Kürzel", () => {
    const config = getMerkmalConfig("basisartikel")!
    expect(config.fields.find((f) => f.key === "code")?.label).toBe("Kürzel")
  })
})

describe("merkmalPayload / rowToMerkmalItem / merkmalLabel", () => {
  it("converts form strings to typed API values", () => {
    const config = getMerkmalConfig("mehrwertsteuersaetze")!
    expect(merkmalPayload(config, { ratePercent: "7", name: "Ermäßigt" })).toEqual({
      ratePercent: 7,
      name: "Ermäßigt",
    })
  })

  it("maps database rows and builds labels", () => {
    const season = getMerkmalConfig("saisons")!
    const item = rowToMerkmalItem(season, { id: "s1", code: "SOM", name: "Sommer", commodity_digit: 3 })
    expect(item.isActive).toBe(true)
    expect(item.values.commodityDigit).toBe(3)
    expect(merkmalLabel(season, item)).toBe("SOM – Sommer")

    const vat = getMerkmalConfig("mehrwertsteuersaetze")!
    const vatItem = rowToMerkmalItem(vat, { id: "v1", rate_percent: 19, name: "Regelsatz", is_active: false })
    expect(vatItem.isActive).toBe(false)
    expect(merkmalLabel(vat, vatItem)).toBe("19 % – Regelsatz")
  })
})
