// Kleiner Helfer für Schreibaufrufe aus Client Components an die eigenen /api-Routen.
// Konvention (von /backend umzusetzen): Fehlerantworten liefern JSON
// `{ error: string, field?: string }` — `field` benennt optional das betroffene Formularfeld
// (z.B. "username" bei bereits vergebenem Benutzernamen, "name" bei doppeltem Rollennamen).

export type ApiResult<T = unknown> =
  | { ok: true; data: T }
  | { ok: false; status: number; error: string; field?: string }

export const CONNECTION_ERROR_MESSAGE =
  "Verbindung zum Server fehlgeschlagen. Bitte versuche es erneut."

export async function apiRequest<T = unknown>(
  url: string,
  options: { method: "POST" | "PATCH" | "PUT" | "DELETE"; body?: unknown }
): Promise<ApiResult<T>> {
  let res: Response
  try {
    res = await fetch(url, {
      method: options.method,
      headers: options.body !== undefined ? { "Content-Type": "application/json" } : undefined,
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    })
  } catch {
    return { ok: false, status: 0, error: CONNECTION_ERROR_MESSAGE }
  }

  let data: unknown = null
  try {
    data = await res.json()
  } catch {
    data = null
  }

  if (res.ok) {
    return { ok: true, data: data as T }
  }

  const payload = (data ?? {}) as { error?: unknown; field?: unknown }
  return {
    ok: false,
    status: res.status,
    error:
      typeof payload.error === "string" && payload.error.length > 0
        ? payload.error
        : res.status === 403
          ? "Dafür fehlt dir die Berechtigung."
          : "Speichern fehlgeschlagen. Bitte versuche es erneut.",
    field: typeof payload.field === "string" ? payload.field : undefined,
  }
}
