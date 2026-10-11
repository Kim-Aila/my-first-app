// Gemeinsame Schemas und Import-Ablauf der PROJ-5-Routen (Lagerbestand).
import { NextResponse } from "next/server"
import type { SupabaseClient } from "@supabase/supabase-js"
import { z } from "zod"

import { invalidIdResponse, jsonError, requireMaskAccess } from "@/lib/api-auth"
import { MASK_LAGERBESTAND } from "@/lib/masks"
import { IMPORT_MAX_BYTES, POSITION_ACTION_CONFLICT_MESSAGE, type ImportOutcome } from "@/lib/stock"
import { parseStockFile } from "@/lib/stock-import"

import { dbErrorResponse } from "./warenwirtschaft-shared"

export const STOCK_POSITION_NOT_FOUND_MESSAGE = "Position nicht gefunden."
export const IMPORT_FILE_MISSING_MESSAGE = "Bitte eine CSV-Datei auswählen."
export const IMPORT_FILE_TOO_LARGE_MESSAGE = `Die Datei ist zu groß (höchstens ${IMPORT_MAX_BYTES / 1024 / 1024} MB).`
const IMPORT_DUPLICATE_MESSAGE = "Die Datei enthält doppelte Positionen."

export { POSITION_ACTION_CONFLICT_MESSAGE }

const STATUS_VALUES = ["in_stock", "missing_unchecked", "missing_checked", "shipped"] as const

export const checkPositionSchema = z.object({
  expectedStatus: z.enum(STATUS_VALUES, { error: "Ungültiger Status." }),
  remark: z
    .string({ error: "Die Bemerkung ist ungültig." })
    .trim()
    .max(500, "Die Bemerkung darf höchstens 500 Zeichen lang sein")
    .nullish()
    .transform((v) => (v ? v : null)),
})

export const shipPositionSchema = z.object({
  expectedStatus: z.enum(STATUS_VALUES, { error: "Ungültiger Status." }),
})

interface FileLike {
  name: string
  size: number
  arrayBuffer: () => Promise<ArrayBuffer>
}

function isFileLike(value: unknown): value is FileLike {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as FileLike).arrayBuffer === "function" &&
    typeof (value as FileLike).size === "number"
  )
}

/**
 * Vorschau (`commit = false`) und Übernahme (`commit = true`) teilen sich Dateiprüfung und
 * Datenbankfunktion `stock_import`; die Vorschau speichert nichts.
 */
export async function runStockImport(
  supabase: SupabaseClient,
  request: Request,
  tenantId: string,
  commit: boolean
) {
  const invalid = invalidIdResponse(tenantId)
  if (invalid) return invalid

  const auth = await requireMaskAccess(supabase, tenantId, MASK_LAGERBESTAND, "write")
  if (!auth.ok) return auth.response

  const form = await request.formData().catch(() => null)
  const file = form?.get("file")
  if (!isFileLike(file) || file.size === 0) return jsonError(400, IMPORT_FILE_MISSING_MESSAGE, "file")
  if (file.size > IMPORT_MAX_BYTES) return jsonError(413, IMPORT_FILE_TOO_LARGE_MESSAGE, "file")

  const parsed = parseStockFile(new Uint8Array(await file.arrayBuffer()))
  if (!parsed.ok) return jsonError(400, parsed.error, "file")

  const { data, error } = await supabase.rpc("stock_import", {
    p_tenant_id: tenantId,
    p_file_name: file.name || "Bestand.csv",
    p_record_count: parsed.recordCount,
    p_records: parsed.records,
    p_excluded: parsed.excluded,
    p_skipped: parsed.skipped,
    p_errors: parsed.errors,
    p_commit: commit,
  })
  if (error) return dbErrorResponse(error, { message: IMPORT_DUPLICATE_MESSAGE })

  return NextResponse.json(data as ImportOutcome, { status: commit ? 201 : 200 })
}

/** 'ok' | 'conflict' | 'not_found' der Funktionen `stock_check_position` / `stock_ship_position`. */
export function positionActionResponse(result: unknown, id: string, status: string) {
  if (result === "ok") return NextResponse.json({ id, status })
  if (result === "conflict") return jsonError(409, POSITION_ACTION_CONFLICT_MESSAGE)
  return jsonError(404, STOCK_POSITION_NOT_FOUND_MESSAGE)
}
