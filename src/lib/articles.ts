// Artikelstamm (PROJ-3): Formularmodell, Validierung, Anzeige-Berechnungen und Mapping der
// Datenbankzeilen (von /backend angelegte Tabelle `articles`).
//
// Artikelnummer, Matchcode, Warengruppe und Bruttogewicht berechnet verbindlich der Server; die
// Funktionen hier erzeugen nur die Live-Vorschau im Formular und müssen dieselbe Regel abbilden.
import { z } from "zod"

import { isDecimalInput, parseDecimalInput, toDecimalInput } from "@/lib/decimal"

export const ARTICLE_UNITS = { dimension: "mm", weight: "g" } as const

export const ARTICLE_LOCK_RESOURCE = "article"

// ---- Berechnungen (Vorschau) ----------------------------------------------------------------

/** Basisartikelnummer (1–10 Ziffern) + "." + 4-stellige Kennziffer; solange eines fehlt → null. */
export function computeArticleNumber(baseNumber: string | null | undefined, kennziffer: string) {
  const base = (baseNumber ?? "").trim()
  const code = kennziffer.trim()
  if (!/^\d{1,10}$/.test(base) || !/^\d{4}$/.test(code)) return null
  return `${base}.${code}`
}

/**
 * Matchcode: Kürzel von Artikeltyp, Markeninhaber, Saison, Basisartikel, Form/Design,
 * Packungsgröße, Geschmackssorte (in dieser Reihenfolge) mit "-"; nicht gewählte werden übersprungen.
 */
export function computeMatchCode(codes: (string | null | undefined)[]) {
  return codes
    .map((code) => (code ?? "").trim())
    .filter((code) => code !== "")
    .join("-")
}

/**
 * Bezeichnungs-Vorschlag aus den Bezeichnungen von Basisartikel, Form/Design, Packungsgröße und
 * Geschmackssorte (in dieser Reihenfolge, durch Leerzeichen getrennt); fehlende werden übersprungen.
 */
export function suggestArticleName(names: (string | null | undefined)[]) {
  return names
    .map((name) => (name ?? "").trim())
    .filter((name) => name !== "")
    .join(" ")
    .slice(0, 200)
}

/** Saison-Ziffer + Artikeltyp-Ziffer + Platzhalter "0"; fehlende Ziffern zählen als 0. */
export function computeCommodityGroup(
  seasonDigit: number | null | undefined,
  typeDigit: number | null | undefined
) {
  const digit = (value: number | null | undefined) =>
    typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= 9 ? value : 0
  return `${digit(seasonDigit)}${digit(typeDigit)}0`
}

/** Bruttogewicht = Gewicht + Tara; ohne beide Werte → null. */
export function computeGrossWeight(weight: string, tara: string): number | null {
  const w = parseDecimalInput(weight)
  const t = parseDecimalInput(tara)
  if ((w === null && t === null) || Number.isNaN(w) || Number.isNaN(t)) return null
  return Math.round(((w ?? 0) + (t ?? 0)) * 1000) / 1000
}

// ---- Formularwerte --------------------------------------------------------------------------

export interface ArticleFormValues {
  articleTypeId: string
  baseArticleNumber: string
  baseArticleId: string
  kennziffer: string
  name: string
  description: string
  brandOwnerId: string
  seasonId: string
  formDesignId: string
  packSizeId: string
  flavorId: string
  fairtrade: boolean
  rainforest: boolean
  fsc: boolean
  palletClassId: string
  isMixed: boolean
  mixedCount: string
  gtinMain: string
  gtinMixed1: string
  gtinMixed2: string
  cartonEan: string
  cartonContent: string
  width: string
  length: string
  height: string
  weight: string
  tara: string
  palletFactor: string
  packagingGroupId: string
  vatRateId: string
  customsTariffNumber: string
}

export const EMPTY_ARTICLE_VALUES: ArticleFormValues = {
  articleTypeId: "",
  baseArticleNumber: "",
  baseArticleId: "",
  kennziffer: "",
  name: "",
  description: "",
  brandOwnerId: "",
  seasonId: "",
  formDesignId: "",
  packSizeId: "",
  flavorId: "",
  fairtrade: false,
  rainforest: false,
  fsc: false,
  palletClassId: "",
  isMixed: false,
  mixedCount: "",
  gtinMain: "",
  gtinMixed1: "",
  gtinMixed2: "",
  cartonEan: "",
  cartonContent: "",
  width: "",
  length: "",
  height: "",
  weight: "",
  tara: "",
  palletFactor: "",
  packagingGroupId: "",
  vatRateId: "",
  customsTariffNumber: "",
}

const optionalText = (label: string, max: number) =>
  z.string().trim().max(max, `${label} darf höchstens ${max} Zeichen lang sein`)

const optionalDecimal = z
  .string()
  .trim()
  .refine((v) => v === "" || isDecimalInput(v), "Bitte eine Zahl angeben (z. B. 12,5)")

const optionalInteger = z
  .string()
  .trim()
  .refine((v) => v === "" || /^\d{1,9}$/.test(v), "Bitte eine ganze Zahl angeben")

const optionalDigits = (label: string) =>
  z
    .string()
    .trim()
    .refine((v) => v === "" || /^\d{1,14}$/.test(v), `${label}: nur Ziffern, höchstens 14 Stellen`)

export const articleFormSchema = z.object({
  articleTypeId: z.string(),
  baseArticleNumber: z
    .string()
    .trim()
    .regex(/^\d{1,10}$/, "Die Basisartikelnummer muss aus 1 bis 10 Ziffern bestehen"),
  baseArticleId: z.string(),
  kennziffer: z
    .string()
    .trim()
    .regex(/^\d{4}$/, "Die Artikelkennziffer muss genau 4 Ziffern haben"),
  name: optionalText("Die Artikelbezeichnung", 200),
  description: optionalText("Die Artikelbeschreibung", 2000),
  brandOwnerId: z.string(),
  seasonId: z.string(),
  formDesignId: z.string(),
  packSizeId: z.string(),
  flavorId: z.string(),
  fairtrade: z.boolean(),
  rainforest: z.boolean(),
  fsc: z.boolean(),
  palletClassId: z.string(),
  isMixed: z.boolean(),
  mixedCount: optionalInteger,
  gtinMain: optionalDigits("GTIN Hauptartikel"),
  gtinMixed1: optionalDigits("GTIN Mischartikel 1"),
  gtinMixed2: optionalDigits("GTIN Mischartikel 2"),
  cartonEan: optionalDigits("Karton-EAN"),
  cartonContent: optionalInteger,
  width: optionalDecimal,
  length: optionalDecimal,
  height: optionalDecimal,
  weight: optionalDecimal,
  tara: optionalDecimal,
  palletFactor: optionalDecimal,
  packagingGroupId: z.string(),
  vatRateId: z.string(),
  customsTariffNumber: optionalText("Die Zolltarifnummer", 20),
})

function nullIfEmpty(value: string) {
  const trimmed = value.trim()
  return trimmed === "" ? null : trimmed
}

function intOrNull(value: string) {
  const trimmed = value.trim()
  return trimmed === "" ? null : Number(trimmed)
}

/** Formularwerte → API-Body (Server berechnet Artikelnummer, Warengruppe, Bruttogewicht). */
export function toArticlePayload(values: ArticleFormValues) {
  return {
    articleTypeId: nullIfEmpty(values.articleTypeId),
    baseArticleNumber: values.baseArticleNumber.trim(),
    baseArticleId: nullIfEmpty(values.baseArticleId),
    kennziffer: values.kennziffer.trim(),
    name: nullIfEmpty(values.name),
    description: nullIfEmpty(values.description),
    brandOwnerId: nullIfEmpty(values.brandOwnerId),
    seasonId: nullIfEmpty(values.seasonId),
    formDesignId: nullIfEmpty(values.formDesignId),
    packSizeId: nullIfEmpty(values.packSizeId),
    flavorId: nullIfEmpty(values.flavorId),
    fairtrade: values.fairtrade,
    rainforest: values.rainforest,
    fsc: values.fsc,
    palletClassId: nullIfEmpty(values.palletClassId),
    isMixed: values.isMixed,
    mixedCount: values.isMixed ? intOrNull(values.mixedCount) : null,
    gtinMain: nullIfEmpty(values.gtinMain),
    gtinMixed1: nullIfEmpty(values.gtinMixed1),
    gtinMixed2: nullIfEmpty(values.gtinMixed2),
    cartonEan: nullIfEmpty(values.cartonEan),
    cartonContent: intOrNull(values.cartonContent),
    width: parseDecimalInput(values.width),
    length: parseDecimalInput(values.length),
    height: parseDecimalInput(values.height),
    weight: parseDecimalInput(values.weight),
    tara: parseDecimalInput(values.tara),
    palletFactor: parseDecimalInput(values.palletFactor),
    packagingGroupId: nullIfEmpty(values.packagingGroupId),
    vatRateId: nullIfEmpty(values.vatRateId),
    customsTariffNumber: nullIfEmpty(values.customsTariffNumber),
  }
}

// ---- Datenbankzeilen ------------------------------------------------------------------------

/** Spalten, die Detailseite und Formular aus `articles` lesen. */
export const ARTICLE_COLUMNS = [
  "id",
  "article_number",
  "match_code",
  "commodity_group",
  "article_type_id",
  "base_article_number",
  "base_article_id",
  "kennziffer",
  "name",
  "description",
  "brand_owner_id",
  "season_id",
  "form_design_id",
  "pack_size_id",
  "flavor_id",
  "fairtrade",
  "rainforest",
  "fsc",
  "pallet_class_id",
  "is_mixed",
  "mixed_count",
  "gtin_main",
  "gtin_mixed_1",
  "gtin_mixed_2",
  "carton_ean",
  "carton_content",
  "width",
  "length",
  "height",
  "weight",
  "tara",
  "pallet_factor",
  "packaging_group_id",
  "vat_rate_id",
  "customs_tariff_number",
  "is_active",
  "updated_at",
].join(", ")

export interface Article {
  id: string
  articleNumber: string
  matchCode: string
  commodityGroup: string
  isActive: boolean
  updatedAt: string | null
  values: ArticleFormValues
}

type Row = Record<string, unknown>

const str = (v: unknown) => (v === null || v === undefined ? "" : String(v))
const num = (v: unknown) => (v === null || v === undefined ? "" : toDecimalInput(Number(v)))
const int = (v: unknown) => (v === null || v === undefined ? "" : String(Math.trunc(Number(v))))

export function rowToArticle(row: Row): Article {
  return {
    id: String(row.id),
    articleNumber: str(row.article_number),
    matchCode: str(row.match_code),
    commodityGroup: str(row.commodity_group),
    isActive: row.is_active !== false,
    updatedAt: row.updated_at ? String(row.updated_at) : null,
    values: {
      articleTypeId: str(row.article_type_id),
      baseArticleNumber: str(row.base_article_number),
      baseArticleId: str(row.base_article_id),
      kennziffer: str(row.kennziffer),
      name: str(row.name),
      description: str(row.description),
      brandOwnerId: str(row.brand_owner_id),
      seasonId: str(row.season_id),
      formDesignId: str(row.form_design_id),
      packSizeId: str(row.pack_size_id),
      flavorId: str(row.flavor_id),
      fairtrade: row.fairtrade === true,
      rainforest: row.rainforest === true,
      fsc: row.fsc === true,
      palletClassId: str(row.pallet_class_id),
      isMixed: row.is_mixed === true,
      mixedCount: int(row.mixed_count),
      gtinMain: str(row.gtin_main),
      gtinMixed1: str(row.gtin_mixed_1),
      gtinMixed2: str(row.gtin_mixed_2),
      cartonEan: str(row.carton_ean),
      cartonContent: int(row.carton_content),
      width: num(row.width),
      length: num(row.length),
      height: num(row.height),
      weight: num(row.weight),
      tara: num(row.tara),
      palletFactor: num(row.pallet_factor),
      packagingGroupId: str(row.packaging_group_id),
      vatRateId: str(row.vat_rate_id),
      customsTariffNumber: str(row.customs_tariff_number),
    },
  }
}
