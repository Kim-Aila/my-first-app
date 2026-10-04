# PROJ-3: Warenwirtschaft – Artikelstamm

## Status: Approved
**Created:** 2026-09-27
**Last Updated:** 2026-10-04

## Dependencies
- Requires: PROJ-1 (Supabase-Infrastruktur) — Multi-Tenant-Grundschema
- Requires: PROJ-2 (Benutzerverwaltung & Rollen-/Rechtesystem) — Rechte pro Maske für Artikelstamm + 9 Merkmal-Tabellen-Masken

## User Stories
- Als Administrator möchte ich alle Artikeltypen (Rohstoff, Verpackung, Halbfertigware, Fertigware) in einem zentralen Artikelstamm verwalten, damit Daten nicht doppelt gepflegt werden.
- Als Einkauf/Verkauf möchte ich Artikel anlegen und bearbeiten können, damit ich neue Produkte/Rohstoffe schnell erfassen kann.
- Als Lager/Produktionsplanung möchte ich Artikeldaten einsehen können (Lesezugriff), damit ich ohne Rückfragen auf aktuelle Daten zugreifen kann.
- Als Administrator möchte ich die Merkmal-Tabellen (Artikeltyp, Markeninhaber, Saison, Basisartikel, Form/Design, Packungsgröße, Geschmackssorte, Mehrwertsteuersatz, Verpackungsgruppe) zentral pflegen, damit die Artikelnummern-/Warengruppenlogik konsistent bleibt.
- Als Nutzer, der einen Artikel bearbeitet, möchte ich vor gleichzeitigen Änderungen durch andere geschützt sein, damit meine Arbeit nicht überschrieben wird.

## Datenfelder

**Kern/Identifikation:**
- Artikeltyp (Pflicht*, Auswahl aus Merkmal-Tabelle: Rohstoff/Verpackung/Halbfertigware/Fertigware)
- Artikelnummer Basisartikel (**Pflicht**, frei vergebbar)
- Artikelkennziffer (**Pflicht**, exakt 4-stellig)
- Artikelnummer (automatisch zusammengesetzt: Basisartikel-Nr. + Kennziffer; Eindeutigkeit pro Mandant wird geprüft)
- Warengruppe (automatisch berechnet: Saison-Ziffer (0–9) + Artikeltyp-Ziffer (0–9) + Platzhalter „0")
- Artikelbezeichnung, Artikelbeschreibung (optional*)

**Klassifizierung (optional*, Auswahl aus Merkmal-Tabellen mit Link zur Pflege-Maske):**
Markeninhaber, Saison, Basisartikel-Kategorie, Form/Design, Packungsgröße, Geschmackssorte

**Zertifizierungen (optional*, bool):** Fairtrade, Rainforest, FSC

**Verpackung & Logistik (optional*):** Palettenklasse, Mischartikel (bool), Anzahl Mischartikel, GTIN Hauptartikel, GTIN Mischartikel 1/2, Karton-EAN, Kartoninhalt, Breite, Länge, Höhe, Gewicht, Tara, Bruttogewicht (automatisch = Gewicht+Tara), Palettenfaktor, Verpackungsgruppe (Auswahl aus Merkmal-Tabelle)

**Steuern & Zoll (optional*):** Mehrwertsteuersatz (Auswahl aus Merkmal-Tabelle), Zolltarifnummer

**Status:** Aktiv/Inaktiv (Default: Aktiv, keine Löschfunktion)

*_Für MVP sind nur Artikelnummer Basisartikel + Artikelkennziffer Pflicht; feingranulare Pflichtfeld-Konfiguration je Artikeltyp folgt in PROJ-12._

**Merkmal-Tabellen (je eine eigene Maske mit eigenen Rechten):**
1. Artikeltyp — Kürzel, Bezeichnung, Warengruppen-Ziffer (0–9)
2. Markeninhaber — Kürzel, Bezeichnung
3. Saison — Kürzel, Bezeichnung, Warengruppen-Ziffer (0–9)
4. Basisartikel — Kürzel/Nummer, Bezeichnung, Zolltarifnummer
5. Form/Design — Kürzel, Bezeichnung
6. Packungsgröße — Kürzel, Bezeichnung
7. Geschmackssorte — Kürzel, Bezeichnung
8. Mehrwertsteuersatz — Satz (%), Bezeichnung
9. Verpackungsgruppe — Bezeichnung, Folien-/Pappengewicht (für DSD-Abrechnung)

Jedes Auswahlfeld mit Tabellenbezug ist über Klick auf die Feldbezeichnung mit der jeweiligen Pflege-Maske verlinkt.

## Out of Scope
- Stücklisten/Rezepturen (Produktions- und Verkaufs-Stückliste) — PROJ-11
- Verknüpfung von Mischartikeln zu anderen Artikeldatensätzen — vorerst nur Mehrfach-GTIN-Felder (siehe Open Questions)
- Admin-UI zur Konfiguration von Pflichtfeldern je Artikeltyp — PROJ-12
- Einkaufspreis/Verkaufspreis, Lieferanten-Zuordnung — PROJ-4, PROJ-6, PROJ-7
- Lagerbestände/Mengen — PROJ-5
- Hard-Delete von Artikeln (nur Deaktivieren)
- Mandantenübergreifende Stammdaten

## Acceptance Criteria

**Format:** Angenommen [Vorbedingung] / Wenn [Aktion] / Dann [Ergebnis]

- [ ] Angenommen ein Nutzer mit Schreibrecht ist eingeloggt, wenn er einen neuen Artikel mit gültiger Artikelnummer Basisartikel und 4-stelliger Kennziffer anlegt, dann wird der Artikel gespeichert und die Artikelnummer automatisch zusammengesetzt
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
- [x] ~~Ist „Artikelnummer Basisartikel" identisch mit dem Kürzel aus der Basisartikel-Merkmaltabelle oder ein unabhängiges Freitextfeld?~~ → Entschieden in `/architecture` (2026-10-04): Auswahl aus der Basisartikel-Merkmaltabelle
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

---
<!-- Sections below are added by subsequent skills -->

## Tech Design (Solution Architect)

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

## Deployment
_To be added by /deploy_
