# PROJ-1: Supabase-Infrastruktur (Self-Hosted, Multi-Tenant-Grundschema)

## Status: In Progress
**Created:** 2026-09-28
**Last Updated:** 2026-09-28

## Dependencies
- None

## User Stories
- Als Super-Admin möchte ich mich mit einem initial angelegten Account einloggen können, um danach Mandanten und User zu verwalten
- Als Betreiber möchte ich, dass das System von Grund auf mandantenfähig ist, damit später mehrere Firmenzweige sauber getrennt zentral verwaltet werden können
- Als User möchte ich mich mit Benutzername und Passwort einloggen, um auf die für mich freigegebenen Mandanten/Module/Masken zuzugreifen
- Als Betreiber möchte ich, dass Supabase lokal (self-hosted) läuft, damit die Datenhoheit bei mir bleibt
- Als Entwickler möchte ich eine verlässliche DB-Grundstruktur (Mandanten, User-Mandanten-Zuordnung, granulare Rechte-Platzhalter), damit darauf aufbauende Module (PROJ-2 ff.) nicht später migriert werden müssen

## Out of Scope
- UI zum Anlegen von Mandanten/Usern (→ PROJ-2)
- UI zum Zuweisen von Modul-/Masken-Rechten (→ PROJ-2)
- "Passwort vergessen"-Funktion (bewusst nicht benötigt, interne User)
- Self-Signup / öffentliche Registrierung
- Social-Logins / Magic-Link
- Mehrere aktive Mandanten im MVP (nur Default-Mandant wird geseedet, weitere folgen mit PROJ-2)

## Acceptance Criteria

**Format:** Angenommen [Vorbedingung] / Wenn [Aktion] / Dann [Ergebnis]

- [ ] Angenommen Supabase läuft lokal (self-hosted) und die Umgebungsvariablen sind korrekt gesetzt, wenn die Next.js-App startet, dann verbindet sie sich erfolgreich mit der lokalen PostgreSQL-Instanz
- [ ] Angenommen das Setup wird zum ersten Mal ausgeführt, wenn das Seed-Skript läuft, dann werden ein Default-Mandant und ein Super-Admin-Account gemäß den konfigurierten Umgebungsvariablen angelegt
- [ ] Angenommen ein Super-Admin-Account existiert, wenn er sich mit korrektem Benutzernamen und Passwort einloggt, dann erhält er mandantenübergreifenden Zugriff ohne Einschränkung durch Row-Level-Security
- [ ] Angenommen ein Passwort wird neu gesetzt, wenn es weniger als 8 Zeichen hat oder Groß-/Kleinbuchstabe, Zahl oder Sonderzeichen fehlt, dann wird es abgelehnt und ein Validierungsfehler angezeigt
- [ ] Angenommen ein User gibt einen falschen Benutzernamen oder ein falsches Passwort ein, wenn er auf "Anmelden" klickt, dann wird eine Fehlermeldung mit der Anzahl verbleibender Versuche vor der Sperre angezeigt
- [ ] Angenommen ein User hat 10 fehlgeschlagene Login-Versuche in Folge, wenn er einen weiteren Versuch startet, dann wird der Account für 15 Minuten gesperrt und eine entsprechende Meldung angezeigt
- [ ] Angenommen der Account ist gesperrt, wenn die 15 Minuten abgelaufen sind, dann kann sich der User wieder normal anmelden und der Fehlversuch-Zähler wird zurückgesetzt
- [ ] Angenommen zwei Mandanten existieren mit jeweils eigenen Daten, wenn ein regulärer (Nicht-Super-Admin) User auf Mandant A zugreift, dann sind Daten von Mandant B für ihn über Row-Level-Security nicht sichtbar, selbst bei direktem API-Zugriff
- [ ] Angenommen die lokale Postgres/Supabase-Instanz ist nicht erreichbar, wenn die App eine Verbindung aufbauen will, dann wird ein klarer Fehlerstatus angezeigt/geloggt statt eines unklaren Absturzes

## Edge Cases
- Umgebungsvariablen für Seed-Daten fehlen/unvollständig → Setup bricht mit klarer Fehlermeldung ab, keine unvollständigen Datensätze
- Seed-Skript wird mehrfach ausgeführt (z.B. erneutes Deploy) → muss idempotent sein, kein doppelter Default-Mandant/Super-Admin
- Verbindungsabbruch zur lokalen Postgres-Instanz während des Betriebs → klare Fehlermeldung statt stillem Fehler
- User ist für mehrere Mandanten freigeschaltet, aber noch keine Masken-Rechte zugewiesen → Grundgerüst muss das zulassen (leere Rechte-Menge = kein Maskenzugriff, Login trotzdem möglich)
- Tabelle ohne aktivierte RLS-Policy → sicherheitskritische Lücke, muss in QA explizit geprüft werden

## Technical Requirements
- Security: RLS auf allen mandantenspezifischen Tabellen aktiv; Super-Admin-Bypass explizit implementiert und geprüft
- Security: Passwort-Hashing über Supabase Auth; Login-Sperre nach 10 Fehlversuchen für 15 Minuten
- Infrastruktur: Self-hosted Supabase (lokale PostgreSQL via Docker/Supabase CLI), keine Cloud-Instanz

## Open Questions
- [ ] Exaktes Schema für granulare Masken-Rechte (User × Mandant × Modul × Maske) wird erst mit PROJ-2 final festgelegt — PROJ-1 legt nur die Grundstruktur/Platzhalter an

## Decision Log

### Product Decisions
| Decision | Rationale | Date |
|----------|-----------|------|
| Login über Benutzername statt E-Mail | Interne Mitarbeiter, keine öffentliche Registrierung nötig | 2026-09-28 |
| Kein "Passwort vergessen" | Nur Admin-verwaltete Accounts, geringe User-Zahl | 2026-09-28 |
| Seed statt Onboarding-UI für ersten Mandant/Admin | Einfacher für einmalige Ersteinrichtung; UI folgt in PROJ-2 | 2026-09-28 |
| User können mehreren Mandanten zugeordnet werden (m:n) | Zentrale Verwaltung mehrerer Firmenzweige durch dieselben Personen möglich | 2026-09-28 |
| Login-Sperre nach 10 Fehlversuchen, 15 Min, mit Anzeige verbleibender Versuche | Schutz vor Brute-Force bei vertretbarem UX-Aufwand | 2026-09-28 |
| PROJ-1 liefert nur DB-Grundstruktur für Rechte, keine Verwaltungs-UI | Trennung von Infrastruktur (PROJ-1) und Benutzerverwaltung (PROJ-2) nach Single Responsibility | 2026-09-28 |

### Technical Decisions
<!-- Added by /architecture -->
| Decision | Rationale | Date |
|----------|-----------|------|
| Self-hosted Supabase (Docker/CLI) statt Supabase Cloud | Volle Datenhoheit, keine Abhängigkeit von externem Cloud-Anbieter, entspricht PRD-Konstraint | 2026-09-28 |
| Login per Benutzername, echte E-Mail im Profil hinterlegt | Benutzername wird beim Login serverseitig zur hinterlegten E-Mail aufgelöst, mit der die eigentliche Supabase-Auth-Anmeldung erfolgt; E-Mail bleibt Stammdatum, kein Login-Merkmal | 2026-09-28 |
| Mandantentrennung über Row-Level-Security in der Datenbank | Isolation wird in der DB selbst erzwungen, nicht nur in der App-Logik — schützt auch bei direktem API-Zugriff oder App-Fehlern | 2026-09-28 |
| Super-Admin-Bypass als explizite, geprüfte RLS-Ausnahmeregel | Macht die mandantenübergreifende Ausnahme nachvollziehbar und auditierbar statt einer pauschalen "Alle Rechte"-Logik | 2026-09-28 |
| Login-Sperre (Fehlversuche + Sperrzeit) serverseitig in der DB gespeichert | Kann nicht durch Neuladen der Seite oder Gerätewechsel umgangen werden | 2026-09-28 |
| Zugriffsschutz über serverseitige Prüfung bei jedem Seitenaufruf | Stellt sicher, dass ungeschützte Seiten nicht versehentlich ohne Login erreichbar sind | 2026-09-28 |
| Keine neuen npm-Pakete — `@supabase/supabase-js` und `zod` reichen aus | Bereits im Projekt vorhanden, deckt DB/Auth-Anbindung und Passwort-Validierung ab | 2026-09-28 |

---
<!-- Sections below are added by subsequent skills -->

## Tech Design (Solution Architect)

### A) Komponentenstruktur

```
App
├── Login-Seite
│   ├── Eingabefeld: Benutzername
│   ├── Eingabefeld: Passwort
│   ├── Fehlermeldung (inkl. "noch X Versuche übrig")
│   └── Sperr-Hinweis ("Account gesperrt, versuche es in X Minuten erneut")
├── Auth-Schutzschicht (prüft bei jedem Seitenaufruf: eingeloggt? sonst → Login-Seite)
└── Platzhalter-Startseite nach Login ("Eingeloggt als [Name/Super-Admin]")
    (dient nur als Nachweis, dass Login funktioniert — der eigentliche Dashboard-Inhalt kommt mit späteren Modulen)
```

### B) Datenmodell (in einfacher Sprache)

**Mandant** (Tenant)
- Eindeutige ID, Name, Erstellungsdatum

**Benutzer**
- Eindeutige ID, Benutzername, E-Mail-Adresse (Stammdatum, kein Login-Merkmal), Passwort (verwaltet durch Supabase Auth), Kennzeichen "ist Super-Admin", Erstellungsdatum
- Fehlversuchs-Zähler + Zeitpunkt bis wann gesperrt (für die 10-Versuche/15-Minuten-Sperre)

**Benutzer-Mandant-Zuordnung**
- Verknüpft einen Benutzer mit einem oder mehreren Mandanten (Mehrfachzuordnung möglich)
- Enthält noch keine Modul-/Masken-Rechte — das ist die Grundlage, auf der PROJ-2 die granulare Rechtevergabe aufbaut

**Rechte-Grundgerüst** (leer/Platzhalter in PROJ-1)
- Struktur ist so angelegt, dass später pro Benutzer + Mandant + Modul + Maske einzeln festgelegt werden kann, was sichtbar ist — die eigentliche Befüllung/Oberfläche kommt mit PROJ-2

**Speicherort:** Lokale, selbst gehostete PostgreSQL-Datenbank (über Supabase, via Docker)

### C) Technische Entscheidungen (für PM verständlich)

1. **Self-hosted Supabase statt Supabase Cloud** — läuft komplett lokal bei euch (Docker), ihr behaltet die volle Datenhoheit, keine Abhängigkeit von einem externen Cloud-Anbieter.
2. **Benutzername als Login, echte E-Mail als Stammdatum** — der Benutzer bekommt seine echte E-Mail-Adresse im Profil hinterlegt. Auf der Login-Maske gibt er aber nur seinen Benutzernamen ein; dieser wird serverseitig zur hinterlegten E-Mail aufgelöst, mit der dann die eigentliche Anmeldung bei Supabase Auth erfolgt. Für den User bleibt es ein reiner Benutzername-Login.
3. **Datenbank erzwingt die Mandantentrennung (Row-Level-Security)** — die Trennung der Mandanten-Daten wird direkt in der Datenbank abgesichert, nicht nur in der App. Das heißt: selbst wenn irgendwo in der App später ein Fehler passiert, kann ein Mandant technisch trotzdem nicht an die Daten eines anderen Mandanten kommen.
4. **Super-Admin-Bypass als explizite Ausnahme-Regel** — der Super-Admin bekommt eine gesondert geprüfte, dokumentierte Ausnahme von der Mandantentrennung, statt einfach "alle Rechte" zu bekommen. Das macht die Ausnahme später überprüfbar (z.B. im Sicherheits-Audit bei `/qa`).
5. **Login-Sperre wird in der Datenbank gespeichert, nicht im Browser** — Fehlversuche und Sperrzeit werden serverseitig gespeichert. Ein Neuladen der Seite oder ein anderes Gerät kann die Sperre also nicht umgehen.
6. **Zugriffsschutz auf Seitenebene** — jede Seite prüft automatisch, ob ein gültiger Login vorliegt, bevor Inhalte angezeigt werden; ohne Login geht es immer zurück zur Login-Seite.

### D) Abhängigkeiten (Pakete)
- `@supabase/supabase-js` — bereits installiert, Verbindung zur Datenbank & Auth
- Supabase CLI — kein npm-Paket, sondern ein lokales Tool zum Starten/Verwalten der self-hosted Supabase-Instanz (Docker-basiert)
- Keine neuen Pakete nötig — `zod` (Validierung, z.B. Passwortrichtlinie) ist bereits vorhanden

## Implementation Notes (Frontend)

**Gebaut:**
- Design-System aus `docs/design-system.md` als Tailwind-Theme umgesetzt (`src/app/globals.css`, `tailwind.config.ts`): warme Farbpalette (inkl. Dark-Mode-Variante), Fraunces (Headings) + Instrument Sans (Body) via `next/font/google` in `src/app/layout.tsx`
- `src/app/login/page.tsx` + `src/components/login-form.tsx`: Login-Formular (Benutzername/Passwort) mit react-hook-form + zod, Lade-/Fehlerzustände inkl. "noch X Versuche übrig" und Sperr-Hinweis, generische Verbindungsfehler-Meldung
- `src/app/page.tsx`: Platzhalter-Startseite nach Login

**Bewusste Abweichungen / offene Anschlussstellen für `/backend`:**
- Das Login-Formular ruft `POST /api/auth/login` auf — diese Route existiert noch nicht, wird von `/backend` implementiert (Benutzername→E-Mail-Auflösung, Supabase-Auth-Anmeldung, Fehlversuchs-/Sperr-Logik in der DB)
- Die Startseite (`/`) ist aktuell **nicht** durch eine echte Session-Prüfung geschützt (kein Redirect zu `/login`) — die Auth-Schutzschicht aus dem Tech Design braucht die von `/backend` bereitgestellte Session-Validierung (Cookie/Middleware) und wird dann ergänzt
- Passwortrichtlinien-Validierung (AC 4) betrifft das Anlegen/Setzen von Passwörtern (Seed/PROJ-2), nicht das Login-Formular selbst — daher hier keine Policy-Prüfung im Login-Formular

## Implementation Notes (Backend)

**Gebaut:**
- Lokales, self-hosted Supabase-Projekt initialisiert (`supabase/`, via `npx supabase` — kein globales Install nötig)
- Migrationen (`supabase/migrations/`): `tenants`, `user_profiles` (Benutzername, echte E-Mail, Super-Admin-Flag, Fehlversuchs-Zähler, Sperrzeit), `user_tenant_access` (m:n), `permissions` (leeres Grundgerüst für PROJ-2), passende Indizes
- Helper-Funktionen `is_super_admin()` / `has_tenant_access(tenant_id)` (SECURITY DEFINER) + RLS-Policies (inkl. `FORCE ROW LEVEL SECURITY`) auf allen vier Tabellen
- `scripts/seed.mjs` (`npm run seed`): idempotentes Seed von Default-Mandant + Super-Admin aus Env-Vars
- `src/lib/supabase.ts` (Browser-Client), `src/lib/supabase-server.ts` (Cookie-Session-Client), `src/lib/supabase-admin.ts` (Service-Role-Client, server-only)
- `POST /api/auth/login`: Benutzername→E-Mail-Auflösung, Sperr-Check, echte Supabase-Auth-Anmeldung, Fehlversuchs-Zähler + 15-Min-Sperre ab 10 Versuchen, Reset bei Erfolg
- `POST /api/auth/logout`, `src/middleware.ts` (schützt alle Routen außer `/login`, Session-Refresh)
- `src/app/page.tsx` liest jetzt die echte Session/das Profil statt eines Platzhaltertexts
- 6 Vitest-Integrationstests für `/api/auth/login` (Validierung, unbekannter User, Sperre, Fehlversuch-Zähler, Sperr-Auslösung, erfolgreicher Login) — alle grün

**Manuell gegen den echten lokalen Stack verifiziert** (Migrationen wurden sauber angewendet):
- Seed erstellt Mandant + Super-Admin; erneuter Lauf erkennt beides und überspringt (Idempotenz, Edge Case aus der Spec)
- Echter Login mit falschem Passwort schlägt fehl, mit korrektem Passwort gelingt er (via Supabase Auth, nicht gemockt)
- RLS greift wirklich: ein reguläres (Nicht-Super-Admin-)Testkonto mit Zugriff auf nur einen Mandanten konnte einen zweiten Mandanten über die API nicht sehen — Test-Accounts danach wieder entfernt

**Bewusste Abweichungen / offen für `/qa`:**
- Login-Sperre wurde nur über Unit-Tests (gemockt) und die "10. Versuch → Sperre"-Logik geprüft, nicht live 10x gegen den echten Stack durchgeklickt — sollte in `/qa` einmal live nachvollzogen werden
- `.env.local.example` konnte ich nicht ergänzen (Security-Regel verbietet mir jeden Zugriff auf `.env*`-Dateien) — der Nutzer hat die nötigen Variablen (`SUPABASE_SERVICE_ROLE_KEY`, `SEED_*`) selbst dokumentiert bekommen und muss sie manuell in `.env.local` bzw. `.env.local.example` eintragen
- Passwortrichtlinie (AC 4: min. 8 Zeichen, Groß-/Klein, Zahl, Sonderzeichen) wird noch nicht serverseitig erzwungen, da es aktuell keine "Passwort setzen"-UI gibt (kommt mit PROJ-2); der Seed selbst validiert die Passwortstärke nicht

## QA Test Results
_To be added by /qa_

## Deployment
_To be added by /deploy_
