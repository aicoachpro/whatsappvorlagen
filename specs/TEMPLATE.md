# {VOE-XXX} — {Titel}

> Spec vor Code (CLAUDE.md Regel 1). Pre-Flight: [ARCHITECTURE_DESIGN.md](../ARCHITECTURE_DESIGN.md),
> [CONVENTIONS.md](../CONVENTIONS.md), [CONTEXT.md](../CONTEXT.md) gelesen.

## Intent
Was soll der Kunde/Operator danach können? (messbares Outcome, kein Implementierungsdetail)

## Kontext
- Linear-Issue: VOE-XXX (Label `wavs`)
- Betroffene Komponenten: …
- Bezug zu Master-Katalog / Overlay / Tenancy / Compliance: …

## Akzeptanzkriterien
- [ ] …
- [ ] …

## Architektur-Dimensionen (relevant)
Reliability · Data Integrity · Security · Performance · Observability · Maintainability · **Compliance** — die zutreffenden markieren + Auswirkung notieren.

## Umsetzung
1. …

## Definition of Done
- [ ] Lokale Prüfung grün (Sync/Test/Build wo zutreffend)
- [ ] Kein Secret im Code/Chat; sensible Daten maskiert
- [ ] Compliance-Check (Meta/DSGVO) falls versand-/template-relevant
- [ ] Git push + CHANGELOG-Eintrag
- [ ] Neue Dateien in ARCHITECTURE_DESIGN.md §6 + INDEX.md eingetragen
- [ ] Linear-Issue auf „Done"

## Session-Referenz
<!-- /implement trägt hier Session-Infos für Audit-Rekonstruktion ein -->
- Datum: …
- Commits: …
