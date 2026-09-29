# PROJ-2: Benutzerverwaltung & Rollen-/Rechtesystem

## Status: Planned
**Created:** 2026-09-29
**Last Updated:** 2026-09-29

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

---
<!-- Sections below are added by subsequent skills -->

## Tech Design (Solution Architect)
_To be added by /architecture_

## QA Test Results
_To be added by /qa_

## Deployment
_To be added by /deploy_
