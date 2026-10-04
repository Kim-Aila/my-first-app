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
  it("has the 9 Merkmal tables with unique slugs, tables and article keys", () => {
    expect(MERKMALE).toHaveLength(9)
    for (const key of ["slug", "table", "articleKey"] as const) {
      expect(new Set(MERKMALE.map((m) => m[key])).size).toBe(9)
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

  it("accepts a missing optional weight for Verpackungsgruppen", () => {
    const schema = buildMerkmalSchema(getMerkmalConfig("verpackungsgruppen")!)
    expect(schema.safeParse({ name: "Karton", foilWeight: "" }).success).toBe(true)
    expect(schema.safeParse({ name: "Karton", foilWeight: "x" }).success).toBe(false)
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
