// Eingabe von Dezimalzahlen in deutschen Formularen ("12,5" oder "12.5").

const DECIMAL_PATTERN = /^\d+([.,]\d+)?$/

export function isDecimalInput(value: string): boolean {
  return DECIMAL_PATTERN.test(value.trim())
}

/** Leerer String → null; ungültige Eingabe → NaN (Validierung fängt das vorher ab). */
export function parseDecimalInput(value: string): number | null {
  const trimmed = value.trim()
  if (trimmed === "") return null
  if (!isDecimalInput(trimmed)) return Number.NaN
  return Number(trimmed.replace(",", "."))
}

export function formatDecimal(value: number | null | undefined, maximumFractionDigits = 3): string {
  if (value === null || value === undefined || Number.isNaN(value)) return ""
  return value.toLocaleString("de-DE", { maximumFractionDigits })
}

/** Zahl → Formularwert (String mit Komma als Dezimaltrenner, ohne Tausendertrenner). */
export function toDecimalInput(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return ""
  return String(value).replace(".", ",")
}
