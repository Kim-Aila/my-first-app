import type { MerkmalItem } from "@/lib/merkmale"

/** Merkmal-Einträge je Verweisfeld des Artikels (Schlüssel = `MerkmalConfig.articleKey`). */
export type ReferenceData = Record<string, MerkmalItem[]>

/** Merkmal-Slug → darf der User die Pflege-Maske öffnen (für Links im Formular). */
export type MaintenanceAccess = Record<string, boolean>
