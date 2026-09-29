// Server-side Supabase client (cookie-based session) — use from Server Components,
// Server Actions and Route Handlers that need the current user's session.
import { createServerClient } from "@supabase/ssr"
import { cookies } from "next/headers"
import { getServerSupabaseUrl, getCookieSecure } from "./supabase-url"

export async function createClient() {
  const cookieStore = await cookies()

  return createServerClient(
    getServerSupabaseUrl(),
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => {
              // Force httpOnly regardless of the library default so the session token is
              // never readable via document.cookie (BUG-2, PROJ-1 QA).
              cookieStore.set(name, value, {
                ...options,
                httpOnly: true,
                secure: getCookieSecure(),
              })
            })
          } catch {
            // Called from a Server Component render — middleware refreshes the session instead.
          }
        },
      },
    }
  )
}
