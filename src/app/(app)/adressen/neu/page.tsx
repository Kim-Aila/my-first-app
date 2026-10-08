import type { Metadata } from "next"

import { AddressForm } from "@/components/adressen/address-form"
import { PageHeader } from "@/components/page-header"
import { LoadErrorAlert, NoAccessCard } from "@/components/state-messages"
import { loadCountries } from "@/lib/address-data"
import { MASK_ADRESSEN, MASK_KONTAKTE, MASK_MERKMAL_LAENDER } from "@/lib/masks"
import { getSessionContext } from "@/lib/session-context"
import { createClient as createServerClient } from "@/lib/supabase-server"
import {
  canToggleActive,
  getAccessLevel,
  resolveTenant,
  tenantsWithMask,
} from "@/lib/tenant-access"

export const metadata: Metadata = { title: "Neue Adresse · Manufaktur-ERP" }

export default async function NeueAdressePage({
  searchParams,
}: {
  searchParams: Promise<{ mandant?: string | string[] }>
}) {
  const [session, params] = await Promise.all([getSessionContext(), searchParams])

  // Anlegen braucht Schreibrecht: nur Mandanten mit Stufe "write" kommen infrage.
  const tenants = tenantsWithMask(session, MASK_ADRESSEN).filter(
    (t) => getAccessLevel(session, t.id, MASK_ADRESSEN) === "write"
  )
  if (tenants.length === 0) {
    return <NoAccessCard description="Dir fehlt das Recht, Adressen anzulegen." />
  }
  const requested = Array.isArray(params.mandant) ? params.mandant[0] : params.mandant
  const tenant = resolveTenant(tenants, requested)!

  const supabase = await createServerClient()
  const { countries, failed } = await loadCountries(supabase, tenant.id)

  if (failed) {
    return (
      <>
        <PageHeader title="Neue Adresse" />
        <LoadErrorAlert />
      </>
    )
  }

  return (
    <AddressForm
      tenantId={tenant.id}
      address={null}
      countries={countries}
      refs={{}}
      childAddresses={[]}
      canWrite
      canToggleActive={canToggleActive(session, tenant.id, MASK_ADRESSEN)}
      canReadContacts={getAccessLevel(session, tenant.id, MASK_KONTAKTE) !== null}
      canWriteContacts={getAccessLevel(session, tenant.id, MASK_KONTAKTE) === "write"}
      canOpenCountries={getAccessLevel(session, tenant.id, MASK_MERKMAL_LAENDER) !== null}
      lockedBy={null}
    />
  )
}
