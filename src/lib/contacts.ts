// Kontakte (PROJ-4): Formularmodell, Validierung und Mapping. Jeder Kontakt gehört zu genau einer
// Adresse. Kontakte übergeordneter Adressen liefert der Server als Zusatz ("inherited").
import { z } from "zod"

export interface ContactFormValues {
  salutation: string
  firstName: string
  lastName: string
  functionTitle: string
  phone: string
  mobile: string
  email: string
  remark: string
}

export const EMPTY_CONTACT_VALUES: ContactFormValues = {
  salutation: "",
  firstName: "",
  lastName: "",
  functionTitle: "",
  phone: "",
  mobile: "",
  email: "",
  remark: "",
}

export interface Contact {
  id: string
  addressId: string
  isActive: boolean
  values: ContactFormValues
}

/** Kontakt einer übergeordneten Adresse (nur lesbar) inkl. Herkunft. */
export interface InheritedContact extends Contact {
  source: {
    addressId: string
    addressNumber: string
    addressName: string
    /** 1 = direkt übergeordnet, 2 = eine Ebene darüber … */
    level: number
  }
}

/** Antwort von GET /api/tenants/:tenantId/addresses/:addressId/contacts */
export interface AddressContacts {
  own: Contact[]
  inherited: InheritedContact[]
}

const text = (label: string, max: number) =>
  z.string().trim().max(max, `${label} darf höchstens ${max} Zeichen lang sein`)

export const contactFormSchema = z.object({
  salutation: text("Anrede", 30),
  firstName: text("Vorname", 100),
  lastName: text("Nachname", 100).min(1, "Bitte den Nachnamen angeben"),
  functionTitle: text("Funktion", 100),
  phone: text("Telefon", 50),
  mobile: text("Mobil", 50),
  email: z
    .string()
    .trim()
    .max(254, "E-Mail darf höchstens 254 Zeichen lang sein")
    .refine((value) => value === "" || z.string().email().safeParse(value).success, {
      message: "Bitte eine gültige E-Mail-Adresse angeben",
    }),
  remark: text("Bemerkung", 2000),
})

const orNull = (value: string) => {
  const trimmed = value.trim()
  return trimmed === "" ? null : trimmed
}

export function toContactPayload(values: ContactFormValues) {
  return {
    salutation: orNull(values.salutation),
    firstName: orNull(values.firstName),
    lastName: values.lastName.trim(),
    functionTitle: orNull(values.functionTitle),
    phone: orNull(values.phone),
    mobile: orNull(values.mobile),
    email: orNull(values.email),
    remark: orNull(values.remark),
  }
}

/** Spalten der Tabelle `contacts` für Server-Seiten, die direkt lesen. */
export const CONTACT_COLUMNS =
  "id, address_id, salutation, first_name, last_name, function_title, phone, mobile, email, remark, is_active"

const str = (value: unknown) => (value === null || value === undefined ? "" : String(value))

export function rowToContact(row: Record<string, unknown>): Contact {
  return {
    id: String(row.id),
    addressId: str(row.address_id),
    isActive: row.is_active !== false,
    values: {
      salutation: str(row.salutation),
      firstName: str(row.first_name),
      lastName: str(row.last_name),
      functionTitle: str(row.function_title),
      phone: str(row.phone),
      mobile: str(row.mobile),
      email: str(row.email),
      remark: str(row.remark),
    },
  }
}

/** "Nachname, Vorname" für Listen. */
export function contactDisplayName(values: Pick<ContactFormValues, "firstName" | "lastName">) {
  return [values.lastName, values.firstName].filter(Boolean).join(", ")
}
