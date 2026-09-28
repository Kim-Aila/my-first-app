# PROJ-1: Supabase-Infrastruktur (Self-Hosted, Multi-Tenant-Grundschema)

## Status: Planned
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
- [ ] Wie wird Benutzername-Login technisch auf Supabase Auth (nativ E-Mail-basiert) abgebildet? → Für `/architecture`
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

---
<!-- Sections below are added by subsequent skills -->

## Tech Design (Solution Architect)
_To be added by /architecture_

## QA Test Results
_To be added by /qa_

## Deployment
_To be added by /deploy_
