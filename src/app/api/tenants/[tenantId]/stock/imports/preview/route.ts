import { createClient as createServerClient } from "@/lib/supabase-server"

import { runStockImport } from "../../../../stock-shared"

// POST /api/tenants/:tenantId/stock/imports/preview — Vorschau eines Vollabzugs (multipart, Feld
// `file`). Speichert nichts; Ergebnis = was die Übernahme tun würde.
export async function POST(request: Request, { params }: { params: Promise<{ tenantId: string }> }) {
  const { tenantId } = await params
  return runStockImport(await createServerClient(), request, tenantId, false)
}
