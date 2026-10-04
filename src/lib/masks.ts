// Register aller Masken, die über Rollen freigeschaltet werden können.
// Künftige Module ergänzen hier ihre eigenen Einträge. In der Datenbank werden Modul + Maske
// direkt in `role_permissions` gespeichert (kein separates Maskenregister).
//
// PROJ-3: Jedes Maskenrecht hat eine Zugriffsstufe ("read" = Lesen, "write" = Lesen + Bearbeiten).
// Masken mit `supportsReadOnly: false` (z.B. Benutzerverwaltung) kennen nur "Zugriff ja/nein";
// ein vorhandenes Recht entspricht dort immer "write".

export type AccessLevel = "read" | "write"

export const ACCESS_LEVEL_LABELS: Record<AccessLevel, string> = {
  read: "Lesen",
  write: "Lesen + Bearbeiten",
}

export interface MaskDefinition {
  module: string
  maske: string
  label: string
  description: string
  /** Überschrift der Gruppe im Rollen-Dialog. */
  group: string
  /** false → nur "Kein Zugriff" / "Zugriff" (Stufe immer "write"). */
  supportsReadOnly: boolean
}

export const MASK_BENUTZERVERWALTUNG: MaskDefinition = {
  module: "basis",
  maske: "benutzerverwaltung",
  label: "Benutzerverwaltung",
  description: "Benutzer und Rollen dieses Mandanten verwalten",
  group: "Basis",
  supportsReadOnly: false,
}

const WAREN = "Warenwirtschaft"
const WAREN_MERKMALE = "Warenwirtschaft – Merkmale"

export const MASK_ARTIKELSTAMM: MaskDefinition = {
  module: "warenwirtschaft",
  maske: "artikelstamm",
  label: "Artikelstamm",
  description: "Artikel ansehen, anlegen und bearbeiten",
  group: WAREN,
  supportsReadOnly: true,
}

function merkmalMask(maske: string, label: string, description: string): MaskDefinition {
  return {
    module: "warenwirtschaft",
    maske,
    label,
    description,
    group: WAREN_MERKMALE,
    supportsReadOnly: true,
  }
}

export const MASK_MERKMAL_ARTIKELTYP = merkmalMask(
  "merkmal_artikeltyp",
  "Artikeltypen",
  "Rohstoff, Verpackung, Halbfertigware, Fertigware u. a. pflegen"
)
export const MASK_MERKMAL_MARKENINHABER = merkmalMask(
  "merkmal_markeninhaber",
  "Markeninhaber",
  "Markeninhaber pflegen"
)
export const MASK_MERKMAL_SAISON = merkmalMask("merkmal_saison", "Saisons", "Saisons pflegen")
export const MASK_MERKMAL_BASISARTIKEL = merkmalMask(
  "merkmal_basisartikel",
  "Basisartikel",
  "Basisartikel pflegen"
)
export const MASK_MERKMAL_FORM_DESIGN = merkmalMask(
  "merkmal_form_design",
  "Form/Design",
  "Formen und Designs pflegen"
)
export const MASK_MERKMAL_PACKUNGSGROESSE = merkmalMask(
  "merkmal_packungsgroesse",
  "Packungsgrößen",
  "Packungsgrößen pflegen"
)
export const MASK_MERKMAL_GESCHMACKSSORTE = merkmalMask(
  "merkmal_geschmackssorte",
  "Geschmackssorten",
  "Geschmackssorten pflegen"
)
export const MASK_MERKMAL_MWST = merkmalMask(
  "merkmal_mwst",
  "Mehrwertsteuersätze",
  "Mehrwertsteuersätze pflegen"
)
export const MASK_MERKMAL_VERPACKUNGSGRUPPE = merkmalMask(
  "merkmal_verpackungsgruppe",
  "Verpackungsgruppen",
  "Verpackungsgruppen inkl. Folien-/Pappengewicht pflegen"
)

export const MASKS: MaskDefinition[] = [
  MASK_BENUTZERVERWALTUNG,
  MASK_ARTIKELSTAMM,
  MASK_MERKMAL_ARTIKELTYP,
  MASK_MERKMAL_MARKENINHABER,
  MASK_MERKMAL_SAISON,
  MASK_MERKMAL_BASISARTIKEL,
  MASK_MERKMAL_FORM_DESIGN,
  MASK_MERKMAL_PACKUNGSGROESSE,
  MASK_MERKMAL_GESCHMACKSSORTE,
  MASK_MERKMAL_MWST,
  MASK_MERKMAL_VERPACKUNGSGRUPPE,
]

export function maskKey(mask: { module: string; maske: string }) {
  return `${mask.module}:${mask.maske}`
}

export function getMaskLabel(mask: { module: string; maske: string }) {
  return MASKS.find((m) => maskKey(m) === maskKey(mask))?.label ?? mask.maske
}

/** Maskenrechte einer Rolle, wie sie die UI braucht (Stufe fehlt in alten Daten → "write"). */
export interface MaskPermission {
  module: string
  maske: string
  accessLevel: AccessLevel
}

export function normalizeAccessLevel(value: unknown): AccessLevel {
  return value === "read" ? "read" : "write"
}

/** Gruppiert Masken in Registerreihenfolge nach `group` (für den Rollen-Dialog). */
export function groupMasks(masks: MaskDefinition[] = MASKS): { group: string; masks: MaskDefinition[] }[] {
  const groups: { group: string; masks: MaskDefinition[] }[] = []
  for (const mask of masks) {
    const existing = groups.find((g) => g.group === mask.group)
    if (existing) existing.masks.push(mask)
    else groups.push({ group: mask.group, masks: [mask] })
  }
  return groups
}
