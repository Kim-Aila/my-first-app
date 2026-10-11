import { createClient as createServerClient } from "@/lib/supabase-server"

import { runStockImport } from "../../../stock-shared"

// POST /api/tenants/:tenantId/stock/imports — Vollabzug übernehmen (multipart, Feld `file`).
// Die Datei wird serverseitig neu geprüft und verglichen; die Übernahme ist eine einzige
// Transaktion. Läuft für den Mandanten schon ein Import, antwortet die Route mit 409.
export async function POST(request: Request, { params }: { params: Promise<{ tenantId: string }> }) {
  const { tenantId } = await params
  return runStockImport(await createServerClient(), request, tenantId, true)
}
