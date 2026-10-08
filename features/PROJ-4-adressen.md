# PROJ-4: Warenwirtschaft – Adressen

## Status: Planned
**Created:** 2026-10-08
**Last Updated:** 2026-10-08

## Dependencies
- Requires: PROJ-1 (Supabase-Infrastruktur) — Multi-Tenant-Grundschema
- Requires: PROJ-2 (Benutzerverwaltung & Rollen-/Rechtesystem) — Rechte pro Maske (Adressen, Kontakte, Länder) plus eigene Berechtigung zum Aktivieren/Deaktivieren
- Berührt: PROJ-3 (Artikelstamm) — Das Artikelfeld „Markeninhaber" verweist künftig auf eine Adresse mit Kürzel (siehe „Umstellung Markeninhaber")
- Grundlage für: PROJ-6 (Einkauf), PROJ-7 (Verkauf)

## User Stories
- Als Einkauf/Verkauf möchte ich Geschäftspartner (Kunden, Lieferanten, Spediteure, Dienstleister, Lieferadressen) in einem zentralen Adressstamm anlegen und pflegen, damit Daten nicht doppelt gepflegt werden und ein Partner mit mehreren Rollen nur einmal existiert.
- Als Verkauf möchte ich Adressen hierarchisch verknüpfen (Zentrale → Landesgesellschaft → Lieferadresse) und pro Adresse festlegen, wer Rechnungsempfänger ist, wohin die Rechnung versendet wird und welche Abrechnungsgesellschaft zuständig ist, damit die Kundenstrukturen aus der Praxis abgebildet sind.
- Als Einkauf/Verkauf möchte ich zu jeder Adresse Ansprechpartner hinterlegen und in einer Gesamtliste durchsuchen können, damit ich Kontakte schnell finde — auch die aus übergeordneten Adressen.
- Als Nutzer, der Artikel pflegt, möchte ich beim Artikel den Markeninhaber aus dem Adressstamm wählen und das Kürzel direkt an der Adresse pflegen, damit es keine zweite Pflegestelle für Markeninhaber gibt.
- Als Administrator möchte ich Adressen (samt untergeordneter Adressen und Kontakte) deaktivieren und reaktivieren können, und zwar über eine eigene Berechtigung, damit nur dafür vorgesehene Nutzer Stammdaten stilllegen.
- Als Lager/Produktionsplanung möchte ich Adressen und Kontakte einsehen können (Lesezugriff), damit ich Lieferadressen ohne Rückfragen finde.
- Als Nutzer, der eine Adresse bearbeitet, möchte ich vor gleichzeitigen Änderungen anderer geschützt sein.

## Datenfelder

**Stammdaten / Identifikation:**
- Adressnummer-Basis (**Pflicht**, nur Ziffern, variable Länge, max. 10 Stellen)
- Kennziffer (**Pflicht**, exakt 4 Ziffern)
- Adressnummer (automatisch zusammengesetzt: Basis + „." + Kennziffer, z.B. `4711.0001`; Eindeutigkeit pro Mandant wird geprüft; manuelle Eingabe der Bestandteile, kein automatisches Hochzählen)
- Vorschlag nächste freie Kennziffer: Gibt der Nutzer eine bereits existierende Basis ein, wird die nächste freie Kennziffer vorgeschlagen (änderbar)
- Name/Firma (**Pflicht**), Namenszusatz (optional)
- Kürzel (optional, max. 10 Zeichen; macht die Adresse zum möglichen Markeninhaber; Duplikate pro Mandant nur als Hinweis, nicht blockierend)
- GLN (optional, wenn gefüllt genau 13 Ziffern, keine Prüfziffernkontrolle)
- Rollen (Mehrfachauswahl, fest vorgegeben): Kunde, Lieferant, Spediteur, Dienstleister, Lieferadresse, Sonstige
- Status Aktiv/Inaktiv (Default: Aktiv, kein Löschen)

**Anschrift (alle optional):** Straße, Hausnummer, PLZ (Freitext, max. 10 Zeichen), Ort, Land (Auswahl aus Merkmal-Tabelle „Länder", mit Link zur Pflege-Maske)

**Allgemeine Erreichbarkeit (optional):** Telefon, E-Mail (Formatprüfung, wenn gefüllt), Webseite — allgemeine Angaben der Adresse, z.B. der Zentrale. Personenbezogene Angaben stehen bei den Kontakten.

**Steuer & Bemerkung (optional):** USt-IdNr. (Freitext mit Länderpräfix, max. 15 Zeichen, keine externe Prüfung), Bemerkung (Freitext)

**Verknüpfungen:**
- Übergeordnete Adresse (optional, **höchstens eine**; untergeordnete Adressen beliebig viele; beliebige Tiefe; kein Zyklus erlaubt)
- Untergeordnete Adressen (nur Anzeige, abgeleitet; Sprung zur jeweiligen Adresse)
- Rechnungsempfänger (optional, Verweis auf eine andere Adresse; leer = die Adresse selbst)
- Rechnungsversand an (optional, Verweis auf eine andere Adresse; leer = Rechnungsempfänger)
- Abrechnungsgesellschaft (optional, Verweis auf eine andere Adresse, über die Konditionen/Abrechnung laufen)

**Kontakte (zentrale Gesamttabelle, jeder Kontakt gehört zu genau einer Adresse):**
Anrede, Vorname (optional), Nachname (**Pflicht**), Funktion/Position, Telefon, Mobil, E-Mail (Formatprüfung, wenn gefüllt), Bemerkung, Aktiv/Inaktiv

**Merkmal-Tabelle Länder (neue Maske, wie die anderen Merkmal-Tabellen):**
Land (Name, Pflicht), Länderkürzel (**Pflicht, 2 bis 3 Buchstaben**, automatisch Großbuchstaben, pro Mandant eindeutig). Startet leer, nur deaktivierbar, nicht löschbar.

**Adressmaske (Layout):** Reiter in einem Formular mit einem Speichern; Kopfzeile (Adressnummer, Name, Rollen, Status, Aktionen) bleibt sichtbar; Reiter mit Validierungsfehlern werden markiert:
1. Stammdaten (Basis, Kennziffer, Name, Namenszusatz, Kürzel, GLN, Rollen)
2. Anschrift & Erreichbarkeit (Straße, Hausnummer, PLZ, Ort, Land, Telefon, E-Mail, Webseite)
3. Kontakt (eigene Kontakte + Kontakte aller übergeordneten Adressen)
4. Verknüpfungen (Übergeordnete Adresse, untergeordnete Adressen, Rechnungsempfänger, Rechnungsversand an, Abrechnungsgesellschaft)
5. Steuer & Bemerkung

**Adressliste:** Spalten Adressnummer, Name, Ort, Land (Kürzel), Rollen (Badges), Übergeordnete Adresse, Status. Suche über Adressnummer, Name, Namenszusatz, Kürzel, GLN, Ort, PLZ (serverseitig, mit Pagination). Filter: Rolle, Status (Standard: nur Aktive), Land. Sortierung Standard: Adressnummer.

### Umstellung Markeninhaber (Änderung gegenüber PROJ-3)
- Das Artikelfeld „Markeninhaber" wählt eine **aktive Adresse mit gepflegtem Kürzel** und verlinkt auf die Adressmaske.
- Der Matchcode des Artikels nutzt das Kürzel der Adresse; bei Änderung des Kürzels werden die Matchcodes betroffener Artikel automatisch neu berechnet.
- Die Merkmal-Tabelle „Markeninhaber" (inkl. Maske und Rechten) entfällt; aus 10 werden 9 Merkmal-Tabellen (plus neue Tabelle Länder, siehe oben, außerhalb der Artikel-Merkmale).
- Vorhandene Testdaten dürfen bereinigt werden; die Markeninhaber-Zuordnungen an Artikeln werden geleert, keine aufwendige Migration.

## Out of Scope
- Preise, Konditionen, Preisaufschläge, Rückvergütungen, Boni, Abrechnungskonditionen und die eigentliche Rechnungs-/Abrechnungslogik (Zentralrechnungen, KW-Abrechnungen) — PROJ-7 (Verkauf) bzw. eigene spätere Konditionen-Spec
- Zahlungsbedingungen, Bankverbindungen — PROJ-6 / PROJ-7
- Mehrere Anschriften pro Adresse (Lieferadressen werden als eigene Adressen unter dem Kunden abgebildet)
- Ein Kontakt für mehrere Adressen (Kontakt gehört genau einer Adresse)
- Baumansicht der gesamten Hierarchie (im MVP nur übergeordnete Adresse und Liste der untergeordneten in der Maske)
- Prüfung der USt-IdNr. gegen externe Dienste, GLN-Prüfziffernkontrolle
- Automatische Vorbefüllung der Länder-Tabelle
- Hard-Delete von Adressen und Kontakten (nur Deaktivieren)
- Mandantenübergreifende Adressen
- Eigene, vom Mandanten pflegbare Rollenliste (Rollen sind fest)

## Acceptance Criteria

**Format:** Angenommen [Vorbedingung] / Wenn [Aktion] / Dann [Ergebnis]

**Anlegen, Nummer, Validierung**
- [ ] Angenommen ein Nutzer mit Schreibrecht auf Adressen ist eingeloggt, wenn er eine Adresse mit Name, gültiger Basis (nur Ziffern, max. 10) und 4-stelliger Kennziffer anlegt, dann wird sie gespeichert und die Adressnummer automatisch als „Basis.Kennziffer" (z.B. 4711.0001) zusammengesetzt
- [ ] Angenommen eine Adressnummer-Basis enthält Buchstaben, ist leer oder länger als 10 Stellen, wenn der Nutzer speichern möchte, dann wird eine Validierungsfehlermeldung angezeigt und nicht gespeichert
- [ ] Angenommen die Kennziffer ist nicht genau 4-stellig oder enthält Nicht-Ziffern, wenn der Nutzer speichert, dann wird eine Validierungsfehlermeldung angezeigt und nicht gespeichert
- [ ] Angenommen der Name ist leer, wenn der Nutzer speichert, dann wird eine Validierungsfehlermeldung angezeigt und nicht gespeichert
- [ ] Angenommen eine Adressnummer existiert bereits im Mandanten, wenn der Nutzer dieselbe Kombination erneut speichern möchte, dann wird das Speichern abgelehnt mit der Fehlermeldung „Adressnummer bereits vergeben"
- [ ] Angenommen der Nutzer gibt eine Basis ein, die bereits existiert, wenn die Kennziffer noch leer ist, dann wird die nächste freie Kennziffer vorgeschlagen und kann geändert werden
- [ ] Angenommen eine GLN ist gefüllt, aber nicht genau 13 Ziffern lang, wenn der Nutzer speichert, dann wird eine Validierungsfehlermeldung angezeigt
- [ ] Angenommen eine E-Mail-Adresse (an der Adresse oder an einem Kontakt) hat ein ungültiges Format, wenn der Nutzer speichert, dann wird eine Validierungsfehlermeldung angezeigt
- [ ] Angenommen ein Nutzer trägt an einer Adresse (z.B. der Zentrale) Telefon, E-Mail und Webseite ein, wenn er speichert, dann werden die allgemeinen Erreichbarkeitsdaten gespeichert und im Reiter „Anschrift & Erreichbarkeit" angezeigt
- [ ] Angenommen ein Nutzer wählt mehrere Rollen (z.B. Kunde und Lieferadresse), wenn er speichert, dann trägt die Adresse alle gewählten Rollen
- [ ] Angenommen ein Nutzer öffnet die Adressmaske, wenn sie geladen ist, dann sieht er die fünf Reiter nebeneinander, die Kopfzeile bleibt sichtbar und ein Reiter mit Validierungsfehler ist markiert

**Kürzel**
- [ ] Angenommen ein Nutzer vergibt ein Kürzel, das im Mandanten bereits von einer anderen Adresse verwendet wird, wenn er das Feld verlässt oder speichert, dann erscheint ein Hinweis mit Nennung der Adresse, die das Kürzel bereits nutzt, aber das Speichern wird nicht blockiert
- [ ] Angenommen eine Adresse hat ein Kürzel und ist aktiv, wenn ein Nutzer am Artikel den Markeninhaber wählt, dann steht diese Adresse zur Auswahl; Adressen ohne Kürzel oder inaktive Adressen erscheinen nicht
- [ ] Angenommen es existiert keine aktive Adresse mit Kürzel, wenn ein Nutzer am Artikel das Feld Markeninhaber öffnet, dann erscheint der Hinweis „Noch keine Adresse mit Kürzel – hier anlegen" mit Link zur Adressmaske
- [ ] Angenommen ein Artikel hat eine Adresse als Markeninhaber, wenn das Kürzel der Adresse geändert wird, dann wird der Matchcode des Artikels automatisch neu berechnet
- [ ] Angenommen der Matchcode wird berechnet, wenn der Artikel einen Markeninhaber hat, dann wird das Kürzel der Adresse verwendet, bei fehlendem Markeninhaber wird der Teil übersprungen

**Land (Merkmal-Tabelle)**
- [ ] Angenommen ein Nutzer mit Schreibrecht auf Länder legt ein Land mit Name und Länderkürzel „VAE" oder „AE" an, wenn er speichert, dann wird es gespeichert (Kürzel 2 bis 3 Buchstaben, automatisch Großbuchstaben)
- [ ] Angenommen das Länderkürzel hat weniger als 2, mehr als 3 Zeichen oder enthält Ziffern, wenn der Nutzer speichert, dann wird eine Validierungsfehlermeldung angezeigt
- [ ] Angenommen ein Länderkürzel existiert bereits im Mandanten, wenn ein Nutzer es erneut anlegt, dann wird das Speichern abgelehnt
- [ ] Angenommen die Länder-Tabelle ist leer, wenn ein Nutzer das Feld „Land" an der Adresse öffnet, dann erscheint der Hinweis „Noch keine Einträge – hier anlegen" mit Link zur Pflege-Maske
- [ ] Angenommen ein Nutzer klickt in der Adressmaske auf die Bezeichnung „Land", wenn der Klick erfolgt, dann gelangt er zur Pflege-Maske der Länder

**Hierarchie und Verknüpfungen**
- [ ] Angenommen ein Nutzer wählt eine übergeordnete Adresse, wenn er speichert, dann hat die Adresse genau eine übergeordnete Adresse und erscheint in der Liste der untergeordneten Adressen der Zentrale
- [ ] Angenommen eine Adresse hat mehrere untergeordnete Adressen (z.B. mehrere Lieferadressen eines Kunden), wenn der Nutzer den Reiter „Verknüpfungen" öffnet, dann werden alle untergeordneten Adressen gelistet und sind per Klick erreichbar
- [ ] Angenommen ein Nutzer wählt als übergeordnete Adresse die Adresse selbst oder eine ihrer direkt oder indirekt untergeordneten Adressen, wenn er speichert, dann wird das Speichern abgelehnt (Zyklus nicht erlaubt)
- [ ] Angenommen ein Nutzer wählt Rechnungsempfänger, Rechnungsversand an und Abrechnungsgesellschaft, wenn er speichert, dann werden die Verweise gespeichert; leere Verweise gelten als „die Adresse selbst" (Rechnungsempfänger) bzw. „der Rechnungsempfänger" (Rechnungsversand)
- [ ] Angenommen eine Adresse ist inaktiv, wenn ein Nutzer eine Verknüpfung (übergeordnete Adresse, Rechnungsempfänger, Rechnungsversand, Abrechnungsgesellschaft) neu wählen möchte, dann erscheint die inaktive Adresse nicht in der Auswahl; ein bereits bestehender Verweis bleibt sichtbar und ist als „inaktiv" gekennzeichnet

**Kontakte**
- [ ] Angenommen ein Nutzer mit Schreibrecht auf Kontakte öffnet im Reiter „Kontakt" einer Adresse den Dialog „Kontakt anlegen", wenn er Nachname eingibt und speichert, dann wird der Kontakt der Adresse zugeordnet (Adresse vorbelegt)
- [ ] Angenommen der Nachname eines Kontakts ist leer, wenn der Nutzer speichert, dann wird eine Validierungsfehlermeldung angezeigt
- [ ] Angenommen eine Adresse hat übergeordnete Adressen mit Kontakten, wenn der Nutzer den Reiter „Kontakt" öffnet, dann sieht er die eigenen Kontakte und zusätzlich die Kontakte aller übergeordneten Adressen mit einer Spalte, die die zugehörige Adresse/Hierarchieebene zeigt
- [ ] Angenommen ein Kontakt stammt aus einer übergeordneten Adresse, wenn der Nutzer ihn im Reiter „Kontakt" betrachtet, dann ist er nur lesbar und wird an seiner eigenen Adresse bearbeitet; Kontakte untergeordneter Adressen werden nicht angezeigt
- [ ] Angenommen ein Nutzer öffnet die Gesamtliste der Kontakte, wenn er sucht, dann findet er Kontakte adressübergreifend und sieht die zugehörige Adresse je Zeile
- [ ] Angenommen ein Kontakt wird deaktiviert, wenn der Nutzer ihn in der Liste ansieht, dann ist er als inaktiv gekennzeichnet; ein Löschen ist nicht möglich

**Deaktivieren / Reaktivieren**
- [ ] Angenommen ein Nutzer hat nur „Lesen + Bearbeiten" auf Adressen ohne die Berechtigung zum Aktivieren/Deaktivieren, wenn er eine Adresse öffnet, dann wird ihm keine Aktivieren/Deaktivieren-Option angeboten
- [ ] Angenommen ein Nutzer hat die Berechtigung zum Aktivieren/Deaktivieren, wenn er eine Adresse ohne untergeordnete Adressen deaktiviert, dann wird die Adresse und alle ihre Kontakte deaktiviert
- [ ] Angenommen eine Adresse hat aktive untergeordnete Adressen, wenn der berechtigte Nutzer sie deaktiviert, dann fragt das System, ob die untergeordneten Adressen auch deaktiviert werden sollen; bei „Ja" werden alle untergeordneten Adressen über alle Ebenen samt deren Kontakten deaktiviert, bei „Nein" bleiben sie aktiv
- [ ] Angenommen eine inaktive Adresse hat untergeordnete Adressen, wenn der berechtigte Nutzer sie reaktiviert, dann fragt das System, ob die untergeordneten Adressen auch aktiviert werden sollen; bei „Ja" werden alle untergeordneten Adressen aktiviert, die Kontakte bleiben inaktiv
- [ ] Angenommen eine Adresse wird reaktiviert, wenn der Nutzer den Reiter „Kontakt" öffnet, dann sind die Kontakte weiterhin inaktiv und können einzeln wieder aktiviert werden
- [ ] Angenommen ein Nutzer sucht nach einer Löschfunktion für Adressen oder Kontakte, dann steht nur „Deaktivieren" zur Verfügung
- [ ] Angenommen eine Adresse wird deaktiviert, die an Artikeln als Markeninhaber hinterlegt ist, wenn der Nutzer den Artikel öffnet, dann bleibt der Markeninhaber sichtbar (als inaktiv gekennzeichnet), erscheint aber in neuen Auswahllisten nicht mehr
- [ ] Angenommen eine Adresse mit Kürzel ist deaktiviert, wenn ein anderer Nutzer dasselbe Kürzel vergibt, dann erscheint weiterhin der Duplikat-Hinweis

**Rechte, Sperre, Mandanten**
- [ ] Angenommen ein Nutzer der Rolle Lager hat nur Leserechte, wenn er eine Adresse oder einen Kontakt bearbeiten möchte, dann wird ihm keine Bearbeitungsoption angeboten
- [ ] Angenommen eine Adresse wird gerade von Nutzer A bearbeitet, wenn Nutzer B sie bearbeiten möchte, dann erhält er nur Lesezugriff und die Meldung nennt den sperrenden Nutzer; dasselbe gilt für einzelne Kontakte
- [ ] Angenommen eine Adresse ist 15 Minuten ohne Aktion im Bearbeitungsmodus, wenn das Timeout erreicht wird, dann wird die Bearbeitungssperre automatisch freigegeben
- [ ] Angenommen ein Nutzer hat ungespeicherte Änderungen an einer Adresse oder einem Kontakt, wenn er sich ausloggt, dann erscheint eine Sicherheitsabfrage zum Speichern oder Verwerfen
- [ ] Angenommen ein Nutzer ist in Mandant A eingeloggt, wenn er Adressen, Kontakte oder Länder öffnet, dann sieht er ausschließlich Daten von Mandant A

**Liste und Suche**
- [ ] Angenommen es existieren Adressen, wenn ein Nutzer in der Liste nach Adressnummer, Name, Namenszusatz, Kürzel, GLN, Ort oder PLZ sucht, dann werden passende Adressen serverseitig gefunden und paginiert angezeigt
- [ ] Angenommen der Nutzer filtert nach Rolle „Lieferadresse", wenn der Filter aktiv ist, dann zeigt die Liste nur Adressen mit dieser Rolle; der Status-Filter steht standardmäßig auf „Aktiv"
- [ ] Angenommen es existiert noch keine Adresse, wenn ein Nutzer mit Schreibrecht die Liste öffnet, dann erscheint „Noch keine Adressen angelegt" mit Button „Adresse anlegen"; ohne Schreibrecht ohne Button

## Edge Cases
- Zwei Nutzer wollen gleichzeitig dieselbe Adresse bearbeiten → zweiter Nutzer erhält nur Lesezugriff, Meldung nennt den sperrenden Nutzer
- Nutzer schließt den Tab ohne zu speichern → Sperre läuft nach 15 Min. ab
- Logout bei ungespeicherter Bearbeitung → Sicherheitsabfrage
- Adressnummer bereits vergeben (auch bei gleichzeitigem Speichern) → Speichern wird abgelehnt
- Kürzel doppelt vergeben → nur Hinweis, Speichern erfolgt
- Zyklus in der Hierarchie (A unter B, B unter A, oder Kette) → wird abgelehnt
- Verweise auf sich selbst bei Rechnungsempfänger/Rechnungsversand/Abrechnungsgesellschaft → erlaubt (entspricht dem leeren Verweis)
- Kaskadierendes Deaktivieren/Reaktivieren einer großen Hierarchie → geschieht vollständig oder gar nicht (kein halb deaktivierter Zustand bei Fehler)
- Nutzer darf Adressen deaktivieren, hat aber keine Rechte an Kontakten → Kontakte werden trotzdem mit deaktiviert (Folge der Adresse, kein eigener Kontakt-Vorgang)
- Beim Deaktivieren einer Adresse waren einzelne Unteradressen bereits inaktiv → Beim Reaktivieren mit „Ja" werden alle untergeordneten Adressen aktiviert (bewusst, siehe Decision Log)
- Land in der Länder-Tabelle wird deaktiviert, obwohl Adressen darauf verweisen → Verweis bleibt sichtbar, erscheint nur nicht mehr in neuen Auswahllisten
- Länder-Tabelle ist leer → Hinweis mit Direktlink zur Pflege-Maske
- Kein Adresse mit Kürzel vorhanden, aber Artikel soll Markeninhaber erhalten → Hinweis mit Direktlink
- Speicherfehler durch Netzwerk-/API-Ausfall → Eingaben bleiben erhalten, Fehlermeldung wird angezeigt
- Eingeloggter Nutzer ohne Recht auf die Maske „Adressen" ruft die Seite direkt auf → Zugriff verweigert
- Kontakt einer Adresse, deren übergeordnete Adresse geändert wird → Im Reiter „Kontakt" wechseln die angezeigten übergeordneten Kontakte entsprechend mit
- Nutzer hat Rechte an Adressen, aber nicht an Kontakten → Reiter „Kontakt" ist sichtbar nur, soweit Leserecht auf Kontakte besteht, sonst ausgeblendet oder mit Hinweis

## Technical Requirements
- Security: Zugriff nur für eingeloggte, mandantenzugeordnete Nutzer; Rechte pro Maske (Adressen, Kontakte, Länder) über PROJ-2; zusätzlich eine eigene Berechtigung „Aktivieren/Deaktivieren" für Adressen (Standard: nur Administrator)
- Performance: Liste und Suche bei mehreren tausend Adressen pro Mandant ohne merkliche Verzögerung (serverseitige Suche + Pagination)
- Architektur-Hinweis für `/architecture`: Bearbeitungssperre aus PROJ-3 wiederverwenden; Hierarchie-Auswertungen (alle übergeordneten/untergeordneten Adressen, Zyklusprüfung, kaskadierendes Deaktivieren) müssen auch bei tiefen Hierarchien performant sein; Struktur so auslegen, dass Einkauf, Verkauf und spätere Agenten die Verknüpfungen (Hierarchie, Rechnungsempfänger, Rechnungsversand, Abrechnungsgesellschaft) sauber abfragen können; die eigene Berechtigung „Aktivieren/Deaktivieren" möglichst generisch im Rechtesystem anlegen, da sie auch für künftige Module gelten kann
- Browser Support: Chrome, Firefox, Safari (wie übrige Module)

## Open Questions
- [x] ~~Soll die Berechtigung „Aktivieren/Deaktivieren" auch für einzelne Kontakte gelten?~~ → Nein, nur für Adressen; Kontakte lassen sich mit „Lesen + Bearbeiten" einzeln (de)aktivieren (2026-10-08)
- [x] ~~Sollen Telefon, E-Mail und Webseite zusätzlich direkt an der Adresse hinterlegbar sein?~~ → Ja, für allgemeine Angaben z.B. der Zentrale (2026-10-08)
- [x] ~~PROJ-3-Spec nachziehen~~ → Am 2026-10-08 in `features/PROJ-3-artikelstamm.md` eingetragen (Refinement-Hinweis); Umsetzung gemeinsam mit PROJ-4
- [ ] Soll bei der Rolle „Lieferadresse" bzw. in der Hierarchie später eine Pflicht-Prüfung entstehen (z.B. Lieferadresse muss unter einem Kunden hängen)? Aktuell keine Pflicht.
- [ ] Kunden-/Lieferantennummer beim Partner (z.B. unsere Nummer bei Markant) und weitere Konditionsdaten: gehören in die spätere Konditionen-Spec bzw. PROJ-6/PROJ-7.

## Decision Log

### Product Decisions
| Decision | Rationale | Date |
|----------|-----------|------|
| Ein zentraler Adressstamm mit Rollen statt getrennter Kunden-/Lieferantenstämme | Partner mit mehreren Rollen werden nur einmal gepflegt; keine doppelte Datenpflege; für Agenten besser ansprechbar | 2026-10-08 |
| Feste Rollen: Kunde, Lieferant, Spediteur, Dienstleister, Lieferadresse, Sonstige; Mehrfachauswahl | Fachlogik in PROJ-3/6/7 kann sich auf feste Rollen verlassen; keine vom Mandanten pflegbare Rollenliste im MVP | 2026-10-08 |
| „Lieferadresse" als eigene Rolle (statt nur aus der Hierarchie abgeleitet) | Eindeutig filterbar in PROJ-7; funktioniert auch, wenn Besteller = Lieferadresse (zwei Rollen) | 2026-10-08 |
| Markeninhaber ist keine Rolle; jede Adresse mit Kürzel kann Markeninhaber sein | Nutzervorgabe: grundsätzlich kann jede Adressart Markeninhaber sein | 2026-10-08 |
| Doppeltes Kürzel nur als Hinweis, nicht blockierend (auch bei inaktiven Adressen) | Nutzervorgabe: Information, aber keine Blockade | 2026-10-08 |
| Adressnummer = Basis (max. 10 Ziffern) + „." + Kennziffer (4 Ziffern), manuell, mit Vorschlag der nächsten freien Kennziffer | Analog zur Artikelnummer (Nutzerwunsch); Vorschlag erleichtert das Anlegen von Unteradressen | 2026-10-08 |
| GLN als optionales Feld (13 Ziffern, ohne Prüfziffer) | Nutzerwunsch; Prüfziffer im MVP nicht nötig | 2026-10-08 |
| Land als Merkmal-Tabelle (Name + Länderkürzel 2 bis 3 Buchstaben) | Einheitliche Pflege wie bei Artikel-Merkmalen; 3 Stellen für Kürzel wie VAE/ARE | 2026-10-08 |
| Kontakte in zentraler Gesamttabelle, je Kontakt genau eine Adresse; Reiter zeigt zusätzlich Kontakte übergeordneter Adressen (nur lesbar, mit Herkunft) | Nutzerwunsch; Kontakte der Zentrale sind für Unteradressen relevant; Mehrfachzuordnung wäre zu aufwendig | 2026-10-08 |
| Telefon, E-Mail, Webseite zusätzlich direkt an der Adresse (allgemeine Angaben, z.B. der Zentrale); Aktivieren/Deaktivieren-Berechtigung nur für Adressen, nicht für einzelne Kontakte | Nutzerentscheidung 2026-10-08 | 2026-10-08 |
| Hierarchie: genau eine übergeordnete, beliebig viele untergeordnete Adressen, beliebige Tiefe | Deckt Fall 1–4 der Kundenstrukturen ab (Zentrale → Landesgesellschaft → Lieferadressen, Kunde mit mehreren Lieferadressen) | 2026-10-08 |
| Abrechnungs-Zuordnungen (Rechnungsempfänger, Rechnungsversand an, Abrechnungsgesellschaft) als getrennte Verweise neben der Hierarchie | Rechnungsfluss weicht in der Praxis von der Hierarchie ab (z.B. Rechnung an Kunde, Versand an Abrechnungsgesellschaft); leerer Verweis = Adresse selbst | 2026-10-08 |
| Preise, Konditionen, Rückvergütungen und Abrechnungslogik nicht in PROJ-4, nur die Verknüpfungsstruktur | Single Responsibility; gehört zu PROJ-7 bzw. späterer Konditionen-Spec | 2026-10-08 |
| Deaktivieren mit Rückfrage zu untergeordneten Adressen (Ja = alle Ebenen deaktivieren); Kontakte werden immer mit deaktiviert | Nutzervorgabe | 2026-10-08 |
| Reaktivieren mit Rückfrage; Ja = alle untergeordneten Adressen werden aktiviert (auch vorher bereits inaktive), Kontakte bleiben inaktiv | Nutzerentscheidung: kommt selten vor, wird ohnehin händisch abgeglichen; vermeidet aufwendiges Merken der Kaskade | 2026-10-08 |
| Aktivieren/Deaktivieren nur mit eigener Berechtigung (Standard: nur Administrator) | Nutzervorgabe; Stilllegen von Stammdaten soll nicht jeder Bearbeiter dürfen | 2026-10-08 |
| Markeninhaber am Artikel verweist auf Adresse mit Kürzel; Merkmal-Tabelle Markeninhaber entfällt; Testdaten werden bereinigt | Umsetzung der in PROJ-3 vorgesehenen Verknüpfung; keine zweite Pflegestelle | 2026-10-08 |
| Standard-Rechte: Admin alles; Einkauf/Verkauf Adressen+Kontakte lesen/bearbeiten, Länder lesen; Lager/Produktion lesen | Sinnvoller Default, über PROJ-2 anpassbar | 2026-10-08 |
| Bearbeitungssperre aus PROJ-3 gilt für Adressen und einzelne Kontakte | Konsistentes Verhalten, wiederverwendbarer Mechanismus | 2026-10-08 |
| Liste flach mit Suche und Filtern (Rolle, Status, Land); keine Baumansicht im MVP | Hierarchie ist in der Adressmaske sichtbar; Baumansicht ist späterer Ausbau | 2026-10-08 |
| Adressmaske als Reiter in einem Formular (Stammdaten, Anschrift, Kontakt, Verknüpfungen, Steuer & Bemerkung) | Einheitlich zur Artikelmaske; übersichtlich | 2026-10-08 |
| Nur Basis, Kennziffer und Name sind Pflicht | Unvollständige Adressen sollen anlegbar sein; strengere Pflichtfelder später über PROJ-12 | 2026-10-08 |

### Technical Decisions
<!-- Added by /architecture -->
| Decision | Rationale | Date |
|----------|-----------|------|
| _folgt mit /architecture_ | | |

---
<!-- Sections below are added by subsequent skills -->

## Tech Design (Solution Architect)
_To be added by /architecture_

## QA Test Results
_To be added by /qa_

## Deployment
_To be added by /deploy_
