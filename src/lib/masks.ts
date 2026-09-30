// Register aller Masken, die über Rollen freigeschaltet werden können.
// Laut PROJ-2-Spec (Decision Log) gibt es aktuell nur die Maske "Benutzerverwaltung";
// künftige Module (PROJ-3 ff.) ergänzen hier ihre eigenen Einträge. In der Datenbank
// werden Modul + Maske direkt in `role_permissions` gespeichert (kein separates Maskenregister).

export interface MaskDefinition {
  module: string
  maske: string
  label: string
  description: string
}

export const MASK_BENUTZERVERWALTUNG: MaskDefinition = {
  module: "basis",
  maske: "benutzerverwaltung",
  label: "Benutzerverwaltung",
  description: "Benutzer und Rollen dieses Mandanten verwalten",
}

export const MASKS: MaskDefinition[] = [MASK_BENUTZERVERWALTUNG]

export function maskKey(mask: { module: string; maske: string }) {
  return `${mask.module}:${mask.maske}`
}

export function getMaskLabel(mask: { module: string; maske: string }) {
  return MASKS.find((m) => maskKey(m) === maskKey(mask))?.label ?? mask.maske
}
