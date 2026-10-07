// Gemeinsame Schemas, Mappings und Fehlerbehandlung der PROJ-3-Routen
// (Artikel, Merkmal-Tabellen, Bearbeitungssperre).
import { z } from "zod"

import { FORBIDDEN_MESSAGE, SERVER_ERROR_MESSAGE, jsonError } from "@/lib/api-auth"
import type { MerkmalConfig } from "@/lib/merkmale"

export const ARTICLE_NOT_FOUND_MESSAGE = "Artikel nicht gefunden."
export const ARTICLE_NUMBER_TAKEN_MESSAGE = "Artikelnummer bereits vergeben"
export const MERKMAL_NOT_FOUND_MESSAGE = "Eintrag nicht gefunden."
export const FOREIGN_REFERENCE_MESSAGE =
  "Ein gewählter Eintrag existiert nicht in diesem Mandanten."
export const INVALID_INPUT_MESSAGE = "Ungültige Eingabe."

// ---- Artikel --------------------------------------------------------------------------------

const refId = z.uuid({ error: "Ungültiger Verweis." }).nullish().transform((v) => v ?? null)

function text(max: number, label: string) {
  return z
    .string({ error: `${label} ist ungültig.` })
    .trim()
    .max(max, `${label} darf höchstens ${max} Zeichen lang sein`)
    .nullish()
    .transform((v) => (v ? v : null))
}

function digits(label: string) {
  return z
    .string({ error: `${label} ist ungültig.` })
    .trim()
    .regex(/^\d{1,14}$/, `${label}: nur Ziffern, höchstens 14 Stellen`)
    .nullish()
    .transform((v) => v ?? null)
}

function decimal(label: string) {
  return z
    .number({ error: `${label} muss eine Zahl sein.` })
    .min(0, `${label} darf nicht negativ sein`)
    .max(999_999_999, `${label} ist zu groß`)
    .nullish()
    .transform((v) => v ?? null)
}

function integer(label: string) {
  return z
    .number({ error: `${label} muss eine ganze Zahl sein.` })
    .int(`${label} muss eine ganze Zahl sein.`)
    .min(0, `${label} darf nicht negativ sein`)
    .max(999_999_999, `${label} ist zu groß`)
    .nullish()
    .transform((v) => v ?? null)
}

// Artikelnummer, Matchcode, Warengruppe und Bruttogewicht gehören nicht ins Schema: sie werden vom
// Datenbank-Trigger berechnet; mitgeschickte Werte werden verworfen.
export const articleSchema = z.object({
  articleTypeId: refId,
  baseArticleNumber: z
    .string({ error: "Die Basisartikelnummer muss aus 1 bis 10 Ziffern bestehen" })
    .trim()
    .regex(/^\d{1,10}$/, "Die Basisartikelnummer muss aus 1 bis 10 Ziffern bestehen"),
  baseArticleId: refId,
  kennziffer: z
    .string({ error: "Die Artikelkennziffer muss genau 4 Ziffern haben" })
    .trim()
    .regex(/^\d{4}$/, "Die Artikelkennziffer muss genau 4 Ziffern haben"),
  name: text(200, "Die Artikelbezeichnung"),
  description: text(2000, "Die Artikelbeschreibung"),
  brandOwnerId: refId,
  seasonId: refId,
  formDesignId: refId,
  packSizeId: refId,
  flavorId: refId,
  fairtrade: z.boolean().default(false),
  rainforest: z.boolean().default(false),
  fsc: z.boolean().default(false),
  palletClassId: refId,
  isMixed: z.boolean().default(false),
  mixedCount: integer("Anzahl Mischartikel"),
  gtinMain: digits("GTIN Hauptartikel"),
  gtinMixed1: digits("GTIN Mischartikel 1"),
  gtinMixed2: digits("GTIN Mischartikel 2"),
  cartonEan: digits("Karton-EAN"),
  cartonContent: integer("Kartoninhalt"),
  width: decimal("Breite"),
  length: decimal("Länge"),
  height: decimal("Höhe"),
  weight: decimal("Gewicht"),
  tara: decimal("Tara"),
  palletFactor: decimal("Palettenfaktor"),
  packagingGroupId: refId,
  vatRateId: refId,
  customsTariffNumber: text(20, "Die Zolltarifnummer"),
})

export type ArticleInput = z.infer<typeof articleSchema>

export const articleStatusSchema = z.object({
  isActive: z.boolean({ error: "Bitte einen Status angeben." }),
})

/** Validierter Body → Spaltenwerte (snake_case) für `articles`. */
export function articleRow(data: ArticleInput) {
  return {
    article_type_id: data.articleTypeId,
    base_article_number: data.baseArticleNumber,
    base_article_id: data.baseArticleId,
    kennziffer: data.kennziffer,
    name: data.name,
    description: data.description,
    brand_owner_id: data.brandOwnerId,
    season_id: data.seasonId,
    form_design_id: data.formDesignId,
    pack_size_id: data.packSizeId,
    flavor_id: data.flavorId,
    fairtrade: data.fairtrade,
    rainforest: data.rainforest,
    fsc: data.fsc,
    pallet_class_id: data.palletClassId,
    is_mixed: data.isMixed,
    // Anzahl nur bei Mischartikeln (wie im Formular)
    mixed_count: data.isMixed ? data.mixedCount : null,
    gtin_main: data.gtinMain,
    gtin_mixed_1: data.gtinMixed1,
    gtin_mixed_2: data.gtinMixed2,
    carton_ean: data.cartonEan,
    carton_content: data.cartonContent,
    width: data.width,
    length: data.length,
    height: data.height,
    weight: data.weight,
    tara: data.tara,
    pallet_factor: data.palletFactor,
    packaging_group_id: data.packagingGroupId,
    vat_rate_id: data.vatRateId,
    customs_tariff_number: data.customsTariffNumber,
  }
}

// ---- Merkmal-Tabellen -----------------------------------------------------------------------

/** Zod-Schema für Anlegen/Ändern eines Merkmal-Eintrags, aus der Konfiguration gebaut. */
export function merkmalSchema(config: MerkmalConfig) {
  const shape: Record<string, z.ZodType> = {}
  for (const field of config.fields) {
    const label = field.label
    if (field.kind === "text") {
      const base = z
        .string({ error: `Bitte ${label} angeben` })
        .trim()
        .max(field.maxLength ?? 100, `${label} darf höchstens ${field.maxLength ?? 100} Zeichen lang sein`)
      shape[field.key] = field.required
        ? base.min(1, `Bitte ${label} angeben`)
        : base.nullish().transform((v) => (v ? v : null))
    } else if (field.kind === "digit") {
      const base = z
        .number({ error: "Bitte eine einzelne Ziffer von 0 bis 9 angeben" })
        .int("Bitte eine einzelne Ziffer von 0 bis 9 angeben")
        .min(0, "Bitte eine einzelne Ziffer von 0 bis 9 angeben")
        .max(9, "Bitte eine einzelne Ziffer von 0 bis 9 angeben")
      shape[field.key] = field.required ? base : base.nullish().transform((v) => v ?? null)
    } else {
      const max = field.unit === "%" ? 100 : 999_999_999
      const base = z
        .number({ error: `Bitte ${label} als Zahl angeben` })
        .min(0, `${label} darf nicht negativ sein`)
        .max(max, `${label} darf höchstens ${max} sein`)
      shape[field.key] = field.required ? base : base.nullish().transform((v) => v ?? null)
    }
  }
  return z.object(shape).extend({ isActive: z.boolean().optional() })
}

/** Body, der nur den Status ändert (Aktivieren/Deaktivieren). */
export const merkmalStatusSchema = z.object({
  isActive: z.boolean({ error: "Bitte einen Status angeben." }),
})

/** Spaltenwerte (snake_case) eines validierten Merkmal-Bodys. */
export function merkmalRow(config: MerkmalConfig, data: Record<string, unknown>) {
  const row: Record<string, unknown> = {}
  for (const field of config.fields) row[field.column] = data[field.key] ?? null
  return row
}

/** Feld, auf dem ein Duplikat gemeldet wird (Kürzel/Nummer, sonst Bezeichnung). */
export function merkmalUniqueField(config: MerkmalConfig) {
  return config.fields.some((f) => f.key === "code") ? "code" : "name"
}

export function merkmalDuplicateMessage(config: MerkmalConfig) {
  const field = merkmalUniqueField(config)
  const label = config.fields.find((f) => f.key === field)?.label ?? "Eintrag"
  return `${label} ist in diesem Mandanten bereits vergeben.`
}

// ---- Datenbankfehler ------------------------------------------------------------------------

interface DbError {
  code?: string
  message?: string
}

/**
 * Übersetzt Postgres-Fehler in HTTP-Antworten. Meldungen der Trigger (55P03, 23514 aus
 * `articles_before_write`) sind bereits deutsch und werden durchgereicht; native
 * Check-Constraint-Meldungen nicht.
 */
export function dbErrorResponse(
  error: DbError,
  duplicate: { message: string; field?: string }
) {
  switch (error.code) {
    case "23505":
      return jsonError(409, duplicate.message, duplicate.field)
    case "23503":
      return jsonError(400, error.message?.includes("violates") ? FOREIGN_REFERENCE_MESSAGE : (error.message ?? FOREIGN_REFERENCE_MESSAGE))
    case "23514":
      return jsonError(
        400,
        error.message && !error.message.includes("violates check constraint")
          ? error.message
          : INVALID_INPUT_MESSAGE
      )
    case "55P03":
      return jsonError(409, error.message ?? "Der Datensatz ist gesperrt.")
    case "42501":
      return jsonError(403, FORBIDDEN_MESSAGE)
    default:
      return jsonError(500, SERVER_ERROR_MESSAGE)
  }
}
