import type { Metadata } from "next"

import { PageHeader } from "@/components/page-header"
import { LoadErrorAlert, NoAccessCard } from "@/components/state-messages"
import { ArticleForm } from "@/components/warenwirtschaft/article-form"
import { loadReferences } from "@/lib/article-data"
import { MASK_ARTIKELSTAMM } from "@/lib/masks"
import { getSessionContext } from "@/lib/session-context"
import { createClient as createServerClient } from "@/lib/supabase-server"
import {
  getAccessLevel,
  maintenanceAccessFor,
  resolveTenant,
  tenantsWithMask,
} from "@/lib/tenant-access"

export const metadata: Metadata = { title: "Neuer Artikel · Manufaktur-ERP" }

export default async function NeuerArtikelPage({
  searchParams,
}: {
  searchParams: Promise<{ mandant?: string | string[] }>
}) {
  const [session, params] = await Promise.all([getSessionContext(), searchParams])

  // Anlegen braucht Schreibrecht: nur Mandanten mit Stufe "write" kommen infrage.
  const tenants = tenantsWithMask(session, MASK_ARTIKELSTAMM).filter(
    (t) => getAccessLevel(session, t.id, MASK_ARTIKELSTAMM) === "write"
  )
  if (tenants.length === 0) {
    return <NoAccessCard description="Dir fehlt das Recht, Artikel anzulegen." />
  }
  const requested = Array.isArray(params.mandant) ? params.mandant[0] : params.mandant
  const tenant = resolveTenant(tenants, requested)!

  const supabase = await createServerClient()
  const { references, failed } = await loadReferences(supabase, tenant.id)

  if (failed) {
    return (
      <>
        <PageHeader title="Neuer Artikel" />
        <LoadErrorAlert />
      </>
    )
  }

  return (
    <ArticleForm
      tenantId={tenant.id}
      article={null}
      references={references}
      maintenanceAccess={maintenanceAccessFor(session, tenant.id)}
      canWrite
      lockedBy={null}
    />
  )
}
