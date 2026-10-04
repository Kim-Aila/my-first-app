// Konfiguration der 9 Merkmal-Tabellen des Artikelstamms (PROJ-3).
// Eine einzige Pflege-Oberfläche (`MerkmalManager`) wird je Tabelle über diese Konfiguration
// gesteuert; Artikelformular und Auswahlfelder lesen Bezeichnungen/Links ebenfalls von hier.
import { z } from "zod"

import { isDecimalInput, parseDecimalInput, toDecimalInput } from "@/lib/decimal"
import {
  MASK_MERKMAL_ARTIKELTYP,
  MASK_MERKMAL_BASISARTIKEL,
  MASK_MERKMAL_FORM_DESIGN,
  MASK_MERKMAL_GESCHMACKSSORTE,
  MASK_MERKMAL_MARKENINHABER,
  MASK_MERKMAL_MWST,
  MASK_MERKMAL_PACKUNGSGROESSE,
  MASK_MERKMAL_SAISON,
  MASK_MERKMAL_VERPACKUNGSGRUPPE,
  type MaskDefinition,
} from "@/lib/masks"

export type MerkmalFieldKind = "text" | "digit" | "decimal"

export interface MerkmalField {
  /** Schlüssel in der API (camelCase). */
  key: string
  /** Spaltenname in der Datenbank (snake_case), nur für Server-Seiten, die direkt lesen. */
  column: string
  label: string
  kind: MerkmalFieldKind
  required: boolean
  maxLength?: number
  /** Einheit, wird hinter dem Label angezeigt (z. B. "%", "g"). */
  unit?: string
  hint?: string
}

export interface MerkmalConfig {
  /** URL-Segment: /merkmale/[slug] */
  slug: string
  /** Datenbanktabelle (von /backend angelegt). */
  table: string
  /** Schlüssel des Verweisfelds am Artikel (API). */
  articleKey: string
  singular: string
  plural: string
  mask: MaskDefinition
  fields: MerkmalField[]
  /** Spalte, nach der die Liste sortiert wird. */
  sortColumn: string
}

const CODE_FIELD: MerkmalField = {
  key: "code",
  column: "code",
  label: "Kürzel",
  kind: "text",
  required: true,
  maxLength: 20,
}

const NAME_FIELD: MerkmalField = {
  key: "name",
  column: "name",
  label: "Bezeichnung",
  kind: "text",
  required: true,
  maxLength: 100,
}

const COMMODITY_DIGIT_FIELD: MerkmalField = {
  key: "commodityDigit",
  column: "commodity_digit",
  label: "Warengruppen-Ziffer",
  kind: "digit",
  required: true,
  hint: "Eine Ziffer von 0 bis 9; fließt in die Warengruppe der Artikel ein.",
}

export const MERKMALE: MerkmalConfig[] = [
  {
    slug: "artikeltypen",
    table: "article_types",
    articleKey: "articleTypeId",
    singular: "Artikeltyp",
    plural: "Artikeltypen",
    mask: MASK_MERKMAL_ARTIKELTYP,
    fields: [CODE_FIELD, NAME_FIELD, COMMODITY_DIGIT_FIELD],
    sortColumn: "code",
  },
  {
    slug: "markeninhaber",
    table: "brand_owners",
    articleKey: "brandOwnerId",
    singular: "Markeninhaber",
    plural: "Markeninhaber",
    mask: MASK_MERKMAL_MARKENINHABER,
    fields: [CODE_FIELD, NAME_FIELD],
    sortColumn: "code",
  },
  {
    slug: "saisons",
    table: "seasons",
    articleKey: "seasonId",
    singular: "Saison",
    plural: "Saisons",
    mask: MASK_MERKMAL_SAISON,
    fields: [CODE_FIELD, NAME_FIELD, COMMODITY_DIGIT_FIELD],
    sortColumn: "code",
  },
  {
    slug: "basisartikel",
    table: "base_articles",
    articleKey: "baseArticleId",
    singular: "Basisartikel",
    plural: "Basisartikel",
    mask: MASK_MERKMAL_BASISARTIKEL,
    fields: [
      { ...CODE_FIELD, label: "Nummer", maxLength: 30, hint: "Wird Teil der Artikelnummer." },
      NAME_FIELD,
      {
        key: "customsTariffNumber",
        column: "customs_tariff_number",
        label: "Zolltarifnummer",
        kind: "text",
        required: false,
        maxLength: 20,
        hint: "Wird im Artikel als Zolltarifnummer vorbelegt.",
      },
    ],
    sortColumn: "code",
  },
  {
    slug: "form-design",
    table: "form_designs",
    articleKey: "formDesignId",
    singular: "Form/Design",
    plural: "Form/Design",
    mask: MASK_MERKMAL_FORM_DESIGN,
    fields: [CODE_FIELD, NAME_FIELD],
    sortColumn: "code",
  },
  {
    slug: "packungsgroessen",
    table: "pack_sizes",
    articleKey: "packSizeId",
    singular: "Packungsgröße",
    plural: "Packungsgrößen",
    mask: MASK_MERKMAL_PACKUNGSGROESSE,
    fields: [CODE_FIELD, NAME_FIELD],
    sortColumn: "code",
  },
  {
    slug: "geschmackssorten",
    table: "flavors",
    articleKey: "flavorId",
    singular: "Geschmackssorte",
    plural: "Geschmackssorten",
    mask: MASK_MERKMAL_GESCHMACKSSORTE,
    fields: [CODE_FIELD, NAME_FIELD],
    sortColumn: "code",
  },
  {
    slug: "mehrwertsteuersaetze",
    table: "vat_rates",
    articleKey: "vatRateId",
    singular: "Mehrwertsteuersatz",
    plural: "Mehrwertsteuersätze",
    mask: MASK_MERKMAL_MWST,
    fields: [
      {
        key: "ratePercent",
        column: "rate_percent",
        label: "Satz",
        kind: "decimal",
        required: true,
        unit: "%",
      },
      NAME_FIELD,
    ],
    sortColumn: "rate_percent",
  },
  {
    slug: "verpackungsgruppen",
    table: "packaging_groups",
    articleKey: "packagingGroupId",
    singular: "Verpackungsgruppe",
    plural: "Verpackungsgruppen",
    mask: MASK_MERKMAL_VERPACKUNGSGRUPPE,
    fields: [
      NAME_FIELD,
      {
        key: "foilWeight",
        column: "foil_weight",
        label: "Folien-/Pappengewicht",
        kind: "decimal",
        required: false,
        unit: "g",
        hint: "Für die DSD-Abrechnung.",
      },
    ],
    sortColumn: "name",
  },
]

export function getMerkmalConfig(slug: string): MerkmalConfig | undefined {
  return MERKMALE.find((m) => m.slug === slug)
}

export function getMerkmalByArticleKey(articleKey: string): MerkmalConfig {
  const config = MERKMALE.find((m) => m.articleKey === articleKey)
  if (!config) throw new Error(`Unbekanntes Merkmal-Verweisfeld: ${articleKey}`)
  return config
}

export function merkmalHref(config: MerkmalConfig, tenantId?: string) {
  const base = `/merkmale/${config.slug}`
  return tenantId ? `${base}?mandant=${encodeURIComponent(tenantId)}` : base
}

/** Ein Eintrag einer Merkmal-Tabelle, wie ihn UI und API austauschen. */
export interface MerkmalItem {
  id: string
  isActive: boolean
  values: Record<string, string | number | null>
}

/** Datenbankzeile (snake_case) → MerkmalItem. */
export function rowToMerkmalItem(config: MerkmalConfig, row: Record<string, unknown>): MerkmalItem {
  const values: MerkmalItem["values"] = {}
  for (const field of config.fields) {
    const raw = row[field.column]
    if (raw === null || raw === undefined) values[field.key] = null
    else if (field.kind === "text") values[field.key] = String(raw)
    else values[field.key] = Number(raw)
  }
  return { id: String(row.id), isActive: row.is_active !== false, values }
}

export function selectColumns(config: MerkmalConfig): string {
  return ["id", "is_active", ...config.fields.map((f) => f.column)].join(", ")
}

/** Anzeigetext in Tabellen und Auswahllisten, z. B. "SOM – Sommer" oder "19 % – Regelsatz". */
export function merkmalLabel(config: MerkmalConfig, item: MerkmalItem): string {
  const code = item.values.code
  const name = item.values.name
  if (config.slug === "mehrwertsteuersaetze") {
    const rate = item.values.ratePercent
    const formatted =
      typeof rate === "number" ? rate.toLocaleString("de-DE", { maximumFractionDigits: 2 }) : "?"
    return name ? `${formatted} % – ${name}` : `${formatted} %`
  }
  if (code && name) return `${code} – ${name}`
  return String(name ?? code ?? "–")
}

export function formatMerkmalValue(field: MerkmalField, value: string | number | null | undefined) {
  if (value === null || value === undefined || value === "") return "–"
  if (typeof value === "number") {
    const text = value.toLocaleString("de-DE", { maximumFractionDigits: 3 })
    return field.unit ? `${text} ${field.unit}` : text
  }
  return value
}

// ---- Formular -------------------------------------------------------------------------------

/** Alle Formularwerte sind Strings; `merkmalPayload` wandelt sie für die API um. */
export type MerkmalFormValues = Record<string, string>

export function buildMerkmalSchema(config: MerkmalConfig) {
  const shape: Record<string, z.ZodType<string>> = {}
  for (const field of config.fields) {
    const label = field.label
    let schema = z.string().trim()
    if (field.maxLength) {
      schema = schema.max(field.maxLength, `${label} darf höchstens ${field.maxLength} Zeichen lang sein`)
    }
    shape[field.key] = schema.superRefine((value, ctx) => {
      if (value === "") {
        if (field.required) ctx.addIssue({ code: "custom", message: `Bitte ${label} angeben` })
        return
      }
      if (field.kind === "digit" && !/^\d$/.test(value)) {
        ctx.addIssue({ code: "custom", message: "Bitte eine einzelne Ziffer von 0 bis 9 angeben" })
      }
      if (field.kind === "decimal" && !isDecimalInput(value)) {
        ctx.addIssue({ code: "custom", message: "Bitte eine Zahl angeben (z. B. 7 oder 12,5)" })
      }
    })
  }
  return z.object(shape)
}

export function merkmalDefaultValues(config: MerkmalConfig, item: MerkmalItem | null): MerkmalFormValues {
  const values: MerkmalFormValues = {}
  for (const field of config.fields) {
    const raw = item?.values[field.key]
    if (raw === null || raw === undefined) values[field.key] = ""
    else if (field.kind === "decimal") values[field.key] = toDecimalInput(Number(raw))
    else values[field.key] = String(raw)
  }
  return values
}

export function merkmalPayload(config: MerkmalConfig, values: MerkmalFormValues) {
  const payload: Record<string, string | number | null> = {}
  for (const field of config.fields) {
    const value = (values[field.key] ?? "").trim()
    if (field.kind === "text") payload[field.key] = value === "" ? null : value
    else if (field.kind === "digit") payload[field.key] = value === "" ? null : Number(value)
    else payload[field.key] = parseDecimalInput(value)
  }
  return payload
}
