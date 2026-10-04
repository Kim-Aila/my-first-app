import type { Metadata } from "next"
import Link from "next/link"

import { Button } from "@/components/ui/button"
import { PageHeader } from "@/components/page-header"
import { EmptyState, LoadErrorAlert, NoAccessCard } from "@/components/state-messages"
import { ArticleForm } from "@/components/warenwirtschaft/article-form"
import { loadForeignArticleLock, loadReferences } from "@/lib/article-data"
import { ARTICLE_COLUMNS, rowToArticle } from "@/lib/articles"
import { MASK_ARTIKELSTAMM } from "@/lib/masks"
import { getSessionContext } from "@/lib/session-context"
import { createClient as createServerClient } from "@/lib/supabase-server"
import {
  getAccessLevel,
  maintenanceAccessFor,
  resolveTenant,
  tenantsWithMask,
} from "@/lib/tenant-access"

export const metadata: Metadata = { title: "Artikel · Manufaktur-ERP" }

export default async function ArtikelDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ articleId: string }>
  searchParams: Promise<{ mandant?: string | string[] }>
}) {
  const [session, { articleId }, query] = await Promise.all([
    getSessionContext(),
    params,
    searchParams,
  ])

  const tenants = tenantsWithMask(session, MASK_ARTIKELSTAMM)
  if (tenants.length === 0) {
    return <NoAccessCard description="Du hast in keinem Mandanten Zugriff auf den Artikelstamm." />
  }
  const requested = Array.isArray(query.mandant) ? query.mandant[0] : query.mandant
  const tenant = resolveTenant(tenants, requested)!
  const canWrite = getAccessLevel(session, tenant.id, MASK_ARTIKELSTAMM) === "write"

  const supabase = await createServerClient()
  const [articleResult, referenceResult, lockedBy] = await Promise.all([
    supabase
      .from("articles")
      .select(ARTICLE_COLUMNS)
      .eq("tenant_id", tenant.id)
      .eq("id", articleId)
      .maybeSingle(),
    loadReferences(supabase, tenant.id),
    loadForeignArticleLock(supabase, tenant.id, articleId, session.userId),
  ])

  if (articleResult.error || referenceResult.failed) {
    return (
      <>
        <PageHeader title="Artikel" />
        <LoadErrorAlert />
      </>
    )
  }

  if (!articleResult.data) {
    return (
      <>
        <PageHeader title="Artikel" />
        <EmptyState
          title="Artikel nicht gefunden"
          description="Der Artikel existiert nicht in diesem Mandanten oder du hast keinen Zugriff darauf."
          action={
            <Button asChild variant="outline">
              <Link href={`/artikelstamm?mandant=${encodeURIComponent(tenant.id)}`}>
                Zur Artikelliste
              </Link>
            </Button>
          }
        />
      </>
    )
  }

  const article = rowToArticle(articleResult.data as unknown as Record<string, unknown>)

  return (
    <ArticleForm
      // Nach dem Speichern liefert der Server einen neuen Stand → Formular frisch aufbauen.
      key={`${article.id}:${article.updatedAt ?? ""}`}
      tenantId={tenant.id}
      article={article}
      references={referenceResult.references}
      maintenanceAccess={maintenanceAccessFor(session, tenant.id)}
      canWrite={canWrite}
      lockedBy={lockedBy}
    />
  )
}
