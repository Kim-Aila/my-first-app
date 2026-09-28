// Standard local Supabase CLI dev credentials — identical on every machine running
// `npx supabase start` locally (fixed JWT_SECRET), not a secret. Never used against a
// real/remote project.
export const LOCAL_SUPABASE_URL = "http://127.0.0.1:54321"
export const LOCAL_SERVICE_ROLE_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU"

export const TEST_USERNAME = "e2e_proj1_test_user"
export const TEST_EMAIL = "e2e-proj1@verification.local"
export const TEST_PASSWORD = "E2E-Test-Pw9!"
