import type { Metadata } from "next"
import { notFound } from "next/navigation"

import { TenantSelector } from "@/components/benutzerverwaltung/tenant-selector"
import { PageHeader } from "@/components/page-header"
import { LoadErrorAlert, NoAccessCard } from "@/components/state-messages"
import { MerkmalManager } from "@/components/warenwirtschaft/merkmal-manager"
import { getMerkmalConfig, rowToMerkmalItem, selectColumns } from "@/lib/merkmale"
import { getSessionContext } from "@/lib/session-context"
import { createClient as createServerClient } from "@/lib/supabase-server"
import { getAccessLevel, resolveTenant, tenantsWithMask } from "@/lib/tenant-access"

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>
}): Promise<Metadata> {
  const config = getMerkmalConfig((await params).slug)
  return { title: `${config?.plural ?? "Merkmale"} · Manufaktur-ERP` }
}

export default async function MerkmalPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>
  searchParams: Promise<{ mandant?: string | string[] }>
}) {
  const [session, { slug }, query] = await Promise.all([getSessionContext(), params, searchParams])

  const config = getMerkmalConfig(slug)
  if (!config) notFound()

  const tenants = tenantsWithMask(session, config.mask)
  if (tenants.length === 0) {
    return <NoAccessCard description={`Du hast in keinem Mandanten Zugriff auf „${config.plural}“.`} />
  }
  const requested = Array.isArray(query.mandant) ? query.mandant[0] : query.mandant
  const tenant = resolveTenant(tenants, requested)!
  const canWrite = getAccessLevel(session, tenant.id, config.mask) === "write"

  const supabase = await createServerClient()
  const { data, error } = await supabase
    .from(config.table)
    .select(selectColumns(config))
    .eq("tenant_id", tenant.id)
    .order(config.sortColumn, { ascending: true })

  const items = ((data ?? []) as unknown as Record<string, unknown>[]).map((row) =>
    rowToMerkmalItem(config, row)
  )

  return (
    <>
      <PageHeader
        title={config.plural}
        description={`Merkmal-Tabelle für den Artikelstamm des Mandanten „${tenant.name}“`}
        actions={
          tenants.length > 1 ? (
            <TenantSelector tenants={tenants} selectedTenantId={tenant.id} />
          ) : undefined
        }
      />
      {error ? (
        <LoadErrorAlert />
      ) : (
        <MerkmalManager
          // Mandanten-/Tabellenwechsel: Dialog- und Filterzustand zurücksetzen
          key={`${tenant.id}:${config.slug}`}
          config={config}
          tenantId={tenant.id}
          tenantName={tenant.name}
          items={items}
          canWrite={canWrite}
        />
      )}
    </>
  )
}
