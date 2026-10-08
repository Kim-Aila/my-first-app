import type { Metadata } from "next"
import Link from "next/link"

import { Button } from "@/components/ui/button"
import { AddressForm } from "@/components/adressen/address-form"
import { PageHeader } from "@/components/page-header"
import { EmptyState, LoadErrorAlert, NoAccessCard } from "@/components/state-messages"
import {
  loadAddressOptions,
  loadChildAddresses,
  loadCountries,
  loadForeignLock,
} from "@/lib/address-data"
import { ADDRESS_COLUMNS, ADDRESS_LOCK_RESOURCE, rowToAddress } from "@/lib/addresses"
import { MASK_ADRESSEN, MASK_KONTAKTE, MASK_MERKMAL_LAENDER } from "@/lib/masks"
import { getSessionContext } from "@/lib/session-context"
import { createClient as createServerClient } from "@/lib/supabase-server"
import {
  canToggleActive,
  getAccessLevel,
  resolveTenant,
  tenantsWithMask,
} from "@/lib/tenant-access"

export const metadata: Metadata = { title: "Adresse · Manufaktur-ERP" }

export default async function AdresseDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ addressId: string }>
  searchParams: Promise<{ mandant?: string | string[] }>
}) {
  const [session, { addressId }, query] = await Promise.all([
    getSessionContext(),
    params,
    searchParams,
  ])

  const tenants = tenantsWithMask(session, MASK_ADRESSEN)
  if (tenants.length === 0) {
    return <NoAccessCard description="Du hast in keinem Mandanten Zugriff auf die Adressen." />
  }
  const requested = Array.isArray(query.mandant) ? query.mandant[0] : query.mandant
  const tenant = resolveTenant(tenants, requested)!
  const canWrite = getAccessLevel(session, tenant.id, MASK_ADRESSEN) === "write"

  const supabase = await createServerClient()
  const [addressResult, countriesResult, childrenResult, lockedBy] = await Promise.all([
    supabase
      .from("addresses")
      .select(ADDRESS_COLUMNS)
      .eq("tenant_id", tenant.id)
      .eq("id", addressId)
      .maybeSingle(),
    loadCountries(supabase, tenant.id),
    loadChildAddresses(supabase, tenant.id, addressId),
    loadForeignLock(supabase, tenant.id, ADDRESS_LOCK_RESOURCE, addressId, session.userId),
  ])

  if (addressResult.error || countriesResult.failed || childrenResult.failed) {
    return (
      <>
        <PageHeader title="Adresse" />
        <LoadErrorAlert />
      </>
    )
  }

  if (!addressResult.data) {
    return (
      <>
        <PageHeader title="Adresse" />
        <EmptyState
          title="Adresse nicht gefunden"
          description="Die Adresse existiert nicht in diesem Mandanten oder du hast keinen Zugriff darauf."
          action={
            <Button asChild variant="outline">
              <Link href={`/adressen?mandant=${encodeURIComponent(tenant.id)}`}>
                Zur Adressliste
              </Link>
            </Button>
          }
        />
      </>
    )
  }

  const address = rowToAddress(addressResult.data as unknown as Record<string, unknown>)
  const v = address.values
  const refs = await loadAddressOptions(supabase, tenant.id, [
    v.parentAddressId,
    v.invoiceRecipientId,
    v.invoiceShipToId,
    v.billingCompanyId,
  ])

  return (
    <AddressForm
      // Nach dem Speichern liefert der Server einen neuen Stand → Formular frisch aufbauen.
      key={`${address.id}:${address.updatedAt ?? ""}`}
      tenantId={tenant.id}
      address={address}
      countries={countriesResult.countries}
      refs={refs}
      childAddresses={childrenResult.children}
      canWrite={canWrite}
      canToggleActive={canToggleActive(session, tenant.id, MASK_ADRESSEN)}
      canReadContacts={getAccessLevel(session, tenant.id, MASK_KONTAKTE) !== null}
      canWriteContacts={getAccessLevel(session, tenant.id, MASK_KONTAKTE) === "write"}
      canOpenCountries={getAccessLevel(session, tenant.id, MASK_MERKMAL_LAENDER) !== null}
      lockedBy={lockedBy}
    />
  )
}
