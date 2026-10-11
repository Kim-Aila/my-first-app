// PROJ-5: Lesen und Prüfen der Bestandsdatei des Lagersystems (Semikolon-CSV, Nutzdaten als XML in
// der Spalte "Daten"). Reine Funktionen ohne Server-Abhängigkeit; der Abgleich mit dem Bestand
// passiert in der Datenbankfunktion `stock_import`.
import Papa from "papaparse"
import { XMLParser, XMLValidator } from "fast-xml-parser"

export const MAX_SKIPPED_LINES = 20

export interface StockRecord {
  sscc: string
  article_number: string
  quantity: number
  free_quantity: number
  qs_quantity: number
  blocked_quantity: number
  qs_and_blocked_quantity: number
  unit: string | null
  logistics_center: string | null
  stock_group: string | null
}

export interface SkippedGroup {
  reason: string
  count: number
  lines: number[]
}

export interface ParsedStockError {
  sscc: string
  articleNumber: string | null
  message: string
}

export type StockFileResult =
  | { ok: false; error: string }
  | {
      ok: true
      /** Anzahl `BestandDaten`-Zeilen in der Datei (alle Status). */
      recordCount: number
      records: StockRecord[]
      /** Schlüssel fehlerhafter Duplikate: bleiben im Bestand unverändert. */
      excluded: { sscc: string; article_number: string }[]
      skipped: SkippedGroup[]
      errors: ParsedStockError[]
    }

export const SKIP_REASONS = {
  status: "Status der Zeile ist nicht „done“",
  sscc: "SSCC fehlt oder besteht nicht nur aus Ziffern",
  article: "Artikelnummer entspricht nicht dem Muster „Ziffern.Kennziffer“ (3 oder 4 Stellen)",
  quantity: "Mengenfeld leer, negativ oder nicht numerisch",
  text: "Textfeld (Einheit, Logistikzentrum, Lagergruppe) zu lang",
} as const

const MAX_QUANTITY = 999_999_999_999
const MAX_TEXT = 100

/** `41100.451` → `41100.0451`; 4-stellige Kennziffer bleibt; alles andere → null. */
export function normalizeArticleNumber(raw: string): string | null {
  const match = /^(\d{1,10})\.(\d{3,4})$/.exec(raw.trim())
  if (!match) return null
  return `${match[1]}.${match[2].padStart(4, "0")}`
}

/** `48.0` → 48; leer, negativ, nicht numerisch oder zu groß → null. */
export function parseQuantity(raw: unknown): number | null {
  if (typeof raw !== "string") return null
  const text = raw.trim()
  if (!/^\d+([.,]\d+)?$/.test(text)) return null
  const value = Number(text.replace(",", "."))
  return Number.isFinite(value) && value <= MAX_QUANTITY ? value : null
}

const GERMAN_LETTERS = /[äöüÄÖÜß]/g
const OTHER_NON_ASCII = /[^\x00-\x7F]/g

/**
 * Zeichensatz bestimmen: UTF-8, sonst der Zeichensatz, in dem die meisten Nicht-ASCII-Zeichen
 * deutsche Umlaute sind (Windows-1252 oder Mac Roman — die Beispieldatei des Lagersystems ist
 * Mac Roman, "Stück" = 53 74 9F 63 6B).
 */
export function decodeStockFile(bytes: Uint8Array): string {
  let text: string
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes)
  } catch {
    let best = ""
    let bestScore = -Infinity
    for (const encoding of ["windows-1252", "macintosh"]) {
      const candidate = new TextDecoder(encoding).decode(bytes)
      const german = (candidate.match(GERMAN_LETTERS) ?? []).length
      const nonAscii = (candidate.match(OTHER_NON_ASCII) ?? []).length
      const score = german - (nonAscii - german)
      if (score > bestScore) {
        best = candidate
        bestScore = score
      }
    }
    text = best
  }
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text
}

const xmlParser = new XMLParser({
  // Alle Werte bleiben Text (SSCC mit 18 Ziffern würde als Zahl Genauigkeit verlieren).
  parseTagValue: false,
  parseAttributeValue: false,
  trimValues: true,
  ignoreAttributes: true,
})

function readXml(xml: string, rootName: string): Record<string, unknown> | null {
  if (XMLValidator.validate(xml) !== true) return null
  try {
    const parsed = xmlParser.parse(xml) as Record<string, unknown>
    const root = parsed[rootName]
    return root !== null && typeof root === "object" ? (root as Record<string, unknown>) : null
  } catch {
    return null
  }
}

function field(node: Record<string, unknown>, key: string): string {
  const value = node[key]
  return typeof value === "string" ? value.trim() : ""
}

const UNREADABLE_MESSAGE =
  "Die Datei konnte nicht gelesen werden. Bitte die unveränderte CSV-Datei des Lagersystems auswählen."

/**
 * Liest die Datei und liefert gültige Positionen, übersprungene Zeilen und Fehler.
 * Ganze Datei ungültig (nicht lesbar, kein `BestandEnde`, Zähler weicht ab) → `{ ok: false }`.
 */
export function parseStockFile(bytes: Uint8Array): StockFileResult {
  if (bytes.length === 0) return { ok: false, error: "Die Datei ist leer." }

  const parsed = Papa.parse<Record<string, string>>(decodeStockFile(bytes), {
    delimiter: ";",
    header: true,
    skipEmptyLines: "greedy",
  })
  if (parsed.errors.some((e) => e.type === "Quotes")) return { ok: false, error: UNREADABLE_MESSAGE }

  const columns = parsed.meta.fields ?? []
  if (!["Record-Type", "Status", "Daten"].every((c) => columns.includes(c))) {
    return {
      ok: false,
      error: "Die Datei hat nicht das erwartete Format (Spalten „Record-Type“, „Status“ und „Daten“ fehlen).",
    }
  }

  const endNodes: Record<string, unknown>[] = []
  const dataRows: { line: number; status: string; xml: string }[] = []
  parsed.data.forEach((row, index) => {
    // Zeilennummer wie in einer Tabellenansicht (Kopfzeile = Zeile 1).
    const line = index + 2
    const type = (row["Record-Type"] ?? "").trim()
    if (type === "BestandDaten") {
      dataRows.push({ line, status: (row["Status"] ?? "").trim().toLowerCase(), xml: row["Daten"] ?? "" })
    } else if (type === "BestandEnde") {
      const node = readXml(row["Daten"] ?? "", "BestandEnde")
      endNodes.push(node ?? {})
    }
  })

  if (endNodes.length === 0) {
    return { ok: false, error: "Die Datei ist unvollständig: Der Abschluss „BestandEnde“ fehlt." }
  }
  if (endNodes.length > 1) {
    return { ok: false, error: "Die Datei enthält mehrere Abzüge („BestandEnde“ kommt mehrfach vor)." }
  }
  const expected = field(endNodes[0], "anzahlDatensaetze")
  if (!/^\d+$/.test(expected)) {
    return { ok: false, error: "Die Datei ist unvollständig: „anzahlDatensaetze“ im Abschluss ist nicht lesbar." }
  }
  if (Number(expected) !== dataRows.length) {
    return {
      ok: false,
      error: `Die Datei ist unvollständig: Laut Abschluss sind ${expected} Datensätze erwartet, enthalten sind ${dataRows.length}.`,
    }
  }

  const skipped = new Map<string, SkippedGroup>()
  const skip = (reason: string, line: number) => {
    const group = skipped.get(reason) ?? { reason, count: 0, lines: [] }
    group.count += 1
    if (group.lines.length < MAX_SKIPPED_LINES) group.lines.push(line)
    skipped.set(reason, group)
  }

  const valid: { line: number; record: StockRecord }[] = []
  for (const row of dataRows) {
    if (row.status !== "done") {
      skip(SKIP_REASONS.status, row.line)
      continue
    }
    const node = readXml(row.xml, "BestandDaten")
    if (!node) {
      return {
        ok: false,
        error: `Die Datei konnte nicht gelesen werden: Die Daten in Zeile ${row.line} sind kein gültiges XML.`,
      }
    }

    const sscc = field(node, "sscc")
    if (!/^\d{1,30}$/.test(sscc)) {
      skip(SKIP_REASONS.sscc, row.line)
      continue
    }
    const articleNumber = normalizeArticleNumber(field(node, "p_artikel-p_artikelnr"))
    if (!articleNumber) {
      skip(SKIP_REASONS.article, row.line)
      continue
    }
    const quantity = parseQuantity(node["menge"])
    const freeQuantity = parseQuantity(node["freieMenge"])
    const qsQuantity = parseQuantity(node["qsMenge"])
    const blockedQuantity = parseQuantity(node["sperrMenge"])
    const qsAndBlockedQuantity = parseQuantity(node["qsUndSperrMenge"])
    if (
      quantity === null ||
      freeQuantity === null ||
      qsQuantity === null ||
      blockedQuantity === null ||
      qsAndBlockedQuantity === null
    ) {
      skip(SKIP_REASONS.quantity, row.line)
      continue
    }
    const unit = field(node, "p_einheitMenge-p_name") || null
    const logisticsCenter = field(node, "logistikzentrum") || null
    const stockGroup = field(node, "bestandslagergruppe") || null
    if ([unit, logisticsCenter, stockGroup].some((text) => text !== null && text.length > MAX_TEXT)) {
      skip(SKIP_REASONS.text, row.line)
      continue
    }

    valid.push({
      line: row.line,
      record: {
        sscc,
        article_number: articleNumber,
        quantity,
        free_quantity: freeQuantity,
        qs_quantity: qsQuantity,
        blocked_quantity: blockedQuantity,
        qs_and_blocked_quantity: qsAndBlockedQuantity,
        unit,
        logistics_center: logisticsCenter,
        stock_group: stockGroup,
      },
    })
  }

  // Gleiche SSCC + gleicher Artikel mehrfach = Datenfehler: alle Zeilen weglassen, Fehler melden,
  // bestehende Position unverändert lassen. (Gleiche SSCC + anderer Artikel = Mischpalette.)
  const counts = new Map<string, number>()
  for (const { record } of valid) {
    const key = `${record.sscc}|${record.article_number}`
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }
  const records: StockRecord[] = []
  const excluded: { sscc: string; article_number: string }[] = []
  const errors: ParsedStockError[] = []
  for (const { record } of valid) {
    const key = `${record.sscc}|${record.article_number}`
    const count = counts.get(key) ?? 1
    if (count === 1) {
      records.push(record)
    } else if (counts.get(key) !== -1) {
      counts.set(key, -1)
      excluded.push({ sscc: record.sscc, article_number: record.article_number })
      errors.push({
        sscc: record.sscc,
        articleNumber: record.article_number,
        message: `Die SSCC kommt mit diesem Artikel ${count}-mal im Abzug vor. Alle Zeilen wurden übersprungen; ein vorhandener Bestand bleibt unverändert.`,
      })
    }
  }

  return { ok: true, recordCount: dataRows.length, records, excluded, skipped: [...skipped.values()], errors }
}
