// Chainable Supabase client mock for Route Handler tests (no network calls).
//
// Every `from(table)` chain is recorded as a `QueryCall` and resolved via queued responses keyed
// by `"table:op"` (op = select | insert | update | delete). Unqueued calls resolve to
// `{ data: null, error: null }` (or `[]` for plain selects).
//
// Usage in a test file:
//   const server = createSupabaseMock()
//   vi.mock("@/lib/supabase-server", () => ({ createClient: async () => server.client }))
//   server.respond("tenants:insert", { data: { id: "t1" } })
//   server.respond("rpc:revoke_super_admin", { data: true })   // for supabase.rpc(...)
import { vi } from "vitest"

export type Op = "select" | "insert" | "update" | "delete"

export interface QueryCall {
  table: string
  op: Op
  columns?: string
  payload?: unknown
  filters: { method: string; column: string; value: unknown }[]
}

export interface MockResult {
  data?: unknown
  error?: { message: string; code?: string } | null
  count?: number | null
}

type Responder = MockResult | ((call: QueryCall) => MockResult)

const FILTER_METHODS = ["eq", "neq", "in", "ilike", "is", "gt", "lt", "gte", "lte"] as const
const PASSTHROUGH_METHODS = ["order", "limit", "range"] as const

export function createSupabaseMock() {
  const calls: QueryCall[] = []
  const queues = new Map<string, Responder[]>()

  function respond(key: string, ...results: Responder[]) {
    queues.set(key, [...(queues.get(key) ?? []), ...results])
  }

  function resolve(call: QueryCall): MockResult {
    const queue = queues.get(`${call.table}:${call.op}`)
    const next = queue?.shift()
    if (next === undefined) {
      return { data: call.op === "select" ? [] : null, error: null }
    }
    return typeof next === "function" ? next(call) : next
  }

  function builder(table: string) {
    const call: QueryCall = { table, op: "select", filters: [] }
    let recorded = false
    const record = () => {
      if (!recorded) {
        calls.push(call)
        recorded = true
      }
    }

    const finish = (mode: "many" | "single" | "maybeSingle") => {
      record()
      const result = resolve(call)
      let data = result.data ?? (call.op === "select" && mode === "many" ? [] : null)
      if (mode !== "many" && Array.isArray(data)) data = data[0] ?? null
      return Promise.resolve({ data, error: result.error ?? null, count: result.count ?? null })
    }

    // Loosely typed on purpose: the routes consume it through the real SupabaseClient types.
    const chain: any = {
      select(columns?: string) {
        // `.insert(...).select()` keeps the write op; a bare `.select()` is a read (default op).
        call.columns = columns
        return chain
      },
      insert(payload: unknown) {
        call.op = "insert"
        call.payload = payload
        return chain
      },
      update(payload: unknown) {
        call.op = "update"
        call.payload = payload
        return chain
      },
      delete() {
        call.op = "delete"
        return chain
      },
      single: () => finish("single"),
      maybeSingle: () => finish("maybeSingle"),
      then(onFulfilled: (value: unknown) => unknown, onRejected?: (reason: unknown) => unknown) {
        return finish("many").then(onFulfilled, onRejected)
      },
    }
    for (const method of FILTER_METHODS) {
      chain[method] = (column: string, value: unknown) => {
        call.filters.push({ method, column, value })
        return chain
      }
    }
    for (const method of PASSTHROUGH_METHODS) {
      chain[method] = () => chain
    }
    return chain
  }

  const auth = {
    getUser: vi.fn(async () => ({ data: { user: null as { id: string; email?: string } | null } })),
    signInWithPassword: vi.fn(async (_creds: { email: string; password: string }) => ({
      error: null as { message: string } | null,
    })),
    updateUser: vi.fn(async (_attrs: { password?: string }) => ({
      error: null as { message: string; code?: string } | null,
    })),
    signOut: vi.fn(async () => ({ error: null })),
    admin: {
      createUser: vi.fn(async (_attrs: Record<string, unknown>) => ({
        data: { user: null as { id: string; email?: string } | null },
        error: null as { message: string; code?: string; status?: number } | null,
      })),
      deleteUser: vi.fn(async (_id: string) => ({ error: null })),
    },
  }

  // `rpc(fn, args)` resolves from the queue keyed `"rpc:<fn>"` (default `{ data: null, error: null }`).
  const rpcResolver = async (fn: string, _args?: Record<string, unknown>) => {
    const next = queues.get(`rpc:${fn}`)?.shift()
    const result: MockResult =
      next === undefined ? {} : typeof next === "function" ? next({ table: fn, op: "select", filters: [] }) : next
    return { data: result.data ?? null, error: result.error ?? null }
  }
  const rpc = vi.fn(rpcResolver)

  const client = { from: (table: string) => builder(table), auth, rpc }

  function reset() {
    calls.length = 0
    queues.clear()
    auth.getUser.mockReset()
    auth.getUser.mockImplementation(async () => ({ data: { user: null } }))
    auth.signInWithPassword.mockReset()
    auth.signInWithPassword.mockImplementation(async () => ({ error: null }))
    auth.updateUser.mockReset()
    auth.updateUser.mockImplementation(async () => ({ error: null }))
    auth.signOut.mockReset()
    auth.signOut.mockImplementation(async () => ({ error: null }))
    auth.admin.createUser.mockReset()
    auth.admin.createUser.mockImplementation(async () => ({
      data: { user: null },
      error: null,
    }))
    auth.admin.deleteUser.mockReset()
    auth.admin.deleteUser.mockImplementation(async () => ({ error: null }))
    rpc.mockReset()
    rpc.mockImplementation(rpcResolver)
  }

  /** Sets up `auth.getUser` + the caller's `user_profiles` lookup done by `requireCaller`. */
  function loginAs(user: { id: string; email?: string; isSuperAdmin?: boolean }) {
    auth.getUser.mockImplementation(async () => ({
      data: { user: { id: user.id, email: user.email ?? `${user.id}@example.com` } },
    }))
    respond("user_profiles:select", {
      data: {
        id: user.id,
        email: user.email ?? `${user.id}@example.com`,
        is_super_admin: Boolean(user.isSuperAdmin),
      },
    })
  }

  /** Response for `isTenantAdmin` on a non-super-admin caller. */
  function tenantAdminRoles(isAdmin: boolean) {
    respond("user_roles:select", {
      data: isAdmin
        ? [{ role_id: "r", roles: { role_permissions: [{ module: "basis", maske: "benutzerverwaltung" }] } }]
        : [],
    })
  }

  const callsTo = (table: string, op?: Op) =>
    calls.filter((c) => c.table === table && (op === undefined || c.op === op))

  return { client, auth, rpc, calls, callsTo, respond, reset, loginAs, tenantAdminRoles }
}

export function jsonRequest(url: string, method: string, body?: unknown) {
  return new Request(url, {
    method,
    headers: body !== undefined ? { "Content-Type": "application/json" } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
}

export function routeParams<T extends Record<string, string>>(params: T) {
  return { params: Promise.resolve(params) }
}

// Stable v4 UUIDs for tests (route params are validated as UUIDs).
export const IDS = {
  tenant: "11111111-1111-4111-8111-111111111111",
  otherTenant: "22222222-2222-4222-8222-222222222222",
  caller: "33333333-3333-4333-8333-333333333333",
  user: "44444444-4444-4444-8444-444444444444",
  role: "55555555-5555-4555-8555-555555555555",
  role2: "66666666-6666-4666-8666-666666666666",
}
