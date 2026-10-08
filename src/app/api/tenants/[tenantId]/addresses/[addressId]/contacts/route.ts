import { NextResponse } from "next/server"

import {
  SERVER_ERROR_MESSAGE,
  invalidIdResponse,
  jsonError,
  requireMaskAccess,
} from "@/lib/api-auth"
import type { Contact, InheritedContact } from "@/lib/contacts"
import { MASK_ADRESSEN, MASK_KONTAKTE } from "@/lib/masks"
import { createClient as createServerClient } from "@/lib/supabase-server"

interface ContactRow {
  out_level: number
  out_id: string
  out_address_id: string
  out_address_number: string
  out_address_name: string
  out_salutation: string | null
  out_first_name: string | null
  out_last_name: string
  out_function_title: string | null
  out_phone: string | null
  out_mobile: string | null
  out_email: string | null
  out_remark: string | null
  out_is_active: boolean
}

function toContact(row: ContactRow): Contact {
  return {
    id: row.out_id,
    addressId: row.out_address_id,
    isActive: row.out_is_active,
    values: {
      salutation: row.out_salutation ?? "",
      firstName: row.out_first_name ?? "",
      lastName: row.out_last_name,
      functionTitle: row.out_function_title ?? "",
      phone: row.out_phone ?? "",
      mobile: row.out_mobile ?? "",
      email: row.out_email ?? "",
      remark: row.out_remark ?? "",
    },
  }
}

// GET /api/tenants/:tenantId/addresses/:addressId/contacts — eigene Kontakte der Adresse und die
// Kontakte aller übergeordneten Adressen (nicht Kontakte untergeordneter), mit Herkunft/Ebene.
// Leserecht auf Kontakte UND Adressen; die Abfrage läuft unter den Rechten des Aufrufers (RLS).
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ tenantId: string; addressId: string }> }
) {
  const { tenantId, addressId } = await params
  const invalid = invalidIdResponse(tenantId, addressId)
  if (invalid) return invalid

  const supabase = await createServerClient()
  const contactsAuth = await requireMaskAccess(supabase, tenantId, MASK_KONTAKTE, "read")
  if (!contactsAuth.ok) return contactsAuth.response
  const addressesAuth = await requireMaskAccess(supabase, tenantId, MASK_ADRESSEN, "read")
  if (!addressesAuth.ok) return addressesAuth.response

  const { data, error } = await supabase.rpc("address_contacts", {
    p_tenant_id: tenantId,
    p_address_id: addressId,
  })
  if (error) return jsonError(500, SERVER_ERROR_MESSAGE)

  const rows = (data ?? []) as ContactRow[]
  const own = rows.filter((r) => r.out_level === 0).map(toContact)
  const inherited: InheritedContact[] = rows
    .filter((r) => r.out_level > 0)
    .map((r) => ({
      ...toContact(r),
      source: {
        addressId: r.out_address_id,
        addressNumber: r.out_address_number,
        addressName: r.out_address_name,
        level: r.out_level,
      },
    }))

  return NextResponse.json({ own, inherited })
}
