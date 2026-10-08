// Adressstamm (PROJ-4): Formularmodell, Validierung, Anzeige-Berechnungen und Mapping der
// Datenbankzeilen (von /backend angelegte Tabelle `addresses`).
//
// Die Adressnummer setzt verbindlich der Server zusammen; `computeAddressNumber` erzeugt nur die
// Live-Vorschau im Formular und muss dieselbe Regel abbilden.
import { z } from "zod"

export const ADDRESS_LOCK_RESOURCE = "address"
export const CONTACT_LOCK_RESOURCE = "contact"

/** Feste Rollen einer Adresse (Mehrfachauswahl). Die Schlüssel verwendet auch die API. */
export const ADDRESS_ROLES = [
  { value: "customer", label: "Kunde" },
  { value: "supplier", label: "Lieferant" },
  { value: "carrier", label: "Spediteur" },
  { value: "service_provider", label: "Dienstleister" },
  { value: "delivery_address", label: "Lieferadresse" },
  { value: "other", label: "Sonstige" },
] as const

export type AddressRole = (typeof ADDRESS_ROLES)[number]["value"]

const ROLE_VALUES = ADDRESS_ROLES.map((r) => r.value) as [AddressRole, ...AddressRole[]]

export function addressRoleLabel(role: string) {
  return ADDRESS_ROLES.find((r) => r.value === role)?.label ?? role
}

// ---- Berechnungen (Vorschau) ----------------------------------------------------------------

/** Basis (1–10 Ziffern) + "." + 4-stellige Kennziffer; solange eines fehlt oder ungültig ist → null. */
export function computeAddressNumber(base: string | null | undefined, suffix: string) {
  const b = (base ?? "").trim()
  const s = suffix.trim()
  if (!/^\d{1,10}$/.test(b) || !/^\d{4}$/.test(s)) return null
  return `${b}.${s}`
}

/** Auswahlfeld-/Listen-Text einer Adresse: "4711.0001 – Name (KÜR)". */
export function addressLabel(option: Pick<AddressOption, "addressNumber" | "name" | "code">) {
  const base = `${option.addressNumber} – ${option.name}`
  return option.code ? `${base} (${option.code})` : base
}

// ---- Typen ----------------------------------------------------------------------------------

/** Kurzdarstellung einer Adresse für Auswahlfelder, Verweise und Listen. */
export interface AddressOption {
  id: string
  addressNumber: string
  name: string
  code: string | null
  isActive: boolean
}

export interface AddressFormValues {
  addressBase: string
  suffix: string
  name: string
  nameAddition: string
  code: string
  gln: string
  roles: AddressRole[]
  street: string
  houseNumber: string
  postalCode: string
  city: string
  countryId: string
  phone: string
  email: string
  website: string
  vatId: string
  remark: string
  parentAddressId: string
  invoiceRecipientId: string
  invoiceShipToId: string
  billingCompanyId: string
}

export const EMPTY_ADDRESS_VALUES: AddressFormValues = {
  addressBase: "",
  suffix: "",
  name: "",
  nameAddition: "",
  code: "",
  gln: "",
  roles: [],
  street: "",
  houseNumber: "",
  postalCode: "",
  city: "",
  countryId: "",
  phone: "",
  email: "",
  website: "",
  vatId: "",
  remark: "",
  parentAddressId: "",
  invoiceRecipientId: "",
  invoiceShipToId: "",
  billingCompanyId: "",
}

export interface Address {
  id: string
  addressNumber: string
  isActive: boolean
  updatedAt: string | null
  values: AddressFormValues
}

// ---- Validierung ----------------------------------------------------------------------------

const text = (label: string, max: number) =>
  z.string().trim().max(max, `${label} darf höchstens ${max} Zeichen lang sein`)

const optionalEmail = z
  .string()
  .trim()
  .max(254, "E-Mail darf höchstens 254 Zeichen lang sein")
  .refine((value) => value === "" || z.string().email().safeParse(value).success, {
    message: "Bitte eine gültige E-Mail-Adresse angeben",
  })

export const addressFormSchema = z.object({
  addressBase: z
    .string()
    .trim()
    .min(1, "Bitte die Adressnummer-Basis angeben")
    .regex(/^\d+$/, "Nur Ziffern erlaubt")
    .max(10, "Höchstens 10 Stellen"),
  suffix: z
    .string()
    .trim()
    .min(1, "Bitte die Kennziffer angeben")
    .regex(/^\d{4}$/, "Die Kennziffer muss genau 4 Ziffern haben"),
  name: text("Name", 200).min(1, "Bitte Name/Firma angeben"),
  nameAddition: text("Namenszusatz", 200),
  code: text("Kürzel", 10),
  gln: z
    .string()
    .trim()
    .refine((value) => value === "" || /^\d{13}$/.test(value), {
      message: "Die GLN muss genau 13 Ziffern haben",
    }),
  roles: z.array(z.enum(ROLE_VALUES)),
  street: text("Straße", 200),
  houseNumber: text("Hausnummer", 20),
  postalCode: text("PLZ", 10),
  city: text("Ort", 100),
  countryId: z.string(),
  phone: text("Telefon", 50),
  email: optionalEmail,
  website: text("Webseite", 200),
  vatId: text("USt-IdNr.", 15),
  remark: text("Bemerkung", 2000),
  parentAddressId: z.string(),
  invoiceRecipientId: z.string(),
  invoiceShipToId: z.string(),
  billingCompanyId: z.string(),
})

// ---- API-Mapping ----------------------------------------------------------------------------

const orNull = (value: string) => {
  const trimmed = value.trim()
  return trimmed === "" ? null : trimmed
}

/** Formularwerte → Body für POST/PATCH (leere Felder werden zu null). */
export function toAddressPayload(values: AddressFormValues) {
  return {
    addressBase: values.addressBase.trim(),
    suffix: values.suffix.trim(),
    name: values.name.trim(),
    nameAddition: orNull(values.nameAddition),
    code: orNull(values.code),
    gln: orNull(values.gln),
    roles: values.roles,
    street: orNull(values.street),
    houseNumber: orNull(values.houseNumber),
    postalCode: orNull(values.postalCode),
    city: orNull(values.city),
    countryId: orNull(values.countryId),
    phone: orNull(values.phone),
    email: orNull(values.email),
    website: orNull(values.website),
    vatId: orNull(values.vatId),
    remark: orNull(values.remark),
    parentAddressId: orNull(values.parentAddressId),
    invoiceRecipientId: orNull(values.invoiceRecipientId),
    invoiceShipToId: orNull(values.invoiceShipToId),
    billingCompanyId: orNull(values.billingCompanyId),
  }
}

/** Spalten der Tabelle `addresses` für Server-Seiten, die direkt lesen. */
export const ADDRESS_COLUMNS =
  "id, address_base, address_suffix, address_number, name, name_addition, code, gln, roles, " +
  "street, house_number, postal_code, city, country_id, phone, email, website, vat_id, remark, " +
  "parent_address_id, invoice_recipient_id, invoice_ship_to_id, billing_company_id, " +
  "is_active, updated_at"

const str = (value: unknown) => (value === null || value === undefined ? "" : String(value))

function toRoles(value: unknown): AddressRole[] {
  if (!Array.isArray(value)) return []
  return value.filter((r): r is AddressRole => ROLE_VALUES.includes(r as AddressRole))
}

/** Datenbankzeile (snake_case) → Address. */
export function rowToAddress(row: Record<string, unknown>): Address {
  return {
    id: String(row.id),
    addressNumber: str(row.address_number),
    isActive: row.is_active !== false,
    updatedAt: typeof row.updated_at === "string" ? row.updated_at : null,
    values: {
      addressBase: str(row.address_base),
      suffix: str(row.address_suffix),
      name: str(row.name),
      nameAddition: str(row.name_addition),
      code: str(row.code),
      gln: str(row.gln),
      roles: toRoles(row.roles),
      street: str(row.street),
      houseNumber: str(row.house_number),
      postalCode: str(row.postal_code),
      city: str(row.city),
      countryId: str(row.country_id),
      phone: str(row.phone),
      email: str(row.email),
      website: str(row.website),
      vatId: str(row.vat_id),
      remark: str(row.remark),
      parentAddressId: str(row.parent_address_id),
      invoiceRecipientId: str(row.invoice_recipient_id),
      invoiceShipToId: str(row.invoice_ship_to_id),
      billingCompanyId: str(row.billing_company_id),
    },
  }
}

/** Kurzspalten für `AddressOption` (Auswahlfelder, Verweise). */
export const ADDRESS_OPTION_COLUMNS = "id, address_number, name, code, is_active"

export function rowToAddressOption(row: Record<string, unknown>): AddressOption {
  return {
    id: String(row.id),
    addressNumber: str(row.address_number),
    name: str(row.name),
    code: row.code ? String(row.code) : null,
    isActive: row.is_active !== false,
  }
}
