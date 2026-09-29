// Server-side base URL for reaching Supabase. Normally the same origin the
// browser uses (NEXT_PUBLIC_SUPABASE_URL), but in Docker that origin
// (127.0.0.1) refers to the container itself, not the host — SUPABASE_URL
// (e.g. http://host.docker.internal:54321) overrides it for server code only.
export function getServerSupabaseUrl() {
  return process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL!
}

// Whether the session cookie should get the `Secure` attribute. Defaults to
// NODE_ENV (matches a normal HTTPS deployment, e.g. Vercel), but NODE_ENV
// only tracks "optimized build", not "served over HTTPS" — a self-hosted
// deployment behind plain HTTP (no reverse-proxy TLS yet) needs this forced
// to false, since browsers drop Secure cookies over an insecure origin.
export function getCookieSecure() {
  if (process.env.COOKIE_SECURE === "true") return true
  if (process.env.COOKIE_SECURE === "false") return false
  return process.env.NODE_ENV === "production"
}
