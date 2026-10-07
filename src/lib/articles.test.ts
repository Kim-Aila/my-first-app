import { describe, expect, it } from "vitest"

import {
  EMPTY_ARTICLE_VALUES,
  articleFormSchema,
  computeArticleNumber,
  computeCommodityGroup,
  computeGrossWeight,
  computeMatchCode,
  rowToArticle,
  suggestArticleName,
  toArticlePayload,
} from "./articles"

describe("computeArticleNumber", () => {
  it("joins base article number, a dot and the 4-digit kennziffer", () => {
    expect(computeArticleNumber("12345", "0001")).toBe("12345.0001")
    expect(computeArticleNumber("1", "0042")).toBe("1.0042")
    expect(computeArticleNumber("1234567890", "0042")).toBe("1234567890.0042")
  })

  it("is null while a part is missing or the kennziffer is not 4 digits", () => {
    expect(computeArticleNumber("", "0042")).toBeNull()
    expect(computeArticleNumber(null, "0042")).toBeNull()
    expect(computeArticleNumber("1200", "42")).toBeNull()
    expect(computeArticleNumber("1200", "00a2")).toBeNull()
  })

  it("is null for a base article number that is not 1 to 10 digits", () => {
    expect(computeArticleNumber("12a", "0042")).toBeNull()
    expect(computeArticleNumber("12345678901", "0042")).toBeNull()
  })
})

describe("computeMatchCode", () => {
  it("joins the Kürzel with a hyphen in the given order", () => {
    expect(computeMatchCode(["FW", "BO", "SOM", "1200", "HAS", "100", "VM"])).toBe(
      "FW-BO-SOM-1200-HAS-100-VM"
    )
  })

  it("skips missing Merkmale", () => {
    expect(computeMatchCode(["FW", null, "SOM", undefined, "", "  ", "VM"])).toBe("FW-SOM-VM")
    expect(computeMatchCode([])).toBe("")
  })
})

describe("suggestArticleName", () => {
  it("joins the names with spaces and skips missing ones", () => {
    expect(suggestArticleName(["Tafelschokolade", "Hase", "100 g", "Vollmilch"])).toBe(
      "Tafelschokolade Hase 100 g Vollmilch"
    )
    expect(suggestArticleName(["Tafelschokolade", null, " ", "Vollmilch"])).toBe(
      "Tafelschokolade Vollmilch"
    )
    expect(suggestArticleName([])).toBe("")
  })

  it("never exceeds the 200 character limit of the article name", () => {
    expect(suggestArticleName(["x".repeat(150), "y".repeat(150)])).toHaveLength(200)
  })
})

describe("computeCommodityGroup", () => {
  it("is season digit + type digit + placeholder 0", () => {
    expect(computeCommodityGroup(3, 4)).toBe("340")
  })

  it("uses 0 for missing digits", () => {
    expect(computeCommodityGroup(null, 4)).toBe("040")
    expect(computeCommodityGroup(3, undefined)).toBe("300")
    expect(computeCommodityGroup(null, null)).toBe("000")
  })
})

describe("computeGrossWeight", () => {
  it("adds weight and tara, accepting comma decimals", () => {
    expect(computeGrossWeight("100,5", "10")).toBe(110.5)
  })

  it("treats a single value as the sum", () => {
    expect(computeGrossWeight("100", "")).toBe(100)
    expect(computeGrossWeight("", "5")).toBe(5)
  })

  it("is null without values or with invalid input", () => {
    expect(computeGrossWeight("", "")).toBeNull()
    expect(computeGrossWeight("abc", "5")).toBeNull()
  })
})

describe("articleFormSchema", () => {
  const valid = { ...EMPTY_ARTICLE_VALUES, baseArticleNumber: "12345", kennziffer: "0001" }

  it("accepts only base article number and kennziffer as required fields", () => {
    expect(articleFormSchema.safeParse(valid).success).toBe(true)
  })

  it("rejects a kennziffer that is not exactly 4 digits", () => {
    for (const kennziffer of ["", "123", "12345", "12a4"]) {
      const result = articleFormSchema.safeParse({ ...valid, kennziffer })
      expect(result.success).toBe(false)
    }
  })

  it("requires a base article number of 1 to 10 digits", () => {
    for (const baseArticleNumber of ["", "12a", "12.3", "12345678901"]) {
      expect(articleFormSchema.safeParse({ ...valid, baseArticleNumber }).success).toBe(false)
    }
    expect(articleFormSchema.safeParse({ ...valid, baseArticleNumber: "1234567890" }).success).toBe(true)
  })

  it("does not require the Basisartikel or Palettenklasse reference", () => {
    expect(articleFormSchema.safeParse({ ...valid, baseArticleId: "", palletClassId: "" }).success).toBe(true)
  })

  it("validates numeric fields", () => {
    expect(articleFormSchema.safeParse({ ...valid, weight: "12,5" }).success).toBe(true)
    expect(articleFormSchema.safeParse({ ...valid, weight: "zwölf" }).success).toBe(false)
    expect(articleFormSchema.safeParse({ ...valid, cartonContent: "1,5" }).success).toBe(false)
    expect(articleFormSchema.safeParse({ ...valid, gtinMain: "40123abc" }).success).toBe(false)
  })
})

describe("toArticlePayload", () => {
  it("converts empty strings to null and decimals to numbers", () => {
    const payload = toArticlePayload({
      ...EMPTY_ARTICLE_VALUES,
      baseArticleNumber: "12345",
      kennziffer: "0001",
      weight: "12,5",
      cartonContent: "24",
    })
    expect(payload.baseArticleNumber).toBe("12345")
    expect(payload.baseArticleId).toBeNull()
    expect(payload.palletClassId).toBeNull()
    expect(payload.name).toBeNull()
    expect(payload.articleTypeId).toBeNull()
    expect(payload.weight).toBe(12.5)
    expect(payload.height).toBeNull()
    expect(payload.cartonContent).toBe(24)
  })

  it("drops the mixed count when the article is not a Mischartikel", () => {
    const base = { ...EMPTY_ARTICLE_VALUES, baseArticleNumber: "12345", kennziffer: "0001", mixedCount: "3" }
    expect(toArticlePayload({ ...base, isMixed: false }).mixedCount).toBeNull()
    expect(toArticlePayload({ ...base, isMixed: true }).mixedCount).toBe(3)
  })
})

describe("rowToArticle", () => {
  it("maps database columns and formats numbers for the form", () => {
    const article = rowToArticle({
      id: "a1",
      article_number: "12345.0042",
      match_code: "FW-SOM-1200",
      commodity_group: "340",
      kennziffer: "0042",
      base_article_number: "12345",
      base_article_id: "b1",
      pallet_class_id: "p1",
      weight: 12.5,
      is_active: false,
      fairtrade: true,
    })
    expect(article.articleNumber).toBe("12345.0042")
    expect(article.matchCode).toBe("FW-SOM-1200")
    expect(article.values.baseArticleNumber).toBe("12345")
    expect(article.values.palletClassId).toBe("p1")
    expect(article.isActive).toBe(false)
    expect(article.values.weight).toBe("12,5")
    expect(article.values.fairtrade).toBe(true)
    expect(article.values.name).toBe("")
  })
})
