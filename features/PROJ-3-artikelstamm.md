# PROJ-3: Warenwirtschaft – Artikelstamm

## Status: Architected
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

## QA Test Results
_To be added by /qa_

## Deployment
_To be added by /deploy_
