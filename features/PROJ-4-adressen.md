# PROJ-4: Warenwirtschaft – Adressen

## Status: In Progress
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
| Aktivieren/Deaktivieren als generisches Zusatzrecht pro Maske (zusätzlicher Schalter im Rollen-Dialog), in PROJ-4 nur für Adressen aktiviert | Nutzerentscheidung 2026-10-08; später für Artikel, Einkauf u. a. wiederverwendbar, ohne Zugriffsstufen zu vermischen; bestehendes Artikel-Verhalten bleibt unverändert | 2026-10-08 |
| Drei neue Masken (Adressen, Kontakte, Länder); Maske „Markeninhaber" entfällt samt ihren Rollenrechten | Rechte pro Maske laut PROJ-2; Kontakte brauchen eigene Rechte (Gesamtliste, Reiter-Sichtbarkeit) | 2026-10-08 |
| Adressnummer wird wie die Artikelnummer serverseitig zusammengesetzt und gespeichert; Eindeutigkeit pro Mandant per Datenbank-Constraint | Bewährtes PROJ-3-Muster; schützt auch bei gleichzeitigem Speichern | 2026-10-08 |
| Vorschlag der nächsten freien Kennziffer als eigene kleine Abfrage (Basis → nächste freie Kennziffer), nicht als Zähler | Spec fordert manuelle Eingabe ohne automatisches Hochzählen; der Vorschlag ist nur ein änderbarer Hinweis | 2026-10-08 |
| Hierarchie als „Verweis auf übergeordnete Adresse" an der Adresse selbst (keine eigene Beziehungstabelle) | Genau eine übergeordnete Adresse laut Spec; einfachste Struktur, für Agenten direkt abfragbar | 2026-10-08 |
| Hierarchie-Auswertungen (alle Über-/Unterordnungen, Zyklusprüfung, kaskadierendes (De)Aktivieren) laufen als datenbankseitige Rekursion, nicht als Schleife in der Anwendung | Performant auch bei tiefen Hierarchien; eine zentrale Stelle für Oberfläche und Agenten | 2026-10-08 |
| Zyklusprüfung wird in der Datenbank beim Speichern erzwungen (zusätzlich zur Prüfung in der Auswahl) | Verhindert Zyklen auch bei gleichzeitigen Änderungen oder direkten Schnittstellenaufrufen | 2026-10-08 |
| Kaskadierendes Deaktivieren/Reaktivieren als ein einziger, unteilbarer Datenbankvorgang | „Vollständig oder gar nicht" laut Spec; kein halb deaktivierter Zustand | 2026-10-08 |
| Das Mitdeaktivieren der Kontakte ist eine Folge der Adress-Aktion und läuft mit erhöhten Rechten, nachdem Zusatzrecht und Mandant geprüft wurden | Spec: Nutzer ohne Kontakt-Recht deaktiviert trotzdem Kontakte mit | 2026-10-08 |
| Kaskade ändert nur den Status; Bearbeitungssperren von Unteradressen blockieren sie nicht, die Sperre der gewählten Adresse selbst schon | Es werden keine Formulardaten überschrieben; sonst könnte ein offener Tab das Stilllegen einer ganzen Hierarchie verhindern (bitte im Review bestätigen) | 2026-10-08 |
| Kontakte der übergeordneten Adressen werden per Abfrage „Kontakte aller Vorfahren inkl. Ebene" geliefert, nicht kopiert | Keine doppelte Datenhaltung; Wechsel der übergeordneten Adresse wirkt sofort | 2026-10-08 |
| Rollen sind eine feste Liste an der Adresse (Mehrfachauswahl), keine eigene Tabelle | Rollen sind fest vorgegeben; einfach filterbar und lesbar | 2026-10-08 |
| Eine gemeinsame, indizierte Suchspalte (Nummer, Name, Zusatz, Kürzel, GLN, Ort, PLZ) | Wie Matchcode bei Artikeln: eine schnelle Suche statt vieler einzelner | 2026-10-08 |
| Kürzel-Duplikatprüfung als Abfrage, die Treffer inkl. inaktiver Adressen nennt; kein Unique-Constraint | Nutzervorgabe: nur Hinweis, nicht blockierend | 2026-10-08 |
| Markeninhaber am Artikel verweist auf die Adresse; Tabelle „Markeninhaber" entfällt; Neuberechnung der Matchcodes bei Kürzeländerung nach demselben Muster wie bei den Merkmal-Kürzeln | Keine zweite Pflegestelle; Matchcodes veralten nicht; Testdaten dürfen bereinigt werden | 2026-10-08 |
| Länder laufen über die bestehende Merkmal-Pflege-Oberfläche und -Schnittstellen (Konfiguration #10, eigene Maske) | Spec: „wie die anderen Merkmal-Tabellen"; keine neue Oberfläche nötig | 2026-10-08 |
| Bearbeitungssperre: neue Datensatztypen „Adresse" und „Kontakt" im bestehenden generischen Mechanismus | Wiederverwendung aus PROJ-3, keine neue Sperr-Tabelle | 2026-10-08 |
| Auswahlfelder für Adressen laden serverseitig mit Suche (Treffer-Limit), nicht die komplette Liste | Mehrere tausend Adressen pro Mandant; die bisherigen Merkmal-Auswahlen (kleine Listen) laden alles | 2026-10-08 |
| Umsetzung als neue Migration; bestehende Migrationen bleiben unverändert | Gleiches Vorgehen wie PROJ-3-Refinement | 2026-10-08 |
| Keine neuen Pakete | Alle benötigten shadcn/ui-Bausteine, react-hook-form und zod sind vorhanden | 2026-10-08 |

---
<!-- Sections below are added by subsequent skills -->

## Tech Design (Solution Architect)

### A) Komponentenstruktur

```
Sidebar-Navigation (Erweiterung)
└── Gruppe "Warenwirtschaft"
    ├── Artikelstamm
    ├── NEU Adressen
    ├── NEU Kontakte (Gesamtliste)
    └── Merkmale
        ├── ... (bisherige, ohne "Markeninhaber")
        └── NEU Länder
    (jeder Punkt nur sichtbar bei Recht auf die jeweilige Maske)

Adressliste
├── Kopfbereich: Titel + Button "Adresse anlegen" (nur bei Schreibrecht)
├── Suche (Nummer, Name, Zusatz, Kürzel, GLN, Ort, PLZ)
├── Filter: Rolle, Status (Standard: Aktiv), Land
├── Tabelle: Adressnummer, Name, Ort, Land (Kürzel), Rollen (Badges),
│            Übergeordnete Adresse, Status-Badge
├── Seitenwechsel (Pagination)
└── Leerzustand "Noch keine Adressen angelegt" (+ Button nur bei Schreibrecht)

Adressmaske (Ansehen / Bearbeiten / Neu)
├── Kopfzeile (immer sichtbar): Adressnummer, Name, Rollen, Status-Badge
│   └── Aktionen: Bearbeiten | Speichern | Abbrechen
│                 | Deaktivieren/Aktivieren (nur mit Zusatzrecht)
├── Sperr-Banner ("Wird gerade von <Name> bearbeitet – nur Lesezugriff")
└── Reiter in EINEM Formular (Reiter mit Fehlern werden markiert)
    ├── Stammdaten
    │   ├── Adressnummer-Basis + Kennziffer (mit Vorschlag der nächsten freien)
    │   │   └── Live-Vorschau "Adressnummer: 4711.0001"
    │   ├── Name, Namenszusatz
    │   ├── Kürzel (mit Hinweis bei Duplikat, nicht blockierend)
    │   ├── GLN
    │   └── Rollen (Mehrfachauswahl)
    ├── Anschrift & Erreichbarkeit
    │   ├── Straße, Hausnummer, PLZ, Ort
    │   ├── Land (Auswahlfeld, Beschriftung = Link zur Länder-Pflege)
    │   └── Telefon, E-Mail, Webseite
    ├── Kontakt (nur sichtbar/nutzbar mit Leserecht auf Kontakte)
    │   ├── Tabelle: eigene Kontakte (bearbeitbar) + Kontakte aller
    │   │   übergeordneten Adressen (nur lesbar, Spalte "Herkunft/Ebene")
    │   └── Dialog "Kontakt anlegen / bearbeiten" (Adresse vorbelegt)
    ├── Verknüpfungen
    │   ├── Übergeordnete Adresse
    │   ├── Untergeordnete Adressen (nur Anzeige, Klick springt dorthin)
    │   ├── Rechnungsempfänger
    │   ├── Rechnungsversand an
    │   └── Abrechnungsgesellschaft
    └── Steuer & Bemerkung (USt-IdNr., Bemerkung)

Dialog "Deaktivieren / Aktivieren"
└── Rückfrage, falls untergeordnete Adressen existieren:
    "Untergeordnete Adressen auch deaktivieren/aktivieren?" Ja | Nein

Kontakte – Gesamtliste
├── Suche (Name, Funktion, E-Mail, Telefon …) + Filter Status
├── Tabelle: Name, Funktion, Telefon/Mobil, E-Mail, zugehörige Adresse, Status
└── Aktionen je Kontakt: Bearbeiten, (De)Aktivieren (mit Kontakt-Schreibrecht)

Länder-Pflege
└── Die vorhandene Merkmal-Pflege-Seite, um eine Konfiguration erweitert
    (Land, Länderkürzel 2–3 Buchstaben, automatisch Großbuchstaben)

Wiederverwendbare Bausteine
├── Adress-Auswahlfeld (NEU): suchbar, lädt Treffer serverseitig, zeigt Inaktive
│   nur als Kennzeichnung bei bestehenden Verweisen, Beschriftung = Link
│   (genutzt für: Übergeordnete Adresse, Rechnungsempfänger, Rechnungsversand,
│   Abrechnungsgesellschaft, Markeninhaber am Artikel)
├── Bestehende Bausteine: Auswahlfeld mit Tabellenbezug (Land), Sperr-Banner,
│   Status-Badge, Reiter-Formular, Logout-Sicherheitsabfrage
└── Rollen-Dialog (PROJ-2): NEU pro Maske optionaler Schalter
    "Darf aktivieren/deaktivieren" (erscheint nur bei Masken, die das unterstützen)

Änderung am Artikelformular (PROJ-3)
└── Feld "Markeninhaber": Auswahl nur aktiver Adressen mit Kürzel
    (statt Merkmal-Tabelle); Leerhinweis "Noch keine Adresse mit Kürzel – hier anlegen"
```

### B) Datenmodell (in einfacher Sprache)

**Adresse** (gehört zu genau einem Mandanten) – speichert:
- Adressnummer-Basis (nur Ziffern, max. 10) und Kennziffer (genau 4 Ziffern)
- Adressnummer = Basis + „." + Kennziffer, wird beim Speichern **automatisch zusammengesetzt** und ist **pro Mandant eindeutig** (die Datenbank selbst verhindert Doppelte)
- Name (Pflicht), Namenszusatz, Kürzel (max. 10 Zeichen, **nicht** eindeutig erzwungen), GLN (13 Ziffern)
- Rollen: feste Liste aus Kunde, Lieferant, Spediteur, Dienstleister, Lieferadresse, Sonstige (Mehrfachauswahl)
- Anschrift: Straße, Hausnummer, PLZ, Ort, Verweis auf ein Land
- Allgemeine Erreichbarkeit: Telefon, E-Mail, Webseite
- USt-IdNr., Bemerkung
- Verweise auf **andere Adressen** desselben Mandanten: übergeordnete Adresse (höchstens eine), Rechnungsempfänger, Rechnungsversand an, Abrechnungsgesellschaft (jeweils leer = Standardregel laut Spec)
- Status Aktiv/Inaktiv (Standard: Aktiv), Angelegt/Geändert-Zeitstempel + wer
- Automatisch gepflegte Suchzeile aus Nummer, Name, Zusatz, Kürzel, GLN, Ort, PLZ (nur für die schnelle Suche)

**Untergeordnete Adressen** werden nicht gespeichert, sondern aus den „Übergeordnete Adresse"-Verweisen abgeleitet. Ebenso die Kette aller Vorfahren bzw. Nachkommen.

**Kontakt** (gehört zu genau einer Adresse und damit einem Mandanten) – speichert:
- Anrede, Vorname, Nachname (Pflicht), Funktion/Position, Telefon, Mobil, E-Mail, Bemerkung
- Status Aktiv/Inaktiv, Angelegt/Geändert-Zeitstempel + wer
- Kontakte übergeordneter Adressen werden **nicht kopiert**, sondern bei Anzeige per Abfrage aus der Hierarchie geholt.

**Land** (neue Merkmal-Tabelle, je Mandant getrennt): Name (Pflicht), Länderkürzel (2–3 Buchstaben, Großbuchstaben, pro Mandant eindeutig), aktiv/inaktiv. Startet leer, nur deaktivierbar.

**Änderung am Artikel:** „Markeninhaber" verweist künftig auf eine Adresse statt auf einen Merkmal-Eintrag. Die Merkmal-Tabelle „Markeninhaber" entfällt (samt Maske und deren Rollenrechten). Bestehende Zuordnungen werden geleert (Testdaten). Der Matchcode nutzt das Kürzel der Adresse; ändert sich das Kürzel, werden die Matchcodes betroffener Artikel automatisch neu berechnet.

**Rollen-Maskenrechte (PROJ-2):** Jedes Maskenrecht erhält ein zusätzliches Ja/Nein-Feld „darf aktivieren/deaktivieren" (Standard: Nein). Der Rollen-Dialog zeigt den Schalter nur bei Masken, die ihn unterstützen – derzeit nur Adressen. Die Standardrolle Administrator bekommt es für Adressen.

**Bearbeitungssperre (PROJ-3):** Zwei neue Datensatztypen „Adresse" und „Kontakt" im bestehenden Mechanismus (15 Min., serverseitig geprüft).

**Neue Masken im Masken-Register:** Adressen, Kontakte, Länder (Modul „Warenwirtschaft"); „Markeninhaber" entfällt → insgesamt 13 Masken im Modul. Standard-Rechte laut Spec: Admin alles; Einkauf/Verkauf Adressen + Kontakte lesen/bearbeiten, Länder lesen; Lager/Produktion lesen.

**Speicherort:** Lokale, selbst gehostete PostgreSQL-Datenbank (Supabase), wie PROJ-1 bis 3. Alle Tabellen tragen den Mandanten und sind per Zugriffsschutz (RLS) strikt getrennt; Verweise zwischen Adressen sind nur innerhalb desselben Mandanten möglich.

### C) Technische Entscheidungen (für PM verständlich)

1. **Ein Adressstamm, Verknüpfungen als Verweise zwischen Adressen** — Hierarchie, Rechnungsempfänger, Rechnungsversand und Abrechnungsgesellschaft sind einfache Verweise. Einkauf, Verkauf und Agenten können sie direkt abfragen („Wer ist der Rechnungsempfänger von Adresse X?", „Alle Lieferadressen unter Kunde Y?").
2. **Hierarchie-Fragen beantwortet die Datenbank in einem Rutsch** — „Alle Vorfahren", „alle Nachkommen", Zyklusprüfung und Kaskaden-Deaktivieren sind rekursive Abfragen in der Datenbank statt vieler Einzelabfragen aus der Anwendung. Bleibt auch bei tiefen Hierarchien schnell.
3. **Zyklen werden in der Datenbank verhindert** — Nicht nur die Auswahlliste blendet unzulässige Adressen aus; die Datenbank lehnt Zyklen auch bei gleichzeitigem Speichern oder direkten Schnittstellenaufrufen ab.
4. **Kaskadierendes (De)Aktivieren ist ein einziger, unteilbarer Vorgang** — Bei einem Fehler bleibt alles unverändert („vollständig oder gar nicht"). Die zugehörigen Kontakte werden beim Deaktivieren automatisch mit deaktiviert, auch wenn der Nutzer sonst keine Kontakt-Rechte hat; dazu prüft der Server vorher ausdrücklich Zusatzrecht und Mandant.
5. **Aktivieren/Deaktivieren als generisches Zusatzrecht** (Nutzerentscheidung) — Ein Schalter pro Maske im Rollen-Dialog statt einer vierten Zugriffsstufe. In PROJ-4 wird er nur bei Adressen angeboten; später lässt er sich pro Maske freischalten. Das bestehende Verhalten bei Artikeln ändert sich nicht.
6. **Adressnummer wird vom Server zusammengesetzt, Eindeutigkeit von der Datenbank erzwungen** — Gleiches Muster wie bei der Artikelnummer. Der Vorschlag der nächsten freien Kennziffer ist eine Hilfsabfrage, kein Zähler; bei gleichzeitigem Anlegen entscheidet die Datenbank, der zweite Nutzer erhält „Adressnummer bereits vergeben".
7. **Kürzel-Duplikate: Hinweis statt Sperre** — Eine Abfrage nennt beim Verlassen des Feldes (und beim Speichern) die Adresse(n), die das Kürzel schon nutzen, auch inaktive. Es gibt keine Datenbank-Sperre dafür.
8. **Kontakte übergeordneter Adressen werden angezeigt, nicht kopiert** — Wechselt die übergeordnete Adresse, ändert sich die Anzeige sofort mit; es gibt keine doppelte Pflege. Diese Vorfahren-Kontakte sind im Reiter nur lesbar, bearbeitet wird an der eigenen Adresse.
9. **Markeninhaber wird zur Adress-Auswahl; Matchcode-Neuberechnung bei Kürzeländerung** — Dieselbe Logik wie bei den bestehenden Merkmal-Kürzeln, jetzt mit der Adresse als Quelle. Deaktivierte Adressen bleiben am Artikel sichtbar (mit Kennzeichnung), erscheinen aber nicht mehr in neuen Auswahllisten.
10. **Länder nutzen die vorhandene Merkmal-Pflege** — Kein neuer Bildschirm: Die Merkmal-Seite und ihre Schnittstellen werden um „Länder" erweitert. Rechte, Sperrverhalten, Deaktivieren-statt-Löschen und Mandantentrennung gelten unverändert.
11. **Adress-Auswahlfeld lädt serverseitig und begrenzt Treffer** — Bei mehreren tausend Adressen darf die Auswahl nicht die ganze Liste laden. Das Feld sucht beim Tippen auf dem Server (z. B. nur aktive, bei Markeninhaber nur mit Kürzel).
12. **Liste und Suche serverseitig mit Seitenwechsel und Suchindex** — Eine gemeinsame Suchzeile (Nummer, Name, Zusatz, Kürzel, GLN, Ort, PLZ) mit Suchindex; Filter Rolle, Status, Land wirken in der Abfrage, nicht im Browser.
13. **Bearbeitungssperre aus PROJ-3 für Adressen und einzelne Kontakte** — Server prüft beim Speichern, dass der Nutzer die gültige Sperre hält. Das Kaskaden-(De)Aktivieren ändert nur den Status und wird durch Sperren von Unteradressen nicht blockiert; die gewählte Adresse selbst darf dabei nicht von jemand anderem gesperrt sein.
14. **Reiter-Formular wie beim Artikel** — Ein Formular, ein Speichern, alle Reiter bleiben im Hintergrund erhalten; Reiter mit Fehlern werden markiert, beim Speichern Sprung zum ersten Fehler. Der Kontakt-Reiter hat eigene Dialoge mit eigener Sperre und eigenem Speichern (Kontakte sind eigene Datensätze).
15. **Serverseitige Rechteprüfung + RLS wie in PROJ-2/3** — Jede Schreibaktion prüft Maskenrecht und Zugriffsstufe; für (De)Aktivieren zusätzlich das Zusatzrecht. Der Datenbank-Zugriffsschutz ist die zweite Ebene.
16. **Einheitliche Schnittstellenstruktur** — Adressen, Kontakte und Länder folgen dem Muster von Artikeln/Merkmalen (Liste, Einzelabruf, Anlegen, Ändern, Status) unter dem Mandanten, plus gezielte Abfragen für Agenten (untergeordnete/übergeordnete Adressen, Kontakte inkl. Vorfahren, Rechnungsverweise).
17. **Umsetzung als neue Migration** — Bestehende Migrationen bleiben unverändert; Markeninhaber-Tabelle, -Maske und -Zuordnungen werden dabei bereinigt.

### D) Schnittstellen (Überblick, ohne Details)

Alle unter dem Mandanten, Rechte pro Maske, deutsche Fehlermeldungen:
- **Adressen:** Liste (Suche, Filter, Seitenwechsel), Einzelabruf, Anlegen, Ändern, Status ändern (mit Option „untergeordnete einbeziehen"), Vorschlag nächste freie Kennziffer, Kürzel-Duplikat prüfen, Auswahl-Suche (für Auswahlfelder), untergeordnete Adressen
- **Kontakte:** Gesamtliste (Suche, Seitenwechsel), Kontakte einer Adresse inkl. Kontakte der Vorfahren, Anlegen, Ändern, Status ändern
- **Länder:** über die bestehende Merkmal-Schnittstelle
- **Bearbeitungssperre:** bestehende Schnittstelle, zwei neue Datensatztypen
- **Rollen (PROJ-2):** Zusatzrecht „aktivieren/deaktivieren" je Maske lesen/schreiben
- **Artikel (PROJ-3):** Markeninhaber verweist auf Adresse; Auswahlquelle ändert sich

### E) Abhängigkeiten (Pakete)
Keine neuen Pakete. Vorhandene shadcn/ui-Bausteine (Tabs, Table, Pagination, Command + Popover, Dialog, AlertDialog, Badge, Checkbox, Switch, Alert) sowie react-hook-form + zod reichen aus.

### F) Auswirkungen auf bestehende Teile
- **Datenbank:** neue Migration (Tabellen Adressen, Kontakte, Länder inkl. RLS; Hierarchie-Auswertungen, Zyklusschutz, unteilbares Kaskaden-(De)Aktivieren; Suchindex; Zusatzrecht-Feld an den Maskenrechten; Masken-Register + Standardrechte; Sperr-Datensatztypen; Umstellung Markeninhaber am Artikel inkl. Matchcode-Neuberechnung; Entfernen von Markeninhaber-Tabelle und -Rechten).
- **PROJ-2:** Rollen-Dialog, Rollen-API und Rechteprüfung kennen das Zusatzrecht; bestehende Rollen bleiben unverändert (Zusatzrecht = Nein, Administrator = Ja für Adressen).
- **PROJ-3:** Artikelformular/-API (Markeninhaber = Adress-Auswahl), Matchcode-Berechnung, Merkmal-Konfiguration ohne Markeninhaber, bestehende Tests anpassen.
- **Frontend:** Adressliste, Adressmaske (5 Reiter), Kontakte-Gesamtliste, Kontakt-Dialog, Adress-Auswahlfeld, Länder-Konfiguration, Sidebar (+3 Einträge, −1), Rollen-Dialog (Schalter).
- **Tests:** Adressnummer/Kennziffer, Hierarchie (Zyklus, Kaskade, Vorfahren-Kontakte), Rechte inkl. Zusatzrecht, Sperren, Mandantentrennung (inkl. SQL-RLS-Tests), Markeninhaber-Umstellung/Matchcode.

## Implementation Notes (Frontend)

### Gebaut
- **Seiten:** `/adressen` (Liste), `/adressen/neu`, `/adressen/[addressId]`, `/kontakte` (Gesamtliste). Länder laufen über die vorhandene `/merkmale/laender`.
- **Komponenten** (`src/components/adressen/`): `address-form` (5 Reiter in einem Formular, Fehlermarkierung, Kopfzeile mit Rollen-/Status-Badge, Sperr-Banner, Deaktivieren-/Aktivieren-Dialog mit Rückfrage zu untergeordneten Adressen), `address-select` (suchbares, serverseitig ladendes Adress-Auswahlfeld + Label mit Link), `address-contacts-tab` (eigene + geerbte Kontakte, Herkunftsspalte, Status-Dialog), `contact-form-dialog` (Anlegen/Bearbeiten/Ansehen mit eigener Bearbeitungssperre), `contact-table` (Gesamtliste mit Aktionen), `address-filters`, `contact-filters`. Neu allgemein: `components/list-pagination.tsx`.
- **Bibliotheken:** `lib/addresses.ts` (Rollen, Formular-Schema, Adressnummer-Vorschau, Payload/Row-Mapping), `lib/contacts.ts`, `lib/address-data.ts` (serverseitige Ladehelfer), `apiGet` in `lib/api-client.ts`.
- **PROJ-2-Erweiterung:** Maske-Register um Adressen, Kontakte, Länder erweitert, „Markeninhaber" entfernt; `MaskDefinition.supportsActivation` (nur Adressen) und `MaskPermission.canToggleActive`; Rollen-Dialog zeigt bei Masken mit `supportsActivation` einen Schalter „Darf … aktivieren/deaktivieren" (nur wirksam bei „Lesen + Bearbeiten"); Rollenübersicht nennt das Zusatzrecht; `SessionContext.maskToggle` + `canToggleActive()` in `tenant-access.ts`.
- **PROJ-3-Anpassung:** Artikelmaske: Feld „Markeninhaber" ist jetzt eine Adress-Auswahl (nur aktive Adressen mit Kürzel, Leerhinweis „Noch keine Adresse mit Kürzel – hier anlegen", Label verlinkt auf die gewählte Adresse, Matchcode-Vorschau nutzt das Adress-Kürzel). Der API-Schlüssel bleibt `brandOwnerId` (Wert = Adress-ID). Merkmal-Konfiguration: „Markeninhaber" entfernt, „Länder" (Feldart `letters`, automatisch Großbuchstaben) ergänzt; `ARTICLE_MERKMALE` trennt Artikel-Merkmale von Länder. Sidebar: „Adressen" und „Kontakte" (Länder erscheinen automatisch unter „Merkmale").
- **Tests:** neue Unit-Tests `addresses.test.ts`, `contacts.test.ts`; erweitert `merkmale.test.ts` (Länder), `tenant-access.test.ts` (Zusatzrecht), `masks.test.ts`. Zwei bestehende Tests angepasst (Markeninhaber nicht mehr vorhanden). Stand: 301 Unit-Tests grün, `tsc`, `npm run lint` und `npm run build` ohne Fehler.

### Abweichungen / Interpretationen (bitte bestätigen)
- **Anrede** ist ein Freitextfeld (max. 30 Zeichen), da die Spec keine feste Liste nennt.
- **Kontakte anlegen** nur im Reiter „Kontakt" einer Adresse (Adresse vorbelegt); die Gesamtliste erlaubt Suchen, Bearbeiten und (De)Aktivieren, aber kein Anlegen.
- **Gesamtliste der Kontakte:** Status-Filter steht standardmäßig auf „Alle" (inaktive sind gekennzeichnet); bei der Adressliste gilt wie in der Spec „Aktiv" als Standard.
- **Rückfrage beim Deaktivieren** erscheint, wenn die Adresse *direkt* untergeordnete aktive Adressen hat (bei Reaktivieren: irgendeine direkt untergeordnete). Eine aktive Adresse tiefer unter einer inaktiven direkten Unteradresse löst die Rückfrage nicht aus; `includeChildren: false` lässt sie dann aktiv.
- **Kürzel-Duplikat-Hinweis** erscheint 0,4 s nach der Eingabe (und beim Öffnen einer Adresse mit Kürzel im Bearbeitungsmodus), nicht erst beim Verlassen des Feldes.
- **Kennziffer-Vorschlag** füllt ein leeres Feld vor und bietet bei abweichender Eingabe „Übernehmen" an.
- **Kontakt-Reiter bei geänderter Zentrale:** Die geerbten Kontakte wechseln erst nach dem Speichern der Adresse (Hinweis im Reiter).
- **Live-Prüfung im Browser** war nicht möglich: Ohne die von `/backend` angelegten Tabellen und Routen zeigen die Seiten den Fehlerzustand (wie bei PROJ-3 im Frontend-Schritt).

### Annahmen für `/backend` (Frontend ruft das schon so auf)
**Tabellen / Spalten** (alle mit `tenant_id`, RLS wie PROJ-3):
- `countries`: `id, name, code (2–3 Buchstaben, Großbuchstaben, pro Mandant eindeutig), is_active` — Merkmal-Routen müssen die Feldart `letters` kennen (`warenwirtschaft-shared.ts` kennt bisher nur `text`/`digit`/Dezimal und würde `code` sonst als Zahl behandeln); Maske `warenwirtschaft:merkmal_laender`.
- `addresses`: `id, address_base, address_suffix, address_number (Basis.Kennziffer, pro Mandant eindeutig), name, name_addition, code, gln, roles (Text-Array), street, house_number, postal_code, city, country_id, phone, email, website, vat_id, remark, parent_address_id, invoice_recipient_id, invoice_ship_to_id, billing_company_id, is_active, updated_at, search_text (gemeinsame Suchspalte, Trigram-Index)`. Rollenwerte: `customer, supplier, carrier, service_provider, delivery_address, other`.
- `contacts`: `id, address_id, salutation, first_name, last_name, function_title, phone, mobile, email, remark, is_active`.
- `role_permissions.can_toggle_active` (boolean, Default false; Administrator-Standardrolle = true für Adressen). Maskenschlüssel: `warenwirtschaft:adressen`, `:kontakte`, `:merkmal_laender`; `:merkmal_markeninhaber` entfällt samt Rechten.
- Sperr-Datensatztypen `address` und `contact` (`edit_lock_types`).
- Artikel: Markeninhaber-Verweis zeigt auf `addresses` (API-Schlüssel `brandOwnerId` unverändert); Matchcode nimmt das Adress-Kürzel; Neuberechnung bei Kürzeländerung.

**Routen** (unter `/api/tenants/:tenantId`, Fehlerformat `{ error, field? }`):
- `GET addresses/options?q=&requireCode=true&excludeSubtreeOf=<id>` → `{ items: AddressOption[] }` (nur aktive; begrenzt; `excludeSubtreeOf` blendet die Adresse und alle ihre Nachkommen aus)
- `GET addresses/next-suffix?base=` → `{ exists: boolean, suffix: string | null }` (nächste freie Kennziffer; `exists` = Basis gibt es schon)
- `GET addresses/code-check?code=&excludeId=` → `{ items: AddressOption[] }` (alle Adressen mit demselben Kürzel, auch inaktive)
- `POST addresses`, `PATCH addresses/:id` (Body siehe `toAddressPayload`; Fehler `field: "suffix"`/`"addressNumber"` bei Duplikat, `parentAddressId` bei Zyklus), `PATCH addresses/:id/status` Body `{ isActive, includeChildren }` (unteilbar; Kontakte werden beim Deaktivieren mitdeaktiviert; Recht = Zusatzrecht `can_toggle_active`)
- `GET addresses/:id/contacts` → `{ own: Contact[], inherited: (Contact & { source: { addressId, addressNumber, addressName, level } })[] }` (Antwort-Typen in `lib/contacts.ts`)
- `POST contacts` (Body `toContactPayload` + `addressId`), `PATCH contacts/:id`, `PATCH contacts/:id/status` Body `{ isActive }`
- Rollen-API (`roles`, `roles/:id`): Maskeneinträge tragen zusätzlich `canToggleActive` (boolean, nur bei Masken mit `supportsActivation`).
- Server-Seiten lesen `addresses`, `contacts`, `countries` direkt per Supabase-Client (RLS), die Rollen-Seiten zusätzlich `role_permissions.can_toggle_active`.

## QA Test Results
_To be added by /qa_

## Deployment
_To be added by /deploy_
