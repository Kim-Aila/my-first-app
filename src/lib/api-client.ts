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

/** Lesender Aufruf aus Client Components (z. B. Auswahlsuche, Kontakte, Vorschläge). */
export async function apiGet<T = unknown>(url: string, signal?: AbortSignal): Promise<ApiResult<T>> {
  let res: Response
  try {
    res = await fetch(url, { method: "GET", signal, cache: "no-store" })
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") throw error
    return { ok: false, status: 0, error: CONNECTION_ERROR_MESSAGE }
  }

  let data: unknown = null
  try {
    data = await res.json()
  } catch {
    data = null
  }

  if (res.ok) return { ok: true, data: data as T }

  const payload = (data ?? {}) as { error?: unknown; field?: unknown }
  return {
    ok: false,
    status: res.status,
    error:
      typeof payload.error === "string" && payload.error.length > 0
        ? payload.error
        : res.status === 403
          ? "Dafür fehlt dir die Berechtigung."
          : "Die Daten konnten nicht geladen werden. Bitte versuche es erneut.",
    field: typeof payload.field === "string" ? payload.field : undefined,
  }
}

/** Datei-Upload (multipart) an eine eigene /api-Route, z. B. der Lagerbestand-Import (PROJ-5). */
export async function apiUpload<T = unknown>(
  url: string,
  file: File,
  signal?: AbortSignal,
  fields: Record<string, string> = {}
): Promise<ApiResult<T>> {
  const body = new FormData()
  body.append("file", file)
  for (const [key, value] of Object.entries(fields)) body.append(key, value)

  let res: Response
  try {
    res = await fetch(url, { method: "POST", body, signal })
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") throw error
    return { ok: false, status: 0, error: CONNECTION_ERROR_MESSAGE }
  }

  let data: unknown = null
  try {
    data = await res.json()
  } catch {
    data = null
  }

  if (res.ok) return { ok: true, data: data as T }

  const payload = (data ?? {}) as { error?: unknown; field?: unknown }
  return {
    ok: false,
    status: res.status,
    error:
      typeof payload.error === "string" && payload.error.length > 0
        ? payload.error
        : res.status === 403
          ? "Dafür fehlt dir die Berechtigung."
          : res.status === 413
            ? "Die Datei ist zu groß."
            : "Die Datei konnte nicht verarbeitet werden. Bitte versuche es erneut.",
    field: typeof payload.field === "string" ? payload.field : undefined,
  }
}
