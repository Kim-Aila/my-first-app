import { describe, it, expect } from "vitest"

import {
  SKIP_REASONS,
  decodeStockFile,
  normalizeArticleNumber,
  parseQuantity,
  parseStockFile,
} from "./stock-import"

const HEADER =
  "Erstellungszeitpunkt;beendet;Record-Type;Job-Number;Sub-Job-Number;Artikelnummer;Sequenz-Nummer;Referenznummer;Status;Daten;erzeugter Dateiname;Host;Synchrone Verarbeitung;Dateiname;Fehlertexte (mehrsprachig)"

function csvRow(type: string, status: string, xml: string) {
  return `09.10.2026 11:23:31;09.10.2026 11:23:40;${type};1;0;X;1;ref;${status};"${xml.replace(/"/g, '""')}";;1;false;;`
}

function dataXml(fields: Record<string, string>) {
  const f = {
    sscc: "340029968001086602",
    "p_artikel-p_artikelnr": "41100.451",
    menge: "48.0",
    freieMenge: "48.0",
    qsMenge: "0.0",
    sperrMenge: "0.0",
    qsUndSperrMenge: "0.0",
    "p_einheitMenge-p_name": "Karton",
    logistikzentrum: "HERFORD",
    bestandslagergruppe: "ALL_HERFORD",
    ...fields,
  }
  const body = Object.entries(f)
    .map(([k, v]) => `<${k}>${v}</${k}>`)
    .join("\n")
  return `<BestandDaten>\n<User>x</User>\n${body}\n</BestandDaten>`
}

const start = csvRow("BestandStart", "done", "<BestandStart><User>x</User></BestandStart>")
const end = (count: number) =>
  csvRow("BestandEnde", "done", `<BestandEnde>\n<anzahlDatensaetze>${count}</anzahlDatensaetze>\n</BestandEnde>`)

function file(rows: string[], count = rows.length - 0) {
  return [HEADER, end(count), ...rows, start].join("\r\n")
}

const bytes = (text: string) => new TextEncoder().encode(text)

describe("normalizeArticleNumber", () => {
  it("pads a 3-digit Kennziffer and keeps a 4-digit one", () => {
    expect(normalizeArticleNumber("41100.451")).toBe("41100.0451")
    expect(normalizeArticleNumber("41100.0451")).toBe("41100.0451")
    expect(normalizeArticleNumber(" 7.123 ")).toBe("7.0123")
  })

  it("rejects other patterns", () => {
    for (const bad of ["", "41100", "41100.12", "41100.12345", "abc.1234", "41100,451", "41100.45a", ".1234"]) {
      expect(normalizeArticleNumber(bad)).toBeNull()
    }
  })
})

describe("parseQuantity", () => {
  it("reads decimals and rejects empty, negative or non-numeric values", () => {
    expect(parseQuantity("48.0")).toBe(48)
    expect(parseQuantity("0.5")).toBe(0.5)
    expect(parseQuantity("12,5")).toBe(12.5)
    for (const bad of ["", " ", "-1", "abc", "1e3", "1.2.3", "NaN", "1000000000000"]) {
      expect(parseQuantity(bad)).toBeNull()
    }
    expect(parseQuantity(undefined)).toBeNull()
    expect(parseQuantity(5)).toBeNull()
  })
})

describe("decodeStockFile", () => {
  it("reads UTF-8", () => {
    expect(decodeStockFile(bytes("Stück Größe"))).toBe("Stück Größe")
  })

  it("reads Mac Roman (as in the reference file: 9F = ü)", () => {
    expect(decodeStockFile(Uint8Array.from([0x53, 0x74, 0x9f, 0x63, 0x6b]))).toBe("Stück")
  })

  it("reads Windows-1252 (FC = ü)", () => {
    expect(decodeStockFile(Uint8Array.from([0x53, 0x74, 0xfc, 0x63, 0x6b]))).toBe("Stück")
  })

  it("strips a BOM", () => {
    expect(decodeStockFile(Uint8Array.from([0xef, 0xbb, 0xbf, 0x41]))).toBe("A")
  })
})

describe("parseStockFile — whole-file rejection", () => {
  it("rejects an empty file", () => {
    expect(parseStockFile(new Uint8Array())).toMatchObject({ ok: false })
  })

  it("rejects a file without the expected columns", () => {
    const result = parseStockFile(bytes("a;b;c\n1;2;3"))
    expect(result).toMatchObject({ ok: false })
  })

  it("rejects a file without BestandEnde", () => {
    const result = parseStockFile(bytes([HEADER, csvRow("BestandDaten", "done", dataXml({})), start].join("\r\n")))
    expect(result).toMatchObject({ ok: false, error: expect.stringContaining("BestandEnde") })
  })

  it("rejects a file whose record count differs from anzahlDatensaetze", () => {
    const rows = [csvRow("BestandDaten", "done", dataXml({}))]
    const result = parseStockFile(bytes(file(rows, 2)))
    expect(result).toMatchObject({ ok: false, error: expect.stringContaining("2 Datensätze") })
  })

  it("rejects a file where the XML of a data row is not readable", () => {
    const rows = [csvRow("BestandDaten", "done", "<BestandDaten><sscc>1</BestandDaten>")]
    const result = parseStockFile(bytes(file(rows, 1)))
    expect(result).toMatchObject({ ok: false, error: expect.stringContaining("Zeile 3") })
  })

  it("rejects unbalanced quotes", () => {
    const text = `${HEADER}\r\n09.10.2026;x;BestandDaten;1;0;X;1;r;done;"<a>;;1;false;;`
    expect(parseStockFile(bytes(text))).toMatchObject({ ok: false })
  })
})

describe("parseStockFile — rows", () => {
  it("returns normalized records with all fields", () => {
    const rows = [csvRow("BestandDaten", "done", dataXml({ "p_artikel-p_artikelnr": "41100.451" }))]
    const result = parseStockFile(bytes(file(rows)))
    expect(result).toMatchObject({ ok: true, recordCount: 1, skipped: [], errors: [], excluded: [] })
    if (!result.ok) return
    expect(result.records).toEqual([
      {
        sscc: "340029968001086602",
        article_number: "41100.0451",
        quantity: 48,
        free_quantity: 48,
        qs_quantity: 0,
        blocked_quantity: 0,
        qs_and_blocked_quantity: 0,
        unit: "Karton",
        logistics_center: "HERFORD",
        stock_group: "ALL_HERFORD",
      },
    ])
  })

  it("keeps an 18-digit SSCC exactly (no number conversion)", () => {
    const rows = [csvRow("BestandDaten", "done", dataXml({ sscc: "340029968001086657" }))]
    const result = parseStockFile(bytes(file(rows)))
    expect(result.ok && result.records[0].sscc).toBe("340029968001086657")
  })

  it("accepts a file with 0 data rows (only Start/Ende)", () => {
    const result = parseStockFile(bytes(file([], 0)))
    expect(result).toMatchObject({ ok: true, recordCount: 0, records: [] })
  })

  it("skips rows that are not 'done' but counts them as data rows", () => {
    const rows = [
      csvRow("BestandDaten", "done", dataXml({})),
      csvRow("BestandDaten", "error", dataXml({ sscc: "2" })),
    ]
    const result = parseStockFile(bytes(file(rows)))
    expect(result).toMatchObject({ ok: true, recordCount: 2 })
    if (!result.ok) return
    expect(result.records).toHaveLength(1)
    expect(result.skipped).toEqual([{ reason: SKIP_REASONS.status, count: 1, lines: [4] }])
  })

  it("skips rows with invalid SSCC, article number, quantity or text and processes the rest", () => {
    const rows = [
      csvRow("BestandDaten", "done", dataXml({ sscc: "34002996800108660X" })),
      csvRow("BestandDaten", "done", dataXml({ sscc: "2", "p_artikel-p_artikelnr": "41100.12" })),
      csvRow("BestandDaten", "done", dataXml({ sscc: "3", menge: "" })),
      csvRow("BestandDaten", "done", dataXml({ sscc: "4", sperrMenge: "-1" })),
      csvRow("BestandDaten", "done", dataXml({ sscc: "5", "p_einheitMenge-p_name": "x".repeat(101) })),
      csvRow("BestandDaten", "done", dataXml({ sscc: "6" })),
    ]
    const result = parseStockFile(bytes(file(rows)))
    expect(result).toMatchObject({ ok: true, recordCount: 6, errors: [] })
    if (!result.ok) return
    expect(result.records.map((r) => r.sscc)).toEqual(["6"])
    expect(Object.fromEntries(result.skipped.map((g) => [g.reason, g.count]))).toEqual({
      [SKIP_REASONS.sscc]: 1,
      [SKIP_REASONS.article]: 1,
      [SKIP_REASONS.quantity]: 2,
      [SKIP_REASONS.text]: 1,
    })
  })

  it("treats the same SSCC with different articles as a mixed pallet (all kept)", () => {
    const rows = [
      csvRow("BestandDaten", "done", dataXml({ "p_artikel-p_artikelnr": "41100.451" })),
      csvRow("BestandDaten", "done", dataXml({ "p_artikel-p_artikelnr": "41100.452" })),
    ]
    const result = parseStockFile(bytes(file(rows)))
    expect(result).toMatchObject({ ok: true, errors: [], excluded: [] })
    expect(result.ok && result.records).toHaveLength(2)
  })

  it("drops all rows of a duplicate SSCC + article, reports one error and excludes the key", () => {
    const rows = [
      csvRow("BestandDaten", "done", dataXml({})),
      csvRow("BestandDaten", "done", dataXml({})),
      csvRow("BestandDaten", "done", dataXml({})),
      csvRow("BestandDaten", "done", dataXml({ sscc: "99" })),
    ]
    const result = parseStockFile(bytes(file(rows)))
    expect(result).toMatchObject({ ok: true, recordCount: 4 })
    if (!result.ok) return
    expect(result.records.map((r) => r.sscc)).toEqual(["99"])
    expect(result.excluded).toEqual([{ sscc: "340029968001086602", article_number: "41100.0451" }])
    expect(result.errors).toHaveLength(1)
    expect(result.errors[0]).toMatchObject({ sscc: "340029968001086602", articleNumber: "41100.0451" })
    expect(result.errors[0].message).toContain("3-mal")
  })

  it("reads umlauts from a Mac Roman file", () => {
    const text = file([csvRow("BestandDaten", "done", dataXml({ "p_einheitMenge-p_name": "Stück" }))])
    const encoded = new TextEncoder().encode(text.replace("Stück", "St@@ck"))
    const index = encoded.findIndex((b, i) => b === 0x40 && encoded[i + 1] === 0x40)
    const macRoman = Uint8Array.from([...encoded.slice(0, index), 0x9f, ...encoded.slice(index + 2)])
    const result = parseStockFile(macRoman)
    expect(result.ok && result.records[0].unit).toBe("Stück")
  })

  it("lists at most 20 line numbers per skipped reason but counts all", () => {
    const rows = Array.from({ length: 30 }, (_, i) => csvRow("BestandDaten", "done", dataXml({ sscc: `x${i}` })))
    const result = parseStockFile(bytes(file(rows)))
    expect(result.ok && result.skipped[0]).toMatchObject({ count: 30 })
    expect(result.ok && result.skipped[0].lines).toHaveLength(20)
  })
})
