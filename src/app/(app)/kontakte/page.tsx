import type { Metadata } from "next"

import { ContactFilters } from "@/components/adressen/contact-filters"
import { ContactTable, type ContactRow } from "@/components/adressen/contact-table"
import { TenantSelector } from "@/components/benutzerverwaltung/tenant-selector"
import { ListPagination } from "@/components/list-pagination"
import { PageHeader } from "@/components/page-header"
import { EmptyState, LoadErrorAlert, NoAccessCard } from "@/components/state-messages"
import { loadAddressOptions, sanitizeSearch } from "@/lib/address-data"
import { CONTACT_COLUMNS, rowToContact } from "@/lib/contacts"
import { MASK_KONTAKTE } from "@/lib/masks"
import { getSessionContext } from "@/lib/session-context"
import { createClient as createServerClient } from "@/lib/supabase-server"
import { getAccessLevel, resolveTenant, tenantsWithMask } from "@/lib/tenant-access"

export const metadata: Metadata = { title: "Kontakte · Manufaktur-ERP" }

const PAGE_SIZE = 25

type SearchParams = Promise<Record<string, string | string[] | undefined>>

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value
}

function pageHref(params: Record<string, string | undefined>, page: number) {
  const qs = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) if (value) qs.set(key, value)
  if (page > 1) qs.set("seite", String(page))
  const text = qs.toString()
  return text ? `/kontakte?${text}` : "/kontakte"
}

export default async function KontaktePage({ searchParams }: { searchParams: SearchParams }) {
  const [session, params] = await Promise.all([getSessionContext(), searchParams])

  const tenants = tenantsWithMask(session, MASK_KONTAKTE)
  if (tenants.length === 0) {
    return <NoAccessCard description="Du hast in keinem Mandanten Zugriff auf die Kontakte." />
  }
  const tenant = resolveTenant(tenants, first(params.mandant))!
  const canWrite = getAccessLevel(session, tenant.id, MASK_KONTAKTE) === "write"

  const q = sanitizeSearch(first(params.q) ?? "")
  const status = first(params.status)
  const page = Math.max(1, Number.parseInt(first(params.seite) ?? "1", 10) || 1)

  const supabase = await createServerClient()
  let query = supabase
    .from("contacts")
    .select(CONTACT_COLUMNS, { count: "exact" })
    .eq("tenant_id", tenant.id)
    .order("last_name", { ascending: true })
    .order("first_name", { ascending: true })
    .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1)
  if (q) {
    query = query.or(
      [
        "last_name",
        "first_name",
        "function_title",
        "email",
        "phone",
        "mobile",
      ]
        .map((column) => `${column}.ilike.%${q}%`)
        .join(",")
    )
  }
  if (status === "aktiv") query = query.eq("is_active", true)
  if (status === "inaktiv") query = query.eq("is_active", false)

  const contactsResult = await query
  const contacts = ((contactsResult.data ?? []) as unknown as Record<string, unknown>[]).map(
    rowToContact
  )
  const addresses = await loadAddressOptions(
    supabase,
    tenant.id,
    contacts.map((c) => c.addressId)
  )
  const rows: ContactRow[] = contacts.map((contact) => {
    const address = addresses[contact.addressId]
    return {
      contact,
      address: address
        ? { id: address.id, addressNumber: address.addressNumber, name: address.name }
        : null,
    }
  })

  const total = contactsResult.count ?? 0
  const hasFilter = Boolean(q || status)
  const linkParams = {
    mandant: tenants.length > 1 ? tenant.id : undefined,
    q: q || undefined,
    status,
  }

  return (
    <>
      <PageHeader
        title="Kontakte"
        description={`Ansprechpartner aller Adressen des Mandanten „${tenant.name}“`}
        actions={
          tenants.length > 1 ? (
            <TenantSelector tenants={tenants} selectedTenantId={tenant.id} />
          ) : undefined
        }
      />

      {contactsResult.error ? (
        <LoadErrorAlert />
      ) : (
        <>
          <ContactFilters />

          {rows.length === 0 ? (
            <EmptyState
              title={hasFilter ? "Keine Kontakte gefunden" : "Noch keine Kontakte"}
              description={
                hasFilter
                  ? "Passe Suche oder Filter an."
                  : "Kontakte legst du in der jeweiligen Adresse im Reiter „Kontakt“ an."
              }
            />
          ) : (
            <ContactTable
              // Neu aufbauen, wenn Mandant oder Seite wechseln (Dialog-/Statuszustand zurücksetzen)
              key={`${tenant.id}:${page}:${q}:${status ?? ""}`}
              tenantId={tenant.id}
              rows={rows}
              canWrite={canWrite}
            />
          )}

          <ListPagination
            page={page}
            pageSize={PAGE_SIZE}
            total={total}
            noun="Kontakte"
            hrefFor={(next) => pageHref(linkParams, next)}
          />
        </>
      )}
    </>
  )
}
