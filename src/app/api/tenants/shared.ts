import { z } from "zod"

import { MASKS, maskKey } from "@/lib/masks"

export const FOREIGN_ROLE_MESSAGE = "Mindestens eine Rolle gehört nicht zu diesem Mandanten."

export const TENANT_NAME_TAKEN_MESSAGE = "Ein Mandant mit diesem Namen existiert bereits."

// Namens-Eindeutigkeit (Mandant: global, Rolle: je Mandant) ist case-insensitive und wird allein
// von der Datenbank erzwungen (Unique-Indizes auf lower(name), Migration 20260930100000) — die
// Routen fangen die unique_violation ab (409). Keine ilike-Vorabprüfung mehr (BUG-10/BUG-11).

export const tenantNameSchema = z.object({
  name: z
    .string({ error: "Bitte gib einen Namen ein" })
    .trim()
    .min(1, "Bitte gib einen Namen ein")
    .max(100, "Der Name darf höchstens 100 Zeichen lang sein"),
})

export const ROLE_NAME_TAKEN_MESSAGE = "In diesem Mandanten gibt es bereits eine Rolle mit diesem Namen."
export const UNKNOWN_MASK_MESSAGE = "Mindestens eine ausgewählte Maske ist unbekannt."

// Nur Masken aus dem Register `MASKS` (src/lib/masks.ts) sind zulässig.
export const roleSchema = z.object({
  name: z
    .string({ error: "Bitte gib einen Rollennamen ein" })
    .trim()
    .min(1, "Bitte gib einen Rollennamen ein")
    .max(100, "Der Rollenname darf höchstens 100 Zeichen lang sein"),
  masks: z
    .array(z.object({ module: z.string(), maske: z.string() }), {
      error: UNKNOWN_MASK_MESSAGE,
    })
    .max(100)
    .refine(
      (masks) => masks.every((m) => MASKS.some((known) => maskKey(known) === maskKey(m))),
      UNKNOWN_MASK_MESSAGE
    )
    .transform((masks) => {
      const unique = new Map(masks.map((m) => [maskKey(m), { module: m.module, maske: m.maske }]))
      return [...unique.values()]
    }),
})
