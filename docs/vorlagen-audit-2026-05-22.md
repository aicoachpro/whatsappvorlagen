# WhatsApp-Vorlagen — Bestandsaudit

**Datum:** 2026-05-22
**Quelle:** Superchat Templates-API (`GET /v1.0/templates`)
**Umfang:** 277 Vorlagen analysiert · WABA `waba_AyZFyauEdUx0f5yQiOrjI`
**Erstellt von:** Claude AI Agent

---

## 1. Überblick

| Kennzahl | Wert |
|---|---|
| Vorlagen gesamt (bei Audit) | 277 |
| Status `approved` | 267 |
| Status `external_deleted` | 9 |
| Status `submitted` | 1 |
| Kategorie `marketing` | 258 |
| Kategorie `utility` | 16 |
| Kategorie leer | 3 |
| Ordner | 30 |
| Mit Variablen | 239 |
| Mit Buttons | 169 |
| 2026 erstellt | 233 von 277 |

**Stand nach Cleanup:** 9 `external_deleted`-Vorlagen wurden am 2026-05-22 per API gelöscht → aktuell **268 Vorlagen**.

---

## 2. Befunde

### Befund 1 — Kategorisierung überwiegend falsch → `VOE-213`

258 von 277 Vorlagen sind `marketing`, nur 16 `utility`, 3 ohne Kategorie. Ein großer Teil ist funktional transaktional (Terminbestätigung, Dokumentenversand, Zahlungsthemen, Schadenmeldung, Unterschriften) und gehört nach `utility`.

**Wirkung:** Marketing-Conversations sind bei Meta teurer, unterliegen Frequenzlimits pro Empfänger und setzen Marketing-Opt-in voraus. Transaktionsnachrichten als Marketing werden unnötig gedrosselt.

**Status:** 48 klare Utility-Kandidaten + 3 kategorielose Vorlagen in `VOE-213` gelistet. Größter Kosten-/Zustellbarkeits-Hebel.

### Befund 2 — Verwaiste Vorlagen → erledigt

9 Vorlagen mit Status `external_deleted` (auf Meta-Seite gelöscht, in Superchat verwaist): 4× TKV, 5× #9 AI Solutions.

**Status:** Am 2026-05-22 per API gelöscht. ✅

### Befund 3 — Ordner-Inkonsistenz Superchat ↔ Notion → `VOE-214`

Superchat hat 30 Ordner, die Notion-DB `Whatsapp Vorlagen autoabgleich` kennt nur 18 — teils mit abweichender Schreibweise. 5 Vorlagen ohne Ordner.

**Wirkung:** Blockiert einen sauberen Phase-1-Mirror (Superchat → Notion) — Vorlagen aus unbekannten Ordnern landen falsch.

### Befund 4 — Dubletten, Tippfehler & überlange Texte → `VOE-215`

- `Wilkommen Firma` vs `Willkommen Firma` — identischer Text, Tippfehler
- `1 Angebot Sie Leads Trustpilote` vs `… Trustpilot` — identischer Text, Tippfehler
- `KuKoMa nicht gewünscht Sie Aue` vs `… Oelsnitz` — identischer Text, nur Standort → Kandidat für eine Vorlage mit Orts-Variable
- `Warten auf Rückmeldung` — Body ist nur `🤔`, wirkt unfertig
- Namen mit angehängten Leerzeichen, uneinheitliche Groß-/Kleinschreibung
- 42 Vorlagen mit Body > 700 Zeichen — Engagement-Risiko

### Befund 5 — Sie/Du-Verdopplung → `VOE-216`

~84 Namensgruppen existieren als getrennte Sie- und Du-Variante. Verdoppelt den Pflegebestand — jede Textänderung doppelt + doppeltes Meta-Review. Bewusste Geschäftsentscheidung, aber Wartungsmultiplikator.

### Befund 6 — Analytics-API gesperrt → `VOE-217`

`GET /v1.0/analytics/templates` liefert **HTTP 403** (*„Ihr Arbeitsbereich darf diese öffentliche API-Funktion nicht verwenden"*). Nutzungszahlen pro Vorlage sind dadurch **nicht über die API abrufbar** — nur über die Superchat-Weboberfläche.

**Folge:** „Welche Vorlagen wurden 2026 genutzt?" konnte nicht automatisiert beantwortet werden.

---

## 3. Linear-Issues

| Issue | Thema | Priorität |
|---|---|---|
| VOE-213 | Kategorie-Korrektur (48 Utility-Kandidaten) + Cleanup verwaiste Vorlagen | Hoch |
| VOE-214 | Ordner-Mapping Superchat ↔ Notion | Hoch |
| VOE-215 | Vorlagen-Qualität: Dubletten, Tippfehler, überlange Texte | Mittel |
| VOE-216 | Sie/Du-Verdopplung bewerten | Niedrig |
| VOE-217 | Superchat Analytics-API freischalten | Mittel |

---

## 4. Methodik & API-Notizen

- **Bestandsabzug:** `GET /v1.0/templates`, cursor-paginiert (`?after=`), 50 pro Page.
- **Analytics:** `GET /v1.0/analytics/templates` — für den Workspace **gesperrt (403)**. Bekannte Einschränkung.
- **Löschung:** `DELETE /v1.0/templates/{id}`, Auth `X-API-Key`.
- **Kategorie-Änderung:** Template-Update über die Superchat-API; löst bei Meta ein Re-Review aus. Meta entscheidet final über die Kategorie und kann die Anforderung überschreiben.
- Vorlagen-Name ist nach Submission gesperrt.
