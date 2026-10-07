# PROJ-3: Warenwirtschaft – Artikelstamm

## Status: Deployed
**Created:** 2026-09-27
**Last Updated:** 2026-10-07

> **Refinement 2026-10-07 (umgesetzt, QA bestanden, deployed 2026-10-07):** Nach dem Test wurden Basisartikelnummer, Matchcode, Bezeichnungs-Vorschlag, Palettenklasse als Merkmal-Tabelle, Verpackungsgruppe (4 Gewichtsfelder) und Reiter-Layout der Artikelmaske angepasst. Die Abschnitte „Datenfelder", „Acceptance Criteria", „Decision Log" sind bereits auf dem neuen Stand; die Abschnitte „Tech Design", „Implementation Notes" und „QA Test Results" beschreiben noch den Stand vom 2026-10-04. Siehe „Refinement 2026-10-07" am Ende.

## Dependencies
- Requires: PROJ-1 (Supabase-Infrastruktur) — Multi-Tenant-Grundschema
- Requires: PROJ-2 (Benutzerverwaltung & Rollen-/Rechtesystem) — Rechte pro Maske für Artikelstamm + 9 Merkmal-Tabellen-Masken

## User Stories
- Als Administrator möchte ich alle Artikeltypen (Rohstoff, Verpackung, Halbfertigware, Fertigware) in einem zentralen Artikelstamm verwalten, damit Daten nicht doppelt gepflegt werden.
- Als Einkauf/Verkauf möchte ich Artikel anlegen und bearbeiten können, damit ich neue Produkte/Rohstoffe schnell erfassen kann.
- Als Lager/Produktionsplanung möchte ich Artikeldaten einsehen können (Lesezugriff), damit ich ohne Rückfragen auf aktuelle Daten zugreifen kann.
- Als Administrator möchte ich die Merkmal-Tabellen (Artikeltyp, Markeninhaber, Saison, Basisartikel, Form/Design, Packungsgröße, Geschmackssorte, Palettenklasse, Mehrwertsteuersatz, Verpackungsgruppe) zentral pflegen, damit die Matchcode-/Warengruppenlogik konsistent bleibt.
- Als Nutzer möchte ich Artikel über einen automatisch erzeugten Matchcode finden und beim Anlegen einen Bezeichnungs-Vorschlag aus den gewählten Merkmalen erhalten, damit ich weniger tippen muss und Bezeichnungen einheitlich sind.
- Als Nutzer, der einen Artikel bearbeitet, möchte ich vor gleichzeitigen Änderungen durch andere geschützt sein, damit meine Arbeit nicht überschrieben wird.

## Datenfelder

**Kern/Identifikation:**
- Artikeltyp (Pflicht*, Auswahl aus Merkmal-Tabelle: Rohstoff/Verpackung/Halbfertigware/Fertigware)
- Basisartikelnummer (**Pflicht**, freies Feld am Artikel, nur Ziffern, variable Länge, max. 10 Stellen; **keine** Verknüpfung zur Merkmal-Tabelle Basisartikel)
- Artikelkennziffer (**Pflicht**, exakt 4-stellig)
- Artikelnummer (automatisch zusammengesetzt: Basisartikelnummer + „." + Kennziffer, z.B. `12345.0001`; Eindeutigkeit pro Mandant wird geprüft)
- Matchcode (automatisch berechnet, nur Anzeige, durchsuchbar): Kürzel von Artikeltyp-Markeninhaber-Saison-Basisartikel-Form/Design-Packungsgröße-Geschmackssorte, getrennt durch Bindestrich; nicht gewählte Merkmale werden übersprungen
- Warengruppe (automatisch berechnet: Saison-Ziffer (0–9) + Artikeltyp-Ziffer (0–9) + Platzhalter „0")
- Artikelbezeichnung (frei bearbeitbar; wird als Vorschlag aus den **Bezeichnungen** von Basisartikel, Form/Design, Packungsgröße, Geschmackssorte vorbelegt, solange sie leer oder noch nicht manuell geändert wurde), Artikelbeschreibung (optional*)

**Klassifizierung (optional*, Auswahl aus Merkmal-Tabellen mit Link zur Pflege-Maske):**
Markeninhaber, Saison, Basisartikel (Merkmal, liefert Kürzel für Matchcode und Zolltarifnummer), Form/Design, Packungsgröße, Geschmackssorte

**Zertifizierungen (optional*, bool):** Fairtrade, Rainforest, FSC

**Verpackung & Logistik (optional*):** Palettenklasse (Auswahl aus Merkmal-Tabelle), Mischartikel (bool), Anzahl Mischartikel, GTIN Hauptartikel, GTIN Mischartikel 1/2, Karton-EAN, Kartoninhalt, Breite, Länge, Höhe, Gewicht, Tara, Bruttogewicht (automatisch = Gewicht+Tara), Palettenfaktor, Verpackungsgruppe (Auswahl aus Merkmal-Tabelle)

**Steuern & Zoll (optional*):** Mehrwertsteuersatz (Auswahl aus Merkmal-Tabelle), Zolltarifnummer

**Status:** Aktiv/Inaktiv (Default: Aktiv, keine Löschfunktion)

*_Für MVP sind nur Artikelnummer Basisartikel + Artikelkennziffer Pflicht; feingranulare Pflichtfeld-Konfiguration je Artikeltyp folgt in PROJ-12._

**Merkmal-Tabellen (je eine eigene Maske mit eigenen Rechten, 10 Stück):**
1. Artikeltyp — Kürzel, Bezeichnung, Warengruppen-Ziffer (0–9)
2. Markeninhaber — Kürzel, Bezeichnung (spätere Umstellung auf Adresse: siehe Open Questions / PROJ-4)
3. Saison — Kürzel, Bezeichnung, Warengruppen-Ziffer (0–9)
4. Basisartikel — Kürzel (für Matchcode), Bezeichnung, Zolltarifnummer
5. Form/Design — Kürzel, Bezeichnung
6. Packungsgröße — Kürzel, Bezeichnung
7. Geschmackssorte — Kürzel, Bezeichnung
8. Palettenklasse — nur Klasse (Kürzel, z.B. „A"; vom Nutzer selbst angelegt, keine Bezeichnung, keine weiteren Felder)
9. Mehrwertsteuersatz — Satz (%), Bezeichnung
10. Verpackungsgruppe — Bezeichnung, 4 Gewichtsfelder in g (für DSD-Abrechnung): Folie Systembeteiligung, Pappe Systembeteiligung, Folie Transport, Pappe Transport

Jedes Auswahlfeld mit Tabellenbezug ist über Klick auf die Feldbezeichnung mit der jeweiligen Pflege-Maske verlinkt.

**Artikelmaske (Layout):** Die Abschnitte sind Reiter (Karteikarten) nebeneinander, nur der gewählte Reiter ist sichtbar: Kern & Identifikation (Standard) | Klassifizierung | Zertifizierungen | Verpackung & Logistik | Steuern & Zoll. Kopfzeile (Artikelnummer, Matchcode, Status, Aktionen) bleibt über allen Reitern sichtbar; ein Formular, ein Speichern; Reiter mit Validierungsfehlern werden markiert.

## Out of Scope
- Stücklisten/Rezepturen (Produktions- und Verkaufs-Stückliste) — PROJ-11
- Verknüpfung von Mischartikeln zu anderen Artikeldatensätzen — vorerst nur Mehrfach-GTIN-Felder (siehe Open Questions)
- Admin-UI zur Konfiguration von Pflichtfeldern je Artikeltyp — PROJ-12
- Einkaufspreis/Verkaufspreis, Lieferanten-Zuordnung — PROJ-4, PROJ-6, PROJ-7
- Lagerbestände/Mengen — PROJ-5
- Hard-Delete von Artikeln (nur Deaktivieren)
- Mandantenübergreifende Stammdaten
- Verknüpfung Markeninhaber ↔ Adresse/Kundenstamm — erst mit PROJ-4 (Feld zeigt dann direkt auf die Adresse, Kürzel wird dort gepflegt)

## Acceptance Criteria

**Format:** Angenommen [Vorbedingung] / Wenn [Aktion] / Dann [Ergebnis]

- [ ] Angenommen ein Nutzer mit Schreibrecht ist eingeloggt, wenn er einen neuen Artikel mit gültiger Basisartikelnummer (nur Ziffern, max. 10) und 4-stelliger Kennziffer anlegt, dann wird der Artikel gespeichert und die Artikelnummer automatisch als „Basisartikelnummer.Kennziffer" (z.B. 12345.0001) zusammengesetzt
- [ ] Angenommen eine Basisartikelnummer enthält Buchstaben, ist leer oder länger als 10 Stellen, wenn der Nutzer speichern möchte, dann wird eine Validierungsfehlermeldung angezeigt und nicht gespeichert
- [ ] Angenommen ein Nutzer wählt Artikeltyp, Markeninhaber, Saison, Basisartikel, Form/Design, Packungsgröße und Geschmackssorte, wenn er speichert, dann wird der Matchcode aus deren Kürzeln mit Bindestrich zusammengesetzt (fehlende Merkmale übersprungen) und ist in der Artikelliste durchsuchbar
- [ ] Angenommen die Bezeichnung ist leer oder wurde nicht manuell geändert, wenn der Nutzer Basisartikel, Form/Design, Packungsgröße oder Geschmackssorte wählt, dann wird die Bezeichnung aus deren Bezeichnungen vorgeschlagen; eine manuell geänderte Bezeichnung wird nie überschrieben
- [ ] Angenommen ein Administrator hat Palettenklassen (z.B. A–D) in der Merkmal-Tabelle angelegt, wenn ein Nutzer am Artikel die Palettenklasse wählt, dann steht nur diese Auswahl zur Verfügung (kein Freitext)
- [ ] Angenommen ein Nutzer pflegt eine Verpackungsgruppe, wenn er sie speichert, dann kann er Folie und Pappe jeweils für Systembeteiligung und Transport (4 Gewichtsfelder in g) erfassen
- [ ] Angenommen ein Nutzer öffnet die Artikelmaske, wenn die Maske geladen ist, dann sieht er die Bereiche als Reiter nebeneinander und nur den gewählten Reiter; Kopfzeile bleibt sichtbar; ein Reiter mit Validierungsfehler ist markiert
- [ ] Angenommen eine Artikelnummer existiert bereits im Mandanten, wenn ein Nutzer dieselbe Kombination erneut speichern möchte, dann wird das Speichern abgelehnt mit Fehlermeldung „Artikelnummer bereits vergeben"
- [ ] Angenommen eine Artikelkennziffer ist nicht genau 4-stellig, wenn der Nutzer das Formular abschickt, dann wird eine Validierungsfehlermeldung angezeigt und nicht gespeichert
- [ ] Angenommen ein Nutzer mit der Rolle Lager hat nur Leserechte, wenn er einen Artikel bearbeiten möchte, dann wird ihm keine Bearbeitungsoption angeboten
- [ ] Angenommen ein Artikel wird aktuell von Nutzer A bearbeitet, wenn Nutzer B denselben Artikel bearbeiten möchte, dann wird ihm mitgeteilt, dass der Artikel gesperrt ist, und er erhält nur Lesezugriff
- [ ] Angenommen ein Artikel ist 15 Minuten ohne Aktion im Bearbeitungsmodus, wenn das Inaktivitäts-Timeout erreicht wird, dann wird die Bearbeitungssperre automatisch freigegeben
- [ ] Angenommen ein Nutzer hat ungespeicherte Änderungen an einem Artikel offen, wenn er sich ausloggt, dann erscheint eine Sicherheitsabfrage zum Speichern oder Verwerfen
- [ ] Angenommen ein Administrator möchte einen Artikel entfernen, wenn er die Löschoption sucht, dann steht nur „Deaktivieren" zur Verfügung, keine echte Löschfunktion
- [ ] Angenommen ein Artikel ist deaktiviert, wenn ein Nutzer in einer anderen Maske einen Artikel auswählen möchte, dann erscheint der deaktivierte Artikel nicht mehr in der Auswahlliste
- [ ] Angenommen eine Merkmal-Tabelle ist für den Mandanten noch leer, wenn ein Nutzer das zugehörige Auswahlfeld öffnet, dann erscheint ein Hinweis „Noch keine Einträge – hier anlegen" mit Link zur Pflege-Maske
- [ ] Angenommen ein Nutzer ist in Mandant A eingeloggt, wenn er den Artikelstamm öffnet, dann sieht er ausschließlich Artikel und Merkmal-Tabellen-Einträge von Mandant A
- [ ] Angenommen ein Nutzer klickt im Artikelformular auf die Bezeichnung eines Auswahlfeldes mit Tabellenbezug, wenn der Klick erfolgt, dann wird er zur Pflege-Maske der entsprechenden Merkmal-Tabelle weitergeleitet

## Edge Cases
- Zwei Nutzer wollen gleichzeitig denselben Artikel bearbeiten → zweiter Nutzer erhält nur Lesezugriff
- Nutzer verlässt den Bearbeitungsmodus ohne zu speichern (Tab schließen, Absturz) → Sperre läuft nach 15 Min. automatisch ab
- Logout bei offener, ungespeicherter Bearbeitung → Sicherheitsabfrage vor dem Logout
- Artikelnummer bereits vergeben → Speichern wird verhindert, Fehlermeldung
- Benötigte Merkmal-Tabelle ist noch leer → Hinweis mit Direktlink zur Pflege-Maske
- Speicherfehler durch Netzwerk-/API-Ausfall → Eingaben bleiben erhalten, Fehlermeldung wird angezeigt
- Artikel wird deaktiviert, obwohl er in anderen Masken bereits referenziert ist → bleibt in bestehenden Datensätzen sichtbar, verschwindet nur aus neuen Auswahllisten

## Technical Requirements
- Security: Zugriff nur für eingeloggte, mandantenzugeordnete Nutzer; granulare Rechte pro Maske (Artikelstamm + je 1 Maske pro Merkmal-Tabelle) über PROJ-2
- Performance: Liste/Suche soll bei mehreren hundert bis wenigen tausend Artikeln pro Mandant ohne merkliche Verzögerung funktionieren
- Architektur-Hinweis für `/architecture`: Bearbeitungssperre als generischer, wiederverwendbarer Mechanismus (Timeout 15 Min. Inaktivität, Freigabe bei Speichern/Abbrechen, Sicherheitsabfrage bei Logout) auslegen, da er auch für künftige Module (z.B. Aufträge) gelten soll

## Open Questions
- [ ] Soll Mischartikel künftig über eine stücklistenähnliche Verknüpfung zu anderen Artikeln (PROJ-11) abgebildet werden statt über feste Mehrfach-GTIN-Felder? (Nutzer wollte nach Bedenkzeit entscheiden)
- [ ] Markeninhaber mit Kundenstamm/Adresse verknüpfen → bewusst verschoben: Mit PROJ-4 zeigt das Feld Markeninhaber direkt auf die Adresse, das Kürzel wird dort gepflegt (2026-10-07). Bei `/write-spec` für PROJ-4 berücksichtigen.
- [x] ~~Ist „Artikelnummer Basisartikel" identisch mit dem Kürzel aus der Basisartikel-Merkmaltabelle oder ein unabhängiges Freitextfeld?~~ → 2026-10-04 Auswahl aus Merkmaltabelle; **revidiert 2026-10-07**: unabhängiges Zifferfeld am Artikel, Merkmal-Tabelle liefert nur Kürzel für den Matchcode
- [x] ~~Warengruppe: Ziffer bei fehlender Saison/Artikeltyp?~~ → „0" als Ersatzziffer (2026-10-04)
- [x] ~~Standard-Artikeltypen bei neuem Mandanten automatisch vorbefüllen?~~ → Nein, Merkmal-Tabellen starten leer (2026-10-04)
- [x] ~~Merkmal-Einträge löschbar?~~ → Nein, nur Deaktivieren (2026-10-04)
- [x] ~~Admin kann fremde Sperre aufheben?~~ → Nein, 15-Min.-Ablauf genügt. Wenn eine Sperre das Bearbeiten verhindert, muss die Meldung anzeigen, welcher Nutzer gerade bearbeitet/sperrt (2026-10-04)

## Decision Log

### Product Decisions
| Decision | Rationale | Date |
|----------|-----------|------|
| Einheitlicher Artikelstamm mit Artikeltyp-Feld (Rohstoff/Verpackung/Halbfertigware/Fertigware) statt getrennter Specs | Gemeinsame Felder, gemeinsame Nutzung durch Lager/Einkauf/Verkauf/Produktion | 2026-09-30 |
| Stücklisten/Rezepturen ausgelagert nach PROJ-11 | Single Responsibility — Komposition ist kein Stammdatenfeld eines einzelnen Artikels | 2026-09-30 |
| Mischartikel vorerst nur als Mehrfach-GTIN-Feld ohne Verknüpfung zu anderen Artikeln | Nutzer wollte nur mehrere GTINs hinterlegen, keine Komposition | 2026-10-04 |
| Konfigurierbare Pflichtfelder je Artikeltyp ausgelagert nach PROJ-12 | Admin-UI zur Feldkonfiguration ist eigener Scope, kein MVP-Blocker | 2026-10-04 |
| Kein Hard-Delete, nur Deaktivieren | Artikel werden von Lager/Einkauf/Verkauf/Produktion referenziert; Löschen zerstört Referenzen | 2026-10-04 |
| Nur Artikelnummer Basisartikel + Artikelkennziffer sind Pflichtfelder | Maximale Flexibilität für MVP; Feinsteuerung später über PROJ-12 | 2026-10-04 |
| Strikte Mandantentrennung auch für alle Merkmal-Tabellen | Konsistenz mit PROJ-1/PROJ-2, verhindert Daten-Leaking zwischen Mandanten | 2026-10-04 |
| 9 einzelne Merkmal-Tabellen-Masken mit je eigenen Rechten | Granulare Rechtevergabe pro Tabelle gewünscht | 2026-10-04 |
| Keine Preis-/Lieferantenfelder im Artikelstamm | Gehören konzeptionell zu PROJ-4/PROJ-6/PROJ-7, nicht zu reinen Stammdaten | 2026-10-04 |
| Bearbeitungssperre als generischer, wiederverwendbarer Mechanismus konzipiert | Soll später auch für Aufträge & Co. gelten | 2026-10-04 |
| Standard-Rechte-Vorschlag: Admin voll, Einkauf/Verkauf anlegen/bearbeiten, Lager/Produktion lesend | Sinnvoller Default, über PROJ-2 jederzeit anpassbar | 2026-10-04 |
| Basisartikelnummer ist ein eigenes Zifferfeld am Artikel (nur Ziffern, max. 10, variable Länge), nicht mehr Auswahl aus der Merkmal-Tabelle; Artikelnummer = Basisartikelnummer + „." + Kennziffer | Test zeigte: Basisartikel-Kürzel (Matchcode) und Basisartikelnummer sind fachlich unabhängig | 2026-10-07 |
| Matchcode automatisch aus Kürzeln: Artikeltyp-Markeninhaber-Saison-Basisartikel-Form/Design-Packungsgröße-Geschmackssorte, Bindestrich, fehlende übersprungen; nur Anzeige, durchsuchbar | Nutzervorgabe; einheitliche Suche/Identifikation | 2026-10-07 |
| Merkmal-Tabelle Basisartikel: „Nummer" wird zu „Kürzel" (Matchcode); Zolltarif-Vorbelegung bleibt | Folge der Entkopplung von der Basisartikelnummer | 2026-10-07 |
| Artikelbezeichnung wird als Vorschlag aus Bezeichnungen von Basisartikel, Form/Design, Packungsgröße, Geschmackssorte vorbelegt, bleibt frei editierbar und wird nach manueller Änderung nie überschrieben | Weniger Tippen, einheitliche Namen, aber Verkaufsnamen dürfen abweichen | 2026-10-07 |
| Palettenklasse wird Merkmal-Tabelle Nr. 10 (nur Klasse/Kürzel, vom Nutzer angelegt, eigene Maske + Rechte, startet leer) | Auswahl statt Freitext; Nutzerwunsch | 2026-10-07 |
| Verpackungsgruppe: 4 Gewichtsfelder (Folie/Pappe je Systembeteiligung und Transport) statt einem | Nutzervorgabe für DSD-Abrechnung | 2026-10-07 |
| Artikelmaske: Abschnitte als Reiter (Karteikarten), nur gewählter Reiter sichtbar; Kopfzeile fix; ein Formular, Fehler-Markierung am Reiter | Übersichtlichkeit bei vielen Feldern | 2026-10-07 |
| Markeninhaber-Verknüpfung zu Adressen erst mit PROJ-4, Markeninhaber bleibt jetzt unverändert | Kundenstamm existiert noch nicht; später zeigt das Feld direkt auf die Adresse | 2026-10-07 |
| Bestehende Testdaten dürfen bei der Umstellung bereinigt werden, keine aufwendige Datenmigration | Nutzerentscheidung: nur Testdaten vorhanden | 2026-10-07 |

### Technical Decisions
<!-- Added by /architecture -->
| Decision | Rationale | Date |
|----------|-----------|------|
| Zugriffsstufe (Lesen / Lesen + Bearbeiten) pro Maske in den Rollen-Maskenrechten statt getrennter Ansehen-/Bearbeiten-Masken | Rollenverwaltung bleibt übersichtlich; gilt automatisch für alle künftigen Module; bestehende Rechte werden zu "Lesen + Bearbeiten" migriert (Nutzerentscheidung) | 2026-10-04 |
| Artikelnummer Basisartikel = Auswahl aus Merkmal-Tabelle "Basisartikel" (kein freies Textfeld) | Keine Tippfehler/Doppelpflege; Zolltarifnummer vorbelegbar (Nutzerentscheidung, löst Open Question) | 2026-10-04 |
| Artikelnummer und Warengruppe serverseitig berechnet und gespeichert; Bruttogewicht ebenfalls | Ein Ort für die Logik, gilt für UI und spätere Agenten identisch | 2026-10-04 |
| Eindeutigkeit der Artikelnummer pro Mandant per Datenbank-Constraint | Verhindert Duplikate auch bei gleichzeitigem Speichern | 2026-10-04 |
| 9 getrennte Merkmal-Tabellen, aber eine konfigurierbare Pflege-UI | Unterschiedliche Felder je Tabelle; UI nur einmal bauen | 2026-10-04 |
| Bearbeitungssperre als eigene generische Tabelle (Datensatztyp + ID + Mandant + Nutzer + Ablaufzeit), 15 Min. Ablauf ab letzter Aktivität, Übernahme abgelaufener Sperren beim nächsten Zugriff | Gemeinsam sichtbar, überlebt Tab-Schließen/Absturz, kein Aufräum-Job, wiederverwendbar für Aufträge & Co. | 2026-10-04 |
| Server prüft beim Speichern, dass der Nutzer die gültige Sperre hält | Sperre ist sonst nur ein umgehbarer UI-Hinweis | 2026-10-04 |
| Zentraler "Ungespeicherte Änderungen"-Merker für die Logout-Abfrage | Eine Abfragestelle für alle sperrenden Masken | 2026-10-04 |
| Serverseitige Suche + Pagination, Indizes auf Artikelnummer/Bezeichnung | Performance bei einigen tausend Artikeln pro Mandant | 2026-10-04 |
| Keine neuen Pakete | Alle UI-Bausteine sind bereits als shadcn/ui vorhanden | 2026-10-04 |
| Fehlende Saison/Artikeltyp ergibt Warengruppen-Ziffer "0" | Nutzerentscheidung; Warengruppe bleibt immer berechenbar | 2026-10-04 |
| Keine automatische Vorbefüllung von Merkmal-Tabellen bei neuem Mandanten | Nutzerentscheidung; Mandanten pflegen ihre Merkmale selbst (Leerhinweis mit Direktlink greift) | 2026-10-04 |
| Merkmal-Einträge nur deaktivierbar, nicht löschbar | Konsistent mit Artikeln; Verweise bleiben intakt | 2026-10-04 |
| Kein manuelles Aufheben fremder Sperren; Sperr-Meldung nennt den sperrenden Nutzer (auch in der Fehleranzeige beim Speichern/Bearbeiten) | Nutzerentscheidung; 15-Min.-Ablauf genügt, Transparenz über Namen | 2026-10-04 |
| Matchcode wird beim Speichern serverseitig berechnet und gespeichert (mit Trigram-Suchindex) | Schnelle Suche, eine zentrale Berechnungsstelle wie bei Artikelnummer/Warengruppe | 2026-10-07 |
| Änderung eines Kürzels (7 Merkmal-Tabellen) berechnet Matchcodes betroffener Artikel automatisch neu, auch bei Nutzern nur mit Merkmal-Rechten | Gleiches Muster wie Warengruppen-Ziffer-Neuberechnung; Matchcodes veralten nicht | 2026-10-07 |
| Artikelnummer hängt nur noch an `Basisartikelnummer`; Neuberechnung bei Merkmal-Nummernänderung entfällt; Basisartikel-Verweis am Artikel wird optional | Entkopplung von Basisartikelnummer und Merkmal (Refinement) | 2026-10-07 |
| Bezeichnungs-Vorschlag nur im Frontend, kein DB-Feld für „manuell geändert"; bestehende Bezeichnungen gelten als manuell | Server speichert nur bestätigten Wert; verhindert Überschreiben | 2026-10-07 |
| Reiter-Layout als ein Formular (tabs-Komponente, alle Reiter gemountet), Fehlermarkierung am Reiter, Sprung zum ersten fehlerhaften Reiter | Ein Speichern, Validierung über alle Reiter; keine neuen Pakete | 2026-10-07 |
| Umbau als zusätzliche Migration (Palettenklassen-Tabelle + RLS, Verpackungsgruppe +3 Felder, Basisartikel-Kürzel, Artikel-Felder, Matchcode-Index, Masken-Register +1); Testdaten werden bereinigt | Bestehende angewendete Migrationen bleiben unverändert; Nutzerentscheidung zur Datenbereinigung | 2026-10-07 |

---
<!-- Sections below are added by subsequent skills -->

## Tech Design (Solution Architect)

> **Update 2026-10-07 (Refinement):** Das Delta zum Stand vom 2026-10-04 steht gesammelt im Abschnitt „F) Delta-Design Refinement 2026-10-07" am Ende dieses Tech Designs. Wo A)–E) davon abweichen (Basisartikel-Auswahl, 9 statt 10 Merkmal-Tabellen, Abschnitte statt Reiter), gilt F).

### A) Komponentenstruktur

```
Sidebar-Navigation (Erweiterung)
└── Gruppe "Warenwirtschaft"
    ├── Artikelstamm
    └── Merkmale (aufklappbar, jeder Punkt nur sichtbar bei Recht auf diese Maske)
        ├── Artikeltypen
        ├── Markeninhaber
        ├── Saisons
        ├── Basisartikel
        ├── Form/Design
        ├── Packungsgrößen
        ├── Geschmackssorten
        ├── Mehrwertsteuersätze
        └── Verpackungsgruppen

Artikelstamm – Liste
├── Kopfbereich: Titel + Button "Neuer Artikel" (nur bei Schreibrecht)
├── Suche (Artikelnummer / Bezeichnung) + Filter (Artikeltyp, Status Aktiv/Inaktiv)
├── Artikeltabelle (Artikelnummer, Bezeichnung, Artikeltyp, Warengruppe, Status-Badge)
├── Seitenwechsel (Pagination)
└── Leerzustand ("Noch keine Artikel")

Artikel – Detailseite (Ansehen / Bearbeiten / Neu)
├── Kopfzeile: Artikelnummer, Status-Badge
│   └── Aktionen: Bearbeiten | Speichern | Abbrechen | Deaktivieren/Aktivieren
├── Sperr-Banner ("Wird gerade von <Name> bearbeitet – nur Lesezugriff")
└── Formularabschnitte (einklappbar)
    ├── Kern & Identifikation (Artikeltyp, Basisartikel, Kennziffer,
    │   Artikelnummer + Warengruppe als berechnete Anzeige, Bezeichnung, Beschreibung)
    ├── Klassifizierung (Markeninhaber, Saison, Kategorie, Form/Design, Packungsgröße, Geschmackssorte)
    ├── Zertifizierungen (Fairtrade, Rainforest, FSC)
    ├── Verpackung & Logistik (Palettenklasse, Mischartikel, GTINs, Karton-EAN, Maße,
    │   Gewicht, Tara, Bruttogewicht als berechnete Anzeige, Palettenfaktor, Verpackungsgruppe)
    └── Steuern & Zoll (Mehrwertsteuersatz, Zolltarifnummer)

Auswahlfeld mit Tabellenbezug (wiederverwendbarer Baustein)
├── Beschriftung = Link zur Pflege-Maske der Merkmal-Tabelle
├── Suchbare Auswahlliste (nur aktive Einträge des eigenen Mandanten)
└── Leerhinweis "Noch keine Einträge – hier anlegen" mit Direktlink

Merkmal-Pflege (EINE wiederverwendbare Seite, 9-mal konfiguriert)
├── Tabelle der Einträge (Spalten je Merkmal-Tabelle unterschiedlich)
├── Dialog "Neu / Bearbeiten" (Felder je Merkmal-Tabelle unterschiedlich)
└── Rechte: Lesen / Lesen + Bearbeiten pro Merkmal-Maske

Bearbeitungssperre (generischer Baustein, auch für spätere Module)
├── Sperr-Banner (wer bearbeitet gerade)
├── Hintergrund-Verlängerung der Sperre solange der Nutzer aktiv ist
├── Hinweis kurz vor Ablauf der 15 Minuten
└── Sicherheitsabfrage "Speichern oder Verwerfen?" bei Logout mit offenen Änderungen

Erweiterung PROJ-2 (Rollenverwaltung)
└── Rollen-Dialog: pro Maske Auswahl "Kein Zugriff / Lesen / Lesen + Bearbeiten"
```

### B) Datenmodell (in einfacher Sprache)

**Artikel** (gehört zu genau einem Mandanten) – speichert:
- Artikeltyp, Basisartikel (jeweils als Verweis auf einen Eintrag der Merkmal-Tabellen)
- Artikelkennziffer (genau 4 Stellen)
- Artikelnummer = Basisartikel-Nummer + Kennziffer, wird beim Speichern **automatisch zusammengesetzt**, ist **pro Mandant eindeutig** (die Datenbank selbst verhindert Doppelte)
- Warengruppe = Saison-Ziffer + Artikeltyp-Ziffer + "0", wird beim Speichern **automatisch berechnet**
- Bezeichnung, Beschreibung
- Verweise auf: Markeninhaber, Saison, Form/Design, Packungsgröße, Geschmackssorte, Verpackungsgruppe, Mehrwertsteuersatz
- Zertifizierungen (3 Ja/Nein-Felder), Palettenklasse, Mischartikel (Ja/Nein) + Anzahl, 3 GTIN-Felder, Karton-EAN, Kartoninhalt, Breite/Länge/Höhe, Gewicht, Tara, Palettenfaktor, Zolltarifnummer
- Bruttogewicht = Gewicht + Tara, **automatisch berechnet**
- Status Aktiv/Inaktiv (Standard: Aktiv), Angelegt/Geändert-Zeitstempel + wer

**9 Merkmal-Tabellen** (je Mandant getrennt, je Eintrag aktiv/inaktiv):
1. Artikeltyp – Kürzel, Bezeichnung, Warengruppen-Ziffer (0–9)
2. Markeninhaber – Kürzel, Bezeichnung
3. Saison – Kürzel, Bezeichnung, Warengruppen-Ziffer (0–9)
4. Basisartikel – Nummer, Bezeichnung, Zolltarifnummer
5. Form/Design – Kürzel, Bezeichnung
6. Packungsgröße – Kürzel, Bezeichnung
7. Geschmackssorte – Kürzel, Bezeichnung
8. Mehrwertsteuersatz – Satz in %, Bezeichnung
9. Verpackungsgruppe – Bezeichnung, Folien-/Pappengewicht

Kürzel/Nummern sind innerhalb eines Mandanten je Tabelle eindeutig.

**Bearbeitungssperre** (generisch, nicht artikelspezifisch):
- Welcher Datensatztyp (z.B. "Artikel"), welcher Datensatz, welcher Mandant
- Wer sperrt, seit wann, **bis wann** (jeweils 15 Minuten ab letzter Aktivität)
- Pro Datensatz höchstens eine Sperre

**Erweiterung Rollen-Maskenrechte (PROJ-2):** Jedes Maskenrecht erhält eine Zugriffsstufe "Lesen" oder "Lesen + Bearbeiten". Bereits vorhandene Rechte (Benutzerverwaltung) werden automatisch zu "Lesen + Bearbeiten" und ändern ihr Verhalten nicht.

**Neue Masken im Masken-Register:** 1 × Artikelstamm + 9 × Merkmal-Tabellen (Modul "Warenwirtschaft"). Laut PROJ-2 ist dafür keine Schema-Änderung nötig.

**Standard-Rechte-Vorschlag** (laut Spec, über PROJ-2 jederzeit änderbar): Admin voll, Einkauf/Verkauf bearbeiten, Lager/Produktion lesen.

**Speicherort:** Lokale, selbst gehostete PostgreSQL-Datenbank (Supabase), wie PROJ-1/2. Alle Tabellen tragen den Mandanten und sind per Zugriffsschutz (RLS) strikt getrennt.

### C) Technische Entscheidungen (für PM verständlich)

1. **Zugriffsstufe (Lesen / Bearbeiten) pro Maske statt doppelter Masken** — Die Rollenverwaltung bleibt übersichtlich (10 statt 20 Masken), und die Regel gilt automatisch für alle künftigen Module. Kosten: eine kleine, abwärtskompatible Erweiterung von PROJ-2.
2. **Artikelnummer und Warengruppe werden vom Server berechnet, nicht vom Nutzer eingegeben** — Verhindert Abweichungen zwischen Feldern; die Logik liegt an genau einer Stelle (und ist später für Agenten genauso gültig wie für die Oberfläche). Das Formular zeigt die Werte live als Vorschau an.
3. **Eindeutigkeit der Artikelnummer durch die Datenbank erzwungen** — Auch bei zwei gleichzeitigen Speichervorgängen kann kein Duplikat entstehen. Die Oberfläche übersetzt den Fehler in "Artikelnummer bereits vergeben".
4. **Basisartikel wird aus der Merkmal-Tabelle gewählt** (Entscheidung des Nutzers) — Keine Tippfehler, Zolltarifnummer kann aus dem Basisartikel vorbelegt werden. Konsequenz: Ein neuer Basisartikel muss zuerst in der Basisartikel-Pflege angelegt werden; das Auswahlfeld verlinkt direkt dorthin.
5. **9 getrennte Merkmal-Tabellen, aber nur EINE Pflege-Oberfläche** — Die Tabellen haben unterschiedliche Felder (z.B. Steuersatz, Folien-Gewicht, Warengruppen-Ziffer), daher keine Sammeltabelle. Die Oberfläche wird einmal gebaut und je Tabelle nur konfiguriert → wenig Aufwand, einheitliches Verhalten, einfache API-Struktur für Agenten.
6. **Bearbeitungssperre liegt in der Datenbank mit Ablaufzeit, nicht im Browser** — Nur so sehen alle Nutzer dieselbe Sperre, und sie überlebt Tab-Schließen oder Absturz: Sie läuft nach 15 Min. ohne Aktivität von selbst ab (kein Aufräum-Job nötig, abgelaufene Sperren werden beim nächsten Zugriff einfach übernommen). Die Sperre wird atomar vergeben, damit zwei Nutzer nicht gleichzeitig "gewinnen".
7. **Speichern nur mit eigener, gültiger Sperre** — Der Server prüft beim Speichern, ob der Nutzer die Sperre noch hält. Ohne diese Prüfung wäre die Sperre nur ein Hinweis, den man umgehen könnte.
8. **Sperre als generischer Baustein (Datensatztyp + ID)** — Künftige Module (z.B. Aufträge) nutzen denselben Mechanismus ohne neue Sperr-Tabelle, wie in der Spec gefordert.
9. **Logout-Sicherheitsabfrage über einen zentralen "Ungespeicherte Änderungen"-Merker** — Jede Maske, die die Sperre nutzt, meldet dort ihren Zustand an; der Logout-Button fragt nur diesen einen Merker ab.
10. **Suche und Seitenwechsel serverseitig** — Die Liste lädt nur die sichtbare Seite. Hält die Antwortzeiten auch bei einigen tausend Artikeln pro Mandant niedrig; Suchfelder (Artikelnummer, Bezeichnung) werden dafür indiziert.
11. **Deaktivieren statt Löschen, Auswahllisten zeigen nur aktive Artikel/Merkmale** — Bestehende Verweise bleiben intakt, neue Auswahlen blenden Inaktive aus (wie in der Spec).
12. **Serverseitige Rechteprüfung + RLS wie in PROJ-2** — Jede Schreibaktion prüft Recht und Zugriffsstufe auf dem Server; der Datenbank-Zugriffsschutz ist die zweite Ebene.
13. **Gemeinsame Schnittstellenstruktur** — Artikel, Merkmale und Sperren folgen demselben Muster (Liste, Einzelabruf, Anlegen, Ändern) unter dem Mandanten, mit einheitlichen Fehlermeldungen. Das erleichtert die spätere Ansteuerung durch Agenten.

### D) Abhängigkeiten (Pakete)
Keine neuen Pakete. Vorhandene shadcn/ui-Bausteine (Tabelle, Pagination, Accordion/Collapsible, Command + Popover für suchbare Auswahl, Dialog, AlertDialog, Tabs, Badge, Alert, Switch, Checkbox) sowie react-hook-form + zod reichen aus.

### E) Auswirkungen auf bestehende Teile
- **PROJ-2:** Rollen-Dialog, Rollen-API und Rechteprüfung (Anwendung + Datenbank) müssen die Zugriffsstufe kennen; bestehende Rechte werden migriert. Wird im `/backend`- und `/frontend`-Schritt von PROJ-3 mitgebaut und mit getestet.
- **Sidebar:** Neue Gruppe "Warenwirtschaft".
- **Masken-Register:** 10 neue Einträge.
- **Logout:** Neue Sicherheitsabfrage bei ungespeicherten Änderungen.

### F) Delta-Design Refinement 2026-10-07

#### F1) Komponentenstruktur (nur Änderungen)

```
Sidebar → Warenwirtschaft → Merkmale
└── NEU: Palettenklassen (jetzt 10 Merkmal-Masken + Artikelstamm = 11 Masken)

Artikelstamm – Liste
├── Suche: Artikelnummer / Bezeichnung / NEU: Matchcode
└── Tabelle: NEU Spalte "Matchcode"

Artikel – Detailseite
├── Kopfzeile (immer sichtbar, über allen Reitern):
│   Artikelnummer, NEU Matchcode, Status-Badge, Aktionen, Sperr-Banner
└── NEU: Reiter statt einklappbarer Abschnitte (ein Formular, ein Speichern)
    ├── Kern & Identifikation (Standard-Reiter)
    │   ├── Artikeltyp
    │   ├── NEU Basisartikelnummer (Ziffernfeld) + Kennziffer
    │   │   └── Live-Vorschau "Artikelnummer: 12345.0001"
    │   ├── Matchcode + Warengruppe (berechnete Anzeige)
    │   └── Bezeichnung (mit Vorschlag) + Beschreibung
    ├── Klassifizierung (Markeninhaber, Saison, Basisartikel [Merkmal], Form/Design,
    │   Packungsgröße, Geschmackssorte)
    ├── Zertifizierungen
    ├── Verpackung & Logistik (Palettenklasse jetzt als Auswahlfeld mit Link)
    └── Steuern & Zoll
    Reiter mit Validierungsfehlern werden markiert (z.B. roter Punkt)

Bezeichnungs-Vorschlag (Baustein im Kern-Reiter)
└── Füllt die Bezeichnung aus Basisartikel + Form/Design + Packungsgröße + Geschmackssorte,
    solange der Nutzer sie nicht selbst geändert hat

Merkmal-Pflege (weiterhin EINE konfigurierbare Seite, jetzt 10-mal konfiguriert)
├── Basisartikel: Spalte/Feld "Kürzel" statt "Nummer"
├── NEU Palettenklasse: nur ein Feld "Klasse"
└── Verpackungsgruppe: 4 Gewichtsfelder statt einem
```

#### F2) Datenmodell (nur Änderungen, plain language)

**Artikel – geänderte/neue Informationen:**
- **Basisartikelnummer** (neu): eigenes Zifferfeld am Artikel, Pflicht, max. 10 Stellen, variable Länge
- **Verweis auf Basisartikel** (Merkmal) bleibt, ist aber **optional** und liefert nur Kürzel (Matchcode), Bezeichnung (Vorschlag) und Zolltarifnummer
- **Artikelnummer** = Basisartikelnummer + „." + Kennziffer, weiterhin automatisch zusammengesetzt und pro Mandant eindeutig (wegen des Punktes sind unterschiedlich lange Basisnummern nie verwechselbar)
- **Matchcode** (neu, automatisch berechnet und mitgespeichert): Kürzel von Artikeltyp, Markeninhaber, Saison, Basisartikel, Form/Design, Packungsgröße, Geschmackssorte, mit Bindestrich getrennt, nicht gewählte Merkmale entfallen; durchsuchbar (Suchindex wie bei Artikelnummer/Bezeichnung)
- **Palettenklasse**: kein Freitext mehr, sondern Verweis auf die neue Merkmal-Tabelle

**Merkmal-Tabellen (jetzt 10):**
- Basisartikel: „Nummer" → **Kürzel** (je Mandant eindeutig, wie die anderen Kürzel), Bezeichnung, Zolltarifnummer
- **Palettenklasse (neu):** nur die Klasse (Kürzel, z.B. „A"), je Mandant eindeutig, startet leer, nur deaktivierbar
- Verpackungsgruppe: Bezeichnung + **4 Gewichtsfelder in g** (Folie Systembeteiligung, Pappe Systembeteiligung, Folie Transport, Pappe Transport)

**Masken-Register:** 1 neue Maske (Palettenklassen) → insgesamt 11 Masken im Modul „Warenwirtschaft"; Standard-Rechte wie bei den anderen Merkmal-Masken.

**Datenbereinigung:** Die vorhandenen Artikel sind reine Testdaten und dürfen beim Umbau bereinigt werden (Nutzerentscheidung) — keine aufwendige Datenübernahme nötig.

#### F3) Technische Entscheidungen (für PM verständlich)

14. **Matchcode wird beim Speichern berechnet und gespeichert, nicht bei jeder Suche** — Dadurch ist die Suche schnell (eigener Suchindex) und der Wert für Agenten und Listen sofort verfügbar. Berechnet wird an derselben zentralen Stelle wie Artikelnummer und Warengruppe.
15. **Ändert sich ein Kürzel in einer Merkmal-Tabelle, werden alle betroffenen Matchcodes automatisch neu berechnet** — Gleiche Logik wie bereits bei den Warengruppen-Ziffern. Ein Kürzel darf also weiter geändert werden, ohne dass Matchcodes veralten. Die Neuberechnung geschieht auch dann, wenn der ändernde Nutzer nur Rechte auf die Merkmal-Maske hat.
16. **Basisartikelnummer und Basisartikel-Merkmal sind getrennt** — Die Artikelnummer hängt nur noch an der Zifferneingabe am Artikel. Damit entfällt die frühere Neuberechnung aller Artikelnummern bei Änderung einer Merkmal-Nummer; das Merkmal beeinflusst nur noch Matchcode, Bezeichnungsvorschlag und Zolltarif.
17. **Bezeichnungs-Vorschlag nur in der Oberfläche, ohne eigenes Datenbankfeld** — Der Server speichert nur die Bezeichnung, die der Nutzer bestätigt. Ob sie „manuell geändert" wurde, merkt sich die Maske selbst (Bezeichnung weicht vom letzten Vorschlag ab). Bei bestehenden Artikeln gilt eine vorhandene Bezeichnung als manuell → wird nie überschrieben.
18. **Reiter-Layout als ein einziges Formular** — Alle Reiter gehören zu einem Formular mit einem Speichern; nicht sichtbare Reiter bleiben im Hintergrund erhalten, sodass Eingaben und Fehlerprüfung über alle Reiter hinweg funktionieren. Reiter mit Fehlern werden markiert, beim Speichern springt die Maske zum ersten Reiter mit Fehler. Kopfzeile (Artikelnummer, Matchcode, Status, Aktionen) bleibt außerhalb der Reiter.
19. **Palettenklasse und Verpackungsgruppe-Gewichte folgen den bestehenden Mustern** — Die Pflege-Oberfläche wird nur um eine Konfiguration (Palettenklasse) und drei Felder erweitert; Rechte, Sperrverhalten, Deaktivieren-statt-Löschen und Mandantentrennung gelten unverändert.
20. **Umsetzung als neue Datenbank-Migration** (keine Änderung bestehender Migrationen) — Bereits angewendete Migrationen bleiben unangetastet; die Änderungen kommen als zusätzliche Migration, bestehende Testdaten werden dabei bereinigt.

#### F4) Abhängigkeiten (Pakete)
Keine neuen Pakete. Das shadcn/ui-Bauteil „Tabs" ist bereits installiert.

#### F5) Auswirkungen auf bestehende Teile
- **Datenbank:** neue Migration (Artikel-Felder, Palettenklassen-Tabelle, Verpackungsgruppen-Felder, Basisartikel-Kürzel, Matchcode-Berechnung inkl. Folge-Berechnung bei Kürzeländerung, Suchindex, Masken-Register + Rechte-Default, RLS für `pallet_classes`).
- **Schnittstellen:** Artikel-Routen (Basisartikelnummer, Matchcode im Ergebnis, Palettenklasse als Verweis); Merkmal-Routen um Palettenklassen erweitert; Zod-Validierung für neue Felder.
- **Frontend:** Artikelformular (Reiter, Vorschläge, Live-Vorschau), Liste (Matchcode-Suche/-Spalte), Merkmal-Konfiguration (Basisartikel, Palettenklasse, Verpackungsgruppe), Sidebar (+1 Eintrag), Berechnungs-Helfer für die Live-Vorschau (Artikelnummer, Matchcode).
- **Tests:** Unit-/E2E-Tests zu Artikelnummer, Basisartikel, Palettenklasse und Verpackungsgruppe anpassen; neue Tests für Matchcode (inkl. Neuberechnung bei Kürzeländerung) und Reiter-Fehlermarkierung; SQL-RLS-Test für `pallet_classes`.
- **Offene Low-Bugs BUG-2 bis BUG-5** können im selben Durchgang erledigt werden.
- **PROJ-4 (später):** Markeninhaber wird dann auf Adressen umgestellt; der Matchcode zieht das Kürzel dann aus der Adresse. Keine Vorarbeit jetzt nötig.

## Implementation Notes (Frontend)

**Stand 2026-10-04:** Frontend gebaut, `npm run build`, `eslint` und `vitest` (143 Tests) laufen durch. **Nicht im Browser getestet** — die Docker-/Supabase-Instanz lief nicht, und die benötigten Tabellen/Routen entstehen erst mit `/backend`. Bis dahin zeigen die neuen Seiten ihren Fehlerzustand.

### Gebaut
- **Seiten:** `/artikelstamm` (Liste: Suche, Filter Typ/Status, Pagination serverseitig), `/artikelstamm/neu`, `/artikelstamm/[articleId]` (Ansehen/Bearbeiten/Deaktivieren), `/merkmale/[slug]` (9 Merkmal-Tabellen über eine konfigurierbare Oberfläche). Mandantenwahl über `?mandant=` wie in der Benutzerverwaltung.
- **Sidebar:** Gruppe „Warenwirtschaft" mit Artikelstamm + aufklappbarem „Merkmale"; Einträge nur sichtbar, wenn der User in mindestens einem Mandanten das Maskenrecht hat.
- **Zugriffsstufen:** Masken-Register um 10 Masken (Modul `warenwirtschaft`) und `accessLevel` (`read`/`write`) erweitert; Rollen-Dialog zeigt je Maske „Kein Zugriff / Lesen / Lesen + Bearbeiten" (Benutzerverwaltung nur „Kein Zugriff / Zugriff"); Rollenliste nennt die Stufe. Session-Kontext liefert `maskAccess` je Mandant.
- **Bearbeitungssperre (generisch):** `src/lib/edit-lock.ts` (API-Client), `src/hooks/use-edit-lock.ts` (Verlängerung nach Aktivität, Inaktivitäts-Ablauf nach 15 Min., Warnung in den letzten 2 Min., Erkennen einer Übernahme, Freigabe bei Seitenwechsel/Tab-Schließen), `EditLockBanner` (nennt immer den sperrenden Nutzer). Nach Ablauf bleiben Eingaben stehen, Speichern erst nach „Erneut sperren".
- **Logout-Abfrage:** `UnsavedChangesProvider` im App-Layout; die Sidebar fragt vor dem Abmelden `confirmLeave()` ab (Speichern & abmelden / Verwerfen & abmelden / Abbrechen). Zusätzlich Browser-Warnung beim Tab-Schließen.
- **Formular:** Live-Vorschau für Artikelnummer, Warengruppe und Bruttogewicht; Zolltarifnummer wird bei Wahl des Basisartikels vorbelegt (wenn leer); „Mischartikel" blendet Anzahl und GTIN 1/2 ein; Auswahlfelder durchsuchbar, Feldbezeichnung verlinkt zur Pflege-Maske, Leerhinweis „Noch keine Einträge – hier anlegen"; inaktive Merkmale nur sichtbar, wenn der Artikel sie schon nutzt; beim Zurückkehren in den Tab werden die Auswahllisten neu geladen.
- **Tests:** `articles.test.ts`, `merkmale.test.ts`, `tenant-access.test.ts` (Berechnungen, Validierung, Registry, Rechte-Helfer).

### Abweichungen / Interpretationen (bitte bestätigen)
- **„Basisartikel-Kategorie" (Klassifizierung)** wird nicht doppelt geführt: Sie ist das Feld „Basisartikel" aus „Kern & Identifikation" (gleiche Merkmal-Tabelle).
- **Einheiten** (in der Spec nicht genannt): Breite/Länge/Höhe in **mm**, Gewicht/Tara/Bruttogewicht und Folien-/Pappengewicht in **g**. Zentral in `ARTICLE_UNITS` (`src/lib/articles.ts`) bzw. `src/lib/merkmale.ts` änderbar.
- **Link auf Pflege-Maske** öffnet in einem **neuen Tab**, damit ungespeicherte Eingaben und die Sperre erhalten bleiben. Ohne Recht auf die Pflege-Maske ist die Bezeichnung nicht verlinkt.
- **GTIN/EAN:** nur Ziffern, max. 14 Stellen (keine Prüfziffernkontrolle).
- Artikelliste zeigt standardmäßig aktive **und** inaktive Artikel (Filter „Status").

### Annahmen für `/backend` (Frontend ruft das schon so auf) — **inzwischen erfüllt, siehe „Implementation Notes (Backend)“**
- **Tabellen:** `articles`, `article_types`, `brand_owners`, `seasons`, `base_articles`, `form_designs`, `pack_sizes`, `flavors`, `vat_rates`, `packaging_groups` (alle mit `tenant_id`, `is_active`; Spaltennamen siehe `ARTICLE_COLUMNS` in `src/lib/articles.ts` und `MERKMALE[].fields[].column` in `src/lib/merkmale.ts`), `edit_locks` (`tenant_id`, `resource_type`, `resource_id`, `user_id`, `expires_at`; FK auf `user_profiles` für den Namen), neue Spalte `role_permissions.access_level` (`read`/`write`, Bestand → `write`).
- **Routen (JSON, Fehler `{ error, field? }`, deutsche Meldungen):**
  - `POST /api/tenants/:tid/articles`, `PATCH …/articles/:id` (nur mit eigener gültiger Sperre; sonst 409 mit Meldung, die den sperrenden Nutzer nennt), `PATCH …/articles/:id/status` `{ isActive }`. Body-Felder siehe `toArticlePayload`. Doppelte Artikelnummer → 409 „Artikelnummer bereits vergeben" (optional `field: "articleNumber"`). `POST` liefert `201 { id }`.
  - `POST /api/tenants/:tid/merkmale/:slug`, `PATCH …/merkmale/:slug/:id` (Felder oder nur `{ isActive }`); Duplikat → 409 mit `field`.
  - `POST /api/tenants/:tid/locks` `{ resourceType, resourceId }` → 200 `{ expiresAt }` oder 409 `{ error, lockedBy: { username, expiresAt } }`; `DELETE …/locks?resourceType=&resourceId=` → 204. Vollständiger Vertrag in `src/lib/edit-lock.ts`.
  - Rollen-API (`POST/PATCH …/roles`) erhält `masks: [{ module, maske, accessLevel }]`; die bestehende Route verwirft `accessLevel` bisher still → in `/backend` übernehmen. Die Maskenprüfung dort nutzt `MASKS`, akzeptiert die neuen Masken also schon.
- Serverseitig müssen Artikelnummer, Warengruppe (fehlende Ziffer = 0) und Bruttogewicht berechnet sowie Schreibrecht/Stufe geprüft werden; `src/lib/api-auth.ts` kennt bisher nur `isTenantAdmin`.

## Implementation Notes (Frontend) – Refinement 2026-10-07

**Stand 2026-10-07:** Artikelmaske auf Reiter umgebaut; Matchcode, Bezeichnungs-Vorschlag, Basisartikelnummer und Palettenklasse sind in der Oberfläche. Geprüft: `tsc`, `eslint`, `vitest`, Playwright-E2E (siehe Ergebnis unten). Neue Pakete: keine (shadcn `tabs` war installiert).

### Gebaut
- **Reiter statt Abschnitten** (`src/components/warenwirtschaft/article-form.tsx`): Kern & Identifikation (Standard) | Klassifizierung | Zertifizierungen | Verpackung & Logistik | Steuern & Zoll. Ein Formular, ein Speichern; alle Reiter bleiben gemountet (`forceMount`), der inaktive wird per `data-[state=inactive]:hidden` ausgeblendet (Radix setzt bei `forceMount` kein `hidden`). Die Kopfzeile (Artikelnummer, Matchcode · Bezeichnung, Status, Aktionen, Sperr-Banner) liegt außerhalb der Reiter.
- **Fehlermarkierung:** Die Konstante `TABS` ordnet jedes Formularfeld einem Reiter zu. Reiter mit Validierungsfehler zeigen einen roten Punkt (+ Screenreader-Text „enthält Fehler“); beim Speichern springt die Maske zum ersten Reiter mit Fehler, ebenso bei Server-Fehlern (z. B. „Artikelnummer bereits vergeben“ → Kern).
- **Kern:** Basisartikelnummer (Pflicht, Ziffernfeld) + Kennziffer mit Live-Vorschau `12345.0001`; Matchcode (Live-Vorschau aus den Kürzeln, nach dem Speichern der gespeicherte Wert) und Warengruppe als berechnete Anzeige.
- **Bezeichnungs-Vorschlag** (`suggestArticleName` in `src/lib/articles.ts`): Bezeichnungen von Basisartikel, Form/Design, Packungsgröße, Geschmackssorte, durch Leerzeichen getrennt. Die Bezeichnung wird nur gefüllt, solange sie leer ist oder noch dem zuletzt vorgeschlagenen Text entspricht; manuell geänderte (und bestehende) Bezeichnungen werden nie überschrieben. Der Vorschlag reagiert nur auf geänderte Merkmale, nicht auf das bloße Öffnen des Bearbeitungsmodus.
- **Klassifizierung:** Basisartikel (Merkmal, optional; füllt weiter die Zolltarifnummer vor) steht jetzt hier.
- **Verpackung & Logistik:** Palettenklasse als Auswahlfeld mit Link zur Pflege-Maske (Leerhinweis wie bei den anderen Merkmalen).
- **Artikelliste:** neue Spalte „Matchcode“ (ab `lg`), Suche über Artikelnummer, Matchcode und Bezeichnung.
- **Merkmal-Pflege:** Palettenklassen (Feld „Klasse“), Basisartikel „Kürzel“, Verpackungsgruppe mit 4 Gewichtsfeldern; läuft über die bestehende konfigurierbare Oberfläche (Konfiguration aus `/backend`), Sidebar-Eintrag entsteht aus `MERKMALE`.

### Tests
- Unit: `suggestArticleName` in `articles.test.ts`.
- E2E (`tests/PROJ-3-artikelstamm.spec.ts`): Bestandstests an Basisartikelnummer, Punkt in der Artikelnummer und Reiter angepasst (`openTab`-Helfer); neue Tests „Refinement 2026-10-07“ für Reiter-Sichtbarkeit, Fehlermarkierung/Sprung, Matchcode (Vorschau, gespeichert, Kopfzeile, Suche), Bezeichnungs-Vorschlag, Palettenklasse und die 4 Gewichtsfelder der Verpackungsgruppe.
- **Ergebnis:** `vitest` 245/245; Playwright (Chromium + Mobile Safari) im Gesamtlauf 153 bestanden, 5 Fehlschläge: 2× „Mischartikel" (Test-Fehler, Felder liegen jetzt im Reiter „Verpackung & Logistik" → behoben) und 3× nur Mobile Safari (AC-7, Netzwerkfehler, Palettenklasse) — nach dem Fix in Einzelläufen alle bestanden. AC-7 scheiterte im Gesamtlauf, weil das Next.js-Dev-Overlay den Benutzermenü-Button verdeckte (Dev-Server-Artefakt, in zwei Einzelläufen grün); die Stabilität unter Last ist in `/qa` nochmals zu prüfen.
- Beim Schreiben der E2E-Tests wurde ein Fehler gefunden und behoben: Inaktive Reiter waren wegen `forceMount` sichtbar.

### Abweichungen / Hinweise
- Die Reiter sind in der Reihenfolge der Spec; „Basisartikel“ (Merkmal) wurde von Kern nach Klassifizierung verschoben (Spec-Layout).
- Offene Low-Bugs BUG-2 bis BUG-5 aus der QA wurden nicht angefasst (laut Spec „können“ mit erledigt werden) → `/qa` bzw. eigener Durchgang.
- Das laufende Docker-Deployment ist noch auf altem Stand (siehe Backend-Hinweis) → `/deploy` nach `/qa`.

## Implementation Notes (Backend)

**Stand 2026-10-04:** Datenbank, RLS, Routen und Tests fertig; Migrationen sind auf der lokalen Supabase-Instanz angewendet. Geprüft: `tsc`, `eslint`, `npm run build`, `vitest` (206 Tests, davon 83 neu bzw. erweitert), ein **SQL-Test** (`supabase/tests/proj3_rls.sql`, läuft in einer Transaktion und rollt zurück) und **47 Live-Checks** gegen die laufende App + lokale Supabase (Rechte, Sperre, Parallelität, SSR-Seiten; alle Testdaten wieder entfernt). Das Frontend-Verhalten im Browser (Klicks, Dialoge, Timer der Sperre) ist weiterhin **nicht** browsergetestet; das PROJ-2-Playwright-Paket wurde nicht erneut ausgeführt.

### Migrationen
- `20261004100000_proj3_tables.sql`: `role_permissions.access_level` (`read`/`write`, Bestand = `write`); 9 Merkmal-Tabellen (`article_types`, `brand_owners`, `seasons`, `base_articles`, `form_designs`, `pack_sizes`, `flavors`, `vat_rates`, `packaging_groups`) mit case-insensitiv eindeutigen Kürzeln/Namen je Mandant; `articles` mit zusammengesetzten Fremdschlüsseln `(id, tenant_id)` auf alle Merkmale (kein Mandanten-Mix möglich), Unique `(tenant_id, article_number)`, Trigram-Indizes für die Suche; `edit_lock_types` + `edit_locks`.
- `20261004100100_proj3_rls.sql`: `mask_access_level()`, RLS auf allen neuen Tabellen (aktiviert + erzwungen), Sperr-Funktionen `acquire_edit_lock` / `release_edit_lock` / `get_edit_lock`.

### Umgesetzt wie freigegeben
- **Lesen:** Artikel mit Leserecht auf Artikelstamm; Merkmal-Tabellen mit Leserecht auf die eigene Merkmal-Maske **oder** den Artikelstamm. **Schreiben:** Stufe `write` auf der jeweiligen Maske. **Keine DELETE-Policy** auf irgendeiner PROJ-3-Tabelle (auch Super-Admins können nichts löschen; per Test belegt).
- **Berechnung im Trigger `articles_before_write`:** Artikelnummer = Basisartikel-Nummer + Kennziffer; Warengruppe = Saison-Ziffer + Typ-Ziffer + 0 (fehlend = 0); Bruttogewicht = Gewicht + Tara. Mitgeschickte Werte werden überschrieben. Ändert sich eine Warengruppen-Ziffer oder die Basisartikel-Nummer, rechnen Folge-Trigger die Artikel neu (auch wenn der Aufrufer nur Rechte auf die Merkmal-Maske hat).
- **Sperre:** atomare Vergabe per `INSERT … ON CONFLICT DO UPDATE … WHERE`, 15 Minuten, Übernahme abgelaufener Sperren, Rechteprüfung über `edit_lock_types` (Datensatztyp → Maske; neue Module tragen nur eine Zeile ein). Der Artikel-Trigger erzwingt: Inhaltsänderung nur mit **eigener gültiger** Sperre, Aktivieren/Deaktivieren nur ohne **fremde** gültige Sperre (SQLSTATE `55P03`, deutsche Meldung mit dem Namen des sperrenden Nutzers). Das gilt auch bei direkten REST-Aufrufen. Zwei gleichzeitige Sperranfragen → genau ein Gewinner (live belegt).
- **Zusätzlich (Defense in Depth):** Neu gewählte Merkmal-Einträge dürfen nicht deaktiviert sein (bestehende Verweise bleiben).

### Abweichungen vom freigegebenen Plan
- **`edit_locks` ist für Clients komplett geschlossen** (keine SELECT-Policy; strenger als geplant). Der Name des sperrenden Nutzers kommt über die Funktion `get_edit_lock`, weil normale Nutzer fremde Profile ohnehin nicht lesen dürfen. `loadForeignArticleLock` (`src/lib/article-data.ts`) nutzt diese Funktion.
- Alte, über einen Tag abgelaufene Sperren werden beim nächsten `acquire_edit_lock` mitgelöscht (kein Aufräum-Job).

### Routen (alle: Session-Client → RLS als zweite Ebene; Zod; deutsche Fehlermeldungen)
- `POST /api/tenants/:tid/articles` → 201 `{ id, articleNumber }`; `PATCH …/articles/:id` (gibt die Sperre nach dem Speichern frei); `PATCH …/articles/:id/status` `{ isActive }`. Duplikat → 409 „Artikelnummer bereits vergeben“ (`field: "kennziffer"`); Sperrkonflikt → 409 mit Nutzernamen; fremder Mandant → 400/403; keine Löschroute.
- `POST …/merkmale/:slug`, `PATCH …/merkmale/:slug/:itemId` (Felder oder nur `{ isActive }`); Duplikat → 409 mit `field` (`code`, bei MwSt/Verpackungsgruppe `name`); keine Löschroute.
- `POST …/locks` → 200 `{ expiresAt }` oder 409 `{ error, lockedBy: { username, expiresAt } }`; `DELETE …/locks?resourceType=&resourceId=` → 204.
- Rollen-Routen (PROJ-2) speichern und ändern jetzt `accessLevel` (Diff: nur Stufe aktualisieren, wenn die Maske bleibt); fehlt die Stufe → `write`, Benutzerverwaltung immer `write`.
- Neuer Helfer `requireMaskAccess()` in `src/lib/api-auth.ts`.

### Bekannte Grenzen
- Eine Basisartikel-Nummer kann auch geändert werden, wenn Artikel sie nutzen (Plan-Entscheidung); die Artikelnummern werden dann neu berechnet. Sie kann nicht mit einer anderen Artikelnummer kollidieren (gleiche Länge ⇒ gleiche Basis), eine theoretische Kollision würde als Fehler zurückgemeldet.
- Merkmal-Einträge werden ohne Sperre bearbeitet (last-write-wins wie Rollen in PROJ-2).
- Policies rufen `mask_access_level()` pro Zeile auf; bei einigen tausend Artikeln pro Mandant ist das unkritisch, bei deutlich mehr sollte die Liste in `/qa` gemessen werden.

## Implementation Notes (Backend) – Refinement 2026-10-07

**Stand 2026-10-07:** Datenbank, Trigger, Routen und Tests für die Refinement sind fertig; Migration `20261007100000_proj3_refinement.sql` ist auf der lokalen Supabase-Instanz angewendet. Geprüft: `tsc`, `eslint`, `npm run build`, `vitest` (243 Tests), SQL-Test `supabase/tests/proj3_rls.sql` (angepasst und erweitert, „ALL OK", rollt zurück). **Nicht** erneut ausgeführt: Playwright-E2E (siehe „Offen").

### Migration `20261007100000_proj3_refinement.sql`
- **Bereinigung:** Die 2 vorhandenen Test-Artikel (und ihre Sperren) werden gelöscht (Nutzerentscheidung 2026-10-07, keine Datenmigration).
- **`articles`:** neu `base_article_number` (Pflicht, Check `^[0-9]{1,10}$`), `match_code` (berechnet, Trigram-Index für die Suche), `pallet_class_id` (zusammengesetzter FK `(id, tenant_id)` → `pallet_classes`); `pallet_class` (Freitext) entfällt; `base_article_id` ist jetzt optional. Zusätzliche Indizes auf `article_type_id`, `brand_owner_id`, `form_design_id`, `pack_size_id`, `flavor_id`, `pallet_class_id` (die Neuberechnung bei Kürzeländerung sucht darüber).
- **`pallet_classes` (neu):** nur `code` (je Mandant case-insensitiv eindeutig), `is_active`; RLS aktiviert + erzwungen; Policies wie alle Merkmal-Tabellen (lesen: Maske `merkmal_palettenklasse` ODER Artikelstamm; anlegen/ändern: Stufe `write` auf `merkmal_palettenklasse`; **keine DELETE-Policy**).
- **`packaging_groups`:** `foil_weight` entfällt; neu `foil_system_weight`, `cardboard_system_weight`, `foil_transport_weight`, `cardboard_transport_weight` (g, `>= 0`, optional).
- **Trigger `articles_before_write`:** Artikelnummer = `base_article_number || '.' || kennziffer`; Matchcode = Kürzel von Artikeltyp, Markeninhaber, Saison, Basisartikel, Form/Design, Packungsgröße, Geschmackssorte, mit `-` verbunden, fehlende übersprungen (ohne Merkmale: leerer String); Warengruppe/Bruttogewicht unverändert; `pallet_classes` in der Prüfung „deaktivierte Merkmale nicht neu verwenden"; `match_code` zählt wie die anderen berechneten Felder nicht als Inhaltsänderung (keine Sperrprüfung beim Neuberechnen).
- **Folge-Berechnung:** Die drei Einzel-Trigger/-Funktionen aus der ersten Migration sind durch **eine** Funktion `recompute_articles_for_ref()` (Argument = Verweisspalte am Artikel) ersetzt. Sie feuert nach Änderung des **Kürzels** in allen 7 Matchcode-Tabellen und zusätzlich bei Änderung der Warengruppen-Ziffer (Saison, Artikeltyp). Die Neuberechnung der Artikelnummern bei Änderung der Basisartikel-Merkmalnummer entfällt.

### Routen / Schemas
- `articleSchema` (`warenwirtschaft-shared.ts`): neu `baseArticleNumber` (Pflicht, 1–10 Ziffern, Meldung „Die Basisartikelnummer muss aus 1 bis 10 Ziffern bestehen"), `baseArticleId` optional (`uuid | null`), `palletClassId` (`uuid | null`) statt `palletClass`. Mitgeschickte `articleNumber`/`matchCode`/`commodityGroup`/`grossWeight` werden verworfen.
- `POST …/articles` → `201 { id, articleNumber, matchCode }`; `PATCH …/articles/:id` → `200 { id, articleNumber, matchCode }`.
- `…/merkmale/palettenklassen` (POST/PATCH) läuft über die bestehende konfigurierbare Route (Konfiguration in `src/lib/merkmale.ts`); Duplikat → 409 mit `field: "code"`. Verpackungsgruppe nimmt `foilSystemWeight`, `cardboardSystemWeight`, `foilTransportWeight`, `cardboardTransportWeight`.
- Die Artikelliste (`/artikelstamm`) durchsucht zusätzlich `match_code`.
- Neue Maske `warenwirtschaft:merkmal_palettenklasse` im Register (`src/lib/masks.ts`); damit 11 Masken (Artikelstamm + 10 Merkmale). Die Rollen-Routen validieren gegen `MASKS` und akzeptieren sie ohne Änderung.

### Minimale Frontend-Anpassung (damit die App mit der neuen Datenbank funktioniert)
- `src/lib/articles.ts`: `baseArticleNumber`, `palletClassId`, `matchCode`, `computeArticleNumber` (mit Punkt), neue Vorschau-Funktion `computeMatchCode`.
- `article-form.tsx`: Feld „Basisartikelnummer" (Pflicht), Basisartikel nur noch optional, Palettenklasse als Auswahlfeld, Matchcode-Live-Anzeige. **Das Reiter-Layout, die Fehlermarkierung am Reiter und der Bezeichnungs-Vorschlag sind noch nicht gebaut → `/frontend`.**
- Merkmal-Konfiguration: Basisartikel-Feld „Nummer" → „Kürzel", Palettenklassen-Konfiguration, 4 Gewichtsfelder der Verpackungsgruppe.

### Offen / Hinweise
- **Playwright-E2E (`tests/PROJ-3-artikelstamm.spec.ts`) ist noch nicht angepasst:** Seed/Fixtures für Artikel (`base_article_id`-Inserts ohne `base_article_number`), Erwartungen an die Artikelnummer ohne Punkt und die UI-Schritte „Basisartikel wählen" müssen mit `/frontend` und `/qa` nachgezogen werden. Nur `tests/global-setup.ts` kennt bereits die neue Maske.
- **Das laufende Docker-Deployment (`localhost:3001`) nutzt dieselbe lokale Datenbank und läuft noch mit dem alten Code:** Artikel anlegen/ändern und die Artikelmasken schlagen dort jetzt fehl, bis die App mit dem neuen Code neu gebaut wird (`/deploy`). Die Datenbank ist rückwärts nicht kompatibel zum alten Stand (neue Pflichtspalte, entfernte Spalten).
- Die Migration wurde per `psql` angewendet und in `supabase_migrations.schema_migrations` eingetragen (die Supabase-CLI ist in dieser Umgebung nicht installiert).

## QA Test Results

**Getestet:** 2026-10-04
**App:** lokaler Dev-Server (`E2E_PORT=3100`, Port 3000 ist durch einen fremden Container belegt) gegen die lokale, selbst gehostete Supabase-Instanz
**Tester:** QA Engineer (AI)

### Testumfang und Ergebnisse im Überblick
| Prüfung | Ergebnis |
|---|---|
| Unit-/Integrationstests (Vitest) | **225 bestanden** (21 Dateien; neu in QA: `edit-lock.test.ts`, `use-edit-lock.test.ts`) |
| E2E (Playwright) Gesamtsuite | **146 bestanden, 0 fehlgeschlagen** (Chromium + Mobile Safari/WebKit, PROJ-1, PROJ-2, PROJ-3); darin 2 bewusst „erwartet fehlschlagende" Tests für offene Bugs (BUG-2, BUG-4) |
| E2E Firefox (nur PROJ-3, eigene temporäre Konfiguration, vor dem letzten Bug-Test BUG-4) | **37/37 bestanden** |
| SQL-Test `supabase/tests/proj3_rls.sql` (RLS, Trigger, Sperre) | alle Prüfungen bestanden, rollt zurück |
| Live-Checks (47) gegen App + Datenbank (aus `/backend`) | alle bestanden |
| Responsive (375 / 768 / 1440 px), Screenshots geprüft | in Ordnung, 1 kleiner Mangel (BUG-5) |
| Performance mit 5.000 Artikeln unter RLS | Liste 1,7 ms, Suche 86 ms, exakter Zähler 164 ms |

Neue E2E-Datei: `tests/PROJ-3-artikelstamm.spec.ts` (38 Tests je Browser). Fixtures: `tests/fixtures.ts`, `tests/global-setup.ts`, `tests/global-teardown.ts` (3 Mandanten, 7 Rollen/Nutzer; Teardown räumt per E-Mail-Domain/Mandanten-Präfix auf; nach dem Lauf: 0 Reste in der Datenbank).

### Acceptance Criteria Status

#### AC-1: Artikel mit Schreibrecht anlegen, Artikelnummer automatisch zusammengesetzt
- [x] Live-Vorschau der Artikelnummer, nach dem Speichern `Basisartikel-Nr. + Kennziffer` in der Datenbank, Weiterleitung auf die Detailseite

#### AC-2: Doppelte Artikelnummer wird abgelehnt
- [x] Meldung „Artikelnummer bereits vergeben" am Kennziffer-Feld, kein zweiter Datensatz (auch per Datenbank-Constraint belegt)

#### AC-3: Kennziffer nicht 4-stellig
- [x] Validierungsmeldung bei leer, 3 Ziffern und Buchstaben; nichts gespeichert; ohne Basisartikel ebenfalls abgelehnt

#### AC-4: Lager (nur Lesen) bekommt keine Bearbeitungsoption
- [x] Kein „Bearbeiten", „Deaktivieren" oder „Neuer Artikel"; Felder gesperrt, Hinweis „Nur Lesezugriff"; `/artikelstamm/neu` zeigt „Kein Zugriff"; API-Schreibzugriffe mit derselben Sitzung → 403

#### AC-5: Gleichzeitige Bearbeitung
- [x] Nutzer B sieht schon beim Öffnen „Gesperrt – nur Lesezugriff" mit dem **Namen** von A; „Bearbeiten" wird mit Meldung abgelehnt; direkter API-Save → 409 mit dem Namen von A; nach „Abbrechen" von A ist die Sperre frei

#### AC-6: 15 Minuten Inaktivität
- [x] Mit simulierter Uhr: nach 14 Min. Warnung „Sperre läuft bald ab", nach 16 Min. Banner „Bearbeitungssperre abgelaufen", Sperre in der Datenbank freigegeben, Eingaben bleiben stehen, Speichern gesperrt, Übernahme durch einen zweiten Nutzer möglich, „Erneut sperren" nennt dann diesen Nutzer

#### AC-7: Logout mit ungespeicherten Änderungen
- [x] Sicherheitsabfrage; „Abbrechen" lässt Nutzer und Eingaben unverändert; „Verwerfen & abmelden" meldet ab, nichts gespeichert, Sperre freigegeben; „Speichern & abmelden" speichert zuerst

#### AC-8: Nur „Deaktivieren", keine Löschfunktion
- [x] Kein Lösch-Button; Deaktivieren per Dialog; direkter REST-Delete löscht 0 Zeilen; es gibt keine Löschroute

#### AC-9: Deaktivierter Artikel erscheint nicht in Auswahllisten anderer Masken
- [x] Datenebene: `is_active` wird gesetzt, Listenfilter „Aktiv" blendet ihn aus, Artikel bleibt mit Status „Inaktiv" in der Liste
- [ ] **Nicht prüfbar:** Es gibt noch keine andere Maske mit Artikel-Auswahl (kommt mit PROJ-5/6/7). Dort erneut prüfen.

#### AC-10: Leere Merkmal-Tabelle
- [x] Hinweis „Noch keine Einträge" mit Link „hier anlegen" auf die Pflege-Maske des Mandanten

#### AC-11: Mandantentrennung
- [x] Nutzer sehen nur Artikel und Merkmale des eigenen Mandanten; fremde Artikel-URL → „Artikel nicht gefunden"; API gegen fremden Mandanten → 403; direkter REST-Zugriff liefert keine fremden Zeilen

#### AC-12: Klick auf die Feldbezeichnung führt zur Pflege-Maske
- [x] Link auf `/merkmale/<tabelle>?mandant=…`, öffnet **in neuem Tab** (bewusste Abweichung, damit Eingaben und Sperre erhalten bleiben); ohne Recht auf die Pflege-Maske nur reine Beschriftung

### Edge Cases Status
- [x] Zwei Nutzer, derselbe Artikel → zweiter nur lesend (AC-5)
- [x] Tab schließen/Absturz → Seite verlassen gibt die Sperre sofort frei; bleibt sie liegen, läuft sie nach 15 Min. ab (Ablauf per Datenbank simuliert und übernommen)
- [x] Logout bei offener Bearbeitung → Sicherheitsabfrage (AC-7)
- [x] Artikelnummer doppelt → abgelehnt (AC-2)
- [x] Leere Merkmal-Tabelle → Hinweis mit Direktlink (AC-10)
- [x] Netzwerkausfall beim Speichern → Fehlermeldung „Verbindung zum Server fehlgeschlagen", Eingaben bleiben, erneutes Speichern klappt
- [x] Deaktivierter, noch verwendeter Merkmal-Eintrag → bleibt am Artikel sichtbar (mit „(inaktiv)"), neu nicht wählbar; auch von der Datenbank erzwungen
- [x] Zusätzlich getestet: Sperre serverseitig verloren (Datenbank), Abbrechen mit Änderungen, Warengruppe/Brutto/Zolltarif-Vorbelegung, Mischartikel-Felder, Suche/Typfilter/Pagination, Doppelte Merkmal-Kürzel (case-insensitiv), Rollen mit Zugriffsstufe (anlegen, nur Stufe ändern)

### Security Audit Results
- [x] Authentifizierung: alle 7 neuen API-Routen → 401 ohne Sitzung; alle neuen Seiten leiten auf `/login`
- [x] Autorisierung je Stufe: „Lesen"-Nutzer können weder anlegen, ändern, sperren noch deaktivieren (UI, API, direkter REST-Zugriff); Nutzer ohne Maske sehen nichts; Merkmal-Schreibrechte sind je Maske getrennt
- [x] Mandantentrennung: Lesen/Schreiben/Sperren in fremden Mandanten verweigert; Artikel lässt sich nicht in einen anderen Mandanten verschieben; Verweis auf Merkmal eines anderen Mandanten → abgelehnt (Fremdschlüssel)
- [x] Berechnete Felder und Audit-Spalten (`article_number`, `commodity_group`, `gross_weight`, `created_by`) lassen sich auch per direktem REST-Update nicht fälschen
- [x] Bearbeitungssperre: fremde Sperre blockiert Speichern und Deaktivieren auch bei direkten REST-Aufrufen; abgelaufene Sperre wird übernommen; fremde Sperre nicht freigebbar; `edit_locks` für Clients geschlossen; parallele Sperranfragen → genau ein Gewinner
- [x] Kein Hard-Delete: weder per API noch per REST (auch nicht für Super-Admins)
- [x] Input-Validierung (Zod + DB-Constraints): falsche Typen, zu lange Texte, ungültige UUIDs, kaputtes JSON, Mass-Assignment (`tenant_id`, Berechnetes, `is_active`) → 400 bzw. ignoriert
- [x] Injection: XSS-Payloads in Name/Beschreibung/Suche werden als Text dargestellt und nicht ausgeführt; Such-/Filter-Injection (`'; drop table`, `%`, `,`, `)(`, Anführungszeichen, 500 Zeichen) bricht die Abfrage nicht, liefert keine fremden Zeilen
- [x] Keine Informationslecks: Datenbankfehler werden als generische Meldung geliefert; kein Service-Role-Schlüssel in HTML
- [ ] Rate-Limiting: nicht vorhanden und nicht getestet (laut Backend-Regeln für den MVP optional); siehe BUG-4

### Regression
- [x] PROJ-1 (5 Tests) und PROJ-2 (alle Tests) bestehen in Chromium und Mobile Safari. Zwei bewusste Anpassungen an den PROJ-2-Tests: (1) die Masken-Checkbox im Rollen-Dialog ist jetzt eine Zugriffs-Auswahl (gewollte PROJ-3-Änderung), (2) der Login-Helfer wiederholt den Versuch, wenn der Klick vor der Hydration einen nativen Form-Submit auslöst (trat in WebKit gelegentlich auf).
- [x] Benutzerverwaltung zeigt Bestandsrollen weiter korrekt („Zugriff"); neue Rollenrechte werden mit Stufe gespeichert.

### Bugs Found

#### BUG-1: Auswahlfelder im Artikelformular haben keinen zugänglichen Namen — **BEHOBEN (2026-10-04)**
- **Severity:** Medium (Barrierefreiheit, WCAG 2.1 AA 1.3.1 / 4.1.2)
- **Steps:** `/artikelstamm/neu` öffnen; im Accessibility-Baum erscheinen alle Merkmal-Auswahlen (Artikeltyp, Basisartikel, Saison, …) als unbenannte `combobox`. Screenreader nennen das Feld nicht; ein Klick auf die Beschriftung fokussiert das Feld nicht.
- **Ursache:** `article-form.tsx` übergab dem `ReferenceSelect` eine eigene `id` (und `aria-invalid`), die die vom `FormControl` gesetzten Werte überschrieb; `htmlFor` der Beschriftung zeigte dadurch ins Leere.
- **Fix:** eigene `id` und `aria-invalid` entfernt, `FormControl` setzt sie wieder (`article-form.tsx`, `reference-select.tsx`). Die Comboboxen heißen jetzt wie ihre Beschriftung, ein Klick auf die Beschriftung fokussiert das Feld.
- **Test:** `PROJ-3: Known bugs › BUG-1 (fixed)` läuft als normaler Test (Chromium und Mobile Safari); nach dem Fix: Gesamtsuite 146/146, Unit-Tests 225/225.

#### BUG-2: Fehlermeldung „Bearbeitungssperre abgelaufen" erscheint unter dem Feld Artikelkennziffer
- **Severity:** Low
- **Steps:** Artikel bearbeiten; die Sperre geht serverseitig verloren (z. B. Rechner im Standby); ändern und „Speichern" klicken.
- **Erwartet:** Meldung im Formular-Hinweis oben. **Tatsächlich:** Meldung hängt am Feld „Artikelkennziffer". Ursache: jedes 409 ohne `field` wird als „Artikelnummer doppelt" behandelt, außer der Text enthält „gesperrt"/„bearbeitet" (`article-form.tsx`, `submit`). Eingaben bleiben erhalten, die Meldung ist lesbar, aber falsch zugeordnet.
- **Test:** `Edge: if the lock was lost on the server …` (erwartet fehlschlagend)
- **Priority:** Nächster Sprint

#### BUG-3: Freigabe kann mit einer laufenden Verlängerung konkurrieren
- **Severity:** Low
- **Beschreibung:** Löst der Inaktivitäts-Ablauf die Freigabe aus, während eine Verlängerungsanfrage noch unterwegs ist, kann die Verlängerung die Sperre nach der Freigabe neu anlegen. Die Sperre blockiert dann bis zu 15 Minuten, obwohl der Browser sie freigegeben hat. Im Test nur durch zwei fast gleichzeitige Zeitsprünge auf dem langsameren WebKit reproduzierbar, im Alltag ein sehr enges Zeitfenster.
- **Priority:** Nice to have (Verlängerung vor der Freigabe abwarten bzw. verwerfen)

#### BUG-4: Sperre kann für nicht existierende Datensätze angelegt werden, kein Rate-Limit
- **Severity:** Low
- **Beschreibung:** `acquire_edit_lock` prüft nicht, ob der Datensatz im Mandanten existiert. Ein Nutzer mit Schreibrecht kann so beliebig viele Sperrzeilen erzeugen (Speicherwachstum; abgelaufene Zeilen werden erst nach einem Tag aufgeräumt). Kein fremder Datensatz wird dadurch gesperrt (Schlüssel enthält den Mandanten).
- **Test:** `Known bugs, part 2 › BUG-4` (erwartet fehlschlagend)
- **Priority:** Nächster Sprint

#### BUG-5: Horizontaler Seiten-Überlauf bei 768 px (Liste und Merkmal-Seiten, Sidebar geöffnet)
- **Severity:** Low (kosmetisch)
- **Beschreibung:** Bei 768 px Breite mit ausgeklappter Sidebar entsteht auf `/artikelstamm` und `/merkmale/…` ein kleiner horizontaler Seiten-Scroll. Bei 375 und 1440 px nicht; Ursache nicht näher untersucht.
- **Priority:** Nächster Sprint

### Beobachtungen (keine Fehler)
- **Performance:** Der exakte Zähler der Liste (`count: exact`) kostet bei 5.000 Artikeln 164 ms (rund 33 µs pro Zeile für die RLS-Funktion) und wächst linear. Für „einige tausend Artikel pro Mandant" (Spec) ausreichend; ab etwa 30.000+ Artikeln pro Mandant lohnt ein geschätzter Zähler oder eine umgeschriebene Policy.
- **Sperre ohne Admin-Eingriff:** Wer aktiv bleibt, kann einen Artikel unbegrenzt gesperrt halten (bewusste Entscheidung: nur 15-Min.-Ablauf, kein manuelles Aufheben).
- **Logout beendet alle Sitzungen des Nutzers** (PROJ-1-Verhalten). Beim parallelen Testen mit einem geteilten Nutzer hat das Tests gestört; die Logout-Tests nutzen deshalb eigene Nutzer.
- **Browser:** Chromium (Desktop), WebKit (iPhone-13-Emulation, nicht Desktop-Safari) und Firefox geprüft; echte Geräte und manuelle Screenreader-Tests nicht.
- **Testumgebung:** Die installierten Playwright-Browser passten nicht zur Playwright-Version (1.58.2), und `npx playwright install` hängt unter Node 26 beim Entpacken. Die Browser wurden von Hand aus dem Playwright-CDN installiert. Die Playwright-Konfiguration kennt jetzt `E2E_PORT` (Standard 3000).

### Summary
- **Acceptance Criteria:** 11 von 12 bestanden, 1 teilweise (AC-9: Auswahllisten anderer Masken existieren noch nicht)
- **Bugs:** 5 insgesamt (0 Critical, 0 High, 1 Medium, 4 Low); **BUG-1 (Medium) behoben, 4 Low offen**
- **Security:** keine Sicherheitslücken gefunden; Rate-Limiting fehlt (MVP-optional)
- **Production Ready:** JA
- **Recommendation:** Deployen. BUG-2 bis BUG-5 (alle Low) im nächsten Sprint. AC-9 bei PROJ-5/6/7 erneut prüfen.

## QA Test Results – Refinement 2026-10-07

**Getestet:** 2026-10-07 (Re-Test der Refinement: Basisartikelnummer, Matchcode, Bezeichnungs-Vorschlag, Palettenklasse, Verpackungsgruppe, Reiter-Layout; der Abschnitt „QA Test Results" oben beschreibt den Stand vom 2026-10-04)
**App:** lokaler Dev-Server (`E2E_PORT=3100`) gegen die lokale, selbst gehostete Supabase-Instanz mit Migration `20261007100000`
**Tester:** QA Engineer (AI)

### Testumfang und Ergebnisse im Überblick
| Prüfung | Ergebnis |
|---|---|
| Unit-/Integrationstests (Vitest) | **245 bestanden** (21 Dateien) |
| `tsc`, `eslint`, `npm run build` | sauber |
| SQL-Test `supabase/tests/proj3_rls.sql` (RLS, Trigger, Matchcode-Neuberechnung, Palettenklassen, Sperre) | **ALL OK** (rollt zurück) |
| E2E Chromium + Mobile Safari (WebKit), Gesamtsuite PROJ-1/2/3 | **171 bestanden, 5 fehlgeschlagen** — alle 5 nur in Mobile Safari (siehe „Instabile Tests") |
| E2E Firefox (nur PROJ-3, temporäre Konfiguration) | **53/53 bestanden** |
| Responsive (375 / 768 / 1440 px), Screenshots geprüft | Formular in Ordnung; Liste bei 768 px mit Seiten-Überlauf (BUG-5, besteht weiter) |

Neu in dieser QA: 8 E2E-Tests „QA Refinement" + 1 offen erwarteter Test (BUG-6) in `tests/PROJ-3-artikelstamm.spec.ts`; zusätzlich die 6 Tests „Refinement" aus `/frontend`.

### Acceptance Criteria Status (Stand der Spec nach Refinement, 18 Kriterien)
- [x] **Anlegen + Artikelnummer:** Basisartikelnummer + „." + Kennziffer (z. B. `1200.0042`), Live-Vorschau, nach Speichern in der Datenbank
- [x] **Ungültige Basisartikelnummer** (leer, Buchstaben, Punkt, Leerzeichen, > 10 Stellen, Nicht-ASCII-Ziffern) → Fehlermeldung bzw. 400, nichts gespeichert; auch von der Datenbank abgelehnt
- [x] **Matchcode** aus den 7 Kürzeln (fehlende übersprungen), Live-Vorschau, gespeichert, in Kopfzeile und Liste, durchsuchbar (teilweise, ohne Beachtung der Groß-/Kleinschreibung)
- [x] **Bezeichnungs-Vorschlag** aus Basisartikel/Form/Packungsgröße/Geschmack; folgt Änderungen, solange nicht manuell geändert; manuelle Bezeichnung wird nie überschrieben
- [x] **Palettenklasse** nur als Auswahl aus der Merkmal-Tabelle (kein Freitext), als Verweis gespeichert
- [x] **Verpackungsgruppe** mit den 4 Gewichtsfeldern (Folie/Pappe je Systembeteiligung und Transport), negative/ungültige Werte abgelehnt
- [x] **Reiter-Layout:** 5 Reiter, nur der gewählte sichtbar, Kopfzeile bleibt, Reiter mit Fehler markiert, Sprung zum ersten fehlerhaften Reiter
- [x] **Doppelte Artikelnummer** → „Artikelnummer bereits vergeben"
- [x] **Kennziffer nicht 4-stellig** → Validierungsfehler
- [x] **Lager (nur Lesen)** sieht Reiter, aber keine Bearbeitungsoption; Felder gesperrt
- [x] **Gleichzeitige Bearbeitung:** zweiter Nutzer nur lesend, Banner nennt den Namen
- [x] **15 Minuten Inaktivität:** Sperre läuft ab (simulierte Uhr)
- [x] **Logout mit ungespeicherten Änderungen:** Sicherheitsabfrage (Speichern / Verwerfen / Abbrechen)
- [x] **Nur „Deaktivieren"**, keine Löschfunktion (auch nicht für Palettenklassen und andere Merkmale)
- [ ] **Deaktivierter Artikel verschwindet aus Auswahllisten anderer Masken** — nicht prüfbar, solange es keine andere Maske mit Artikelauswahl gibt (PROJ-5/6/7); Datenebene geprüft
- [x] **Leere Merkmal-Tabelle** → Hinweis „Noch keine Einträge – hier anlegen" mit Link
- [x] **Mandantentrennung** (inkl. Palettenklassen: fremde Einträge unsichtbar und nicht referenzierbar)
- [x] **Klick auf Feldbezeichnung → Pflege-Maske** (neuer Tab; Basisartikel jetzt im Reiter Klassifizierung)

### Edge Cases (zusätzlich zu den dokumentierten)
- [x] Kürzel-Änderung (Saison) per API → Matchcode aller betroffenen Artikel neu berechnet, Artikelnummer bleibt; auch während ein Artikel gesperrt ist
- [x] Alle 7 Matchcode-Kürzel einzeln geändert / Merkmale entfernt (SQL-Test)
- [x] Fehler in verstecktem Reiter: Speichern aus anderem Reiter springt zum Fehler; Serverfehler (Duplikat) springt zum Kern-Reiter
- [x] Bezeichnung leer, vorbelegt, manuell geändert, dann Merkmal gewechselt → bleibt
- [x] Read-only-Ansicht zeigt Matchcode in der Kopfzeile, alle Felder inkl. Palettenklasse gesperrt
- [x] Netzwerkausfall beim Speichern (Eingaben bleiben, erneutes Speichern klappt) — in Chromium/Firefox stabil, in Mobile Safari gelegentlich instabil

### Security Audit Results
- [x] Berechnete Felder (`article_number`, `match_code`, `commodity_group`, `gross_weight`) lassen sich weder per API noch per direktem REST-Insert/-Update fälschen (REST-Insert mit `match_code: "HACK"` → vom Trigger überschrieben)
- [x] `base_article_number`: SQL-Injection-Strings, Überlänge, Nicht-ASCII-Ziffern (`１２３`, `١٢٣`), falsche Typen (Zahl, `null`, Array) → 400; Datenbank-Check lehnt dieselben Werte ab
- [x] Palettenklassen: Schreiben nur mit Stufe `write` auf der eigenen Maske (Artikelstamm-`write` allein → 403), Lesen mit eigener Maske oder Artikelstamm; fremder Mandant unsichtbar; Verweis auf fremde Palettenklasse (Fremdschlüssel) und auf deaktivierte Palettenklasse abgelehnt; kein Löschen (auch nicht per REST)
- [x] Matchcode-Neuberechnung (`SECURITY DEFINER`): Argument kommt nur aus der Trigger-Definition, `search_path` gesetzt, `EXECUTE` für Clients entzogen; kein Weg zu Rechteerweiterung gefunden
- [x] XSS: Kürzel/Bezeichnungen mit HTML (`<i onclick=…>`, `<img onerror=…>`, `<script>`) erscheinen als Text in Kopfzeile, Formular und Liste; kein Dialog, kein eingeschleustes Element
- [x] Such-Injection über die neue Suchspalte `match_code` (`,`, `)(`, `%`, `_`, `\`, `x),(match_code.ilike.*`) bricht die Abfrage nicht und liefert keine fremden Zeilen
- [x] Authentifizierung/Autorisierung/Mandantentrennung der bestehenden Routen unverändert (Gesamtsuite grün in Chromium und Firefox)
- [ ] Rate-Limiting weiterhin nicht vorhanden (MVP-optional, siehe BUG-4)

### Regression
- [x] PROJ-1 und PROJ-2 (alle Tests) bestehen in Chromium und Mobile Safari bzw. Firefox; Rollen-Dialog kennt die neue Maske „Palettenklassen" über das Masken-Register.

### Bugs Found

#### BUG-6: Listensuche findet Kürzel/Texte mit `_`, `%`, `,`, `(`, `)`, `"`, `*`, `\` nicht
- **Severity:** Low
- **Beschreibung:** `sanitizeSearch` (`src/app/(app)/artikelstamm/page.tsx`) ersetzt diese Zeichen durch Leerzeichen, damit der PostgREST-Filter nicht bricht. Ein Matchcode/Kürzel wie `A_B` ist deshalb über die Suche nicht auffindbar (Eingabe `A_B` sucht nach `A B`). Sicherheitlich unkritisch, aber ein funktionaler Fehler, seit der Matchcode durchsucht wird (Kürzel dürfen beliebige Zeichen enthalten).
- **Test:** `PROJ-3 QA Refinement: known bugs (open) › BUG-6` (erwartet fehlschlagend)
- **Priority:** Nächster Sprint (Zeichen maskieren statt entfernen, oder Suchfunktion in der Datenbank)

#### BUG-7: Formularzeilen im Reiter „Kern" sind unsauber ausgerichtet
- **Severity:** Low (kosmetisch)
- **Beschreibung:** Auswahlfeld Artikeltyp (ohne Hinweistext) und Basisartikelnummer (mit Hinweistext) stehen in einer Zeile auf unterschiedlicher Höhe; ebenso Kennziffer/Artikelnummer. Screenshot 1440 px.
- **Priority:** Nice to have

#### Weiterhin offen aus der QA vom 2026-10-04 (unverändert, nicht Teil der Refinement)
- **BUG-2** (Low): Sperrfehler erscheint unter dem Kennziffer-Feld (jetzt zusätzlich: Sprung zum Kern-Reiter)
- **BUG-3** (Low): Freigabe kann mit einer laufenden Verlängerung konkurrieren
- **BUG-4** (Low): Sperre für nicht existierende Datensätze / kein Rate-Limit
- **BUG-5** (Low): horizontaler Seiten-Überlauf bei 768 px auf `/artikelstamm` (gemessen: 149 px) und den Merkmal-Seiten bei geöffneter Sidebar; besteht weiter

### Beobachtungen (keine Fehler)
- **Instabile Tests (Mobile Safari/WebKit):** Im Gesamtlauf scheiterten 5 Tests nur unter WebKit (AC-7b, Netzwerkausfall, XSS-Test aus der Hauptsuite, Palettenklasse, neuer XSS-Test). Ursachen: (a) der neue XSS-Test erwartete die Matchcode-Spalte, die erst ab 1024 px sichtbar ist, und nutzte ein festes Kürzel, das parallel in zwei Browsern kollidierte → beides im Test behoben; (b) die übrigen scheiterten wiederholt an Klicks, die vor der Hydration des Dev-Servers ankamen bzw. am Next.js-Dev-Overlay, das den Benutzermenü-Button verdeckte. Einzeln laufen sie überwiegend grün, „Netzwerkausfall" scheiterte aber auch einzeln gelegentlich. Chromium und Firefox waren in allen Läufen stabil. Empfehlung: gegen einen Produktions-Build (nach `/deploy` auf `localhost:3001`) wiederholen.
- **Doppeltes Formular direkt nach der Navigation:** Unmittelbar nach `page.goto` auf `/artikelstamm/neu` waren im Dev-Server kurzzeitig zwei Eingabefelder `baseArticleNumber` im DOM (Hydration-Übergang, `useId`-Formate `_r_…` und `_R_…`); nach `networkidle` nur eines. Vermutlich ein Dev-Server-Artefakt, nicht gegen den Produktions-Build geprüft.
- **Matchcode-Spalte** in der Liste erst ab 1024 px sichtbar (bewusst, Platz); die Suche findet ihn auf allen Breiten.
- **Matchcode-Eindeutigkeit:** Kürzel dürfen den Trenner `-` enthalten; Matchcodes sind daher nicht zwingend eindeutig und nicht eindeutig zerlegbar (laut Spec nur Anzeige/Suche, kein Schlüssel).
- **Laufendes Docker-Deployment (`localhost:3001`) läuft noch mit altem Code gegen die bereits migrierte Datenbank** — Artikel anlegen/ändern funktioniert dort nicht, bis `/deploy` die App neu baut.
- **Browser:** Chromium, WebKit (iPhone-13-Emulation) und Firefox; keine echten Geräte, keine manuellen Screenreader-Tests.

### Summary
- **Acceptance Criteria:** 17 von 18 bestanden, 1 nicht prüfbar (Auswahllisten anderer Masken, erst mit PROJ-5/6/7)
- **Bugs (neu):** 2 Low (BUG-6, BUG-7); 0 Critical, 0 High, 0 Medium. Offen aus früher: BUG-2 bis BUG-5 (Low)
- **Security:** keine Sicherheitslücken gefunden; Rate-Limiting fehlt weiterhin (MVP-optional)
- **Production Ready:** JA
- **Recommendation:** Mit `/deploy` ausrollen (die laufende App ist ohnehin nicht mehr zur Datenbank passend); danach die instabilen WebKit-Tests gegen den Produktions-Build wiederholen. BUG-6 und BUG-2 bis BUG-5 im nächsten Sprint.

## Deployment

**Deployed:** 2026-10-04
**Ziel:** derselbe selbst gehostete Docker-Container wie bei PROJ-1/2 (`my-first-app-app-1`, nicht Vercel — das Projekt deployt laut PRD lokal), neu gebaut mit dem PROJ-3-Code und neu gestartet. Dahinter die lokale, selbst gehostete Supabase-Instanz; die beiden PROJ-3-Migrationen (`20261004100000`, `20261004100100`) waren schon während `/backend` angewendet, ein separater „Produktions"-Migrationsschritt war nicht nötig.
**Zugriff:** `http://localhost:3001` (nur an `127.0.0.1` gebunden), wie bei PROJ-1/2.

**Pre-Deployment-Checks (alle bestanden):**
- `npm run build` erfolgreich, alle neuen Routen vorhanden (`/artikelstamm`, `/artikelstamm/neu`, `/artikelstamm/[articleId]`, `/merkmale/[slug]`, `/api/tenants/[tenantId]/articles|merkmale|locks`)
- `npm run lint` sauber; `npm test` 225/225
- QA: Approved (11/12 Acceptance Criteria, AC-9 erst mit PROJ-5/6/7 prüfbar), keine Critical/High-Bugs, BUG-1 (Medium) behoben, 4 Low offen und akzeptiert
- Keine Secrets committet (Diff der PROJ-3-Commits geprüft, keine `.env*`-Dateien); keine neuen Umgebungsvariablen
- Migrationen: `supabase migration list --local` zeigt beide PROJ-3-Migrationen als angewendet

**Deploy-Schritte:**
1. Drei Commits (`feat(PROJ-3)` Frontend, `feat(PROJ-3)` Backend, `test(PROJ-3)` QA)
2. `docker compose --env-file .env.local build`
3. `docker compose --env-file .env.local up -d` (Container neu erstellt und gestartet)
4. Verifikation gegen `http://localhost:3001`:
   - ohne Anmeldung: `/login` → 200, `/` und `/artikelstamm` → 307 auf `/login`, `POST …/articles` und `POST …/locks` → 401
   - 47 Live-Checks mit Wegwerf-Mandant/-Nutzern im Container (Rechte, Mandantentrennung, Sperre inkl. parallelem Zugriff, Seiten): alle bestanden, danach 0 Reste in der Datenbank
   - `tests/PROJ-3-artikelstamm.spec.ts` (Chromium) gegen den Container: 38/38 bestanden, 0 Reste
   - keine Fehler in den Container-Logs

**Nicht Teil dieses Deployments / weiterhin offen:**
- Fehler-Tracking (`docs/production/error-tracking.md`) und Security-Header (`docs/production/security-headers.md`) sind weiterhin nicht eingerichtet (bestehende Schuld seit PROJ-1, nicht durch PROJ-3 entstanden)
- Offene Low-Bugs aus der QA: BUG-2 (Sperrfehler unter dem Kennziffer-Feld), BUG-3 (Freigabe/Verlängerung-Rennen), BUG-4 (Sperre für nicht existierende Datensätze, kein Rate-Limit), BUG-5 (768-px-Überlauf)
- Nicht auf das GitHub-Remote gepusht (siehe unten)

## Refinement 2026-10-07 (Änderungen nach Nutzertest)

**Status:** Spec angepasst, Tech Design (Delta) ergänzt am 2026-10-07 (siehe „F) Delta-Design" im Abschnitt Tech Design), Backend und Frontend umgesetzt am 2026-10-07 (siehe die „Implementation Notes … – Refinement 2026-10-07"). QA am 2026-10-07 bestanden (siehe „QA Test Results – Refinement 2026-10-07"). Deployed am 2026-10-07 (siehe „Deployment – Refinement 2026-10-07").

### Auswirkungen auf Umsetzung (Delta zu Tech Design / Implementation)
- **Datenmodell `articles`:** neues Feld `base_article_number` (Ziffern, max. 10, Pflicht); Verweis `base_article_id` bleibt als Klassifizierung (optional); `article_number` = `base_article_number || '.' || kennziffer`; neues berechnetes Feld `match_code` (+ Trigram-Index für Suche); `pallet_class` wird Verweis auf neue Tabelle.
- **Berechnung im Trigger:** Matchcode aus Kürzeln der 7 Merkmale; Folge-Trigger müssen bei Änderung eines Kürzels (Artikeltyp, Markeninhaber, Saison, Basisartikel, Form/Design, Packungsgröße, Geschmackssorte) Matchcodes neu berechnen. Artikelnummer-Neuberechnung bei Änderung der Basisartikel-Merkmalnummer entfällt.
- **Merkmal-Tabellen:** `base_articles`: „Nummer" → „Kürzel"; neue Tabelle `pallet_classes` (nur `code`); `packaging_groups`: 4 Gewichtsfelder statt einem; Masken-Register +1 (11 Masken: Artikelstamm + 10 Merkmale), Rechte-Default analog.
- **Frontend:** Reiter-Layout (tabs-Komponente) mit Fehlermarkierung; Matchcode-Anzeige in Kopfzeile/Kern; Bezeichnungs-Vorschlag mit „manuell geändert"-Merker; Basisartikelnummer-Feld mit Live-Vorschau `12345.0001`; Palettenklasse als Auswahlfeld; Artikelliste durchsucht zusätzlich den Matchcode.
- **Tests:** bestehende Unit-/E2E-Tests zu Artikelnummer, Basisartikel und Verpackungsgruppe müssen angepasst werden; Testdaten dürfen bereinigt werden.
- **Offene Low-Bugs aus QA (BUG-2 bis BUG-5)** können beim selben Durchgang mit erledigt werden.

## Deployment – Refinement 2026-10-07

**Deployed:** 2026-10-07
**Ziel:** wie bei PROJ-1/2/3 der selbst gehostete Docker-Container `my-first-app-app-1` (nicht Vercel), neu gebaut und neu erstellt; dahinter die lokale, selbst gehostete Supabase-Instanz. Die Migration `20261007100000_proj3_refinement.sql` war bereits seit `/backend` angewendet (und in `schema_migrations` eingetragen) — das laufende Deployment war seitdem inkompatibel zur Datenbank und ist jetzt wieder konsistent.
**Zugriff:** `http://localhost:3001` (nur an `127.0.0.1` gebunden)
**Git-Tag:** `v1.3.0-PROJ-3` (lokal; nicht gepusht)

**Pre-Deployment-Checks (alle bestanden):**
- `npm run lint` sauber; `npm run build` (in `/qa` und im Docker-Build) erfolgreich
- QA: Approved (17/18 Acceptance Criteria, 1 nicht prüfbar bis PROJ-5/6/7), keine Critical/High-Bugs
- Keine `.env*`-/Secret-Dateien im Diff seit dem letzten Deploy; keine neuen Umgebungsvariablen
- Working Directory sauber, Migration `20261007100000` als angewendet bestätigt

**Deploy-Schritte:** `docker compose --env-file .env.local build` → `docker compose --env-file .env.local up -d` (Container neu erstellt).

**Verifikation gegen `http://localhost:3001`:**
- ohne Anmeldung: `/login` → 200; `/`, `/artikelstamm`, `/merkmale/palettenklassen` → 307 auf `/login`; `POST …/articles`, `…/locks`, `…/merkmale/palettenklassen` → 401
- `tests/PROJ-3-artikelstamm.spec.ts` gegen den Container: **Chromium 53/53 bestanden**; **Mobile Safari 49/53** im Parallellauf — die 4 Fehlschläge (AC-5, „calculated fields", Reiter-Fehlermarkierung, Read-only-Ansicht) laufen einzeln mit einem Worker alle grün (12,7 s). Das bestätigt das in der QA beschriebene Muster instabiler WebKit-Tests unter Parallellast (wechselnde Tests je Lauf); gegen den Produktions-Build war es nicht besser, die Ursache liegt also vermutlich im Test-Timing (Hydration/Klick), nicht im Produktionscode — nicht abschließend geklärt.
- Container-Logs ohne Fehler; nach den Läufen 0 Test-Reste in der Datenbank (Artikel/Mandanten `E2E…`)

**Weiterhin offen:** Fehler-Tracking und Security-Header (`docs/production/…`, bestehende Schuld seit PROJ-1); Low-Bugs BUG-2 bis BUG-7; Remote-Push (`origin` = GitHub) nicht ausgeführt.
