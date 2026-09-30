import { NextResponse } from "next/server"
import { z } from "zod"

import {
  GOTRUE_WEAK_PASSWORD_MESSAGE,
  SERVER_ERROR_MESSAGE,
  isWeakPasswordError,
  jsonError,
  readJson,
  requireCaller,
  validationError,
} from "@/lib/api-auth"
import { passwordSchema } from "@/lib/password-policy"
import { createClient as createServerClient } from "@/lib/supabase-server"

// Bewusst allgemein — verrät nicht, welche Prüfung fehlschlug (Frontend zeigt eine eigene Meldung).
export const PASSWORD_CHANGE_REJECTED_MESSAGE =
  "Das Passwort konnte nicht geändert werden. Bitte prüfe deine Eingaben."

const changePasswordSchema = z.object({
  currentPassword: z
    .string({ error: "Bitte gib dein aktuelles Passwort ein" })
    .min(1, "Bitte gib dein aktuelles Passwort ein"),
  newPassword: passwordSchema,
})

// POST /api/profile/password — eigenes Passwort ändern (jeder eingeloggte User).
// Das aktuelle Passwort wird per `signInWithPassword` mit der eigenen E-Mail geprüft; danach
// setzt `updateUser` das neue Passwort auf der eigenen Session — der User bleibt eingeloggt.
export async function POST(request: Request) {
  const supabase = await createServerClient()
  const auth = await requireCaller(supabase)
  if (!auth.ok) return auth.response

  const parsed = changePasswordSchema.safeParse(await readJson(request))
  if (!parsed.success) return validationError(parsed.error)
  const { currentPassword, newPassword } = parsed.data

  if (!auth.caller.email) return jsonError(500, SERVER_ERROR_MESSAGE)

  const { error: verifyError } = await supabase.auth.signInWithPassword({
    email: auth.caller.email,
    password: currentPassword,
  })
  if (verifyError) return jsonError(401, PASSWORD_CHANGE_REJECTED_MESSAGE)

  const { error: updateError } = await supabase.auth.updateUser({ password: newPassword })
  if (isWeakPasswordError(updateError)) {
    return jsonError(400, GOTRUE_WEAK_PASSWORD_MESSAGE, "newPassword")
  }
  if (updateError) {
    // z.B. neues Passwort identisch mit dem alten (GoTrue "same_password") — allgemein halten.
    return jsonError(400, PASSWORD_CHANGE_REJECTED_MESSAGE)
  }

  return NextResponse.json({ success: true })
}
