# WhatsAppVorlagen SuperChat — Security

**Version:** 1.0.0 | **Stand:** 2026-05-04

## API Key Policy

| Schlüssel | Speicherort | Niemals |
|-----------|-------------|---------|
| `LINEAR_API_KEY` | `.env` (lokal) | im Chat, Logs, Git |
| `SUPERCHAT_API_KEY` | `.env` (lokal) | im Chat, Logs, Git |
| `SUPERCHAT_ENC_KEY` | Server-Env (VPS) | im Chat, Logs, Git, DB |
| `SUPERCHAT_INBOX_ID` | `.env` (lokal, nicht-secret aber privat) | im Chat, Logs, Git |
| `TELEGRAM_BOT_TOKEN` | `.env` (lokal, optional) | im Chat, Logs, Git |

- `.env` ist via `.gitignore` ausgeschlossen.
- `.env.example` enthält **nur Variablen-Namen**, niemals echte Werte.

## Threat Model (Initial)

| Bedrohung | Asset | Mitigation |
|-----------|-------|------------|
| Token-Leak (Superchat / Kunden-Keys) | API-Credentials | Env-only, Logs-Sanitizer, Kunden-Keys AES-256-GCM (`SUPERCHAT_ENC_KEY`), Rotation |
| Versehentliches Versenden | Empfänger-PII | Dry-Run-Modus default, Approval vor Production-Send |
| DSGVO-Verstoß | Empfänger-Telefonnummern | Nur verschlüsselt gespeichert, Maskierung in Logs |
| Meta Policy Violation | WhatsApp Business Account | Pre-Send Compliance-Check (Template-Kategorie + Inhalt) |

## Logs-Sanitizer

Vor Implementierung **muss** ein Log-Wrapper existieren, der:
- Tokens vollständig maskiert (`***`)
- Telefonnummern bis auf die letzten 4 Stellen maskiert
- Empfänger-Inhalt nur in DEBUG-Mode loggt

## Incident Response

[TBD — wird mit erstem Production-Deploy ergänzt.]

## Audit-Log

Jede Änderung am Vorlagen-Bestand muss in `journal/audit.log` (append-only) geloggt werden:
- Timestamp (ISO 8601)
- Actor (system/user-id)
- Aktion (create/update/delete/send)
- Template-ID
- Vorher/Nachher-Diff
