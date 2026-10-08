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

// PROJ-3 fixtures (created in global-setup, removed in global-teardown). Users use P3_EMAIL_DOMAIN,
// tenants P3_TENANT_PREFIX, so teardown can sweep them (tenant deletion cascades to articles,
// Merkmale, roles and locks).
export const P3_EMAIL_DOMAIN = "e2e-proj3.local"
export const P3_TENANT_PREFIX = "E2E-P3 "
export const P3_TENANT = "E2E-P3 Mandant" // has Merkmale (Saison SOM=3, Artikeltyp FW=4, Basisartikel 1200)
export const P3_TENANT_LEER = "E2E-P3 Leer" // no Merkmale at all
export const P3_TENANT_FREMD = "E2E-P3 Fremd" // second tenant, for isolation tests
export const P3_PASSWORD = "E2E-Proj3-Pw9!"
export const P3_EINKAUF = "e2e_p3_einkauf" // Artikelstamm write + Merkmal masks write
export const P3_EINKAUF2 = "e2e_p3_einkauf2" // same role, second person (lock conflicts)
export const P3_LAGER = "e2e_p3_lager" // Artikelstamm read only
export const P3_OHNE = "e2e_p3_ohne" // member, role without any Warenwirtschaft mask
export const P3_LEER = "e2e_p3_leer" // Artikelstamm write in the empty tenant
export const P3_FREMD = "e2e_p3_fremd" // Artikelstamm write in the foreign tenant only
export const P3_MERKMAL_ONLY = "e2e_p3_saisonpflege" // only Merkmal Saisons write, no Artikelstamm
export const P3_BASE_CODE = "1200"

// PROJ-4 fixtures (created in global-setup, removed in global-teardown). Users use P4_EMAIL_DOMAIN,
// tenants P4_TENANT_PREFIX, so teardown can sweep them (tenant deletion cascades to addresses,
// contacts, countries, articles, roles and locks).
export const P4_EMAIL_DOMAIN = "e2e-proj4.local"
export const P4_TENANT_PREFIX = "E2E-P4 "
export const P4_TENANT = "E2E-P4 Mandant" // countries DE + AT, base article 1300, article type FW
export const P4_TENANT_LEER = "E2E-P4 Leer" // no addresses, no countries
export const P4_TENANT_FREMD = "E2E-P4 Fremd" // second tenant, for isolation tests
export const P4_PASSWORD = "E2E-Proj4-Pw9!"
export const P4_ADMIN = "e2e_p4_admin" // Adressen write + toggle, Kontakte write, Länder write, Artikelstamm write
export const P4_EINKAUF = "e2e_p4_einkauf" // Adressen write, Kontakte write, Länder read, Artikelstamm write
export const P4_EINKAUF2 = "e2e_p4_einkauf2" // same role, second person (lock conflicts)
export const P4_LAGER = "e2e_p4_lager" // Adressen read, Kontakte read
export const P4_LAGER_OHNE_KONTAKTE = "e2e_p4_lagerohnekontakte" // Adressen read only
export const P4_NUR_KONTAKTE = "e2e_p4_nurkontakte" // Kontakte read only (no Adressen mask)
export const P4_NUR_ARTIKEL = "e2e_p4_nurartikel" // Artikelstamm read only
export const P4_OHNE = "e2e_p4_ohne" // member, role without any Warenwirtschaft mask
export const P4_LEER = "e2e_p4_leer" // Adressen/Kontakte/Länder/Artikelstamm write in the empty tenant
export const P4_FREMD = "e2e_p4_fremd" // everything in the foreign tenant only
export const P4_BASE_CODE = "1300"
