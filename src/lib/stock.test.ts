import { describe, expect, it } from "vitest"

import {
  formatQuantity,
  isStockStatus,
  isStockTab,
  rowToArticleStock,
  rowToImportLog,
  rowToPosition,
  stockStatusMeta,
  wipesStock,
  type ImportOutcome,
} from "./stock"

const emptyOutcome: ImportOutcome = {
  fileName: "bestand.csv",
  recordCount: 0,
  counts: { new: 0, changed: 0, unchanged: 0, missing: 0, reappeared: 0 },
  skippedCount: 0,
  skipped: [],
  errors: [],
  unknownArticles: [],
}

describe("stock helpers", () => {
  it("knows the four statuses and labels them", () => {
    expect(isStockStatus("in_stock")).toBe(true)
    expect(isStockStatus("gone")).toBe(false)
    expect(stockStatusMeta("missing_unchecked").label).toBe("Fehlt, ungeprüft")
    expect(stockStatusMeta("shipped").label).toBe("Versendet")
  })

  it("validates tab ids", () => {
    expect(isStockTab("import")).toBe(true)
    expect(isStockTab("x")).toBe(false)
    expect(isStockTab(undefined)).toBe(false)
  })

  it("formats quantities in German notation", () => {
    expect(formatQuantity(1234.5)).toBe("1.234,5")
    expect(formatQuantity(48)).toBe("48")
    expect(formatQuantity(null)).toBe("0")
  })

  it("flags an empty file only when it would wipe existing stock", () => {
    expect(wipesStock(emptyOutcome)).toBe(false)
    expect(wipesStock({ ...emptyOutcome, counts: { ...emptyOutcome.counts, missing: 12 } })).toBe(true)
    expect(
      wipesStock({ ...emptyOutcome, recordCount: 5, counts: { ...emptyOutcome.counts, missing: 12 } })
    ).toBe(false)
  })

  it("maps article stock rows and marks unknown articles", () => {
    const row = rowToArticleStock({
      article_number: "41100.0451",
      article_id: null,
      article_name: null,
      stock: "48.0",
      qs_blocked: 2,
      blocked: 1,
      blocked_total: 3,
      available: 45,
    })
    expect(row.articleId).toBeNull()
    expect(row.stock).toBe(48)
    expect(row.blockedTotal).toBe(3)
  })

  it("maps positions with safe defaults", () => {
    const row = rowToPosition({ id: "1", sscc: "00123", article_number: "1.0001", status: "kaputt" })
    expect(row.status).toBe("in_stock")
    expect(row.isMixedPallet).toBe(false)
    expect(row.quantity).toBe(0)
  })

  it("maps import log rows", () => {
    const row = rowToImportLog({
      id: "i1",
      file_name: "a.csv",
      created_at: "2026-10-11T08:00:00Z",
      new_count: 3,
      error_count: 1,
    })
    expect(row.counts.new).toBe(3)
    expect(row.errorCount).toBe(1)
    expect(row.userName).toBeNull()
  })
})
