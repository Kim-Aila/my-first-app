// PROJ-5: Typen und Helfer für den Lagerbestand (Lagerebene). Reine Funktionen, ohne Server-Abhängigkeit.
// Tabellen/Sichten legt /backend an (siehe "Annahmen für /backend" in der Spec):
//   stock_by_article, stock_position_list, stock_imports.
import { formatDecimal } from "@/lib/decimal"
import type { StatusTone } from "@/components/status-badge"

export type StockStatus = "in_stock" | "missing_unchecked" | "missing_checked" | "shipped"

export const STOCK_STATUSES: { value: StockStatus; label: string; tone: StatusTone }[] = [
  { value: "in_stock", label: "Im Lager", tone: "positive" },
  { value: "missing_unchecked", label: "Fehlt, ungeprüft", tone: "blocked" },
  { value: "missing_checked", label: "Fehlt, geprüft i.O.", tone: "pending" },
  { value: "shipped", label: "Versendet", tone: "neutral" },
]

export function stockStatusMeta(value: string) {
  return STOCK_STATUSES.find((s) => s.value === value) ?? { value, label: value, tone: "neutral" as const }
}

export function isStockStatus(value: string | undefined): value is StockStatus {
  return STOCK_STATUSES.some((s) => s.value === value)
}

export const STOCK_TABS = [
  { id: "bestand", title: "Bestand je Artikel" },
  { id: "lhm", title: "LHM-Liste" },
  { id: "pruefliste", title: "Prüfliste" },
  { id: "import", title: "Import" },
] as const

export type StockTabId = (typeof STOCK_TABS)[number]["id"]

export function isStockTab(value: string | undefined): value is StockTabId {
  return STOCK_TABS.some((t) => t.id === value)
}

export function formatQuantity(value: number | null | undefined) {
  return formatDecimal(value, 3) || "0"
}

export function formatDateTime(value: string | null | undefined) {
  if (!value) return "–"
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return "–"
  return date.toLocaleString("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}

function num(value: unknown): number {
  const n = typeof value === "number" ? value : Number(value)
  return Number.isFinite(n) ? n : 0
}

function str(value: unknown): string {
  return typeof value === "string" ? value : ""
}

function strOrNull(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null
}

// ── Bestand je Artikel (Sicht stock_by_article) ─────────────────────────────

export const ARTICLE_STOCK_COLUMNS =
  "article_number, article_id, article_name, stock, qs_blocked, blocked, blocked_total, available"

export interface ArticleStockValues {
  stock: number
  qsBlocked: number
  blocked: number
  blockedTotal: number
  available: number
}

export interface ArticleStockRow extends ArticleStockValues {
  articleNumber: string
  /** Leer, wenn die Artikelnummer (noch) nicht im Artikelstamm existiert. */
  articleId: string | null
  articleName: string | null
}

export function rowToArticleStock(row: Record<string, unknown>): ArticleStockRow {
  return {
    articleNumber: str(row.article_number),
    articleId: strOrNull(row.article_id),
    articleName: strOrNull(row.article_name),
    stock: num(row.stock),
    qsBlocked: num(row.qs_blocked),
    blocked: num(row.blocked),
    blockedTotal: num(row.blocked_total),
    available: num(row.available),
  }
}

// ── LHM-Positionen (Sicht stock_position_list) ──────────────────────────────

export const POSITION_COLUMNS =
  "id, sscc, article_number, article_id, article_name, quantity, free_quantity, qs_quantity, blocked_quantity, qs_and_blocked_quantity, unit, status, is_mixed_pallet, last_seen_at, updated_at"

export interface StockPositionRow {
  id: string
  sscc: string
  articleNumber: string
  articleId: string | null
  articleName: string | null
  quantity: number
  freeQuantity: number
  qsQuantity: number
  blockedQuantity: number
  qsAndBlockedQuantity: number
  unit: string | null
  status: StockStatus
  isMixedPallet: boolean
  lastSeenAt: string | null
  updatedAt: string | null
}

export function rowToPosition(row: Record<string, unknown>): StockPositionRow {
  return {
    id: str(row.id),
    sscc: str(row.sscc),
    articleNumber: str(row.article_number),
    articleId: strOrNull(row.article_id),
    articleName: strOrNull(row.article_name),
    quantity: num(row.quantity),
    freeQuantity: num(row.free_quantity),
    qsQuantity: num(row.qs_quantity),
    blockedQuantity: num(row.blocked_quantity),
    qsAndBlockedQuantity: num(row.qs_and_blocked_quantity),
    unit: strOrNull(row.unit),
    status: (isStockStatus(str(row.status)) ? row.status : "in_stock") as StockStatus,
    isMixedPallet: row.is_mixed_pallet === true,
    lastSeenAt: strOrNull(row.last_seen_at),
    updatedAt: strOrNull(row.updated_at),
  }
}

/** Antwort von GET stock/positions/:id (Detailansicht inkl. Prüf-/Versandinfo und Import-Verlauf). */
export interface StockPositionDetail extends StockPositionRow {
  logisticsCenter: string | null
  stockGroup: string | null
  firstSeenAt: string | null
  checkedByName: string | null
  checkedAt: string | null
  checkRemark: string | null
  shippedByName: string | null
  shippedAt: string | null
  imports: { id: string; fileName: string; userName: string | null; createdAt: string }[]
}

export const POSITION_ACTION_CONFLICT_MESSAGE =
  "Der Status dieser Position hat sich inzwischen geändert. Die Ansicht wird aktualisiert."

// ── Import (Vorschau und Ergebnis) ──────────────────────────────────────────

export interface ImportCounts {
  new: number
  changed: number
  unchanged: number
  missing: number
  reappeared: number
}

export interface ImportSkippedGroup {
  reason: string
  count: number
  /** Die ersten Zeilennummern der Datei (der Server kürzt die Liste). */
  lines: number[]
}

export interface ImportErrorEntry {
  sscc: string
  articleNumber: string | null
  message: string
}

/** Antwort von POST stock/imports/preview und POST stock/imports (identische Struktur). */
export interface ImportOutcome {
  fileName: string
  /** Anzahl `BestandDaten`-Zeilen in der Datei. */
  recordCount: number
  counts: ImportCounts
  skippedCount: number
  skipped: ImportSkippedGroup[]
  errors: ImportErrorEntry[]
  unknownArticles: string[]
}

export const IMPORT_MAX_BYTES = 25 * 1024 * 1024

/** Würde die Übernahme den bisherigen Bestand komplett als fehlend markieren? */
export function wipesStock(outcome: ImportOutcome) {
  return outcome.recordCount === 0 && outcome.counts.missing > 0
}

export const IMPORT_COUNT_LABELS: { key: keyof ImportCounts; label: string }[] = [
  { key: "new", label: "Neu" },
  { key: "changed", label: "Geändert" },
  { key: "unchanged", label: "Unverändert" },
  { key: "missing", label: "Fehlend" },
  { key: "reappeared", label: "Wieder aufgetaucht" },
]

export const IMPORT_LOG_COLUMNS =
  "id, file_name, user_name, created_at, new_count, changed_count, unchanged_count, missing_count, reappeared_count, skipped_count, error_count"

export interface ImportLogRow {
  id: string
  fileName: string
  userName: string | null
  createdAt: string
  counts: ImportCounts
  skippedCount: number
  errorCount: number
}

export function rowToImportLog(row: Record<string, unknown>): ImportLogRow {
  return {
    id: str(row.id),
    fileName: str(row.file_name),
    userName: strOrNull(row.user_name),
    createdAt: str(row.created_at),
    counts: {
      new: num(row.new_count),
      changed: num(row.changed_count),
      unchanged: num(row.unchanged_count),
      missing: num(row.missing_count),
      reappeared: num(row.reappeared_count),
    },
    skippedCount: num(row.skipped_count),
    errorCount: num(row.error_count),
  }
}
