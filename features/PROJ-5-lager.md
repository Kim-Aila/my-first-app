# PROJ-5: Warenwirtschaft – Lager (Lagerebene, CSV-Import)

## Status: Architected
**Created:** 2026-10-11
**Last Updated:** 2026-10-11

## Dependencies
- Requires: PROJ-1 (Supabase-Infrastruktur, Mandantentrennung)
- Requires: PROJ-2 (Rollen-/Rechtesystem pro Maske) — Maske „Lagerbestand"
- Requires: PROJ-3 (Artikelstamm) — Verknüpfung über die Artikelnummer, Reiter „Bestand" in der Artikelmaske

## Überblick
Der Lagerbestand wird auf **Lagerebene** geführt: je Lagerhilfsmittel (LHM, identifiziert über SSCC) und Artikel. Die Daten kommen zunächst per **CSV-Import** (Vollabzug aus dem Lagersystem), später über eine Datenbankschnittstelle mit Einzelmeldungen (neu produziert / versendet). Jedes LHM bleibt 5 Jahre erhalten und durchläuft einen Lebenszyklus (im Lager → fehlt → geprüft / versendet).

Die Bestandsführung auf **Systemebene** (Reserviert für Versand, Bedarf für Aufträge, Zu produzieren, Differenz) und die Maske **Lagerabgleich** sind bewusst nicht Teil dieses Specs.

## User Stories
- Als Lagermitarbeiter möchte ich eine Bestandsdatei des Lagersystems hochladen, damit der Lagerbestand im ERP ohne manuelle Eingabe aktuell ist.
- Als Lagermitarbeiter möchte ich vor der Übernahme sehen, wie viele LHM neu, geändert oder fehlend sind und welche Zeilen fehlerhaft sind, damit ich keine falschen Daten übernehme.
- Als Lagermitarbeiter möchte ich LHM, die im neuen Abzug fehlen, prüfen und mit Bemerkung als „geprüft i.O." kennzeichnen können, damit Abweichungen nachvollziehbar abgearbeitet werden.
- Als Lagermitarbeiter möchte ich ein fehlendes LHM manuell als versendet buchen können, damit der Ablauf auch vor Anbindung der Versandbuchung funktioniert.
- Als Einkauf/Verkauf/Produktionsplanung möchte ich den Lagerbestand je Artikel einsehen (Bestand, Gesperrt QS, Gesperrt, Verfügbar), damit ich ohne Rückfragen planen kann.
- Als Nutzer möchte ich auch Bestände von Artikeln sehen, die noch nicht im Artikelstamm angelegt sind, damit kein Lagerbestand unsichtbar bleibt.

## Datenmodell (fachlich)
**LHM-Position** (Schlüssel: Mandant + SSCC + Artikelnummer):
- SSCC, Artikelnummer (umgewandelt, siehe unten), Verweis auf Artikelstamm (leer, wenn Artikel unbekannt)
- Menge, Freie Menge, Menge QS, Sperrmenge, QS und Sperre gesamt
- Einheit (wie in der Datei geliefert, **nur gespeichert, nicht geprüft**)
- Logistikzentrum (reines Infofeld, **nicht** der Lagerort), Bestandslagergruppe
- Status: Im Lager | Fehlt, ungeprüft | Fehlt, geprüft i.O. | Versendet
- Mischpalette (abgeleitet: SSCC hat mehr als eine Position mit verschiedenen Artikeln)
- Prüfung: Prüfer, Zeitpunkt, Bemerkung; Versandbuchung: Zeitpunkt, Nutzer (bzw. später Quelle)
- Erstmals gesehen, zuletzt im Abzug gesehen, letzter Import

**Import-Protokoll:** Datei, Nutzer, Zeitpunkt, Anzahl neu / geändert / unverändert / fehlend / wieder aufgetaucht, übersprungene Zeilen mit Grund, Fehler mit SSCC.

**Dateiformat:** Semikolon-CSV des Lagersystems; die Nutzdaten stehen als XML in der Spalte „Daten".
- Verarbeitet: Zeilen `BestandDaten` mit Status `done` (je Zeile eine Position)
- `BestandStart` / `BestandEnde`: nur Plausibilitätsprüfung (`anzahlDatensaetze` gegen Zeilenzahl)
- Übernommene XML-Felder: `sscc`, `p_artikel-p_artikelnr`, `menge`, `freieMenge`, `qsMenge`, `sperrMenge`, `qsUndSperrMenge`, `p_einheitMenge-p_name`, `logistikzentrum`, `bestandslagergruppe`
- Nicht übernommen: `User`, `Zeit`, `pc`, `gruppe`, `rlzMenge`, `reservierteMenge` (Systemebene), `eigentuemer`, `p_mandant-p_name` (Mandant = Mandant des Importierenden)

**Artikelnummer-Umwandlung:** Format `Basisartikelnummer.Kennziffer`. Eine 3-stellige Kennziffer (alter Stand) erhält eine führende 0 (`41100.451` → `41100.0451`); eine 4-stellige bleibt unverändert.

**Anzeige-Zuordnung (Lagerspalte aus „Bestandsanzeige im Artikelstamm"):**
| Anzeige | Quelle | 
|---|---|
| Bestand | Summe `menge` (Status Im Lager) |
| Gesperrt QS | Summe `qsMenge` |
| Gesperrt | Summe `sperrMenge` |
| Gesperrt gesamt | Summe `qsUndSperrMenge` |
| Verfügbar | Summe `freieMenge` |

## Out of Scope
- Bestandsführung auf Systemebene (Reserviert für Versand, Bedarf für Aufträge, Zu produzieren, Differenz System/Lager) — eigenes Spec nach Verkauf/Produktion (PROJ-6, PROJ-7, PROJ-8)
- Maske „Lagerabgleich" (Systembestand mit Lagerbestand überschreiben) — folgt mit der Systemebene
- Automatische Versandbuchung und Meldungen zu neu produzierten LHM (Datenbankschnittstelle, Delta-Meldungen) — eigenes Feature; hier nur manuelle Versandbuchung
- Losnummer, MHD, Lagerbereich/Lagerort — Dateifelder kommen später (voraussichtlich im XML), Ergänzung per `/refine PROJ-5`
- Einheitenprüfung (Einheit je Artikel, Fehler bei Abweichung) und Pflichtfeld „Einheit" im Artikelstamm — später per `/refine PROJ-3` / `/refine PROJ-5`
- Umrechnung zwischen Einheiten (Karton ↔ Stück)
- Artikel-Export vom Artikelstamm zum Lagersystem — neues Roadmap-Feature (PROJ-13)
- Teilabzüge je Logistikzentrum (ein Import ist immer ein Vollabzug des gesamten Mandanten)
- Automatischer Import per Zeitplan/Schnittstelle

## Acceptance Criteria

**Format:** Angenommen [Vorbedingung] / Wenn [Aktion] / Dann [Ergebnis]

### Import
- [ ] Angenommen ein Nutzer mit Schreibrecht auf „Lagerbestand", wenn er im Reiter „Import" eine gültige CSV-Datei auswählt, dann wird zunächst eine Vorschau mit Anzahl neuer, geänderter, unveränderter, fehlender und wieder aufgetauchter Positionen sowie übersprungener Zeilen und Fehler angezeigt und noch nichts gespeichert
- [ ] Angenommen die Vorschau wird angezeigt, wenn der Nutzer die Übernahme bestätigt, dann wird der Bestand des Mandanten dem Vollabzug angepasst und ein Import-Protokoll gespeichert
- [ ] Angenommen die Vorschau wird angezeigt, wenn der Nutzer abbricht, dann ändert sich am Bestand nichts
- [ ] Angenommen die Datei enthält kein `BestandEnde` oder die Zahl der `BestandDaten`-Zeilen weicht von `anzahlDatensaetze` ab, wenn der Nutzer sie hochlädt, dann wird die gesamte Datei abgelehnt mit verständlicher Fehlermeldung
- [ ] Angenommen die Datei ist keine lesbare CSV bzw. die XML-Spalte lässt sich nicht lesen, wenn der Nutzer sie hochlädt, dann wird die Datei abgelehnt und der Bestand bleibt unverändert
- [ ] Angenommen eine `BestandDaten`-Zeile hat nicht den Status `done`, wenn die Datei verarbeitet wird, dann wird die Zeile nicht als Position übernommen
- [ ] Angenommen dieselbe Datei wurde schon importiert, wenn sie erneut importiert wird, dann zeigt die Vorschau keine Änderungen und der Bestand bleibt gleich
- [ ] Angenommen ein Import läuft für den Mandanten bereits, wenn ein zweiter gestartet wird, dann wird er abgelehnt mit Hinweis, dass bereits ein Import läuft
- [ ] Angenommen ein Nutzer hat nur Leserecht, wenn er die Maske öffnet, dann wird ihm kein Import, keine Prüfung und keine Versandbuchung angeboten

### Artikelnummer und Artikelstamm
- [ ] Angenommen die Datei enthält `41100.451`, wenn sie importiert wird, dann wird die Position unter `41100.0451` geführt
- [ ] Angenommen die Datei enthält `41100.0451`, wenn sie importiert wird, dann bleibt die Nummer unverändert
- [ ] Angenommen die Artikelnummer entspricht nicht dem Muster „Ziffern.Kennziffer (3 oder 4 Stellen)", wenn die Datei importiert wird, dann wird die Zeile übersprungen und im Ergebnis als übersprungen mit Zeilennummer und Grund gezählt; die übrigen Zeilen werden verarbeitet
- [ ] Angenommen die Artikelnummer existiert nicht im Artikelstamm, wenn die Datei importiert wird, dann wird die Position trotzdem geführt und mit „Artikel nicht im Stamm" gekennzeichnet
- [ ] Angenommen es gibt Positionen mit „Artikel nicht im Stamm", wenn der Artikel später im Artikelstamm mit derselben Nummer angelegt wird, dann gehört der Bestand sofort zu diesem Artikel und der Hinweis verschwindet
- [ ] Angenommen der Import ist abgeschlossen, wenn Zeilen zu unbekannten Artikeln enthalten waren, dann zeigt das Ergebnis die Anzahl und die Liste der betroffenen Artikelnummern

### Doppelte SSCC / Mischpalette
- [ ] Angenommen dieselbe SSCC kommt mit verschiedenen Artikeln mehrfach vor, wenn die Datei importiert wird, dann werden alle Zeilen als Positionen übernommen und das LHM als „Mischpalette" gekennzeichnet
- [ ] Angenommen dieselbe SSCC kommt mit demselben Artikel mehrfach vor, wenn die Datei importiert wird, dann werden alle diese Zeilen übersprungen und eine Fehlermeldung nennt die betroffene SSCC und den Artikel; die übrigen Zeilen werden verarbeitet
- [ ] Angenommen eine Position existierte bereits und kommt in der Datei doppelt vor (Fehler), wenn der Import übernommen wird, dann bleibt sie unverändert und wird nicht als „Fehlt" markiert
- [ ] Angenommen die SSCC besteht nicht nur aus Ziffern, wenn die Datei importiert wird, dann wird die Zeile übersprungen und gezählt
- [ ] Angenommen das Importergebnis enthält Fehler und übersprungene Zeilen, wenn es angezeigt wird, dann sind beide getrennt aufgeführt (Fehler mit SSCC, übersprungene Zeilen als Anzahl mit Grund)

### Lebenszyklus
- [ ] Angenommen eine Position hat den Status „Im Lager" und fehlt im neuen Vollabzug, wenn der Import übernommen wird, dann erhält sie den Status „Fehlt, ungeprüft", zählt nicht mehr zum Lagerbestand und erscheint in der Prüfliste
- [ ] Angenommen eine Position ist „Fehlt, ungeprüft" oder „Fehlt, geprüft i.O.", wenn sie im nächsten Vollabzug wieder vorkommt, dann wird sie wieder „Im Lager" und die Fehlt-Markierung entfällt
- [ ] Angenommen eine Position ist „Fehlt, ungeprüft", wenn ein Nutzer mit Schreibrecht sie als „geprüft i.O." mit Bemerkung bestätigt, dann wird Status, Prüfer und Zeitpunkt gespeichert und sie verschwindet aus der Prüfliste
- [ ] Angenommen ein Nutzer bestätigt eine Prüfung ohne Bemerkung, wenn er speichert, dann ist die Bemerkung optional und die Prüfung wird gespeichert
- [ ] Angenommen eine Position ist „Fehlt, ungeprüft", wenn ein Nutzer sie manuell als versendet bucht, dann erhält sie den Status „Versendet" mit Zeitpunkt und Nutzer und die Fehlt-Markierung entfällt
- [ ] Angenommen eine Position hat den Status „Versendet", wenn sie später im Vollabzug nicht mehr vorkommt, dann bleibt sie „Versendet" und wird nicht als fehlend markiert
- [ ] Angenommen eine Position hat den Status „Versendet", wenn sie im Vollabzug wieder vorkommt, dann wird die Zeile übersprungen, die Position bleibt „Versendet" und eine Fehlermeldung nennt die betroffene SSCC (und den Artikel); die übrigen Zeilen werden verarbeitet
- [ ] Angenommen die letzte Änderung einer Position liegt mehr als 5 Jahre zurück, wenn die Bereinigung läuft, dann wird sie entfernt; Positionen mit jüngerer letzter Änderung bleiben
- [ ] Angenommen eine Position wurde importiert, wenn ein Nutzer sie öffnet, dann sieht er ihre Daten, Status, Prüf- und Versandinformationen sowie die Importe, in denen sie vorkam

### Anzeige
- [ ] Angenommen es gibt Positionen im Status „Im Lager", wenn der Nutzer den Reiter „Bestand je Artikel" öffnet, dann sieht er je Artikel Bestand, Gesperrt QS, Gesperrt, Gesperrt gesamt und Verfügbar als Summe über „Im Lager"-Positionen
- [ ] Angenommen Positionen mit Status Fehlt oder Versendet, wenn die Summen berechnet werden, dann gehen sie nicht ein
- [ ] Angenommen der Nutzer filtert nach „Artikel nicht im Stamm", wenn er den Filter setzt, dann sieht er nur diese Artikel
- [ ] Angenommen der Nutzer öffnet die LHM-Liste, wenn er nach Status, SSCC, Artikelnummer oder Mischpalette filtert bzw. sucht, dann zeigt die Liste serverseitig gefiltert und seitenweise passende Treffer
- [ ] Angenommen ein Artikel im Artikelstamm hat Bestand, wenn der Nutzer den Reiter „Bestand" der Artikelmaske öffnet, dann sieht er die fünf Lagerwerte schreibgeschützt
- [ ] Angenommen es existiert noch kein Bestand, wenn der Nutzer die Maske öffnet, dann erscheint ein Leerzustand mit Hinweis auf den Import
- [ ] Angenommen ein Nutzer ohne Leserecht auf „Lagerbestand", wenn er die Maske aufruft, dann wird der Zugriff verweigert

### Mandanten
- [ ] Angenommen es gibt mehrere Mandanten, wenn ein Nutzer Bestand importiert oder ansieht, dann betrifft das ausschließlich Daten seines Mandanten; dieselbe SSCC darf in verschiedenen Mandanten vorkommen

## Edge Cases
- Datei ist leer oder enthält nur `BestandStart`/`BestandEnde` (0 Datensätze) → würde den gesamten Bestand als fehlend markieren; die Vorschau warnt deutlich vor der Übernahme
- Sehr große Datei (Referenz: ca. 3.200 Positionen, später mehr) → Import bleibt bedienbar; Fortschritt/Wartezustand sichtbar
- Eine Mischpalette: eine Position fehlt im neuen Abzug, die SSCC ist mit anderem Artikel noch da → nur die fehlende Position wird „Fehlt, ungeprüft"
- Mengenfelder sind leer, negativ oder nicht numerisch → Zeile wird übersprungen und gezählt
- Dezimalformat (`48.0`) → wird als Zahl gelesen
- Zeichensatz/Umlaute in der CSV → werden korrekt gelesen
- Nutzer schließt den Browser während der Vorschau → nichts ist gespeichert
- Zwei Nutzer prüfen oder buchen dieselbe Position gleichzeitig → zweite Aktion bekommt Hinweis, dass sich der Status geändert hat
- Netzwerkfehler beim Bestätigen → Fehlermeldung, Import wird entweder vollständig oder gar nicht übernommen
- Artikel wird im Stamm deaktiviert → Bestand bleibt sichtbar

## Technical Requirements
- Sicherheit: Authentifizierung und Rechte pro Maske (PROJ-2); strikte Mandantentrennung; Dateiinhalt wird serverseitig geprüft
- Performance: Vorschau und Übernahme bei ca. 5.000 Positionen in wenigen Sekunden; Listen serverseitig gefiltert und paginiert
- Agentenfähigkeit: Import, Prüfung, Versandbuchung und Bestandsabfrage als klar getrennte, API-fähige Aktionen (gleiche Logik für Oberfläche, spätere Schnittstelle und Agenten)
- Übernahme eines Imports ist atomar (vollständig oder gar nicht)

## Open Questions
- [x] ~~Beginn der 5-Jahres-Frist?~~ → 2026-10-11: ab der letzten Änderung des Datensatzes
- [x] ~~Soll ein als „Versendet" gebuchtes LHM, das im Vollabzug wieder auftaucht, auf „Im Lager" zurückgesetzt werden?~~ → 2026-10-11: Nein, Fehlermeldung mit SSCC; Status bleibt „Versendet"
- [ ] Einheitenprüfung und Pflichtfeld „Einheit" im Artikelstamm (später, `/refine PROJ-3`); bis dahin ist die Einheit nur gespeichert
- [ ] Losnummer, MHD, Lagerbereich/Lagerort: Dateiformat und Verwendung, sobald die Felder im XML geliefert werden (`/refine PROJ-5`)
- [ ] Bedeutung von `rlzMenge` (derzeit ignoriert)
- [ ] Zeitplaner für die 5-Jahres-Bereinigung im Self-hosted-Supabase (pg_cron oder externer Aufruf) — in `/backend` klären

## Decision Log

### Product Decisions
| Decision | Rationale | Date |
|----------|-----------|------|
| PROJ-5 umfasst nur die Lagerebene; Systemebene und Lagerabgleich sind eigene Specs | Systemwerte brauchen Einkauf/Verkauf/Produktion; Single Responsibility | 2026-10-11 |
| Import ist immer ein Vollabzug des gesamten Mandanten | Nutzervorgabe; Lagerbestand soll exakt dem Lagersystem entsprechen | 2026-10-11 |
| Logistikzentrum ist nur Infofeld, nicht Lagerort; Lagerort kommt später in die Datei | Nutzervorgabe | 2026-10-11 |
| LHM werden nie gelöscht, 5 Jahre aufbewahrt; fehlende LHM werden markiert statt entfernt | Nachvollziehbarkeit; Versandbuchung kann verspätet eintreffen | 2026-10-11 |
| Status: Im Lager / Fehlt, ungeprüft / Fehlt, geprüft i.O. / Versendet; fehlende LHM müssen aktiv geprüft werden | Nutzervorgabe | 2026-10-11 |
| Bereits versendetes LHM im Vollabzug = Fehler mit SSCC-Meldung, kein automatisches Zurücksetzen auf „Im Lager" | Nutzerentscheidung; Widerspruch zwischen Versandbuchung und Lagerdaten soll im Lagersystem geklärt werden | 2026-10-11 |
| Aufbewahrungsfrist von 5 Jahren beginnt mit der letzten Änderung des Datensatzes | Nutzerentscheidung | 2026-10-11 |
| Manuelle Versandbuchung als Übergangslösung | Ablauf vor Anbindung der Schnittstelle testbar | 2026-10-11 |
| Import mit Vorschau und Plausibilitätsprüfung (BestandEnde, anzahlDatensaetze) | Schutz vor unvollständigen Dateien, die den ganzen Bestand als fehlend markieren würden | 2026-10-11 |
| CSV-Format des Lagersystems wird unverändert akzeptiert (XML in Spalte „Daten") | Kein Umbau durch Nutzer; später 1:1 zur Datenbankschnittstelle | 2026-10-11 |
| Fehlerhafte Zeilen werden übersprungen und gezählt, nicht die ganze Datei abgelehnt | Nutzerentscheidung | 2026-10-11 |
| Unbekannte Artikelnummern werden trotzdem geführt, später automatisch mit dem Stamm verknüpft | Nutzervorgabe | 2026-10-11 |
| 3-stellige Kennziffer wird mit führender 0 auf 4 Stellen ergänzt | Alte Artikelnummernlogik in der Übergangszeit | 2026-10-11 |
| Schlüssel ist SSCC + Artikel; gleiche SSCC mit verschiedenen Artikeln = Mischpalette (markiert); gleiche SSCC + gleicher Artikel = Fehler mit SSCC-Meldung, Rest läuft durch | Mischpaletten existieren; echte Duplikate sind Datenfehler im Lagersystem | 2026-10-11 |
| Einheit wird in PROJ-5 nur gespeichert, nicht geprüft; Einheitenprüfung später mit Pflichtfeld im Artikelstamm | Schneller Start (Nutzerentscheidung) | 2026-10-11 |
| Artikel-Export zum Lagersystem als eigenes späteres Feature | Nutzervorgabe: nur gültige Daten sollen aus dem Lager zurückkommen | 2026-10-11 |
| Rechte-Vorschlag: Admin alles; Lager Import/Prüfung/Versandbuchung; Einkauf/Verkauf/Produktion lesend | Konsistent mit Standard-Rechten aus PROJ-3, über PROJ-2 änderbar | 2026-10-11 |

### Technical Decisions
<!-- Added by /architecture -->
| Decision | Rationale | Date |
|----------|-----------|------|
| Bestand in eigenen Tabellen, nicht im Artikelstamm | Bestand ändert sich ständig; später zweite Quelle (Datenbankschnittstelle) füllt dieselbe Tabelle | 2026-10-11 |
| Zuordnung zum Artikel über die Artikelnummer statt gespeichertem Verweis | Unbekannte Artikel werden später automatisch zugeordnet, keine Nachpflege | 2026-10-11 |
| Mischpalette und Bestandssummen werden abgeleitet, nicht gespeichert | Kein Auseinanderlaufen von Daten; eine Quelle | 2026-10-11 |
| Vorschau ohne Zwischenspeicher; Datei wird bei Übernahme erneut gesendet und serverseitig neu berechnet | Kein Datenmüll bei Abbruch, „nichts gespeichert bis Bestätigung" garantiert; Dateigröße unkritisch | 2026-10-11 |
| Übernahme als eine Datenbank-Transaktion mit Import-Sperre pro Mandant | Atomar (ganz oder gar nicht), kein paralleler Import | 2026-10-11 |
| Prüfung/Versandbuchung ohne Bearbeitungssperre, stattdessen Statusprüfung beim Speichern | Kurze Aktion ohne Formular; Konflikte werden per Hinweis gelöst | 2026-10-11 |
| Mengen als exakte Dezimalzahlen | Keine Rundungsfehler bei Summen | 2026-10-11 |
| 5-Jahres-Bereinigung als täglich laufende Datenbank-Aufgabe | Unabhängig von Nutzeraktionen; Zeitplaner im Self-hosted-Setup in `/backend` klären | 2026-10-11 |
| Neue Pakete: CSV-Leser (papaparse) und XML-Leser (fast-xml-parser) | Zuverlässiges Lesen von Semikolon-CSV mit Umlauten und XML in Spalte | 2026-10-11 |
| Eine Maske „Lagerbestand" mit 4 Reitern (Bestand je Artikel, LHM-Liste, Prüfliste, Import) | Eine Rechte-Einheit, passt zur Spec (Maske „Lagerbestand") | 2026-10-11 |

---

## Tech Design (Solution Architect)

### A) Komponentenstruktur

```
Sidebar → Warenwirtschaft
└── NEU: Lagerbestand (eine Maske "Lagerbestand", sichtbar bei Leserecht)

Lagerbestand – Seite mit 4 Reitern
├── Kopfbereich: Titel + Hinweis "Letzter Import: <Datum, Nutzer>"
├── Leerzustand (wenn noch kein Bestand): Hinweis + Link zum Reiter "Import"
│
├── Reiter "Bestand je Artikel"
│   ├── Suche (Artikelnummer / Bezeichnung) + Filter "Artikel nicht im Stamm"
│   ├── Tabelle: Artikelnummer, Bezeichnung, Bestand, Gesperrt QS, Gesperrt,
│   │            Gesperrt gesamt, Verfügbar  (Badge "Nicht im Stamm")
│   └── Seitenwechsel
│
├── Reiter "LHM-Liste"
│   ├── Suche (SSCC / Artikelnummer) + Filter (Status, Mischpalette)
│   ├── Tabelle: SSCC, Artikelnummer, Menge, Status-Badge, Mischpalette-Badge,
│   │            zuletzt im Abzug gesehen
│   ├── Seitenwechsel
│   └── LHM-Detail (Seitenpanel)
│       ├── Daten (alle Mengen, Einheit, Logistikzentrum, Bestandslagergruppe)
│       ├── Status, Prüfinfo (Prüfer, Zeit, Bemerkung), Versandinfo
│       ├── Verlauf: Importe, in denen die Position vorkam
│       └── Aktionen (nur Schreibrecht, nur bei "Fehlt"): Geprüft i.O. | Als versendet buchen
│
├── Reiter "Prüfliste" (fehlende, ungeprüfte LHM; Anzahl als Zähler am Reiter)
│   ├── Tabelle der Positionen "Fehlt, ungeprüft"
│   └── Aktionen je Zeile (nur Schreibrecht):
│       ├── Dialog "Geprüft i.O." (Bemerkung optional)
│       └── Bestätigung "Als versendet buchen"
│
└── Reiter "Import" (Aktionen nur mit Schreibrecht)
    ├── Schritt 1: Datei wählen (CSV) + Wartezustand/Fortschritt
    ├── Schritt 2: Vorschau
    │   ├── Zahlenübersicht: neu / geändert / unverändert / fehlend / wieder aufgetaucht
    │   ├── Warnung bei 0 Datensätzen ("würde gesamten Bestand als fehlend markieren")
    │   ├── Fehler (mit SSCC + Artikel) und übersprungene Zeilen (Anzahl + Grund) – getrennt
    │   ├── Liste unbekannter Artikelnummern
    │   └── Buttons: Übernehmen | Abbrechen
    ├── Schritt 3: Ergebnis (gleiche Zahlen wie Vorschau, nun gespeichert)
    └── Import-Protokoll: Liste früherer Importe (Datei, Nutzer, Zeit, Zahlen)

Artikelmaske (bestehend, PROJ-3) – Erweiterung
└── NEU: Reiter "Bestand" (schreibgeschützt: Bestand, Gesperrt QS, Gesperrt,
         Gesperrt gesamt, Verfügbar) – nur sichtbar mit Leserecht auf "Lagerbestand"
```

Wiederverwendet (nichts Neues bauen): Tabelle, Seitenwechsel, Reiter, Seitenpanel (Sheet), Dialoge, Status-Badge, Leer-/Fehlerzustände, Alert, Fortschrittsbalken. Neu zu bauen sind nur die fachlichen Bausteine (Import-Assistent, LHM-Detail, Prüf-Dialog).

### B) Datenmodell (in einfacher Sprache)

**LHM-Position** (gehört zu genau einem Mandanten; pro Mandant eindeutig durch SSCC + Artikelnummer, von der Datenbank erzwungen):
- SSCC, umgewandelte Artikelnummer (als Text, 4-stellige Kennziffer)
- Mengen: Menge, Freie Menge, Menge QS, Sperrmenge, QS und Sperre gesamt; Einheit (nur Text)
- Logistikzentrum, Bestandslagergruppe (reine Infofelder)
- Status (Im Lager / Fehlt ungeprüft / Fehlt geprüft i.O. / Versendet)
- Prüfung: Prüfer, Zeitpunkt, Bemerkung; Versandbuchung: Zeitpunkt, Nutzer
- Erstmals gesehen, zuletzt im Abzug gesehen, letzte Änderung (Basis der 5-Jahres-Frist), letzter Import
- **Kein gespeicherter Verweis auf den Artikelstamm.** Die Zuordnung entsteht beim Anzeigen über die Artikelnummer. So gehört der Bestand sofort zum Artikel, sobald er im Stamm angelegt wird, und „Artikel nicht im Stamm" verschwindet von selbst – ohne Nachpflege-Job.
- „Mischpalette" wird **nicht gespeichert**, sondern bei der Anzeige abgeleitet (SSCC hat mehrere Positionen).

**Import-Protokoll** (pro Mandant): Dateiname, Nutzer, Zeitpunkt, Zahlen (neu / geändert / unverändert / fehlend / wieder aufgetaucht), übersprungene Zeilen mit Grund, Fehler mit SSCC/Artikel, Liste unbekannter Artikelnummern.

**Import-Verlauf je Position:** Welche Position in welchem Import vorkam – speist den Verlauf im LHM-Detail. Wird mit der Position nach 5 Jahren mitbereinigt.

**Bestand je Artikel:** wird nicht gespeichert, sondern bei jeder Anzeige als Summe über „Im Lager"-Positionen berechnet (Datenbank-Sicht). Dadurch kann nichts auseinanderlaufen.

**Neue Maske im Masken-Register:** „Lagerbestand" (Modul Warenwirtschaft). Zugriffsstufen (Lesen / Lesen + Bearbeiten) wie in PROJ-3. Vorschlag Standardrechte laut Decision Log.

**Speicherort:** Lokale, selbst gehostete PostgreSQL (Supabase); alle Tabellen tragen den Mandanten und sind per RLS getrennt.

### C) Ablauf des Imports (fachlich)

1. **Vorschau (Schritt 1+2):** Der Server liest die Datei, prüft sie (Plausibilität, Zeilen, Artikelnummern, Duplikate), vergleicht mit dem aktuellen Bestand und liefert nur die Zahlen/Listen zurück. **Es wird nichts gespeichert.**
2. **Übernahme (Schritt 3):** Die Datei wird erneut gesendet; der Server rechnet identisch nach und speichert alles in **einem einzigen, unteilbaren Vorgang** (ganz oder gar nicht). Währenddessen ist der Import für den Mandanten gesperrt – ein zweiter Import wird mit Hinweis abgelehnt.
3. **Regeln beim Vergleich:** Neue Positionen anlegen; geänderte Mengen aktualisieren; fehlende „Im Lager"-Positionen → „Fehlt, ungeprüft"; wieder auftauchende „Fehlt"-Positionen → „Im Lager"; „Versendet" bleibt unangetastet (taucht sie wieder auf → Fehler mit SSCC); Positionen, die als Duplikat fehlerhaft sind, bleiben unverändert und werden nicht als fehlend markiert.

### D) Technische Entscheidungen (für PM verständlich)

1. **Lagerbestand als eigene Tabellen, nicht im Artikelstamm** — Der Artikelstamm bleibt Stammdaten; Bestand ändert sich ständig und kommt später aus einer anderen Quelle (Datenbankschnittstelle). Beide Wege füllen dieselbe Tabelle.
2. **Keine feste Verknüpfung zum Artikel, sondern Zuordnung über die Artikelnummer** — Erfüllt „Bestand unbekannter Artikel sichtbar, später automatisch zugeordnet" ohne Sonderlogik. Kosten: die Artikelnummer muss im Stamm pro Mandant eindeutig sein (ist sie bereits).
3. **Dateiprüfung und Vergleich auf dem Server** — Der Browser wird nicht vertraut (Sicherheit); dieselbe Logik dient später der Schnittstelle und Agenten. Die Rohdatei wird nicht dauerhaft gespeichert, nur das Protokoll.
4. **Vorschau ohne Zwischenspeicher: Datei wird bei Übernahme erneut gesendet** — Einfacher und robuster als eine Zwischentabelle (kein Aufräumen, kein Datenmüll bei Browser-Abbruch). Bei ca. 3.200–5.000 Positionen (wenige MB) ist das unkritisch. Garantiert zugleich, dass „nichts gespeichert wird", bis bestätigt ist.
5. **Übernahme als eine Datenbank-Transaktion** — Sichert „ganz oder gar nicht" auch bei Netzwerkfehlern und lässt sich in einer Datenbankfunktion mit gutem Tempo (Mengenoperation statt Zeile für Zeile) ausführen.
6. **Import-Sperre pro Mandant in der Datenbank** — Verhindert zwei gleichzeitige Importe, auch bei zwei Servern/Tabs; die Sperre endet automatisch mit dem Vorgang.
7. **Gleichzeitige Prüfung/Buchung durch zwei Nutzer: Statusprüfung beim Speichern** — Die Aktion gelingt nur, wenn die Position noch im erwarteten Status ist; sonst Hinweis „Status hat sich geändert". Keine Bearbeitungssperre nötig (Aktion ist kurz, kein Formular).
8. **Bestandssummen als Datenbank-Sicht** — Immer aktuell, eine Quelle für Bestandsliste und Artikelreiter; serverseitig gefiltert und seitenweise geladen. Index auf Mandant + Artikelnummer und auf SSCC.
9. **5-Jahres-Bereinigung als täglich laufende Datenbank-Aufgabe** — Läuft unabhängig von Nutzeraktionen. *Hinweis:* Self-hosted Supabase braucht dafür einen Zeitplaner (z.B. pg_cron); falls nicht vorhanden, reicht ein einfacher externer Aufruf. Wird im `/backend`-Schritt geklärt.
10. **Rechte pro Maske serverseitig + RLS** — Gleiches Muster wie PROJ-2/3: Lesen für Ansicht, „Lesen + Bearbeiten" für Import, Prüfung, Versandbuchung. Der Reiter „Bestand" in der Artikelmaske richtet sich nach dem Recht auf „Lagerbestand".
11. **Getrennte, API-fähige Aktionen** — Vorschau, Übernahme, Prüfen, Versand buchen, Bestandsabfrage sind jeweils eigene Endpunkte unter dem Mandanten (gleiches Muster wie Artikel/Adressen). Die spätere Schnittstelle ruft dieselbe Fachlogik auf.
12. **Beträge als exakte Dezimalzahlen** — Mengen wie `48.0` werden ohne Rundungsfehler gespeichert und summiert.

### E) Abhängigkeiten (Pakete)
- **CSV-Leser** (z.B. `papaparse`) — liest Semikolon-CSV mit Umlauten und Anführungszeichen zuverlässig.
- **XML-Leser** (z.B. `fast-xml-parser`) — liest die Nutzdaten in der Spalte „Daten".
- Sonst keine; Zod und shadcn/ui sind vorhanden.

### F) Auswirkungen auf bestehende Teile
- **PROJ-3 (Artikelmaske):** neuer Reiter „Bestand" (schreibgeschützt).
- **PROJ-2:** neue Maske „Lagerbestand" im Masken-Register; Standardrechte für Lager/Einkauf/Verkauf/Produktion.
- **Sidebar:** neuer Eintrag in „Warenwirtschaft".
- **Keine Änderung** an bestehenden Artikeldaten.

### G) Umsetzungsreihenfolge
Empfohlen: `/frontend` (Reiter, Import-Assistent, LHM-Detail mit Beispieldaten) → `/backend` (Tabellen, Import-Logik, Rechte, Bereinigung) → `/qa`.

## QA Test Results
_To be added by /qa_

## Deployment
_To be added by /deploy_
