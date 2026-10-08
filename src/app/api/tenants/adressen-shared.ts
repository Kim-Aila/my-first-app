// Gemeinsame Schemas, Mappings und Meldungen der PROJ-4-Routen (Adressen, Kontakte).
import { z } from "zod"

import { ADDRESS_ROLES } from "@/lib/addresses"

import { refId, text } from "./warenwirtschaft-shared"

export const ADDRESS_NOT_FOUND_MESSAGE = "Adresse nicht gefunden."
export const CONTACT_NOT_FOUND_MESSAGE = "Kontakt nicht gefunden."
export const ADDRESS_NUMBER_TAKEN_MESSAGE = "Adressnummer bereits vergeben"

const ROLE_VALUES = ADDRESS_ROLES.map((r) => r.value) as [string, ...string[]]

const email = z
  .string({ error: "Die E-Mail-Adresse ist ungültig." })
  .trim()
  .max(254, "Die E-Mail-Adresse darf höchstens 254 Zeichen lang sein")
  .nullish()
  .transform((v) => (v ? v : null))
  .refine((v) => v === null || z.string().email().safeParse(v).success, {
    message: "Bitte eine gültige E-Mail-Adresse angeben",
  })

// Adressnummer, Suchzeile, Zeitstempel gehören nicht ins Schema: Der Datenbank-Trigger setzt sie;
// mitgeschickte Werte (auch `isActive`) werden verworfen — der Status ändert sich nur über /status.
export const addressSchema = z.object({
  addressBase: z
    .string({ error: "Die Adressnummer-Basis muss aus 1 bis 10 Ziffern bestehen" })
    .trim()
    .regex(/^\d{1,10}$/, "Die Adressnummer-Basis muss aus 1 bis 10 Ziffern bestehen"),
  suffix: z
    .string({ error: "Die Kennziffer muss genau 4 Ziffern haben" })
    .trim()
    .regex(/^\d{4}$/, "Die Kennziffer muss genau 4 Ziffern haben"),
  name: z
    .string({ error: "Bitte Name/Firma angeben" })
    .trim()
    .min(1, "Bitte Name/Firma angeben")
    .max(200, "Der Name darf höchstens 200 Zeichen lang sein"),
  nameAddition: text(200, "Der Namenszusatz"),
  code: text(10, "Das Kürzel"),
  gln: z
    .string({ error: "Die GLN ist ungültig." })
    .trim()
    .regex(/^\d{13}$/, "Die GLN muss genau 13 Ziffern haben")
    .nullish()
    .transform((v) => v ?? null),
  roles: z
    .array(z.enum(ROLE_VALUES, { error: "Unbekannte Rolle." }), { error: "Rollen sind ungültig." })
    .max(ROLE_VALUES.length)
    .default([])
    .transform((roles) => [...new Set(roles)]),
  street: text(200, "Die Straße"),
  houseNumber: text(20, "Die Hausnummer"),
  postalCode: text(10, "Die PLZ"),
  city: text(100, "Der Ort"),
  countryId: refId,
  phone: text(50, "Das Telefon"),
  email,
  website: text(200, "Die Webseite"),
  vatId: text(15, "Die USt-IdNr."),
  remark: text(2000, "Die Bemerkung"),
  parentAddressId: refId,
  invoiceRecipientId: refId,
  invoiceShipToId: refId,
  billingCompanyId: refId,
})

export type AddressInput = z.infer<typeof addressSchema>

/** Validierter Body → Spaltenwerte (snake_case) für `addresses`. */
export function addressRow(data: AddressInput) {
  return {
    address_base: data.addressBase,
    address_suffix: data.suffix,
    name: data.name,
    name_addition: data.nameAddition,
    code: data.code,
    gln: data.gln,
    roles: data.roles,
    street: data.street,
    house_number: data.houseNumber,
    postal_code: data.postalCode,
    city: data.city,
    country_id: data.countryId,
    phone: data.phone,
    email: data.email,
    website: data.website,
    vat_id: data.vatId,
    remark: data.remark,
    parent_address_id: data.parentAddressId,
    invoice_recipient_id: data.invoiceRecipientId,
    invoice_ship_to_id: data.invoiceShipToId,
    billing_company_id: data.billingCompanyId,
  }
}

export const addressStatusSchema = z.object({
  isActive: z.boolean({ error: "Bitte einen Status angeben." }),
  includeChildren: z.boolean({ error: "Ungültige Angabe zu untergeordneten Adressen." }).default(false),
})

// ---- Kontakte -------------------------------------------------------------------------------

export const contactSchema = z.object({
  salutation: text(30, "Die Anrede"),
  firstName: text(100, "Der Vorname"),
  lastName: z
    .string({ error: "Bitte den Nachnamen angeben" })
    .trim()
    .min(1, "Bitte den Nachnamen angeben")
    .max(100, "Der Nachname darf höchstens 100 Zeichen lang sein"),
  functionTitle: text(100, "Die Funktion"),
  phone: text(50, "Das Telefon"),
  mobile: text(50, "Die Mobilnummer"),
  email,
  remark: text(2000, "Die Bemerkung"),
})

export const contactCreateSchema = contactSchema.extend({
  addressId: z.uuid({ error: "Bitte eine Adresse angeben." }),
})

export type ContactInput = z.infer<typeof contactSchema>

export function contactRow(data: ContactInput) {
  return {
    salutation: data.salutation,
    first_name: data.firstName,
    last_name: data.lastName,
    function_title: data.functionTitle,
    phone: data.phone,
    mobile: data.mobile,
    email: data.email,
    remark: data.remark,
  }
}

export const contactStatusSchema = z.object({
  isActive: z.boolean({ error: "Bitte einen Status angeben." }),
})

// ---- Abfrageparameter -----------------------------------------------------------------------

export const optionsQuerySchema = z.object({
  q: z.string().trim().max(100, "Die Suche darf höchstens 100 Zeichen lang sein").optional(),
  requireCode: z.enum(["true", "false"]).optional(),
  excludeSubtreeOf: z.uuid({ error: "Ungültige Adress-ID." }).optional(),
})

export const nextSuffixQuerySchema = z.object({
  base: z
    .string({ error: "Bitte die Basis angeben." })
    .trim()
    .regex(/^\d{1,10}$/, "Die Basis muss aus 1 bis 10 Ziffern bestehen"),
})

export const codeCheckQuerySchema = z.object({
  code: z.string({ error: "Bitte ein Kürzel angeben." }).trim().min(1, "Bitte ein Kürzel angeben").max(10),
  excludeId: z.uuid({ error: "Ungültige Adress-ID." }).optional(),
})

/** Zeile aus `address_options` / `address_code_matches` → API-Form (`AddressOption`). */
export interface OptionRow {
  out_id: string
  out_address_number: string
  out_name: string
  out_code: string | null
  out_is_active: boolean
}

export function optionFromRow(row: OptionRow) {
  return {
    id: row.out_id,
    addressNumber: row.out_address_number,
    name: row.out_name,
    code: row.out_code,
    isActive: row.out_is_active,
  }
}

/** Query-String → Objekt (fehlende Parameter fehlen, statt `null` zu sein). */
export function queryObject(request: Request) {
  const result: Record<string, string> = {}
  for (const [key, value] of new URL(request.url).searchParams) result[key] = value
  return result
}
