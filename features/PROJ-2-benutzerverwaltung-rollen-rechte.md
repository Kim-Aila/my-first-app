# PROJ-2: Benutzerverwaltung & Rollen-/Rechtesystem

## Status: Approved
**Created:** 2026-09-29
**Last Updated:** 2026-09-30 (QA re-verification)

## Dependencies
- Requires: PROJ-1 (Supabase-Infrastruktur) — nutzt `tenants`, `user_profiles`, `user_tenant_access`, `permissions` als Grundgerüst; Login/Session/RLS-Basis ist bereits vorhanden

## User Stories
- Als Super-Admin möchte ich neue Mandanten anlegen können, damit neue Firmenzweige im System abgebildet werden können
- Als Super-Admin möchte ich einem User das Super-Admin-Flag geben oder entziehen können, damit die Systemverantwortung nicht dauerhaft an einen einzigen Account gebunden bleibt
- Als Mandanten-Admin möchte ich innerhalb meines Mandanten Rollen mit Maskenrechten anlegen können, damit ich Zugriffe passend zu den Funktionsbereichen meines Firmenzweigs steuern kann
- Als Mandanten-Admin möchte ich neue User für meinen Mandanten anlegen und ihnen Rollen zuweisen können, damit neue Mitarbeiter sofort mit passenden Zugriffsrechten starten können
- Als User möchte ich mein eigenes Passwort ändern können, damit ich nicht dauerhaft auf das initiale Admin-Passwort angewiesen bin
- Als Mandanten-Admin möchte ich einen User aus meinem Mandanten entfernen können, ohne dass er in anderen Mandanten betroffen ist, damit Zugriffsänderungen sauber auf meinen Verantwortungsbereich beschränkt bleiben
- Als Super-Admin möchte ich einen User global deaktivieren können, damit ausgeschiedene Mitarbeiter sich nirgends mehr einloggen können

## Out of Scope
- Individuelle Maskenrechte-Overrides pro User (nur Rollen-Bündel, keine Ausnahmen pro User)
- Globale/geteilte Rollen über Mandanten hinweg — Rollen sind strikt pro Mandant definiert
- Volle CRUD-Granularität pro Maske (Lesen/Anlegen/Bearbeiten/Löschen einzeln) — nur Sichtbarkeit an/aus, kann später erweitert werden
- Mandanten-Admin fügt bestehende User aus anderen Mandanten zu seinem Mandanten hinzu — nur Super-Admin kann mandantenübergreifend agieren, Mandanten-Admin kann nur neue User anlegen
- Automatisches Anlegen einer Standard-Rolle "Administrator" bei neuem Mandanten — Super-Admin legt Rolle und ersten User manuell an
- Schutz vor "letztem Mandanten-Admin" eines Mandanten (nur der letzte globale Super-Admin ist geschützt, siehe AC)
- Mandanten löschen oder umbenennen durch den Mandanten selbst (Mandanten-Admin) — nur Super-Admin kann Mandanten anlegen/umbenennen; Löschen von Mandanten generell nicht Teil dieser Version
- Echtes/hartes Löschen von Usern — nur Deaktivieren (global) bzw. Entfernen aus einem einzelnen Mandanten
- Self-Signup, "Passwort vergessen", Formatregeln für Benutzernamen über Eindeutigkeit hinaus (konsistent mit PROJ-1)
- Audit-Log für Rechte-/Rollenänderungen (wer hat wann was geändert) — siehe Open Questions
- Agenten-Automatisierung (PRD Non-Goal, siehe PROJ-10)

## Acceptance Criteria

**Format:** Angenommen [Vorbedingung] / Wenn [Aktion] / Dann [Ergebnis]

- [ ] Angenommen der Super-Admin ist eingeloggt, wenn er einen neuen Mandanten mit eindeutigem Namen anlegt, dann erscheint der Mandant sofort in der Mandantenliste, ohne automatisch angelegte Rollen oder User
- [ ] Angenommen ein neuer Mandant ohne Rollen/User existiert, wenn der Super-Admin die erste Rolle "Administrator" mit Zugriff auf die Maske "Benutzerverwaltung" anlegt und einem neuen User zuweist, dann kann sich dieser User einloggen und hat Zugriff auf die Benutzerverwaltung dieses Mandanten
- [ ] Angenommen ein Mandanten-Admin (User mit Zugriff auf die Maske "Benutzerverwaltung" in seinem Mandanten) ist eingeloggt, wenn er eine neue Rolle mit einer Auswahl an Masken anlegt, dann ist diese Rolle nur in seinem eigenen Mandanten sichtbar und nutzbar
- [ ] Angenommen ein User hat in einem Mandanten mehrere Rollen zugewiesen, wenn seine sichtbaren Masken berechnet werden, dann sieht er die Vereinigung aller Masken aus allen zugewiesenen Rollen
- [ ] Angenommen ein Mandanten-Admin legt einen neuen User für seinen Mandanten an, wenn er ein Initial-Passwort vergibt, das nicht der Passwortrichtlinie entspricht (min. 8 Zeichen, Groß-/Kleinbuchstabe, Zahl, Sonderzeichen), dann wird die Anlage abgelehnt und ein Validierungsfehler angezeigt
- [ ] Angenommen ein Mandanten-Admin legt einen neuen User an, wenn der gewählte Benutzername systemweit bereits vergeben ist, dann wird die Anlage mit einer entsprechenden Fehlermeldung abgelehnt
- [ ] Angenommen ein eingeloggter User öffnet seinen Profilbereich, wenn er sein aktuelles Passwort korrekt eingibt und ein neues Passwort nach Richtlinie vergibt, dann wird sein Passwort geändert und er bleibt eingeloggt
- [ ] Angenommen ein eingeloggter User öffnet seinen Profilbereich, wenn er sein aktuelles Passwort falsch eingibt, dann wird die Passwortänderung abgelehnt und eine Fehlermeldung angezeigt, ohne das neue Passwort zu speichern
- [ ] Angenommen ein Mandanten-Admin ist eingeloggt, wenn er einen User aus seinem eigenen Mandanten entfernt, dann verliert der User den Zugriff auf diesen Mandanten, bleibt aber in anderen Mandanten und global weiterhin aktiv
- [ ] Angenommen der Super-Admin ist eingeloggt, wenn er einen User global deaktiviert, dann kann sich dieser User in keinem Mandanten mehr einloggen, unabhängig von seinen Rollen
- [ ] Angenommen eine Rolle ist noch mindestens einem User zugewiesen, wenn ein Mandanten-Admin oder Super-Admin diese Rolle löscht, dann wird die Rolle entfernt und die betroffenen User verlieren automatisch die damit verbundenen Maskenrechte, ohne dass ihr Login blockiert wird
- [ ] Angenommen es existiert genau ein Super-Admin im System, wenn versucht wird, ihm das Super-Admin-Flag zu entziehen, dann wird die Aktion blockiert und eine Fehlermeldung angezeigt, dass mindestens ein Super-Admin bestehen bleiben muss
- [ ] Angenommen es existieren mindestens zwei Super-Admins, wenn einem von ihnen das Super-Admin-Flag entzogen wird, dann wird die Aktion durchgeführt und der User verliert die mandantenübergreifenden Rechte
- [ ] Angenommen ein Mandanten-Admin ist eingeloggt, wenn er versucht, einen bereits existierenden User eines anderen Mandanten zu seinem eigenen Mandanten hinzuzufügen, dann steht ihm nur die Neuanlage eines Users zur Verfügung, keine Zuordnung bestehender fremder User
- [ ] Angenommen ein Super-Admin ist eingeloggt, wenn er einem beliebigen User das Super-Admin-Flag setzt, dann erhält dieser User ab sofort mandantenübergreifenden Zugriff ohne Einschränkung durch Row-Level-Security
- [ ] Angenommen ein deaktivierter User versucht sich einzuloggen, wenn seine Zugangsdaten korrekt sind, dann wird der Login trotzdem abgelehnt mit einer eindeutigen Meldung, dass der Account deaktiviert ist

## Edge Cases
- Ein Mandanten-Admin entzieht sich selbst als letztem Admin seines Mandanten den Zugriff auf die Maske "Benutzerverwaltung" → wird ohne Warnung zugelassen (siehe Decision Log); der Mandant hat danach keinen eigenen Admin mehr, der Super-Admin kann jederzeit über sein mandantenübergreifendes Recht wieder eingreifen
- Ein User verliert (z.B. durch Rollenlöschung) alle Rollen in einem Mandanten → er bleibt dem Mandanten zugeordnet und kann sich einloggen, sieht dort aber keine Masken mehr (leere Rechte-Menge blockiert den Login nicht, analog zu PROJ-1)
- Zwei Rollen mit demselben Namen im selben Mandanten → wird verhindert, Rollenname muss innerhalb eines Mandanten eindeutig sein (Mandant A und B dürfen aber gleichnamige Rollen unabhängig voneinander haben)
- Zwei Admins bearbeiten gleichzeitig dieselbe Rolle → kein Konflikt-Handling in dieser Version, letzter Speichervorgang gewinnt (siehe Decision Log)
- API/Datenbank beim Speichern von User/Rolle/Mandant nicht erreichbar → Fehlermeldung wird angezeigt, Formulareingaben bleiben erhalten, nichts wird teilweise gespeichert
- Mandanten-Admin versucht, den Namen seines eigenen Mandanten zu ändern → nicht möglich, nur der Super-Admin kann Mandanten umbenennen

## Technical Requirements
- Security: Alle Schreibaktionen (User/Rollen/Mandanten anlegen/ändern) serverseitig gegen die Berechtigung des ausführenden Users geprüft, nicht nur clientseitig ausgeblendet
- Security: Mandanten-Admin-Aktionen serverseitig strikt auf den eigenen Mandanten beschränkt (RLS + Anwendungslogik), auch bei direktem API-Zugriff
- Security: Passwort-Richtlinie aus PROJ-1 gilt auch für vom Admin vergebene Initial-Passwörter und für die "Passwort ändern"-Funktion

## Open Questions
- [ ] Soll es ein Audit-Log für Rechte-/Rollenänderungen geben (wer hat wann welche Rolle/welches Maskenrecht geändert)? Im Interview nicht vertieft — für später relevant, sobald mehrere Mandanten-Admins parallel agieren
- [ ] Soll ein deaktivierter Mandant (falls Mandanten-Löschung/-Deaktivierung später eingeführt wird) automatisch alle zugehörigen User-Zuordnungen sperren? Aktuell nicht relevant, da Mandanten in dieser Version nicht gelöscht/deaktiviert werden können

## Decision Log

### Product Decisions
| Decision | Rationale | Date |
|----------|-----------|------|
| Zwei Admin-Ebenen: Super-Admin (mandantenübergreifend) + Mandanten-Admin (nur eigener Mandant) | Spiegelt die PRD-Rolle "Administratoren" pro Firmenzweig, entlastet den Super-Admin von Routineverwaltung | 2026-09-29 |
| Maskenrechte nur als Sichtbarkeit an/aus, keine CRUD-Granularität | Ausreichend für 30 Nutzer/Mandant im MVP, vermeidet Overengineering eines Rechtesystems mit aktuell nur 1 realer Maske | 2026-09-29 |
| Maskenliste aktuell nur "Benutzerverwaltung"; weitere Masken werden von künftigen Modulen (PROJ-3 ff.) selbst ergänzt | Keine Notwendigkeit, jetzt schon Platzhalter für unbekannte künftige Masken zu pflegen | 2026-09-29 |
| Initial-Passwort wird vom Admin manuell vergeben (kein Zufallspasswort-Generator) | Einfachste Lösung ohne zusätzlichen technischen Aufwand; interne, kleine Nutzerzahl | 2026-09-29 |
| Self-Service "Passwort ändern" für alle eingeloggten User | Sinnvolle Ergänzung zum admin-vergebenen Initial-Passwort, verhindert dauerhafte Abhängigkeit vom Admin | 2026-09-29 |
| Super-Admin kann Mandanten anlegen/umbenennen; kein Mandanten-Löschen in dieser Version | Deckt den PRD-Bedarf nach mehreren Firmenzweigen; Löschen ist riskant/selten und wird bewusst verschoben | 2026-09-29 |
| User werden deaktiviert statt gelöscht (global); zusätzlich separat aus einzelnen Mandanten entfernbar | Verhindert Datenlücken bei künftigen Modulen mit User-Referenzen; deckt sowohl "Mitarbeiter verlässt Firmenzweig" als auch "Mitarbeiter verlässt Firma komplett" ab | 2026-09-29 |
| Echte Rollen als Bündel von Maskenrechten statt individueller Maskenrechte pro User | Entspricht explizit dem PRD-Begriff "Rollen-/Rechtesystem"; nach initialer Rückfrage vom Nutzer bewusst korrigiert (ursprünglicher Vorschlag "rein individuell" wurde verworfen) | 2026-09-29 |
| Keine individuellen Maskenrechte-Overrides zusätzlich zu Rollen | Hält das Modell für MVP einfach; bei Bedarf für einzelne Ausnahmen später per `/refine` nachrüstbar | 2026-09-29 |
| Rollen sind pro Mandant definiert, nicht global | Passt zur sauberen Mandantentrennung; unterschiedliche Firmenzweige können unterschiedliche Funktionsbereiche/Rollen haben | 2026-09-29 |
| Rollen-Verwaltung (Anlegen/Bearbeiten) durch Mandanten-Admin (= Zugriff auf Maske "Benutzerverwaltung") und Super-Admin | Konsistent dazu, dass wer User verwaltet auch die dafür nötigen Rollen selbst pflegen können muss | 2026-09-29 |
| Mandanten-Admin-Status ist kein eigenes Flag, sondern ergibt sich aus Rollenzugriff auf die Maske "Benutzerverwaltung" im jeweiligen Mandanten | Konsistent mit der Entscheidung "Rollen = Bündel von Maskenrechten", kein zusätzliches Datenmodell-Konzept nötig | 2026-09-29 |
| Neuer Mandant startet leer — Super-Admin legt Rolle "Administrator" und ersten User manuell an | Kein Sonderfall/Auto-Seed-Logik im Code nötig, Ablauf bleibt für Super-Admin einfach nachvollziehbar | 2026-09-29 |
| Mehrfachrollen pro User und Mandant, additiv (Vereinigung der Maskenrechte) | Realistisch für kleine Firmenzweige, in denen einzelne Mitarbeiter mehrere Funktionsbereiche abdecken | 2026-09-29 |
| Rolle kann gelöscht werden, auch wenn noch zugewiesen; Zuweisung fällt automatisch weg | Nutzerentscheidung: einfacherer Ablauf ohne Lösch-Blockade bevorzugt gegenüber zusätzlicher Sicherheitsabfrage | 2026-09-29 |
| Keine Schutzlogik gegen "letzten Mandanten-Admin ohne Zugriff" | Super-Admin ist als mandantenübergreifender Fallback immer verfügbar, zusätzliche Sperrlogik hier nicht nötig | 2026-09-29 |
| Keine Formatregeln für Benutzernamen außer Eindeutigkeit | Maximale Flexibilität, geringes Risiko bei kleiner, intern verwalteter Nutzerzahl | 2026-09-29 |
| Super-Admin kann weitere User per UI zu Super-Admins machen | Vermeidet dauerhafte Abhängigkeit von einem einzigen Seed-Account | 2026-09-29 |
| Letzter verbleibender Super-Admin ist vor Selbstentzug/Fremdentzug des Flags geschützt | Verhindert eine komplette Aussperrung aus dem System ohne direkten DB-Zugriff | 2026-09-29 |
| Mandanten-Admin kann nur neue User anlegen, keine bestehenden User anderer Mandanten hinzufügen | Verhindert versehentliche mandantenübergreifende Datenfreigabe durch einen nicht-privilegierten Admin | 2026-09-29 |
| Kein Konflikt-Handling bei gleichzeitiger Bearbeitung derselben Rolle (last-write-wins) | Bei ~30 Nutzern/Mandant und wenigen Admins ist gleichzeitige Bearbeitung derselben Rolle unwahrscheinlich; optimistic locking wäre Overengineering für MVP | 2026-09-29 |

### Technical Decisions
<!-- Added by /architecture -->
| Decision | Rationale | Date |
|----------|-----------|------|
| Alte, ungenutzte `permissions`-Platzhaltertabelle aus PROJ-1 wird per Migration entfernt und durch `roles`, `role_permissions`, `user_roles` ersetzt | Passt nicht mehr zum in PROJ-2 gewählten Rollenmodell (Bündel statt Einzel-Rechte); Tabelle war noch nie befüllt, kein Datenverlust | 2026-09-29 |
| Neue Tabelle `roles` (gehört zu einem Mandanten, Name eindeutig je Mandant) | Bildet "Rollen pro Mandant" aus der Spec ab | 2026-09-29 |
| Neue Tabelle `role_permissions` (Rolle → Modul + Maske) statt separater Maskenregister-Tabelle | Modul/Maske werden direkt am Rollen-Recht gespeichert; neue Module führen einfach neue Maskennamen ein, ohne Schema-Änderung | 2026-09-29 |
| Neue Tabelle `user_roles` (User + Mandant + Rolle, mehrere Zeilen pro User/Mandant möglich) | Bildet additive Mehrfachrollen pro User und Mandant ab | 2026-09-29 |
| Neues Feld "global aktiv" auf `user_profiles` statt separater Status-Tabelle | Einfachste Abbildung der globalen Deaktivierung, konsistent mit bestehenden Feldern wie dem Sperr-Status aus PROJ-1 | 2026-09-29 |
| Mandanten-Admin-Erkennung über Rollenzugriff auf Maske "Benutzerverwaltung" statt eigenes Boolean-Feld | Vermeidet ein zweites, parallel zu pflegendes Berechtigungskonzept neben dem Rollenmodell | 2026-09-29 |
| "Letzter Super-Admin bleibt erhalten"-Regel wird serverseitig vor dem Speichern geprüft (nicht nur clientseitig) | Kann sonst über direkten API-Aufruf umgangen werden; konsistent mit Security-Regeln des Projekts | 2026-09-29 |
| Alle neuen Tabellen (`roles`, `role_permissions`, `user_roles`) erhalten RLS-Policies + Indizes wie die bestehenden PROJ-1-Tabellen | Verpflichtend laut Projekt-Backend-Regeln ("Never skip RLS"); wird von `/backend` konkret umgesetzt | 2026-09-29 |
| Keine neuen npm-Pakete | Vorhandene shadcn/ui-Komponenten und react-hook-form/zod decken alle neuen Formulare/Listen ab | 2026-09-29 |

---
<!-- Sections below are added by subsequent skills -->

## Tech Design (Solution Architect)

### A) Komponentenstruktur

```
App (nach Login)
├── Sidebar-Navigation
│   └── Menüpunkt "Benutzerverwaltung" (nur sichtbar für User mit Zugriff auf diese Maske)
│
├── Benutzerverwaltung (pro Mandant — für Mandanten-Admin & Super-Admin)
│   ├── Tab "Benutzer"
│   │   ├── Benutzerliste (Benutzername, zugewiesene Rollen, Status)
│   │   ├── "Neuer Benutzer"-Formular (Benutzername, E-Mail, Initial-Passwort, Rollen-Auswahl per Checkbox)
│   │   └── Aktion pro Zeile: "Aus diesem Mandanten entfernen"
│   └── Tab "Rollen"
│       ├── Rollenliste (Name, Anzahl Masken, Anzahl zugewiesener User)
│       ├── "Neue Rolle"-Formular (Name, Masken-Auswahl per Checkbox)
│       └── Rolle bearbeiten / löschen
│
├── Mandantenverwaltung (nur Super-Admin, mandantenübergreifend)
│   ├── Mandantenliste
│   └── "Neuer Mandant"-Formular (Name) / Mandant umbenennen
│
├── Globale Benutzerverwaltung (nur Super-Admin)
│   ├── Liste aller User systemweit (mandantenübergreifend)
│   ├── Schalter "Super-Admin" pro User (mit Schutz gegen Entzug des letzten Super-Admins)
│   └── Aktion "Global (de)aktivieren" pro User
│
└── Profilbereich (jeder eingeloggte User)
    └── "Passwort ändern"-Formular (aktuelles + neues Passwort nach Richtlinie)
```

### B) Datenmodell (in einfacher Sprache)

**Bereits vorhanden aus PROJ-1 (unverändert nutzbar):**
- **Mandant** — ID, Name, Erstellungsdatum
- **Benutzer** — ID, Benutzername, E-Mail, Super-Admin-Kennzeichen, Login-Sperr-Felder
- **Benutzer-Mandant-Zuordnung** — verknüpft einen Benutzer mit einem oder mehreren Mandanten; "aus Mandant entfernen" bedeutet, diese Zuordnung zu entfernen

**Neu in PROJ-2:**
- **Benutzer** erhält ein zusätzliches Feld "global aktiv" (Standard: aktiv) — deckt die globale Deaktivierung ab, unabhängig von der Mandantenzugehörigkeit
- **Rolle** — gehört zu genau einem Mandanten, hat einen Namen (eindeutig innerhalb dieses Mandanten)
- **Rollen-Maskenrechte** — legt fest, welche Masken (Modul + Maske) eine Rolle freischaltet
- **Benutzer-Rollen-Zuordnung** — legt fest, welche Rolle(n) ein Benutzer innerhalb eines bestimmten Mandanten hat (mehrere Rollen pro Benutzer und Mandant möglich, additiv)

**Ersetzt:** Die leere, noch ungenutzte Rechte-Platzhaltertabelle aus PROJ-1 (User × Mandant × Modul × Maske) wird entfernt und durch die drei neuen Rollen-Tabellen oben ersetzt — sie war als Grundgerüst bewusst noch offen gehalten, bis PROJ-2 das endgültige Rechtemodell (Rollen statt Einzel-Rechte) festlegt. Da die Tabelle nie befüllt wurde, gehen keine Daten verloren.

**Kein separates "Maskenregister":** Modul- und Maskenname werden direkt in den Rollen-Maskenrechten gespeichert. Wenn ein künftiges Modul (z.B. PROJ-3 Artikelstamm) eine neue Maske einführt, trägt es einfach einen neuen Maskennamen in diese Tabelle ein — keine Schema-Änderung nötig.

**Speicherort:** Wie bei PROJ-1 die lokale, selbst gehostete PostgreSQL-Datenbank (Supabase).

### C) Technische Entscheidungen (für PM verständlich)

1. **Rollenbasiertes statt Einzel-Rechte-Modell** — passend zur Spec-Entscheidung, dass Rechte über wiederverwendbare Rollen statt einzeln pro User vergeben werden. Weniger Klickaufwand bei 30 Usern pro Mandant.
2. **Mandanten-Admin-Status ergibt sich aus Rollenzugriff, kein eigenes Datenfeld** — wer über eine Rolle Zugriff auf die Maske "Benutzerverwaltung" hat, gilt als Mandanten-Admin. Vermeidet ein zweites, parallel zu pflegendes Berechtigungskonzept.
3. **Alte Rechte-Platzhaltertabelle wird ersetzt, nicht daneben stehen gelassen** — verhindert verwirrenden toten Code im Datenmodell; unkritisch, da sie noch nie befüllt wurde.
4. **Serverseitige Prüfung jeder Schreibaktion, nicht nur UI-Ausblendung** — sowohl "darf dieser User in diesem Mandanten Rollen/User verwalten?" als auch "bleibt mindestens ein Super-Admin übrig?" werden serverseitig vor dem Speichern geprüft, ergänzt durch Datenbank-Zugriffsschutz (RLS) als zweite Sicherheitsebene. Konsistent mit dem Sicherheitsmodell aus PROJ-1 und den Projekt-Sicherheitsregeln — verhindert Umgehung über direkte API-Aufrufe.
5. **Initial-Passwort nutzt dieselbe Passwortrichtlinie wie das bestehende Seed-Skript** — keine doppelte Validierungslogik, ein einziger Ort für "was ist ein gültiges Passwort".
6. **Keine neuen Pakete** — alle benötigten UI-Bausteine (Tabellen, Formulare, Checkboxen, Schalter, Tabs, Dialoge) sind über shadcn/ui bereits im Projekt vorhanden; Formulare nutzen wie bisher react-hook-form + zod.

### D) Abhängigkeiten (Pakete)
- Keine neuen npm-Pakete nötig — `@supabase/supabase-js`, `zod`, `react-hook-form` sowie die benötigten shadcn/ui-Komponenten (Table, Dialog, Checkbox, Switch, Tabs, Form) sind bereits installiert

## Implementation Notes (Frontend)

**Gebaut:**
- App-Shell mit Sidebar (shadcn `sidebar`): neue Route-Gruppe `src/app/(app)/` mit `layout.tsx` (Sidebar + Kopfzeile mit Toggle, Sonner-Toaster), `loading.tsx` (Skeleton) und `error.tsx` (Fehlerkarte mit "Erneut versuchen"). Die bisherige Startseite liegt jetzt unter `src/app/(app)/page.tsx`; `/login` bleibt außerhalb der Gruppe und hat keine Sidebar. Abmelden ist jetzt im Benutzermenü unten in der Sidebar.
- `src/components/app-sidebar.tsx`: Logo/Brand oben, Navigation (Startseite; Gruppe "Verwaltung": Benutzerverwaltung / Mandanten / Globale Benutzerverwaltung; Gruppe "Konto": Profil), Benutzerblock mit Avatar + Dropdown (Profil, Abmelden) unten; einklappbar (Icon-Modus), auf Mobile als Sheet
- `src/lib/session-context.ts` (`getSessionContext`, per `React.cache` pro Request geteilt): lädt User, Profil, sichtbare Mandanten und die Mandanten mit Maske "Benutzerverwaltung" (Super-Admin: alle). Steuert Sichtbarkeit der Menüpunkte und den Seitenzugriff (Seiten zeigen "Kein Zugriff"-Karte, wenn nicht berechtigt)
- Benutzerverwaltung (`/benutzerverwaltung`, optional `?mandant=<id>`): Mandanten-Auswahl (shadcn `Select`, nur bei >1 verwaltbarem Mandanten), Tabs "Benutzer" und "Rollen"
  - Tab "Benutzer": Tabelle (Benutzername + E-Mail, Rollen als Badges, Status Aktiv/Deaktiviert/Gesperrt), Dialog "Neuer Benutzer" (Benutzername, E-Mail, Initial-Passwort mit Passwortrichtlinie, Rollen per Checkbox), Zeilenmenü mit "Rollen bearbeiten" und "Aus diesem Mandanten entfernen" (AlertDialog)
  - Tab "Rollen": Tabelle (Name, Anzahl Masken, Anzahl Benutzer), Dialog "Neue Rolle"/"Rolle bearbeiten" (Name, Masken per Checkbox — aktuell nur "Benutzerverwaltung"), Löschen per AlertDialog mit Hinweis auf betroffene Benutzer
- Mandanten (`/mandanten`, nur Super-Admin): Tabelle (Name, Anzahl Benutzer, Anlagedatum), Dialog "Neuer Mandant" und "Umbenennen"; kein Löschen
- Globale Benutzerverwaltung (`/globale-benutzer`, nur Super-Admin): Tabelle aller User (Benutzername, E-Mail, Mandanten, Status), Switch "Super-Admin" mit Bestätigungsdialog, Button "Aktivieren/Deaktivieren" mit Bestätigungsdialog
- Profil (`/profil`, alle User): Kontodaten (read-only) + Formular "Passwort ändern" (aktuelles Passwort, neues Passwort nach Richtlinie, Bestätigung); bei Erfolg Hinweis "Du bleibst angemeldet", bei Fehler allgemeine Meldung ohne Hinweis, welche Prüfung fehlschlug
- Gemeinsame Bausteine: `src/lib/password-policy.ts` (zod-Schema, identische Regeln wie `scripts/seed.mjs`), `src/lib/masks.ts` (Masken-Register, aktuell nur `basis`/`benutzerverwaltung`), `src/lib/api-client.ts` (fetch-Helfer mit einheitlicher Fehlerbehandlung inkl. Verbindungsfehler), `src/components/status-badge.tsx` (Status-Pills laut Design-System), `src/components/page-header.tsx`, `src/components/state-messages.tsx` (Fehler/Kein Zugriff/Leer)
- Alle Listen haben Lade- (Route-`loading.tsx`), Fehler- (`LoadErrorAlert`) und Leerzustände; alle Formulare haben Lade-/Fehlerzustände, Eingaben bleiben bei Fehlern erhalten, Erfolg per Toast + `router.refresh()`
- Clientseitige Komfort-Prüfungen (verbindlich ist immer der Server): doppelte Mandanten-/Rollennamen, Passwortrichtlinie, "letzter Super-Admin" (Toast statt API-Aufruf), Super-Admin kann sich nicht selbst global deaktivieren

**Bewusste Abweichungen / offene Anschlussstellen für `/backend`:**
- API-Routen existieren noch nicht (liefern bis dahin 404). Erwartete Fehlerantwort-Konvention: JSON `{ error: string, field?: string }` — `field` ordnet die Meldung einem Formularfeld zu; `409` wird bei Namens-/Benutzernamen-Konflikten erwartet, `403` bei fehlender Berechtigung:
  - `POST /api/tenants` `{ name }` — Mandant anlegen (nur Super-Admin, Name eindeutig → 409 `field: "name"`)
  - `PATCH /api/tenants/:tenantId` `{ name }` — Mandant umbenennen (nur Super-Admin)
  - `POST /api/tenants/:tenantId/users` `{ username, email, password, roleIds[] }` — User neu anlegen (Supabase-Auth-User + `user_profiles` + `user_tenant_access` + `user_roles`, atomar; Passwortrichtlinie serverseitig; Benutzername systemweit eindeutig → 409 `field: "username"`)
  - `PATCH /api/tenants/:tenantId/users/:userId` `{ roleIds[] }` — Rollen eines Users im Mandanten ersetzen
  - `DELETE /api/tenants/:tenantId/users/:userId` — User aus Mandant entfernen (`user_tenant_access` + zugehörige `user_roles` des Mandanten löschen, User bleibt sonst unverändert)
  - `POST /api/tenants/:tenantId/roles` `{ name, masks: [{ module, maske }] }` — Rolle anlegen (Name je Mandant eindeutig → 409 `field: "name"`)
  - `PATCH /api/tenants/:tenantId/roles/:roleId` `{ name, masks }` — Rolle umbenennen + Masken ersetzen (last-write-wins)
  - `DELETE /api/tenants/:tenantId/roles/:roleId` — Rolle löschen, `user_roles` kaskadiert
  - `PATCH /api/users/:userId` `{ isSuperAdmin?: boolean, isActive?: boolean }` — nur Super-Admin; "letzter Super-Admin"-Schutz serverseitig (Fehlermeldung wird im Toast angezeigt)
  - `POST /api/profile/password` `{ currentPassword, newPassword }` — eigenes Passwort ändern, Session bleibt bestehen; bei falschem aktuellem Passwort `401` (UI zeigt allgemeine Meldung), bei Richtlinienverstoß `400` mit `field: "newPassword"`
- Alle `/api/tenants/:tenantId/...`-Routen müssen serverseitig prüfen: Super-Admin ODER Rolle mit Maske `basis`/`benutzerverwaltung` in genau diesem Mandanten
- Angenommene, noch nicht existierende Tabellen/Spalten (Server Components lesen sie direkt über `createClient()`; bis zur Migration zeigen die Seiten den Fehlerzustand):
  - `user_profiles.is_active boolean not null default true`
  - `roles (id, tenant_id, name, …)` mit `unique (tenant_id, name)`
  - `role_permissions (role_id, module, maske)` — Masken-Kennung im Frontend: `module = "basis"`, `maske = "benutzerverwaltung"` (siehe `src/lib/masks.ts`)
  - `user_roles (user_id, tenant_id, role_id)`
  - PostgREST-Embeddings setzen Fremdschlüssel voraus: `user_roles.role_id → roles`, `role_permissions.role_id → roles`, `user_tenant_access.user_id → user_profiles` (existiert), `user_tenant_access.tenant_id → tenants` (existiert)
- RLS muss erweitert werden: Aktuell sieht ein Nicht-Super-Admin in `user_profiles`/`user_tenant_access` nur seine eigene Zeile — Mandanten-Admins brauchen Lesezugriff auf User, Zuordnungen, Rollen und Rollen-Zuweisungen **ihres** Mandanten, sonst bleibt deren Benutzerliste leer. Jeder User braucht Lesezugriff auf seine eigenen `user_roles` + zugehörige `roles`/`role_permissions` (für die Menü-Sichtbarkeit)
- Menü-Sichtbarkeit für reguläre User ist Best-Effort: schlägt die `user_roles`-Abfrage fehl oder ist leer, gilt "kein Zugriff" (kein Absturz). Muss nach Anlage der Tabellen einmal mit einem echten Mandanten-Admin geprüft werden
- `tenants.name` hat aktuell keine Unique-Constraint — die "eindeutiger Name"-Regel muss von `/backend` ergänzt werden (Frontend prüft nur vorab gegen die geladene Liste)
- Login-Ablehnung deaktivierter User (AC "Account ist deaktiviert") gehört in `POST /api/auth/login` — das bestehende Login-Formular zeigt die `error`-Meldung der Route bereits generisch an
- Ergänzung gegenüber Tech Design: Aktion "Rollen bearbeiten" für bestehende User (sonst könnten Rollen nur bei der Neuanlage vergeben werden) → `PATCH /api/tenants/:tenantId/users/:userId`
- Nicht gebaut: Super-Admin-UI zum Hinzufügen eines bestehenden Users zu einem weiteren Mandanten (Spec erlaubt es nur dem Super-Admin, nennt aber keine Maske dafür) — bei Bedarf per `/refine`
- Die Sidebar ersetzt die bisherige zentrierte Startseiten-Karte; der Abmelde-Link ist ins Benutzermenü der Sidebar gewandert (E2E-Test aus PROJ-1 für Logout muss ggf. angepasst werden)

**Frontend-Bugfixes nach QA (2026-09-30):**
- **BUG-1 (High) behoben — Abmelden ohne Wirkung:** In `src/components/app-sidebar.tsx` saß ein natives `<form action="/api/auth/logout">` im Radix-`DropdownMenuContent`; das Menü wurde beim Auswählen geschlossen/unmountet, bevor der Submit rausging. Jetzt ein `DropdownMenuItem` mit `onSelect`, das `fetch("/api/auth/logout", { method: "POST", redirect: "manual" })` aufruft und danach per `window.location.href = "/login"` navigiert (`redirect: "manual"`, damit fetch dem 307 der Route nicht als POST auf `/login` folgt). Bei Netzwerkfehler erscheint ein Fehler-Toast ("Abmelden fehlgeschlagen"). Per E2E auf 1440 px und 375 px verifiziert
- **BUG-8 (Low) behoben — "E-Mail bereits registriert" unter falschem Feld:** In `src/components/benutzerverwaltung/create-user-dialog.tsx` hat ein konkretes `field` (`email`/`password`) jetzt Vorrang; nur 409 ohne Feld bzw. `field: "username"` landet am Benutzernamen. Der zugehörige `test.fixme` in `tests/PROJ-2-benutzerverwaltung-rollen-rechte.spec.ts` läuft jetzt als normaler Test (grün auf 1440 px und 375 px)
- **PROJ-1-E2E-Regression behoben** (`tests/PROJ-1-supabase-infrastructure.spec.ts`, siehe BUG-12): Logout-Test öffnet jetzt das Benutzermenü (`button` "Benutzermenü für …", auf Mobile vorher das Navigations-Sheet) und klickt das `menuitem` "Abmelden", mit `toPass`-Retry gegen Klicks vor der Hydration; Benutzername-Assertion auf `getByRole("main")` beschränkt (Name steht auch in der Sidebar); Alert-Assertion mit `.filter({ hasText: /\S/ })` gegen den leeren Route-Announcer von Next.js (`role="alert"`). PROJ-1-Spec: 10/10 grün (Chromium 1440 + 375)

## Implementation Notes (Backend)

**Gebaut:**
- Migration `supabase/migrations/20260929130000_proj2_roles.sql`: alte, nie befüllte `permissions`-Platzhaltertabelle aus PROJ-1 entfernt (vor dem Anwenden geprüft: 0 Zeilen); `user_profiles.is_active` (default `true`); Unique-Constraint `tenants_name_key` auf `tenants.name`; neue Tabellen `roles` (unique `tenant_id, name`), `role_permissions` (unique `role_id, module, maske`), `user_roles` (unique `user_id, tenant_id, role_id`) inkl. Indizes. `user_roles` hat einen zusammengesetzten Fremdschlüssel auf `user_tenant_access (user_id, tenant_id)` mit `ON DELETE CASCADE` — "aus Mandant entfernen" löscht die Rollen-Zuweisungen dieses Mandanten automatisch mit; Rolle löschen kaskadiert auf `role_permissions` + `user_roles`
- Migration `supabase/migrations/20260929130100_proj2_rls.sql`: neue Helper-Funktion `has_tenant_admin_access(tenant_id)` (SECURITY DEFINER wie `is_super_admin()`/`has_tenant_access()`): Super-Admin ODER eine Rolle mit Maske `basis`/`benutzerverwaltung` in genau diesem Mandanten. Darauf aufbauend: RLS (enable + force) + SELECT/INSERT/UPDATE/DELETE-Policies auf `roles` und `role_permissions`, SELECT/INSERT/DELETE auf `user_roles` (jeder sieht seine eigenen Zuweisungen/Rollen/Maskenrechte für die Menü-Sichtbarkeit, Mandanten-Admins alles ihres Mandanten); additive Policies auf `user_profiles` (Mandanten-Admin liest Profile der User seines Mandanten) und `user_tenant_access` (Mandanten-Admin liest und löscht Zuordnungen seines Mandanten). Die PROJ-1-Policies bleiben unverändert bestehen. **Bewusst keine** INSERT-Policy auf `user_tenant_access` für Mandanten-Admins — sie dürfen nie einen bestehenden fremden User per direktem REST-Aufruf an ihren Mandanten hängen
- `src/lib/api-auth.ts`: `requireCaller` (User + Super-Admin-Flag, 401), `isTenantAdmin`/`requireTenantAdmin` (spiegelt `has_tenant_admin_access` in Anwendungscode für frühe, freundliche 403 — RLS bleibt die eigentliche Durchsetzung), `rolesBelongToTenant`, UUID-Prüfung der Routen-Segmente, einheitliche Fehlerantwort `{ error, field? }`
- 10 Route Handler, alle mit Zod-Validierung und den vom Frontend erwarteten Statuscodes/`field`-Werten:
  - `POST /api/tenants`, `PATCH /api/tenants/:tenantId` — nur Super-Admin; case-insensitive Namens-Vorabprüfung → 409 `field: "name"`, Unique-Constraint als Absicherung
  - `POST /api/tenants/:tenantId/users` — Super-Admin oder Mandanten-Admin; Passwortrichtlinie über `passwordSchema` aus `src/lib/password-policy.ts`; Rollen müssen zum Mandanten gehören (400); Benutzername vergeben → 409 `field: "username"`, E-Mail registriert → 409 `field: "email"`; bei jedem Fehler nach dem Anlegen des Auth-Users wird dieser wieder gelöscht (Kaskade entfernt Profil/Zuordnung/Rollen → nichts bleibt teilweise gespeichert)
  - `PATCH` / `DELETE /api/tenants/:tenantId/users/:userId` — Rollen ersetzen (bei Fehler Best-Effort-Wiederherstellung des alten Stands) bzw. User aus diesem Mandanten entfernen (Selbst-Entfernung erlaubt)
  - `POST /api/tenants/:tenantId/roles`, `PATCH` / `DELETE /api/tenants/:tenantId/roles/:roleId` — Masken nur aus dem Register `MASKS` (`src/lib/masks.ts`), unbekannte → 400; doppelter Rollenname im Mandanten → 409 `field: "name"`; Rolle darf auch gelöscht werden, wenn sie noch zugewiesen ist
  - `PATCH /api/users/:userId` — nur Super-Admin; letzter Super-Admin kann das Flag nicht verlieren → 409 (ohne `field`, Meldung identisch mit dem Frontend-Toast); Selbst-Deaktivierung → 400 "Du kannst dich nicht selbst deaktivieren."
  - `POST /api/profile/password` — aktuelles Passwort per `signInWithPassword` mit der eigenen E-Mail geprüft (falsch → 401, allgemeine Meldung, kein `field`), neues Passwort per `updateUser` auf der eigenen Session → User bleibt eingeloggt; Richtlinienverstoß → 400 `field: "newPassword"`
- **Warum Admin-Client nur beim User-Anlegen:** `auth.admin.createUser()` existiert nur mit Service-Role-Key, und `user_tenant_access` hat absichtlich keine Insert-Policy für Mandanten-Admins. Die Berechtigung wird vorher über den Session-Client des Aufrufers geprüft. Alle anderen Routen schreiben über den Session-Client des Aufrufers, d.h. RLS greift als zweite Ebene zusätzlich zur Prüfung in der Route
- `POST /api/auth/login`: deaktivierte User (`is_active = false`) werden **erst nach** erfolgreicher Passwortprüfung abgelehnt (sonst würde der Deaktivierungs-Status an Passwort-Rater verraten), die gerade erzeugte Session wird sofort per `signOut()` beendet, Fehlversuchszähler zurückgesetzt, Antwort 403 "Dieser Account wurde deaktiviert."
- Tests: 64 neue Vitest-Tests (8 Testdateien neben den Routen, gemeinsamer verkettbarer Supabase-Mock in `src/test/supabase-mock.ts`, keine Netzwerkaufrufe) inkl. "letzter Super-Admin", Selbst-Deaktivierung und beider Login-Fälle für deaktivierte User — gesamt 70/70 grün; `npm run lint` und `npm run build` sauber
- **Live gegen den lokalen Stack verifiziert** (beide Migrationen angewendet, 48 Prüfungen gegen den laufenden `next dev` + echte Supabase-JWTs, Testdaten danach wieder entfernt): Mandant anlegen/umbenennen inkl. 409-Fälle → Rolle "Administrator" mit Maske anlegen → User mit dieser Rolle anlegen → dieser loggt sich ein, sieht die Benutzerverwaltung seines Mandanten und legt selbst einen User an; 403 für fremde Mandanten, Mandant umbenennen/anlegen und globale Aktionen; RLS direkt über PostgREST (Mandanten-Admin sieht nur Profile/Zuordnungen seines Mandanten, normaler User nur sich selbst + eigene Rolle, keine Rechteausweitung per REST, kein Anhängen fremder User); User entfernen (Kaskade der Rollen, Profil bleibt aktiv); globale Deaktivierung → Login 403 ohne Session-Cookie, falsches Passwort weiterhin normale 401; Passwort ändern (bleibt eingeloggt, neues Passwort funktioniert); Rolle löschen → ehemaliger Admin verliert Zugriff, kann sich aber weiter einloggen

**Bewusste Abweichungen / offene Anschlussstellen für `/qa`:**
- **Abweichung vom freigegebenen RLS-Plan (bitte explizit bestätigen):** zusätzlich zur geplanten DELETE-Policy wurde eine SELECT-Policy `"Tenant admins see tenant access of their own tenant"` auf `user_tenant_access` (`using (has_tenant_admin_access(tenant_id))`) ergänzt. Ohne sie sieht ein Mandanten-Admin nur seine eigene Zuordnungszeile — live nachgewiesen: Benutzerliste zeigt nur ihn selbst, die geplante `user_profiles`-Policy (deren Unterabfrage auf `user_tenant_access` selbst RLS unterliegt) greift nicht, und "aus Mandant entfernen" löscht 0 Zeilen. Die Policy ist rein lesend und strikt auf den eigenen Mandanten begrenzt
- **Bewusste Lücke:** Der letzte *aktive* Super-Admin kann von einem anderen Super-Admin weiterhin deaktiviert werden — geschützt ist nur das Super-Admin-*Flag* (laut AC). Selbst-Deaktivierung ist blockiert
- Bestehende Sessions eines global deaktivierten Users bleiben bis zum Ablauf gültig (Refresh-Tokens werden nicht widerrufen, Middleware prüft `is_active` nicht) — blockiert wird nur der nächste Login. Falls sofortiges Aussperren gewünscht ist, per `/refine` nachziehen (z.B. GoTrue-Ban oder `is_active`-Prüfung in der Middleware)
- "Letzter Super-Admin"-Prüfung ist Check-then-Update, keine DB-Sperre: zwei gleichzeitige Entzüge durch zwei Super-Admins könnten theoretisch beide durchgehen (bei der Nutzerzahl sehr unwahrscheinlich)
- Mehrschrittige Schreibvorgänge (User anlegen, Rolle anlegen/bearbeiten, Rollen eines Users ersetzen) sind keine DB-Transaktionen, sondern haben Kompensations-Logik (Rollback/Wiederherstellung) — bei einem Fehler *während* der Kompensation kann theoretisch ein Zwischenstand bleiben
- Namenseindeutigkeit von Mandanten: Vorabprüfung case-insensitive, DB-Constraint case-sensitive (Race zweier nur in Groß-/Kleinschreibung verschiedener Namen wäre theoretisch möglich)
- Die Prüfung des aktuellen Passworts in `POST /api/profile/password` zählt nicht in die Login-Sperre (10 Fehlversuche) aus PROJ-1; es gilt nur das GoTrue-eigene Rate-Limit
- **Frontend-Bug für `/qa`:** `create-user-dialog.tsx` prüft `result.field === "username" || result.status === 409` vor `field === "email"` — die 409 "E-Mail bereits registriert" (`field: "email"`) wird deshalb am Feld *Benutzername* angezeigt. Backend liefert korrekt `field: "email"`; Reihenfolge der Prüfung im Dialog sollte angepasst werden
- Hinweis aus PROJ-1-Konfiguration: `supabase/config.toml` hat unter `[auth]` `enable_signup = true` — über den Anon-Key ist GoTrue-Self-Signup technisch möglich (solche Accounts haben kein Profil/keinen Mandanten und sehen dank RLS nichts, sind aber unerwünscht). Sollte in `/qa` bzw. vor Produktion auf `false` gesetzt werden

## Backend-Bugfixes nach QA (2026-09-30)

Behebt BUG-2, -3, -4, -6, -7, -9, -10, -11 und mildert BUG-5 teilweise (BUG-1/-8/-12 = Frontend, separat). Änderungen an RLS-Helper-Funktionen und Auth-Konfiguration vom User vorab freigegeben. Einige Punkte unter "Bewusste Abweichungen" oben sind damit überholt (Sessions deaktivierter User, Check-then-Update beim Super-Admin-Entzug, case-sensitive Mandanten-Constraint, Self-Signup).

**Neue Migration `supabase/migrations/20260930100000_proj2_bugfixes.sql`:**
- **BUG-2 (deaktivierte User):** `is_super_admin()`, `has_tenant_access()` und `has_tenant_admin_access()` verlangen jetzt zusätzlich `is_active` des eigenen Profils. Da jede RLS-Policy über diese drei Funktionen läuft, verliert ein deaktivierter User sofort den Zugriff auf alle Mandantendaten, egal wie er an eine Session kam (bestehende Browser-Session, direkter GoTrue-Login mit Anon-Key). Er sieht nur noch sein eigenes Profil, seine eigene Zuordnungszeile und seine eigenen Rollen-Zuweisungen (PROJ-1/PROJ-2-Policies `id = auth.uid()`), aber keine Mandanten und darf nichts schreiben. Zusätzlich beendet der Trigger `user_profiles_revoke_sessions_on_deactivation` (SECURITY DEFINER, `is_active` true → false) sofort alle Sessions des Users in `auth.sessions`. Das gilt auch, wenn ein Super-Admin per direktem REST-Aufruf deaktiviert. Refresh-Tokens werden per Kaskade mitgelöscht, und GoTrue lehnt das noch nicht abgelaufene Access-Token mit `session_not_found` ab. Die Middleware leitet dadurch auf `/login` um.
- **BUG-4 (letzter Super-Admin):** Neue Funktion `revoke_super_admin(target_id)`. Zählt nur *aktive* Super-Admins und entzieht das Flag atomar. Sie ist SECURITY DEFINER mit eigener Super-Admin-Prüfung (sonst könnte jeder eingeloggte User sie per `/rpc` aufrufen → 42501). Ausführbar nur für `authenticated`. Die gleichzeitige Nutzung ist per Advisory-Lock serialisiert, und die übrigen aktiven Super-Admins werden per `SELECT … FOR UPDATE` gesperrt.
- **BUG-9 (fremde role_id):** `roles` bekommt `unique (id, tenant_id)`, `user_roles` den zusammengesetzten Fremdschlüssel `(role_id, tenant_id) → roles (id, tenant_id)` mit `on delete cascade`. Der bisherige einspaltige FK `user_roles_role_id_fkey` wurde entfernt, weil der neue ihn vollständig abdeckt. Mit beiden FKs schlug jedes PostgREST-Embedding `user_roles → roles(...)` mit PGRST201 (mehrdeutig) fehl, u.a. `isTenantAdmin` und `session-context` (live aufgefallen).
- **BUG-10/-11 (Namen):** Case-insensitive Unique-Indizes `tenants (lower(name))`, `roles (tenant_id, lower(name))` und `user_profiles (lower(username))`. Der Login sucht den Benutzernamen weiterhin exakt (`.eq`), nur die Eindeutigkeit ist case-insensitive.

**Routen:**
- **BUG-3:** `PATCH /api/tenants/:tenantId/users/:userId` und `PATCH /api/tenants/:tenantId/roles/:roleId` ersetzen nicht mehr "alles löschen, alles einfügen", sondern arbeiten mit einem Diff: erst neue Zeilen einfügen, dann entfernte löschen. Unveränderte Zuweisungen/Masken werden nie angefasst, das eigene Admin-Recht bleibt also während der Bearbeitung bestehen. Entzieht sich ein Mandanten-Admin bewusst die letzte Admin-Rolle (EC-1), klappt das weiterhin. Schlägt das Insert fehl, ist nichts geändert. Schlägt das Delete fehl, werden die gerade eingefügten Zeilen wieder entfernt (Best-Effort). Die alte Wiederherstellungslogik ist entfallen.
- **BUG-4:** `PATCH /api/users/:userId` ruft beim Entzug des Flags `supabase.rpc("revoke_super_admin")` auf. Liefert sie `false`, antwortet die Route mit 409 und `LAST_SUPER_ADMIN_MESSAGE`. Eine separate Count-Abfrage gibt es nicht mehr.
- **BUG-10/-11:** `POST /api/tenants` und `PATCH /api/tenants/:tenantId` haben keine `ilike`-Vorabprüfung mehr (`isTenantNameTaken`/`escapeLikePattern` entfernt). Die Datenbank entscheidet, `isUniqueViolation()` → 409 `field: "name"`. Die Rollen-Routen haben ohnehin schon so gearbeitet. Ein nur in Groß-/Kleinschreibung abweichender Benutzername fällt beim Profil-Insert auf den neuen Index → Rollback des Auth-Users, 409 `field: "username"`.
- Zusätzlich (Defense in Depth zu BUG-2): `requireCaller` in `src/lib/api-auth.ts` antwortet für deaktivierte Caller mit 403 "Dieser Account wurde deaktiviert.".
- Zusätzlich (Folge von BUG-7): Lehnt GoTrue ein Passwort als `weak_password` ab, liefern `POST /api/tenants/:tenantId/users` und `POST /api/profile/password` jetzt 400 mit `field: "password"` bzw. `"newPassword"` statt 500/allgemeiner Meldung (siehe Restlücke unten).

**`supabase/config.toml` (Stack per `supabase stop`/`start` neu gestartet, Daten bleiben erhalten):**
- **BUG-6:** `[auth] enable_signup = false` → `POST /auth/v1/signup` liefert 422 `signup_disabled`. **Achtung:** `[auth.email] enable_signup` muss `true` bleiben. In CLI 2.118 schaltet `false` dort den kompletten E-Mail-Provider ab ("Email logins are disabled"), dann kann sich niemand mehr einloggen. Kurz live passiert und sofort zurückgenommen, im Config-Kommentar dokumentiert.
- **BUG-7:** `minimum_password_length = 8`, `password_requirements = "lower_upper_letters_digits_symbols"` (stärkste Stufe in CLI 2.118 / GoTrue v2.197). Ein direktes `PUT /auth/v1/user` mit schwachem Passwort liefert jetzt 422 `weak_password`.
- **BUG-5:** Keine Änderung an `[auth.rate_limit]`, bewusst. Live gemessen: 165 falsche Passwort-Grants von einer IP in unter 5 Minuten, keine einzige 429. GoTrue wendet seine IP-Limits nur an, wenn `GOTRUE_RATE_LIMIT_HEADER` gesetzt ist. Das setzt die CLI nicht, und `config.toml` bietet es nicht an. `sign_in_sign_ups` betrifft ohnehin nur Signup/OTP (CLI → `GOTRUE_RATE_LIMIT_OTP`). Ein Verschärfen der Werte wäre wirkungslos und würde falsche Sicherheit vermitteln.

**Bekannte Restlücken (dokumentiert, nicht behoben):**
- **BUG-5 (Login-Sperre umgehbar), nur teilweise gemildert:** Die Sperre nach 10 Fehlversuchen für 15 Minuten gilt weiterhin nur über `POST /api/auth/login`. Direkt gegen GoTrue (`/auth/v1/token?grant_type=password` mit Anon-Key) gibt es weder eine Sperre pro Account noch (siehe oben) ein wirksames IP-Limit. Gemildert ist nur die Wirkung: Ein so erlangter Token eines *deaktivierten* Users ist dank RLS wertlos. Für einen aktiven, gesperrten Account mit bekanntem Passwort bleibt der direkte Login möglich. Vollständig schließen ließe sich das nur, wenn GoTrue nicht direkt erreichbar ist (Auth nur über die App, z.B. Kong-Route für `/auth/v1/token` nur intern) oder mit einem GoTrue-Auth-Hook. Spätestens vor dem LAN-Rollout per `/refine` entscheiden. Eine IP-basierte Grenze würde die Sperre pro Account ohnehin nicht nachbilden. Außerdem laufen alle App-Logins vom Next.js-Server, also von einer einzigen IP, sodass ein IP-Limit alle Mitarbeiter gemeinsam treffen würde.
- **BUG-7, Restunterschied bei Sonderzeichen:** GoTrue zählt als Sonderzeichen nur ASCII-Interpunktion (`!@#$%^&*()_+-=[]{};'\:"|<>?,./`~`). Die App-Richtlinie (`src/lib/password-policy.ts`) akzeptiert jedes nicht-alphanumerische Zeichen. Ein Passwort, dessen einziges Sonderzeichen z.B. `§`, `€`, `ä` oder ein Leerzeichen ist, besteht die Prüfung im Formular, wird aber von GoTrue abgelehnt. Die Routen antworten dann mit 400 und einer Meldung, die die erlaubten Zeichen nennt. Sauberer wäre es, die Frontend-Richtlinie auf den GoTrue-Zeichensatz einzuschränken (Produktentscheidung, nicht umgesetzt). Außerdem prüft ein direktes `PUT /auth/v1/user` weiterhin nicht das *aktuelle* Passwort (`secure_password_change = false`; die Option würde das mit einem frisch ausgestellten Token ohnehin nicht verhindern).
- Deaktivieren des letzten *aktiven* Super-Admins bleibt nur bei gleichzeitiger gegenseitiger Deaktivierung zweier Super-Admins möglich (Selbst-Deaktivierung ist blockiert). Wie bisher bewusst offen.

**Verifikation:**
- Live gegen den lokalen Stack (`next dev` + echte JWTs, direkte GoTrue-/PostgREST-Aufrufe): 50/50 Prüfungen grün, Testdaten (`QA-FIX …`, `@qa-fix.local`) danach entfernt, DB wieder im Ausgangszustand (1 User `admin`, 1 Mandant `Default`, 0 Rollen).
  - BUG-3: Selbst-Bearbeitung mit behaltener Admin-Rolle bzw. Maske → 200, Recht bleibt erhalten. EC-1 (letzte eigene Admin-Rolle entfernen) weiter erlaubt.
  - BUG-2: bestehende App-Session → `/profil` leitet auf `/login` um, API liefert 401. Altes GoTrue-Token → 403 `session_not_found`, PostgREST liefert 0 Mandanten. Frischer direkter GoTrue-Login → 0 Mandanten, Insert 403. Ein deaktivierter Super-Admin kann sich per REST nicht reaktivieren (0 Zeilen). Nach Reaktivierung ist alles wieder normal.
  - BUG-4: letzter aktiver Super-Admin (plus ein deaktivierter) → 409. Gegenseitiger Entzug parallel über die API → genau einer bleibt übrig. 20 parallele RPC-Runden → immer genau 1 Super-Admin (eine erste Version nur mit Advisory-Lock ließ in 3 von 5 Runden 0 übrig, deshalb `FOR UPDATE`).
  - BUG-9: FK-Verletzung 23503, Insert im eigenen Mandanten weiterhin 201.
  - BUG-10/-11: "QA-FIX N*" → 201; Varianten in anderer Groß-/Kleinschreibung (Mandant, Umbenennung, Rolle, Benutzername) → 409, kein verwaister Auth-User.
  - BUG-6: 422 `signup_disabled`.
  - BUG-7: sechs Varianten schwacher Passwörter → 422 `weak_password`, ein konformes Passwort → 200.
- `npm test` 118/118, `npm run lint` und `npm run build` sauber, `tsc` sauber.
- E2E: `test.fixme` bei AC-10 und beim Selbst-Rollen-Bearbeitungs-Fall (jetzt "BUG-3 (fixed)") entfernt. Gesamte PROJ-2-Spec **46/46 grün** (Chromium 1440 + 375, 2 Worker, QA-Config mit Chromium 1243). Hinweis: Mit 4 Workern schlugen die Logins auf der stark ausgelasteten Maschine per Timeout fehl, obwohl das Login-POST laut Trace 200 lieferte. Das Rendern von `/` dauerte unter `next dev` länger als der 5-s-Timeout von `toHaveURL`. Das ist ein Umgebungs-/Timing-Effekt, kein funktionaler Fehler.

---

## QA Test Results

**Initial QA:** 2026-09-29 · **Re-verification after bug fixes:** 2026-09-30 (this section reflects the current state)
**App URL:** http://localhost:3000 (`next dev`; self-hosted Supabase: http://127.0.0.1:54321)
**Tester:** QA Engineer (AI)

### Test Method
- **Live against the real local stack**, not mocked: initial pass ~190 scripted checks, re-verification 64 scripted checks + 10 race rounds, via the Next.js API (real session cookies from `POST /api/auth/login`) and **directly against GoTrue/PostgREST with each test user's own JWT** (to prove RLS independently of app code). All data disposable (`QA-P2 …` tenants, `@qa-proj2.local` users), deleted afterward; DB verified back to baseline (1 user `admin` = super-admin + active, 1 tenant `Default`, 0 roles, 1 auth user).
- For system-wide "last super-admin" checks the seeded `admin`'s flag was cleared temporarily (only while no E2E run was active) and **restored in a `finally` block** (verified `admin | t | t`).
- The re-verification did **not** rely on the developers' self-reported checks; every fixed bug was re-tested independently (see table below).
- Scope: 16 acceptance criteria, 6 edge cases.

### Automated Tests (re-verification 2026-09-30)
- `npm test` (Vitest): **118/118 passing** (13 files). `npm run lint` clean, `tsc --noEmit` clean.
- Playwright (QA config pointing at installed Chromium 1243; projects Chromium 1440px + Chromium 375px, 2 workers):
  - PROJ-1 spec: **10/10** (both runs) — BUG-12 resolved.
  - PROJ-2 spec, **extended by QA with 7 new regression tests** (BUG-3 rename path, BUG-2 direct GoTrue login, BUG-4 RPC authorization, BUG-6, BUG-7, BUG-9, BUG-10/11): 30 tests per project.
  - Full run PROJ-1 + PROJ-2: **68/70**; the 2 failures (AC-7/AC-8 at 375px, strict-mode "2 elements for Aktuelles Passwort" during a dev-server render) did not reproduce: re-run of AC-7, AC-8, EC-6 and all BUG-* tests with `--repeat-each=3` → **72/72**. Baseline run before adding tests: 55/56 (EC-6 login timeout, same known `next dev` load/timing effect). Classified as test/environment flakiness, not product defects.
  - **Not covered:** Firefox, WebKit/Mobile Safari, 768px (project browsers still not installable here, see initial QA note). AC-12 and the BUG-4 concurrency guarantee are not E2E-automatable in parallel runs (require a system-wide single-super-admin state) — verified live instead; the RPC's authorization is covered by a new E2E test, the route's use of the RPC by unit tests.

### Bug Status (re-verified 2026-09-30)

| Bug | Sev. | Status | Independent evidence |
|-----|------|--------|----------------------|
| BUG-1 Logout does nothing | High | **Fixed** | PROJ-1 logout E2E (opens user menu, clicks "Abmelden", lands on `/login`, `/` then redirects to `/login` = session really ended) green at 1440px and 375px (mobile via navigation sheet), in both runs |
| BUG-2 Deactivation not enforced | High | **Fixed** | Open app session → `/profil` 307 `/login`, write API 401; old GoTrue access token → `/auth/v1/user` 403, PostgREST 0 tenants; old refresh token 400. Fresh direct GoTrue grant (still 200 — GoTrue issues the token) is useless: 0 tenants, only own profile, role insert 403, role-assignment insert 403, cannot delete access rows, cannot reactivate self. Deactivated **super-admin**: cannot reactivate self via REST (0 rows), 0 tenants, cannot grant flags, `is_super_admin()` = false, RPC 42501, old app session kicked out. Acting super-admin's session unaffected by the trigger. Reactivation restores login + access. App login still 403 "deaktiviert" |
| BUG-3 Self-edit wipes roles/masks | High | **Fixed** | Tenant admin (non-super-admin): add role to self keeping admin → 200, 2 roles; remove non-admin role → 200, admin kept; **rename own admin role** keeping mask → 200, mask kept; rename to case variant of itself → 200; still admin afterwards (201 on role create). EC-1 still allowed: removing own last admin role → 200, access gone (403); removing the mask from own admin role → 200, 0 masks |
| BUG-4 Last-super-admin guard | Medium | **Fixed** (residual race → NEW-1) | Last active SA with a *deactivated* SA in the mix → 409, flag kept. Concurrency: 8 rounds × 6 simultaneous mutual API revokes (3 SAs) and 20 rounds × 6 simultaneous direct RPC revokes → **always exactly 1** active SA. RPC authorization: tenant admin 42501, anon 401, deactivated SA 42501 |
| BUG-5 Lockout bypass via GoTrue | Medium | **Open (documented honestly)** | Account locked in app (423) → direct GoTrue grant still 200 with token; 40 wrong direct grants → 0× 429. Matches the backend's documentation ("nur teilweise gemildert", no working IP limit on this stack) — no false fix claimed. Impact now limited to *active* accounts (deactivated users get no usable access, see BUG-2) |
| BUG-6 Self-signup | Medium | **Fixed** | `POST /auth/v1/signup` → 422 `signup_disabled` (live + new E2E); normal logins unaffected |
| BUG-7 Weak password via GoTrue | Medium | **Fixed** (residual documented) | `PUT /auth/v1/user` with `abcdef`, `abcdefgh`, `Abcdefgh`, `Abcdefg1`, `abcdefg1!`, `ABCDEFG1!`, `Abcd-1!` → all 422 `weak_password`; conforming password → 200. Residual (documented by backend, Low): passwords whose only special char is non-ASCII (`§`, `€`) pass the form but the routes return 400 with a clear message listing allowed characters; no orphan user created. Direct `PUT /auth/v1/user` still does not require the current password (documented) |
| BUG-8 E-mail error under wrong field | Low | **Fixed** | E2E: message under "E-Mail" (`aria-invalid=true`), Benutzername `false`, both viewports |
| BUG-9 Foreign role_id in user_roles | Low | **Fixed** | Tenant admin REST insert with other tenant's role → 409/`23503`; even service-role insert → `23503`; own-tenant insert 201; UPDATE of `role_id` blocked (no update policy, 0 rows); PostgREST embed `user_roles→roles` still works (no PGRST201) |
| BUG-10 `*` in tenant name | Low | **Fixed** | `QA-P2 R*` → 201; `%`, `_`, `\` in names → 201 |
| BUG-11 Case handling of names | Low | **Fixed** | Tenant case variant (create + rename) → 409 `field: name`; renaming a tenant/role to a case variant of *itself* → 200; role case variant same tenant → 409, other tenant → 201; username case variant → 409 `field: username`, no orphan auth user. Note: login stays exact-case (`QA3_PLAIN` for `qa3_plain` → 401), as documented |
| BUG-12 PROJ-1 E2E broken | Low | **Fixed** | PROJ-1 spec 10/10 |

### New Findings (re-verification)

#### NEW-1: Concurrent "deactivate other super-admin" + "revoke flag" can still leave 0 active super-admins
- **Severity:** Low
- **Steps to Reproduce:** exactly two active super-admins A and B (no others). Simultaneously: A sends `PATCH /api/users/<B> {isActive:false}` and B sends `PATCH /api/users/<A> {isSuperAdmin:false}`.
- **Expected:** at least one active super-admin remains. **Actual:** via the API 2/10 rounds ended with **0** active super-admins (B's request sometimes 500/404, but the revoke had already committed); via direct PostgREST 6/10. Cause: `revoke_super_admin()` locks the remaining super-admins, but deactivation is a plain `UPDATE is_active` that neither takes the advisory lock nor checks "last active super-admin". Close relative of the gap the backend documented ("gleichzeitige gegenseitige Deaktivierung"), but that note only mentions mutual deactivation, not deactivate + revoke. Requires two super-admins acting against each other at the same moment → very unlikely at this scale; recovery needs direct DB access.
- **Priority:** Nice to have (e.g. a `deactivate_user()` RPC using the same lock/guard, or a trigger on `user_profiles` that enforces "≥1 active super-admin" for both columns)

#### NEW-2: A super-admin can bypass the last-super-admin guard via direct PostgREST
- **Severity:** Low
- **Steps to Reproduce:** as the only active super-admin, `PATCH /rest/v1/user_profiles?id=eq.<self> {"is_super_admin": false}` with the own JWT → 200, flag removed (the PROJ-1 policy "Only super-admins manage profiles (update)" allows it; the guard lives only in the RPC/route).
- **Expected (Technical Decision "serverseitig … kann sonst über direkten API-Aufruf umgangen werden"):** blocked. **Actual:** allowed; same for deactivating oneself via REST. Only the super-admin themself can do this (trusted actor, self-harm), no privilege gain → Low.
- **Priority:** Nice to have — same fix as NEW-1 (enforce the invariant in a DB trigger) would close both

### Acceptance Criteria Status (current)
- AC-1 … AC-9, AC-11 … AC-16: **pass** (initial QA; AC-1/3/6/7/12 related findings BUG-10/9/11/7/4 now fixed and re-verified above; AC-2 … AC-11, AC-13 … AC-16 also covered by the E2E suite, green)
- **AC-10: now pass** (was failing due to BUG-2) — existing sessions end immediately, fresh GoTrue tokens give no access, app login shows "deaktiviert" (E2E + live)
- AC-12: pass, now also with a deactivated super-admin in the mix (live, 409)
- Result: **16/16 passed**

### Edge Cases Status (current)
- EC-1: pass — removing own last admin role / own admin mask still allowed; keeping admin rights while editing no longer destroys anything (BUG-3 fixed)
- EC-2, EC-4, EC-6: pass (unchanged)
- EC-3: pass incl. case-insensitive duplicates (BUG-11 fixed)
- EC-5: pass for the tested scenario (network failure in UI); the BUG-3 partial-state path no longer exists (diff-based updates, insert before delete). Stopping the whole Supabase stack still not covered (shared with the deployed Docker instance)
- Result: **6/6 passed**

### Security Audit Results (current)
- [x] Everything from the initial audit still holds (auth on all routes/pages, app-layer authorization, RLS tenant isolation for tenant admins and regular users, anon 0 rows, input validation, XSS, no secrets in bundle, cookie flags, PROJ-1 lockout via the app)
- [x] **New RLS helper behavior:** `is_super_admin()`, `has_tenant_access()`, `has_tenant_admin_access()` now require `is_active` — verified with deactivated tenant admin and deactivated super-admin JWTs (see BUG-2 row); tenant admin of A → `has_tenant_admin_access(B)` false
- [x] **New RPC `revoke_super_admin`:** own authorization check works (tenant admin / deactivated SA → 42501, anon → 401), atomic under concurrent revokes (see BUG-4 row)
- [x] **New trigger `revoke_sessions_on_deactivation`:** fires on deactivation (sessions and refresh tokens gone), does not affect the acting admin's session, not callable via `/rpc` (404)
- [x] **New composite FK / case-insensitive indexes:** see BUG-9/10/11 rows; no embedding regressions
- [x] GoTrue config: signup disabled, password policy enforced (BUG-6/7)
- [ ] BUG-5 (Medium, open, documented): lockout bypassable via direct GoTrue grant for *active* accounts; no effective IP rate limit on this stack. Must be decided before LAN rollout (e.g. make `/auth/v1/token` unreachable from outside the app server, or a GoTrue hook)
- [ ] NEW-1, NEW-2 (Low): last-super-admin invariant not enforced at DB level
- Informational (unchanged): no throttling of wrong current-password guesses on `/api/profile/password` (session required); security headers not configured (`/deploy` item)

### Regression (PROJ-1)
- PROJ-1 E2E 10/10 (login, wrong password counter, unauthenticated redirect, logout via sidebar menu at 1440 + 375). Live: lockout via the app still works (9×401 → 423, correct password while locked → 423).

### Summary
- **Acceptance Criteria:** 16/16 passed
- **Edge Cases:** 6/6 passed
- **Bugs:** of the original 12, **11 fixed and independently re-verified** (BUG-1, -2, -3, -4, -6, -7, -8, -9, -10, -11, -12); **BUG-5 (Medium) remains open**, honestly documented as not fixable via `config.toml` on this stack. **2 new Low findings** (NEW-1, NEW-2). Open: 0 critical, 0 high, 1 medium, 2 low
- **Security:** RLS tenant isolation, deactivation enforcement, privilege checks hold; residual risk BUG-5 (direct GoTrue access)
- **Production Ready:** **YES** (for the current local/self-hosted setup) — no Critical/High bugs remain
- **Recommendation:** Approve. Before a LAN rollout (Supabase reachable from other machines) resolve BUG-5 via `/refine`; NEW-1/NEW-2 can be closed together with a DB-level "≥1 active super-admin" trigger. Cross-browser (Firefox, Safari) and 768px remain untested in this environment — run `npm run test:e2e` with the project config once `npx playwright install` succeeds in a normal terminal.

### Historical Bug Descriptions (initial QA 2026-09-29, for reference — current status in the table above)

#### BUG-1: Logout from the sidebar user menu does nothing (PROJ-1 regression) — FIXED
- **Severity:** High. Clicking "Abmelden" in the sidebar dropdown sent no request (native `<form>` inside Radix `DropdownMenuContent` was unmounted before submit); user stayed logged in (desktop + 375px).

#### BUG-2: Global deactivation did not cut off existing sessions / not enforced at auth/RLS layer (AC-10) — FIXED
- **Severity:** High. Existing sessions kept full access; a fresh GoTrue password grant with the anon key gave full tenant access and write rights; a deactivated super-admin could re-activate themself via REST.

#### BUG-3: Tenant admin editing own roles / own admin role wiped assignments / masks — FIXED
- **Severity:** High. Routes deleted first (as caller under RLS), which removed the caller's admin right, so insert and restore were rejected → 500 and all roles / masks gone.

#### BUG-4: "Last super-admin" guard counted deactivated super-admins and was racy — FIXED (residual: NEW-1)
- **Severity:** Medium.

#### BUG-5: PROJ-1 login lockout bypassable via direct GoTrue sign-in — OPEN
- **Severity:** Medium
- **Steps to Reproduce:** lock an account with 10 wrong app logins (423) → `POST http://127.0.0.1:54321/auth/v1/token?grant_type=password` with anon key + correct password → 200 with a session. GoTrue attempts never increment `failed_login_attempts`; no effective IP rate limit on this stack (0× 429 in 40 attempts on re-test).
- **Priority:** Fix at the latest before LAN rollout

#### BUG-6: GoTrue self-signup was enabled — FIXED (Medium)
#### BUG-7: Password policy bypassable via GoTrue `PUT /auth/v1/user` — FIXED (Medium; non-ASCII-symbol mismatch documented)
#### BUG-8: "E-Mail bereits registriert" shown under Benutzername — FIXED (Low)
#### BUG-9: `user_roles` could reference another tenant's role via REST — FIXED (Low)
#### BUG-10: Tenant names containing `*` falsely rejected as duplicates — FIXED (Low)
#### BUG-11: Inconsistent case handling of tenant/role/user names — FIXED (Low)
#### BUG-12: PROJ-1 E2E suite broken by the new app shell — FIXED (Low)

## Deployment
_To be added by /deploy_
