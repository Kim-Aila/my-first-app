// Standard local Supabase CLI dev credentials — identical on every machine running
// `npx supabase start` locally (fixed JWT_SECRET), not a secret. Never used against a
// real/remote project.
export const LOCAL_SUPABASE_URL = "http://127.0.0.1:54321"
export const LOCAL_SERVICE_ROLE_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU"

// Public local anon key (same fixed dev JWT secret) — used only to verify passwords in PROJ-2 tests.
export const LOCAL_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0"

// PROJ-2 fixtures (created in global-setup, removed in global-teardown). Every user created by
// PROJ-2 tests uses P2_EMAIL_DOMAIN and every tenant P2_TENANT_PREFIX, so teardown can sweep them.
export const P2_EMAIL_DOMAIN = "e2e-proj2.local"
export const P2_TENANT_PREFIX = "E2E-P2 "
export const P2_TENANT_NORD = "E2E-P2 Nord"
export const P2_TENANT_SUED = "E2E-P2 Süd"
export const P2_ADMIN_ROLE = "Administrator"
export const P2_PASSWORD = "E2E-Proj2-Pw9!"
export const P2_SUPER_ADMIN = "e2e_p2_superadmin"
export const P2_TENANT_ADMIN = "e2e_p2_tenantadmin"
export const P2_REGULAR = "e2e_p2_regular"

export const TEST_USERNAME = "e2e_proj1_test_user"
export const TEST_EMAIL = "e2e-proj1@verification.local"
export const TEST_PASSWORD = "E2E-Test-Pw9!"
