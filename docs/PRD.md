# Product Requirements Document

## Vision
Ein modulares ERP-System für eine Schokoladenfabrik (Manufaktur), das schrittweise alle Betriebsprozesse abdeckt (Warenwirtschaft, Produktionsplanung, Wartung u.a.). Ziel ist es, Entscheidungen künftig auf Basis zugänglicher, zentraler Daten statt auf reiner Erfahrung zu treffen. Langfristig sollen Prozesse zunehmend automatisiert und von konfigurierbaren Agenten gesteuert werden können.

## Target Users
- ~30 Nutzer pro Mandant (Firmenzweig), Rollen u.a.: Lager, Einkauf/Verkauf, Produktionsplanung, Wartungsteams/Techniker, Administratoren
- Mehrere Firmenzweige (Mandanten) werden zentral verwaltet, aber datentechnisch sauber getrennt (Multi-Tenant von Anfang an)
- Schmerzpunkt: Heute basieren Entscheidungen auf Erfahrung statt auf Daten, da diese verteilt und schwer zugänglich sind

## Core Features (Roadmap)

| Priority | Feature | Status |
|----------|---------|--------|
| P0 (MVP) | Basis: Auth, Benutzerverwaltung, Rollen-/Rechtesystem (pro Maske), Multi-Tenant-Grundgerüst, Self-hosted Supabase | Planned |
| P0 (MVP) | Warenwirtschaft – Artikelstamm | Roadmap |
| P1 | Warenwirtschaft – Adressen | Roadmap |
| P1 | Warenwirtschaft – Einkauf | Roadmap |
| P1 | Warenwirtschaft – Verkauf | Roadmap |
| P1 | Warenwirtschaft – Lager | Roadmap |
| P1 | Produktionsplanung | Roadmap |
| P2 | Wartung (Aufgabenplanung & Team-Verteilung) | Roadmap |
| P2 | Agenten-Automatisierung (agentensteuerbare Prozesse) | Roadmap |

## Success Metrics
- Kurzfristig (MVP): Artikeldaten sind zentral und ohne Nachfragen/Excel-Suche abrufbar; keine doppelte Datenpflege
- Langfristig (ab mehreren Modulen): Anzahl menschlicher Eingriffe pro Prozess so gering wie möglich halten und mit jeder Iteration weiter senken — ausgenommen bewusst menschlich vorgesehene Prozessschritte (z.B. Ausführung einer Wartungsaufgabe durch einen Techniker)

## Constraints
- Kein hartes Zeitfenster, iterative Entwicklung Modul für Modul
- Team: Nutzer arbeitet vorerst allein mit Claude Code
- Backend: Self-hosted Supabase (lokale PostgreSQL-Instanz, kein Supabase-Cloud-Hosting)
- Multi-Tenant-Fähigkeit muss von Anfang an ins Datenmodell eingebaut werden (nicht nachrüstbar)
- Design-System: siehe `docs/design-system.md` (warmes "Manufaktur"-Design, Fraunces/Instrument Sans, individuelle Farbpalette statt shadcn-Standard)
- Alle Module sollen so gestaltet sein, dass sie sich später gut von Agenten ansteuern lassen (klare, saubere API-/Datenstrukturen)

## Non-Goals
- Alle Module außer Basis + Artikelstamm (Adressen, Einkauf, Verkauf, Lager, Produktionsplanung, Wartung) — bewusst spätere Ausbaustufen
- Agenten-Automatisierung selbst (nur architektonisch vorbereiten, nicht implementieren)
- Mobile Apps, Offline-Fähigkeit

---

Use `/write-spec` to create detailed feature specifications for each item in the roadmap above.
