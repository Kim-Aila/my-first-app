import type { Metadata } from "next"
import Link from "next/link"
import { Plus } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { TenantSelector } from "@/components/benutzerverwaltung/tenant-selector"
import { PageHeader } from "@/components/page-header"
import { EmptyState, LoadErrorAlert, NoAccessCard } from "@/components/state-messages"
import { StatusBadge } from "@/components/status-badge"
import { ArticleFilters } from "@/components/warenwirtschaft/article-filters"
import { MASK_ARTIKELSTAMM } from "@/lib/masks"
import { MERKMALE, merkmalLabel, rowToMerkmalItem, selectColumns } from "@/lib/merkmale"
import { getSessionContext } from "@/lib/session-context"
import { createClient as createServerClient } from "@/lib/supabase-server"
import { getAccessLevel, resolveTenant, tenantsWithMask } from "@/lib/tenant-access"

export const metadata: Metadata = { title: "Artikelstamm · Manufaktur-ERP" }

const PAGE_SIZE = 25

type SearchParams = Promise<Record<string, string | string[] | undefined>>

interface ArticleListRow {
  id: string
  article_number: string
  name: string | null
  commodity_group: string | null
  is_active: boolean | null
  article_type_id: string | null
}

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value
}

/** Entfernt Zeichen, die in einem PostgREST-`or`-Filter die Syntax brechen würden. */
function sanitizeSearch(value: string) {
  return value.replace(/[%_*,()"\\]/g, " ").replace(/\s+/g, " ").trim().slice(0, 100)
}

function pageHref(params: Record<string, string | undefined>, page: number) {
  const qs = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) if (value) qs.set(key, value)
  if (page > 1) qs.set("seite", String(page))
  const text = qs.toString()
  return text ? `/artikelstamm?${text}` : "/artikelstamm"
}

export default async function ArtikelstammPage({ searchParams }: { searchParams: SearchParams }) {
  const [session, params] = await Promise.all([getSessionContext(), searchParams])

  const tenants = tenantsWithMask(session, MASK_ARTIKELSTAMM)
  if (tenants.length === 0) {
    return <NoAccessCard description="Du hast in keinem Mandanten Zugriff auf den Artikelstamm." />
  }
  const tenant = resolveTenant(tenants, first(params.mandant))!
  const canWrite = getAccessLevel(session, tenant.id, MASK_ARTIKELSTAMM) === "write"

  const q = sanitizeSearch(first(params.q) ?? "")
  const typ = first(params.typ)
  const status = first(params.status)
  const page = Math.max(1, Number.parseInt(first(params.seite) ?? "1", 10) || 1)

  const supabase = await createServerClient()
  const typeConfig = MERKMALE.find((m) => m.slug === "artikeltypen")!

  let query = supabase
    .from("articles")
    .select("id, article_number, name, commodity_group, is_active, article_type_id", {
      count: "exact",
    })
    .eq("tenant_id", tenant.id)
    .order("article_number", { ascending: true })
    .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1)
  if (q) query = query.or(`article_number.ilike.%${q}%,name.ilike.%${q}%,match_code.ilike.%${q}%`)
  if (typ) query = query.eq("article_type_id", typ)
  if (status === "aktiv") query = query.eq("is_active", true)
  if (status === "inaktiv") query = query.eq("is_active", false)

  const [articlesResult, typesResult] = await Promise.all([
    query,
    supabase
      .from(typeConfig.table)
      .select(selectColumns(typeConfig))
      .eq("tenant_id", tenant.id)
      .order(typeConfig.sortColumn, { ascending: true }),
  ])

  const types = ((typesResult.data ?? []) as unknown as Record<string, unknown>[]).map((row) =>
    rowToMerkmalItem(typeConfig, row)
  )
  const typeLabels = new Map(types.map((t) => [t.id, merkmalLabel(typeConfig, t)]))
  const articles = (articlesResult.data ?? []) as unknown as ArticleListRow[]
  const total = articlesResult.count ?? 0
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const hasFilter = Boolean(q || typ || status)
  const linkParams = {
    mandant: tenants.length > 1 ? tenant.id : undefined,
    q: q || undefined,
    typ,
    status,
  }
  const mandantQuery = `?mandant=${encodeURIComponent(tenant.id)}`

  return (
    <>
      <PageHeader
        title="Artikelstamm"
        description={`Alle Artikel des Mandanten „${tenant.name}“`}
        actions={
          <>
            {tenants.length > 1 && (
              <TenantSelector tenants={tenants} selectedTenantId={tenant.id} />
            )}
            {canWrite && (
              <Button asChild>
                <Link href={`/artikelstamm/neu${mandantQuery}`}>
                  <Plus className="mr-1 h-4 w-4" aria-hidden="true" />
                  Neuer Artikel
                </Link>
              </Button>
            )}
          </>
        }
      />

      {articlesResult.error ? (
        <LoadErrorAlert />
      ) : (
        <>
          <ArticleFilters
            articleTypes={types
              .filter((t) => t.isActive || t.id === typ)
              .map((t) => ({ id: t.id, label: merkmalLabel(typeConfig, t) }))}
          />

          {articles.length === 0 ? (
            <EmptyState
              title={hasFilter ? "Keine Artikel gefunden" : "Noch keine Artikel"}
              description={
                hasFilter
                  ? "Passe Suche oder Filter an."
                  : canWrite
                    ? "Lege den ersten Artikel an."
                    : "In diesem Mandanten wurden noch keine Artikel angelegt."
              }
              action={
                !hasFilter && canWrite ? (
                  <Button asChild>
                    <Link href={`/artikelstamm/neu${mandantQuery}`}>Neuer Artikel</Link>
                  </Button>
                ) : undefined
              }
            />
          ) : (
            <div className="rounded-lg border bg-card">
              <Table>
                <caption className="sr-only">Artikel im Mandanten {tenant.name}</caption>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs uppercase tracking-wider">Artikelnummer</TableHead>
                    <TableHead className="text-xs uppercase tracking-wider">Bezeichnung</TableHead>
                    <TableHead className="hidden text-xs uppercase tracking-wider md:table-cell">
                      Artikeltyp
                    </TableHead>
                    <TableHead className="hidden text-xs uppercase tracking-wider sm:table-cell">
                      Warengruppe
                    </TableHead>
                    <TableHead className="text-xs uppercase tracking-wider">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {articles.map((article) => (
                    <TableRow key={article.id}>
                      <TableCell className="font-medium tabular-nums">
                        <Link
                          href={`/artikelstamm/${article.id}${mandantQuery}`}
                          className="underline-offset-4 hover:text-primary hover:underline"
                        >
                          {article.article_number}
                        </Link>
                      </TableCell>
                      <TableCell>
                        {article.name || <span className="text-muted-foreground">–</span>}
                      </TableCell>
                      <TableCell className="hidden md:table-cell">
                        {(article.article_type_id && typeLabels.get(article.article_type_id)) || "–"}
                      </TableCell>
                      <TableCell className="hidden tabular-nums sm:table-cell">
                        {article.commodity_group || "–"}
                      </TableCell>
                      <TableCell>
                        <StatusBadge tone={article.is_active === false ? "neutral" : "positive"}>
                          {article.is_active === false ? "Inaktiv" : "Aktiv"}
                        </StatusBadge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}

          {total > PAGE_SIZE && (
            <nav
              aria-label="Seitenwechsel"
              className="mt-4 flex items-center justify-between gap-3 text-sm"
            >
              <p className="text-muted-foreground">
                Seite {page} von {pageCount} · {total} Artikel
              </p>
              <div className="flex gap-2">
                <Button asChild variant="outline" size="sm" disabled={page <= 1}>
                  {page <= 1 ? (
                    <span aria-disabled="true">Zurück</span>
                  ) : (
                    <Link href={pageHref(linkParams, page - 1)} rel="prev">
                      Zurück
                    </Link>
                  )}
                </Button>
                <Button asChild variant="outline" size="sm" disabled={page >= pageCount}>
                  {page >= pageCount ? (
                    <span aria-disabled="true">Weiter</span>
                  ) : (
                    <Link href={pageHref(linkParams, page + 1)} rel="next">
                      Weiter
                    </Link>
                  )}
                </Button>
              </div>
            </nav>
          )}
        </>
      )}
    </>
  )
}
