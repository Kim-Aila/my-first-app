// Server-seitige Ladefunktionen für Adress-Seiten (nur aus Server Components verwenden).
// Die Tabellen (`addresses`, `contacts`, `countries`) legt /backend an; bis dahin schlagen die
// Abfragen fehl und die Seiten zeigen den Fehlerzustand bzw. lassen optionale Teile weg.
import type { SupabaseClient } from "@supabase/supabase-js"

import {
  ADDRESS_OPTION_COLUMNS,
  rowToAddressOption,
  type AddressOption,
} from "@/lib/addresses"
import type { LockHolder } from "@/lib/edit-lock"
import { getMerkmalConfig, rowToMerkmalItem, selectColumns, type MerkmalItem } from "@/lib/merkmale"

/** Alle Länder des Mandanten (aktive und inaktive). */
export async function loadCountries(
  supabase: SupabaseClient,
  tenantId: string
): Promise<{ countries: MerkmalItem[]; failed: boolean }> {
  const config = getMerkmalConfig("laender")!
  const { data, error } = await supabase
    .from(config.table)
    .select(selectColumns(config))
    .eq("tenant_id", tenantId)
    .order(config.sortColumn, { ascending: true })
  return {
    countries: ((data ?? []) as unknown as Record<string, unknown>[]).map((row) =>
      rowToMerkmalItem(config, row)
    ),
    failed: Boolean(error),
  }
}

/** Kurzdaten der angegebenen Adressen (best effort: Fehler → leere Zuordnung). */
export async function loadAddressOptions(
  supabase: SupabaseClient,
  tenantId: string,
  ids: (string | null | undefined)[]
): Promise<Record<string, AddressOption>> {
  const unique = [...new Set(ids.filter((id): id is string => Boolean(id)))]
  if (unique.length === 0) return {}
  try {
    const { data, error } = await supabase
      .from("addresses")
      .select(ADDRESS_OPTION_COLUMNS)
      .eq("tenant_id", tenantId)
      .in("id", unique)
    if (error) return {}
    const options = ((data ?? []) as unknown as Record<string, unknown>[]).map(rowToAddressOption)
    return Object.fromEntries(options.map((o) => [o.id, o]))
  } catch {
    return {}
  }
}

/** Direkt untergeordnete Adressen (sortiert nach Adressnummer). */
export async function loadChildAddresses(
  supabase: SupabaseClient,
  tenantId: string,
  parentId: string
): Promise<{ children: AddressOption[]; failed: boolean }> {
  const { data, error } = await supabase
    .from("addresses")
    .select(ADDRESS_OPTION_COLUMNS)
    .eq("tenant_id", tenantId)
    .eq("parent_address_id", parentId)
    .order("address_number", { ascending: true })
  return {
    children: ((data ?? []) as unknown as Record<string, unknown>[]).map(rowToAddressOption),
    failed: Boolean(error),
  }
}

interface LockRow {
  out_user_id: string
  out_username: string
  out_expires_at: string
}

/**
 * Gültige Sperre eines ANDEREN Nutzers auf dem Datensatz (best effort, Fehler → keine Sperre).
 * Läuft über die SQL-Funktion `get_edit_lock` (siehe `loadForeignArticleLock`).
 */
export async function loadForeignLock(
  supabase: SupabaseClient,
  tenantId: string,
  resourceType: string,
  resourceId: string,
  currentUserId: string
): Promise<LockHolder | null> {
  try {
    const { data, error } = await supabase.rpc("get_edit_lock", {
      p_tenant_id: tenantId,
      p_resource_type: resourceType,
      p_resource_id: resourceId,
    })
    const row = ((data ?? []) as LockRow[])[0]
    if (error || !row || row.out_user_id === currentUserId) return null
    return { username: row.out_username, expiresAt: row.out_expires_at }
  } catch {
    return null
  }
}

/** Entfernt Zeichen, die in einem PostgREST-`or`-Filter die Syntax brechen würden. */
export function sanitizeSearch(value: string) {
  return value.replace(/[%_*,()"\\]/g, " ").replace(/\s+/g, " ").trim().slice(0, 100)
}
