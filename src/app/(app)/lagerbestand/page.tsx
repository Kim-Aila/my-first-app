import type { Metadata } from "next"

import { ImportLogTable } from "@/components/lager/import-log-table"
import { ImportWizard } from "@/components/lager/import-wizard"
import { PositionTable } from "@/components/lager/position-table"
import { StockFilters } from "@/components/lager/stock-filters"
import { StockTabsNav } from "@/components/lager/stock-tabs-nav"
import { TenantSelector } from "@/components/benutzerverwaltung/tenant-selector"
import { ListPagination } from "@/components/list-pagination"
import { PageHeader } from "@/components/page-header"
import { EmptyState, LoadErrorAlert, NoAccessCard } from "@/components/state-messages"
import { Badge } from "@/components/ui/badge"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { sanitizeSearch } from "@/lib/address-data"
import { MASK_LAGERBESTAND } from "@/lib/masks"
import { getSessionContext } from "@/lib/session-context"
import {
  ARTICLE_STOCK_COLUMNS,
  IMPORT_LOG_COLUMNS,
  POSITION_COLUMNS,
  formatDateTime,
  formatQuantity,
  isStockStatus,
  isStockTab,
  rowToArticleStock,
  rowToImportLog,
  rowToPosition,
  type StockTabId,
} from "@/lib/stock"
import { createClient as createServerClient } from "@/lib/supabase-server"
import { getAccessLevel, resolveTenant, tenantsWithMask } from "@/lib/tenant-access"
import Link from "next/link"

export const metadata: Metadata = { title: "Lagerbestand · Manufaktur-ERP" }

const PAGE_SIZE = 25
const LOG_LIMIT = 20

type SearchParams = Promise<Record<string, string | string[] | undefined>>

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value
}

export default async function LagerbestandPage({ searchParams }: { searchParams: SearchParams }) {
  const [session, params] = await Promise.all([getSessionContext(), searchParams])

  const tenants = tenantsWithMask(session, MASK_LAGERBESTAND)
  if (tenants.length === 0) {
    return <NoAccessCard description="Du hast in keinem Mandanten Zugriff auf den Lagerbestand." />
  }
  const tenant = resolveTenant(tenants, first(params.mandant))!
  const canWrite = getAccessLevel(session, tenant.id, MASK_LAGERBESTAND) === "write"

  // Nutzer mit nur Leserecht bekommen keinen Import-Reiter.
  const tabs: StockTabId[] = canWrite
    ? ["bestand", "lhm", "pruefliste", "import"]
    : ["bestand", "lhm", "pruefliste"]
  const requestedTab = first(params.reiter)
  const tab: StockTabId = isStockTab(requestedTab) && tabs.includes(requestedTab) ? requestedTab : "bestand"

  const q = sanitizeSearch(first(params.q) ?? "")
  const page = Math.max(1, Number.parseInt(first(params.seite) ?? "1", 10) || 1)
  const statusParam = first(params.status)
  const status = isStockStatus(statusParam) ? statusParam : undefined
  const onlyUnknown = first(params.unbekannt) === "1"
  const onlyMixed = first(params.mischpalette) === "1"

  const supabase = await createServerClient()

  // Kopfdaten: Gesamtzahl der Positionen (Leerzustand), offene Prüfungen (Zähler), letzter Import.
  const [totalResult, reviewResult, lastImportResult] = await Promise.all([
    supabase.from("stock_positions").select("id", { count: "exact", head: true }).eq("tenant_id", tenant.id),
    supabase
      .from("stock_positions")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", tenant.id)
      .eq("status", "missing_unchecked"),
    supabase
      .from("stock_imports")
      .select("created_at, user_name")
      .eq("tenant_id", tenant.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ])

  const headerFailed = Boolean(totalResult.error || reviewResult.error)
  const totalPositions = totalResult.count ?? 0
  const reviewCount = reviewResult.count ?? 0
  const lastImport = lastImportResult.data as { created_at: string; user_name: string | null } | null
  const mandantQuery = `?mandant=${encodeURIComponent(tenant.id)}`

  function pageHref(next: number) {
    const qs = new URLSearchParams()
    if (tenants.length > 1) qs.set("mandant", tenant.id)
    if (tab !== "bestand") qs.set("reiter", tab)
    if (q) qs.set("q", q)
    if (status) qs.set("status", status)
    if (onlyUnknown) qs.set("unbekannt", "1")
    if (onlyMixed) qs.set("mischpalette", "1")
    if (next > 1) qs.set("seite", String(next))
    const text = qs.toString()
    return text ? `/lagerbestand?${text}` : "/lagerbestand"
  }

  const range: [number, number] = [(page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1]
  const description = lastImport
    ? `Letzter Import: ${formatDateTime(lastImport.created_at)}${lastImport.user_name ? `, ${lastImport.user_name}` : ""} · Mandant „${tenant.name}“`
    : `Lagerbestand des Mandanten „${tenant.name}“`

  let content: React.ReactNode = null

  if (headerFailed) {
    content = <LoadErrorAlert />
  } else if (tab === "import") {
    const logResult = await supabase
      .from("stock_imports")
      .select(IMPORT_LOG_COLUMNS)
      .eq("tenant_id", tenant.id)
      .order("created_at", { ascending: false })
      .limit(LOG_LIMIT)
    const log = ((logResult.data ?? []) as unknown as Record<string, unknown>[]).map(rowToImportLog)
    content = (
      <div className="space-y-8">
        <ImportWizard tenantId={tenant.id} />
        <section aria-labelledby="import-log-heading" className="space-y-3">
          <h2 id="import-log-heading" className="font-display text-lg font-medium">
            Import-Protokoll
          </h2>
          {logResult.error ? (
            <LoadErrorAlert title="Protokoll konnte nicht geladen werden" />
          ) : log.length === 0 ? (
            <EmptyState title="Noch kein Import durchgeführt" />
          ) : (
            <ImportLogTable rows={log} />
          )}
        </section>
      </div>
    )
  } else if (totalPositions === 0) {
    content = (
      <EmptyState
        title="Noch kein Lagerbestand vorhanden"
        description={
          canWrite
            ? "Importiere den ersten Vollabzug des Lagersystems, um den Bestand zu füllen."
            : "Sobald ein Vollabzug des Lagersystems importiert wurde, erscheint der Bestand hier."
        }
        action={
          canWrite ? (
            <Link
              href={`/lagerbestand${mandantQuery}&reiter=import`}
              className="inline-flex h-9 items-center rounded-xl bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90"
            >
              Zum Import
            </Link>
          ) : undefined
        }
      />
    )
  } else if (tab === "bestand") {
    let query = supabase
      .from("stock_by_article")
      .select(ARTICLE_STOCK_COLUMNS, { count: "exact" })
      .eq("tenant_id", tenant.id)
      .order("article_number", { ascending: true })
      .range(...range)
    if (q) query = query.or(`article_number.ilike.%${q}%,article_name.ilike.%${q}%`)
    if (onlyUnknown) query = query.is("article_id", null)
    const result = await query
    const rows = ((result.data ?? []) as unknown as Record<string, unknown>[]).map(rowToArticleStock)
    content = (
      <>
        <StockFilters kind="article" />
        {result.error ? (
          <LoadErrorAlert />
        ) : rows.length === 0 ? (
          <EmptyState title="Keine Artikel gefunden" description="Passe Suche oder Filter an." />
        ) : (
          <div className="rounded-lg border bg-card">
            <Table>
              <caption className="sr-only">Lagerbestand je Artikel im Mandanten {tenant.name}</caption>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs uppercase tracking-wider">Artikelnummer</TableHead>
                  <TableHead className="text-xs uppercase tracking-wider">Bezeichnung</TableHead>
                  <TableHead className="text-right text-xs uppercase tracking-wider">Bestand</TableHead>
                  <TableHead className="hidden text-right text-xs uppercase tracking-wider md:table-cell">
                    Gesperrt QS
                  </TableHead>
                  <TableHead className="hidden text-right text-xs uppercase tracking-wider md:table-cell">
                    Gesperrt
                  </TableHead>
                  <TableHead className="hidden text-right text-xs uppercase tracking-wider lg:table-cell">
                    Gesperrt gesamt
                  </TableHead>
                  <TableHead className="text-right text-xs uppercase tracking-wider">Verfügbar</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => (
                  <TableRow key={row.articleNumber}>
                    <TableCell className="font-medium tabular-nums">
                      {row.articleId ? (
                        <Link
                          href={`/artikelstamm/${row.articleId}${mandantQuery}`}
                          className="underline-offset-4 hover:text-primary hover:underline"
                        >
                          {row.articleNumber}
                        </Link>
                      ) : (
                        row.articleNumber
                      )}
                    </TableCell>
                    <TableCell>
                      {row.articleName ?? (
                        <Badge variant="outline" className="border-[#9A3412]/40 font-normal text-[#9A3412]">
                          Nicht im Stamm
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{formatQuantity(row.stock)}</TableCell>
                    <TableCell className="hidden text-right tabular-nums md:table-cell">
                      {formatQuantity(row.qsBlocked)}
                    </TableCell>
                    <TableCell className="hidden text-right tabular-nums md:table-cell">
                      {formatQuantity(row.blocked)}
                    </TableCell>
                    <TableCell className="hidden text-right tabular-nums lg:table-cell">
                      {formatQuantity(row.blockedTotal)}
                    </TableCell>
                    <TableCell className="text-right font-medium tabular-nums">
                      {formatQuantity(row.available)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
        <ListPagination page={page} pageSize={PAGE_SIZE} total={result.count ?? 0} noun="Artikel" hrefFor={pageHref} />
      </>
    )
  } else {
    // LHM-Liste und Prüfliste lesen dieselbe Sicht; die Prüfliste ist fest auf "Fehlt, ungeprüft" gefiltert.
    const isReview = tab === "pruefliste"
    let query = supabase
      .from("stock_position_list")
      .select(POSITION_COLUMNS, { count: "exact" })
      .eq("tenant_id", tenant.id)
      .range(...range)
    if (isReview) {
      query = query.eq("status", "missing_unchecked").order("last_seen_at", { ascending: false })
    } else {
      query = query.order("sscc", { ascending: true }).order("article_number", { ascending: true })
      if (status) query = query.eq("status", status)
      if (onlyMixed) query = query.eq("is_mixed_pallet", true)
      if (q) query = query.or(`sscc.ilike.%${q}%,article_number.ilike.%${q}%`)
    }
    const result = await query
    const rows = ((result.data ?? []) as unknown as Record<string, unknown>[]).map(rowToPosition)
    content = (
      <>
        {!isReview && <StockFilters kind="lhm" />}
        {isReview && (
          <p className="mb-4 text-sm text-muted-foreground">
            Positionen, die im letzten Vollabzug fehlten. Prüfe sie und kennzeichne sie als „geprüft i.O.“
            oder buche sie als versendet.
          </p>
        )}
        {result.error ? (
          <LoadErrorAlert />
        ) : rows.length === 0 ? (
          <EmptyState
            title={isReview ? "Nichts zu prüfen" : "Keine LHM gefunden"}
            description={isReview ? "Alle fehlenden Positionen sind abgearbeitet." : "Passe Suche oder Filter an."}
          />
        ) : (
          <PositionTable
            tenantId={tenant.id}
            rows={rows}
            canWrite={canWrite}
            variant={isReview ? "review" : "list"}
            caption={isReview ? "Fehlende, ungeprüfte LHM-Positionen" : "LHM-Positionen"}
          />
        )}
        <ListPagination page={page} pageSize={PAGE_SIZE} total={result.count ?? 0} noun="Positionen" hrefFor={pageHref} />
      </>
    )
  }

  return (
    <>
      <PageHeader
        title="Lagerbestand"
        description={description}
        actions={tenants.length > 1 ? <TenantSelector tenants={tenants} selectedTenantId={tenant.id} /> : undefined}
      />
      <StockTabsNav active={tab} tabs={tabs} reviewCount={reviewCount} />
      {content}
    </>
  )
}
