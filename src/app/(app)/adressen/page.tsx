import type { Metadata } from "next"
import Link from "next/link"
import { Plus } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { AddressFilters } from "@/components/adressen/address-filters"
import { TenantSelector } from "@/components/benutzerverwaltung/tenant-selector"
import { ListPagination } from "@/components/list-pagination"
import { PageHeader } from "@/components/page-header"
import { EmptyState, LoadErrorAlert, NoAccessCard } from "@/components/state-messages"
import { StatusBadge } from "@/components/status-badge"
import { loadAddressOptions, loadCountries, sanitizeSearch } from "@/lib/address-data"
import { ADDRESS_ROLES, addressRoleLabel } from "@/lib/addresses"
import { MASK_ADRESSEN } from "@/lib/masks"
import { getMerkmalConfig, merkmalLabel } from "@/lib/merkmale"
import { getSessionContext } from "@/lib/session-context"
import { createClient as createServerClient } from "@/lib/supabase-server"
import { getAccessLevel, resolveTenant, tenantsWithMask } from "@/lib/tenant-access"

export const metadata: Metadata = { title: "Adressen · Manufaktur-ERP" }

const PAGE_SIZE = 25
const COUNTRY_CONFIG = getMerkmalConfig("laender")!

type SearchParams = Promise<Record<string, string | string[] | undefined>>

interface AddressListRow {
  id: string
  address_number: string
  name: string | null
  name_addition: string | null
  city: string | null
  country_id: string | null
  roles: string[] | null
  parent_address_id: string | null
  is_active: boolean | null
}

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value
}

function pageHref(params: Record<string, string | undefined>, page: number) {
  const qs = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) if (value) qs.set(key, value)
  if (page > 1) qs.set("seite", String(page))
  const text = qs.toString()
  return text ? `/adressen?${text}` : "/adressen"
}

export default async function AdressenPage({ searchParams }: { searchParams: SearchParams }) {
  const [session, params] = await Promise.all([getSessionContext(), searchParams])

  const tenants = tenantsWithMask(session, MASK_ADRESSEN)
  if (tenants.length === 0) {
    return <NoAccessCard description="Du hast in keinem Mandanten Zugriff auf die Adressen." />
  }
  const tenant = resolveTenant(tenants, first(params.mandant))!
  const canWrite = getAccessLevel(session, tenant.id, MASK_ADRESSEN) === "write"

  const q = sanitizeSearch(first(params.q) ?? "")
  const roleParam = first(params.rolle)
  const role = ADDRESS_ROLES.find((r) => r.value === roleParam)?.value
  const land = first(params.land)
  // Standard: nur Aktive; "alle" und "inaktiv" stehen ausdrücklich in der URL.
  const statusParam = first(params.status)
  const status = statusParam === "alle" || statusParam === "inaktiv" ? statusParam : "aktiv"
  const page = Math.max(1, Number.parseInt(first(params.seite) ?? "1", 10) || 1)

  const supabase = await createServerClient()

  let query = supabase
    .from("addresses")
    .select(
      "id, address_number, name, name_addition, city, country_id, roles, parent_address_id, is_active",
      { count: "exact" }
    )
    .eq("tenant_id", tenant.id)
    .order("address_number", { ascending: true })
    .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1)
  // `search_text` ist die gemeinsame, indizierte Suchspalte (Nummer, Name, Zusatz, Kürzel, GLN, Ort, PLZ).
  if (q) query = query.ilike("search_text", `%${q}%`)
  if (role) query = query.contains("roles", [role])
  if (land) query = query.eq("country_id", land)
  if (status === "aktiv") query = query.eq("is_active", true)
  if (status === "inaktiv") query = query.eq("is_active", false)

  const [addressesResult, countriesResult] = await Promise.all([
    query,
    loadCountries(supabase, tenant.id),
  ])

  const addresses = (addressesResult.data ?? []) as unknown as AddressListRow[]
  const parents = await loadAddressOptions(
    supabase,
    tenant.id,
    addresses.map((a) => a.parent_address_id)
  )
  const countryCodes = new Map(
    countriesResult.countries.map((c) => [c.id, String(c.values.code ?? "")])
  )
  const total = addressesResult.count ?? 0
  const hasFilter = Boolean(q || role || land || status !== "aktiv")
  const linkParams = {
    mandant: tenants.length > 1 ? tenant.id : undefined,
    q: q || undefined,
    rolle: role,
    land,
    status: status === "aktiv" ? undefined : status,
  }
  const mandantQuery = `?mandant=${encodeURIComponent(tenant.id)}`
  const noAddressesAtAll = !hasFilter && total === 0

  return (
    <>
      <PageHeader
        title="Adressen"
        description={`Alle Geschäftspartner des Mandanten „${tenant.name}“`}
        actions={
          <>
            {tenants.length > 1 && (
              <TenantSelector tenants={tenants} selectedTenantId={tenant.id} />
            )}
            {canWrite && (
              <Button asChild>
                <Link href={`/adressen/neu${mandantQuery}`}>
                  <Plus className="mr-1 h-4 w-4" aria-hidden="true" />
                  Adresse anlegen
                </Link>
              </Button>
            )}
          </>
        }
      />

      {addressesResult.error ? (
        <LoadErrorAlert />
      ) : (
        <>
          <AddressFilters
            countries={countriesResult.countries
              .filter((c) => c.isActive || c.id === land)
              .map((c) => ({ id: c.id, label: merkmalLabel(COUNTRY_CONFIG, c) }))}
          />

          {addresses.length === 0 ? (
            <EmptyState
              title={noAddressesAtAll ? "Noch keine Adressen angelegt" : "Keine Adressen gefunden"}
              description={
                noAddressesAtAll
                  ? canWrite
                    ? "Lege die erste Adresse an."
                    : "In diesem Mandanten wurden noch keine Adressen angelegt."
                  : "Passe Suche oder Filter an."
              }
              action={
                noAddressesAtAll && canWrite ? (
                  <Button asChild>
                    <Link href={`/adressen/neu${mandantQuery}`}>Adresse anlegen</Link>
                  </Button>
                ) : undefined
              }
            />
          ) : (
            <div className="rounded-lg border bg-card">
              <Table>
                <caption className="sr-only">Adressen im Mandanten {tenant.name}</caption>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs uppercase tracking-wider">Adressnummer</TableHead>
                    <TableHead className="text-xs uppercase tracking-wider">Name</TableHead>
                    <TableHead className="hidden text-xs uppercase tracking-wider md:table-cell">
                      Ort
                    </TableHead>
                    <TableHead className="hidden text-xs uppercase tracking-wider lg:table-cell">
                      Land
                    </TableHead>
                    <TableHead className="hidden text-xs uppercase tracking-wider sm:table-cell">
                      Rollen
                    </TableHead>
                    <TableHead className="hidden text-xs uppercase tracking-wider lg:table-cell">
                      Übergeordnete Adresse
                    </TableHead>
                    <TableHead className="text-xs uppercase tracking-wider">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {addresses.map((address) => {
                    const parent = address.parent_address_id
                      ? parents[address.parent_address_id]
                      : undefined
                    return (
                      <TableRow
                        key={address.id}
                        className={address.is_active === false ? "opacity-70" : ""}
                      >
                        <TableCell className="font-medium tabular-nums">
                          <Link
                            href={`/adressen/${address.id}${mandantQuery}`}
                            className="underline-offset-4 hover:text-primary hover:underline"
                          >
                            {address.address_number}
                          </Link>
                        </TableCell>
                        <TableCell>
                          {address.name || <span className="text-muted-foreground">–</span>}
                          {address.name_addition && (
                            <div className="text-xs text-muted-foreground">
                              {address.name_addition}
                            </div>
                          )}
                        </TableCell>
                        <TableCell className="hidden md:table-cell">
                          {address.city || <span className="text-muted-foreground">–</span>}
                        </TableCell>
                        <TableCell className="hidden lg:table-cell">
                          {(address.country_id && countryCodes.get(address.country_id)) || "–"}
                        </TableCell>
                        <TableCell className="hidden sm:table-cell">
                          <div className="flex flex-wrap gap-1">
                            {(address.roles ?? []).map((r) => (
                              <Badge key={r} variant="outline" className="font-normal">
                                {addressRoleLabel(r)}
                              </Badge>
                            ))}
                          </div>
                        </TableCell>
                        <TableCell className="hidden lg:table-cell">
                          {parent ? (
                            <Link
                              href={`/adressen/${parent.id}${mandantQuery}`}
                              className="underline-offset-4 hover:text-primary hover:underline"
                            >
                              {parent.addressNumber} – {parent.name}
                            </Link>
                          ) : (
                            <span className="text-muted-foreground">–</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <StatusBadge tone={address.is_active === false ? "neutral" : "positive"}>
                            {address.is_active === false ? "Inaktiv" : "Aktiv"}
                          </StatusBadge>
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </div>
          )}

          <ListPagination
            page={page}
            pageSize={PAGE_SIZE}
            total={total}
            noun="Adressen"
            hrefFor={(next) => pageHref(linkParams, next)}
          />
        </>
      )}
    </>
  )
}
