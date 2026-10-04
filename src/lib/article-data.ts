// Server-seitige Ladefunktionen für Artikelstamm-Seiten (nur aus Server Components verwenden).
// Die Tabellen (`articles`, 9 Merkmal-Tabellen, `edit_locks`) legt /backend an; bis dahin
// schlagen die Abfragen fehl und die Seiten zeigen den Fehlerzustand.
import type { SupabaseClient } from "@supabase/supabase-js"

import type { ReferenceData } from "@/components/warenwirtschaft/types"
import { ARTICLE_LOCK_RESOURCE } from "@/lib/articles"
import type { LockHolder } from "@/lib/edit-lock"
import { MERKMALE, rowToMerkmalItem, selectColumns } from "@/lib/merkmale"

/** Alle Merkmal-Einträge des Mandanten (aktive und inaktive), je Verweisfeld des Artikels. */
export async function loadReferences(
  supabase: SupabaseClient,
  tenantId: string
): Promise<{ references: ReferenceData; failed: boolean }> {
  const results = await Promise.all(
    MERKMALE.map((config) =>
      supabase
        .from(config.table)
        .select(selectColumns(config))
        .eq("tenant_id", tenantId)
        .order(config.sortColumn, { ascending: true })
    )
  )

  const references: ReferenceData = {}
  let failed = false
  MERKMALE.forEach((config, index) => {
    const { data, error } = results[index]
    if (error) failed = true
    references[config.articleKey] = ((data ?? []) as unknown as Record<string, unknown>[]).map(
      (row) => rowToMerkmalItem(config, row)
    )
  })
  return { references, failed }
}

interface LockRow {
  out_user_id: string
  out_username: string
  out_expires_at: string
}

/**
 * Gültige Sperre eines ANDEREN Nutzers auf dem Artikel (best effort, Fehler → keine Sperre).
 * Läuft über die SQL-Funktion `get_edit_lock`: Sie nennt auch den Namen, obwohl normale User die
 * Profile anderer nicht lesen dürfen; `edit_locks` selbst ist für Clients geschlossen.
 */
export async function loadForeignArticleLock(
  supabase: SupabaseClient,
  tenantId: string,
  articleId: string,
  currentUserId: string
): Promise<LockHolder | null> {
  try {
    const { data, error } = await supabase.rpc("get_edit_lock", {
      p_tenant_id: tenantId,
      p_resource_type: ARTICLE_LOCK_RESOURCE,
      p_resource_id: articleId,
    })
    const row = ((data ?? []) as LockRow[])[0]
    if (error || !row || row.out_user_id === currentUserId) return null
    return { username: row.out_username, expiresAt: row.out_expires_at }
  } catch {
    return null
  }
}
