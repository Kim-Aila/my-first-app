import { NextResponse } from "next/server"
import { z } from "zod"

import { createAdminClient } from "@/lib/supabase-admin"
import { createClient as createServerClient } from "@/lib/supabase-server"

export const MAX_LOGIN_ATTEMPTS = 10
export const LOCKOUT_MINUTES = 15

const loginSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
})

export async function POST(request: Request) {
  const body = await request.json().catch(() => null)
  const parsed = loginSchema.safeParse(body)

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Benutzername und Passwort sind erforderlich." },
      { status: 400 }
    )
  }

  const { username, password } = parsed.data
  const admin = createAdminClient()

  const { data: profile, error: profileError } = await admin
    .from("user_profiles")
    .select("id, email, failed_login_attempts, locked_until")
    .eq("username", username)
    .maybeSingle()

  if (profileError) {
    return NextResponse.json(
      { error: "Anmeldung derzeit nicht möglich. Bitte versuche es später erneut." },
      { status: 503 }
    )
  }

  if (!profile) {
    // Unknown username: respond with the same shape as a wrong password, without persisting
    // an attempt count for an account that doesn't exist.
    return NextResponse.json(
      { error: "Benutzername oder Passwort ist falsch.", remainingAttempts: MAX_LOGIN_ATTEMPTS - 1 },
      { status: 401 }
    )
  }

  if (profile.locked_until && new Date(profile.locked_until) > new Date()) {
    return NextResponse.json(
      {
        error: "Zu viele Fehlversuche. Der Account ist vorübergehend gesperrt.",
        lockedUntil: profile.locked_until,
      },
      { status: 423 }
    )
  }

  const server = await createServerClient()
  const { error: signInError } = await server.auth.signInWithPassword({
    email: profile.email,
    password,
  })

  if (signInError) {
    const nextAttempts = profile.failed_login_attempts + 1

    if (nextAttempts >= MAX_LOGIN_ATTEMPTS) {
      const lockedUntil = new Date(Date.now() + LOCKOUT_MINUTES * 60_000).toISOString()
      await admin
        .from("user_profiles")
        .update({ failed_login_attempts: nextAttempts, locked_until: lockedUntil })
        .eq("id", profile.id)

      return NextResponse.json(
        {
          error: "Zu viele Fehlversuche. Der Account ist vorübergehend gesperrt.",
          lockedUntil,
        },
        { status: 423 }
      )
    }

    await admin
      .from("user_profiles")
      .update({ failed_login_attempts: nextAttempts })
      .eq("id", profile.id)

    return NextResponse.json(
      {
        error: "Benutzername oder Passwort ist falsch.",
        remainingAttempts: MAX_LOGIN_ATTEMPTS - nextAttempts,
      },
      { status: 401 }
    )
  }

  await admin
    .from("user_profiles")
    .update({ failed_login_attempts: 0, locked_until: null })
    .eq("id", profile.id)

  return NextResponse.json({ success: true })
}
