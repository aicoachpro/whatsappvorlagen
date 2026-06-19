# CONTEXT.md — Ubiquitous Language (WhatsAppVorlagen SuperChat)

Kanonisches Vokabular + Verbotsliste. Die KI nutzt beim Schreiben konsequent die
kanonischen Begriffe. **Default = Guidance, kein Hard-Gate.**

## Compliance-Vokabular

| kanonisch | verboten | Quelle |
| --- | --- | --- |
| `Betroffener` | `User` / `Customer` (im PII-Kontext) | DSGVO Art. 4 |
| `Einwilligung` | `Zustimmung` / `OK` | DSGVO Art. 6 / 7 |
| `personenbezogene Daten` | `PII` ohne Definition | DSGVO Art. 4 |
| `Meta WhatsApp Business Policy` | „WhatsApp-Regeln" (lose) | Meta BSP-Compliance |

## Governance-Vokabular

| kanonisch | verboten | Quelle |
| --- | --- | --- |
| `Story` / `Spec` / `Intent` | `Ticket` / `Anforderung` / `Ziel` | INTENTRON-Governance |
| `Gate` | `Check` (generisch) | INTENTRON Quality-Gate |
| `VOR-<n>` | freie Issue-Bezeichnung | Huly-Issue-Prefix (aktiv seit 2026-06-19) |
| `VOE-<n>` | freie Issue-Bezeichnung | Alt-Prefix Linear (nur Historie; migriert nach `VOR-`) |

## Projekt-Domäne (WhatsAppVorlagen SuperChat)

| kanonisch | Bedeutung / Abgrenzung | Quelle |
| --- | --- | --- |
| `Superchat` | BSP (Business Solution Provider) für WhatsApp Business — **Master** der Vorlagen. Nie direkt mit Meta sprechen. | SYSTEM_ARCHITECTURE.md |
| `Vorlage` / `Template` | WhatsApp-Nachrichten-Vorlage (Body, Header, Footer, Buttons, Variablen). NICHT „Nachricht". | Superchat-API |
| `Mandant` / `Tenant` | Ein Kunde der Plattform (eigener PocketBase-`tenants`-Record). | VOE-240 |
| `Overlay` | Tenant-spezifische Anpassung einer Master-Vorlage (`template_overlays`). Master bleibt unberührt. | VOE-240 |
| `Anreicherung` | Von Völker gepflegte Zusatzfelder (Kategorie, Ordner, Buttons …), die das nackte Superchat-Template auslieferbar machen. | VOE-238 |
| `Master-Katalog` | Globaler kuratierter Vorlagen-Bestand (Superchat-Mirror + Anreicherung), gehört VÖLKER. | specs/VPS_PLATTFORM_KONZEPT.md |
| `Superuser` vs. `Admin` | `Superuser` = PocketBase-Instanz-Admin (`/_/`). `Admin` = users-Account mit `role=admin` (Kundenverwaltung in der App). | VOE-246 |
| `Quick-Reply` / `Schnellantwort` | Button-Typ. In der Kunden-UI immer deutsch („Schnellantwort"), nicht `quick_reply`. | VOE-243 |
