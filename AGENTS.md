# AGENTS.md — Codex-Einstieg (WhatsAppVorlagen SuperChat)

Portabler Einstieg für KI-Runtimes (Codex u. a.). Für Claude Code ist [CLAUDE.md](CLAUDE.md)
der aktive Einstieg; dieses Dokument ist die tool-neutrale Brücke.

## Pflichtlektüre vor jeder Arbeit
1. [CONVENTIONS.md](CONVENTIONS.md) — Runtime, Backlog-Adapter (Huly `VOR-`), Governance-Modus `lite`, aktive Gates
2. [CONTEXT.md](CONTEXT.md) — kanonisches Vokabular (Superchat, Vorlage, Mandant, Overlay …)
3. [ARCHITECTURE_DESIGN.md](ARCHITECTURE_DESIGN.md) — Hub mit Referenzen
4. [CLAUDE.md](CLAUDE.md) — Identität + Regeln (NIEMALS-Liste)

## Harte Regeln (aus CLAUDE.md)
- Kein Code ohne Huly-Issue (Workspace „VOELKER AI", Projekt `VOR`, Prefix `VOR-`).
- Issue nicht schließen ohne Git-Push + Changelog.
- Nie `.env`/API-Keys/Tokens committen oder loggen; Telefonnummern maskieren.
- Nie Vorlagen ohne Compliance-Check (Meta-Richtlinien) versenden.
- Nie direkt gegen die Meta WhatsApp Business API — immer via Superchat (BSP).
- Jede neue Datei sofort in [ARCHITECTURE_DESIGN.md §6](ARCHITECTURE_DESIGN.md) + [INDEX.md](INDEX.md) eintragen.

## Sprache & Stil
Deutsch, kurz und direkt. Bestehende Konventionen beibehalten, kein Over-Engineering, erst lesen dann ändern.

## Deploy
`git push origin main` → der VPS zieht via Cron (read-only Deploy-Key) und kopiert `webui/*`
nach `pb_public/`. Details: [deploy/vorlagen/README.md](deploy/vorlagen/README.md).
