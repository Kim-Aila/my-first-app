// Server-side base URL for reaching Supabase. Normally the same origin the
// browser uses (NEXT_PUBLIC_SUPABASE_URL), but in Docker that origin
// (127.0.0.1) refers to the container itself, not the host — SUPABASE_URL
// (e.g. http://host.docker.internal:54321) overrides it for server code only.
export function getServerSupabaseUrl() {
  return process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL!
}
