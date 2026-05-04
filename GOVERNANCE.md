# Governance Blueprint — AI-Driven Development Lifecycle

**Version:** 1.0.0 | **Stand:** 2026-05-04
**Projekt:** WhatsAppVorlagen SuperChat
**Zweck:** Vollstaendige Beschreibung des Governance-Setups, sodass dieses Framework auf ein beliebiges neues Projekt uebertragen werden kann.

> **Anweisung an Claude:** Dieses Dokument beschreibt exakt, wie ein AI-gesteuerter Development Lifecycle aufgebaut ist. Wenn du den Auftrag bekommst "Baue dieses Governance-Setup auf", lies dieses Dokument komplett und setze es Schritt fuer Schritt um. Du wirst vom Operator die projektspezifischen Informationen (Repository-URL, Linear-Workspace, Obsidian-Vault-Pfad etc.) erhalten.

---

## Inhaltsverzeichnis

1. [Uebersicht: Was dieses Framework leistet](#1-uebersicht)
2. [Dokumentations-Architektur](#2-dokumentations-architektur)
3. [Story-Governance](#3-story-governance)
4. [Development Lifecycle](#4-development-lifecycle)
5. [Auto-Healing & Documentation Sync](#5-auto-healing--documentation-sync)
6. [Unverbruechliche Regeln](#6-unverbruechliche-regeln)
7. [Skills-Uebersicht](#7-skills-uebersicht)
8. [Setup-Anleitung fuer neue Projekte](#8-setup-anleitung-fuer-neue-projekte)

---

## 1. Uebersicht

Dieses Framework verbindet vier Plattformen zu einem durchgaengigen Development Lifecycle:

| Plattform | Rolle |
|-----------|-------|
| **Linear** | Backlog, Sprint Planning, Issue Tracking — jede Arbeit beginnt mit einem Issue |
| **GitHub** | Code Repository, Versionierung — kein Code ohne Commit + Push |
| **Obsidian** | Dokumentation, Change-Log, Wissensmanagement — externe Wissensbasis |
| **Telegram** (optional) | Operator-Kommunikation, Alerts, System-Notifications |

### Kernprinzipien

1. **Kein Code ohne Issue.** Jede Aenderung wird durch ein Linear-Issue autorisiert.
2. **Kein Issue ohne Struktur.** Jede Story folgt einem definierten Template mit Pflicht-Sektionen.
3. **Keine Aenderung ohne Dokumentation.** Jede Code-Aenderung zieht Doku-Updates nach sich.
4. **Single Source of Truth.** `config.js → VERSION` steuert alle Versions-Nummern zentral.
5. **Automatische Ueberwachung.** Self-Healing Agent prueft alle 15 Min, ob Doku und Code synchron sind.
6. **Reproduzierbarkeit.** Jeder Prozess ist als Skill codiert und wiederholbar — manuell oder automatisch.

---

## 2. Dokumentations-Architektur

### 2.1 Die registrierten Dokumentationsdateien

Alle Dokumentationsdateien werden zentral in `config.js` im `DOC_FILES`-Objekt registriert. Jede Datei hat ein `versionPattern` (Regex), ueber das der Self-Healing Agent die aktuelle Version extrahiert und gegen `config.js VERSION` abgleicht.

```javascript
// lib/config.js — SSoT fuer Versionierung
const VERSION = 'X.Y.Z';

const DOC_FILES = {
  'DATEINAME.md': {
    path: 'DATEINAME.md',
    versionPattern: /\*\*Version:\*\*\s*([\d.]+)/
  },
  // ... weitere Dateien
};
```

**Minimum Viable Set (ab Tag 1):**

| Datei | Pflicht? | Warum |
|-------|:--------:|-------|
| `CLAUDE.md` | Ja | AI-Operator braucht Identitaet + Regeln |
| `SYSTEM_ARCHITECTURE.md` | Ja | Architektur muss dokumentiert sein bevor Code geschrieben wird |
| `COMPONENT_INVENTORY.md` | Ja | Self-Healing braucht Inventar zum Abgleich |
| `DEVELOPMENT_PROCESS.md` | Ja | Prozesse muessen definiert sein bevor Arbeit beginnt |
| `GOVERNANCE.md` | Ja | Dieses Dokument — Framework-Blueprint |

### 2.2 Wo wird WAS dokumentiert?

| Aspekt | Datei | Beispiel-Inhalt |
|--------|-------|-----------------|
| **Was das System IST** | `SYSTEM_ARCHITECTURE.md` | Komponenten, Datenfluss |
| **Was das System KANN** | `CLAUDE.md` | Faehigkeiten, Config-Werte, Regeln fuer Runtime |
| **WIE entwickelt wird** | `DEVELOPMENT_PROCESS.md` | Workflows, Skills, Checklisten |
| **WIE Governance funktioniert** | `GOVERNANCE.md` (dieses Dokument) | Blueprint fuer das gesamte Framework |
| **Security-Regeln** | `SECURITY.md` | Threat Model, Checklisten, Incident Response |
| **Alle Komponenten** | `COMPONENT_INVENTORY.md` | Datei-Inventar, wird automatisch gegen Filesystem geprueft |
| **Aenderungshistorie** | `CHANGELOG.md` + Obsidian | Was wurde wann geaendert |

### 2.3 Referenz-Dateien (nicht versioniert, aber essentiell)

Diese Dateien liegen unter `.claude/` und steuern die Qualitaet von Stories und Reviews:

| Datei | Pfad | Zweck |
|-------|------|-------|
| Issue Writing Guidelines | `.claude/ISSUE_WRITING_GUIDELINES.md` | Story-Format, Checkliste, Anti-Patterns |
| Feature-Template | `.claude/skills/ideation/references/story-template-feature.md` | Template fuer Features |
| Fix-Template | `.claude/skills/ideation/references/story-template-fix.md` | Template fuer Fixes |
| Architektur-Dimensionen | `.claude/skills/ideation/references/architecture-dimensions.md` | Quality-Dimensionen |
| Change-Checklist | `.claude/skills/implement/references/change-checklist.md` | Pflicht-Checkliste nach Code-Aenderung |

---

## 3. Story-Governance

### 3.1 Titel-Format

```
[Action] [Component] — [Detail/Benefit]
```

**Action Types:** Build, Add, Integrate, Optimize, Fix, Epic

### 3.2 Pflicht-Struktur (alle Story-Typen)

```markdown
## Was
[Was wird gebaut/geaendert? Technische Uebersicht, Architektur, Komponenten]

## Warum
[Business Value, Performance-Gewinn, Risiko-Reduktion, quantifiziert wenn moeglich]

## Kontext
[Related Issues, Dependencies, Trigger, Risiken + Mitigation]

## Workflow-Type
`direct` (sofort bauen) oder `epic` (mehrere Sub-Tasks)

## Komplexitaet
`low`, `medium` oder `high`

## Abhaengigkeiten
- Benoetigt: [ISSUE-XX] (muessen vorher fertig sein)
- Beeinflusst: [ISSUE-YY] (werden durch diese Story veraendert)

## Akzeptanzkriterien
- [ ] Spezifische, testbare Anforderung 1
- [ ] Spezifische, testbare Anforderung 2
- [ ] Dokumentation aktualisiert (CLAUDE.md + SYSTEM_ARCHITECTURE.md)
- [ ] Git Push
```

**Ohne "Abhaengigkeiten" wird keine Story akzeptiert.** Sie ist essentiell fuer die Dependency-Analyse.

### 3.2.1 Pflicht-Sektion: Agent Team Setup

Jede Story MUSS am Ende einen `## Agent Team Setup` Abschnitt enthalten:

**Entscheidungslogik:**

| Kriterium | Ergebnis |
|-----------|----------|
| Mehrere Dateien/Layer betroffen | → Team (+ Architect) |
| Blockt andere Issues | → Team (+ Architect) |
| Infrastruktur-Aenderungen (Docker, Cron, Ports, DNS) | → Team (+ Cloud Engineer) |
| Security-relevant (API Keys, Auth, Permissions) | → Team (+ Architect) |
| Einzelner Bereich mit klarer Vorlage | → Solo |
| Reine Dokumentation/Review | → Solo |

**Format:**
```markdown
## Agent Team Setup

**Team noetig:** Ja/Nein — [Einzeiler-Begruendung]

| Rolle | Aufgabe |
|-------|---------|
| **Lead (Implementer)** | [Hauptaufgabe] |
| **Architect** | [Architektur-Aufgabe, falls noetig] |
```

### 3.3 Zwei Templates

#### Feature (Pflicht-Sektionen)

1. APIs & Datenquellen — Endpunkte, Auth, Rate Limits, Kosten
2. Code-Beispiele — Konkrete Funktionen im Projekt-Stil, Error Handling
3. Architektur-Integration — ASCII-Diagramm: Input → Komponente → Output → Konsumenten
4. Phasen-Plan — Schrittweise Implementierung
5. Abhaengigkeiten + Akzeptanzkriterien
6. Agent Team Setup

#### Fix/Refactoring (Pflicht-Sektionen)

1. Problem-Beschreibung — Was ist kaputt? Wie aeussert sich das?
2. Betroffene Dateien
3. Loesung — Konkreter Fix-Ansatz
4. Abhaengigkeiten + Akzeptanzkriterien
5. Agent Team Setup

### 3.4 Metadata (vor Erstellung in Linear)

```
Priority: [1=Urgent, 2=High, 3=Medium, 4=Low]
Labels: [projektspezifische Tags, z.B. architecture, feature, bug]
Estimate: [Stunden, oder leer wenn unklar]
State: [Backlog, Current Sprint, etc.]
```

### 3.5 AI-generierte Issues

Wenn Claude ein Issue erstellt, IMMER am Anfang der Description:

```markdown
> 🤖 **Ideation Source:** Claude AI Agent
> Created during [Kontext der Erstellung]
> Recommendation: [Prioritaetsempfehlung]
```

### 3.6 Anti-Patterns

| Schlecht | Gut |
|----------|-----|
| "Improve System" | "Optimize Supervisor Loop — Add Delta-Based Change Detection" |
| "Build something cool" | "- [ ] Feature X implementiert + getestet" |
| "Add new component" | "Depends on ISSUE-50. Blocked until dependency deployed." |
| "Make it faster" | "Reduce latency from 150ms to <100ms" |

### 3.7 Sprint-Sizing & Kapazitaet

Da dieses Setup oft ein **Ein-Personen-Dev-Team mit AI-Unterstuetzung** ist, gelten folgende Limits:

| Parameter | Wert | Begruendung |
|-----------|------|-------------|
| **Sprint-Laenge** | 1 Woche | Kurze Feedback-Loops, schnelle Kurskorrektur |
| **Max Stories/Sprint** | 3–4 | Mehr fuehrt zu Context-Switching und Completion-Verlust |
| **Max WIP** | 2 gleichzeitig | >2 parallele Stories senken Produktivitaet |
| **Buffer-Slot** | 1 Story | Fuer ungeplante Arbeit (Bugs, Infra, Hotfixes) freihalten |
| **Max Story-Groesse** | 5 Story Points | Groessere Stories MUESSEN vor Sprint-Aufnahme gesplittet werden |

### 3.8 Architektur-Dimensionen (Quality Gate)

| # | Dimension | Kernfragen |
|---|-----------|------------|
| 1 | **Reliability** | Graceful Degradation? Self-Healing noetig? Kill-Switch vorhanden? |
| 2 | **Data Integrity** | SSoT eingehalten? Kein Dual-Write? Atomic Writes? Race Conditions? |
| 3 | **Security** | API-Keys in .env? Inputs validiert? Tokens in Logs sanitized? |
| 4 | **Performance** | Latenz akzeptabel? Rate Limits eingehalten? Memory stabil? |
| 5 | **Observability** | Logging implementiert? Alerts konfiguriert? |
| 6 | **Maintainability** | Keine Code-Duplikation? Config SSoT? Doku aktuell? |
| 7 | **Cost Efficiency** | API-Kosten kalkuliert? Guenstigere Alternative? |
| 8 | **Domain Quality** | Verbessert Kern-Qualitaet (z.B. Signal-Qualitaet, Data-Accuracy)? |

---

## 4. Development Lifecycle

### 4.1 Der komplette Lifecycle

```
Idee → /ideation → Linear Issue → /backlog → Priorisierung → /implement → Code + Doku → Git Push → Done
                                                                               ↑
                                                                    /architecture-review
                                                                    (ad-hoc oder bei Bedarf)

Periodisch: /sprint-review (quartalsweise)
Jederzeit:  /research (fuer externe Recherchen)
```

### 4.2 Ideation-Prozess (/ideation)

**Trigger:** Operator hat eine Idee → `/ideation`

| Schritt | Aktion | Output |
|---------|--------|--------|
| 1 | **Research** (falls noetig) | Technische Machbarkeit, API-Verfuegbarkeit, Kosten |
| 2 | **Kontext laden** (parallel) | Backlog + Architektur + Config einlesen, Duplikat-Check |
| 3 | **ADD erstellen** (Architecture Design Document) | Layer-Analyse, Komponenten, 8-Dimensionen-Bewertung, Risiken |
| 4 | **Story entwerfen** (ADD + Template) | Draft mit allen Pflicht-Sektionen + ADD als Anhang |
| 5 | **Draft praesentieren** ← HUMAN-IN-THE-LOOP | Operator prueft, gibt OK oder Aenderungen |
| 6 | **Linear Issue erstellen** | Issue + ADD-Kommentar angelegt, betroffene Issues aktualisiert |

### 4.3 Implementierungs-Prozess (/implement)

**Trigger:** Operator sagt "los" oder "Hol dir ISSUE-XX" → `/implement`

| Schritt | Aktion | Details |
|---------|--------|---------|
| 1 | **Issue identifizieren** | Linear Issue laden, Description lesen, Pflicht-Sektionen pruefen |
| 2 | **Abhaengigkeiten pruefen** | Benoetigt-Issues done? Beeinflusst-Issues notieren |
| 3 | **Context sammeln** (parallel) | Betroffene Dateien, CLAUDE.md, SYSTEM_ARCHITECTURE.md, config.js |
| 4 | **Plan + Approval** ← HUMAN-IN-THE-LOOP | Dateiliste, Aenderungen, Risiken |
| 5 | **Implementieren** | Code, Doku-Update, Change-Checklist, Git Commit + Push |
| 6 | **Validation** | Syntax, Akzeptanzkriterien, Smoke Test → PASS/FAIL |
| 7 | **Backlog aktualisieren** | Issue → Done + Kommentar, Obsidian Change-Log |
| 8 | **Ergebnis-Tabelle ausgeben** | Was wurde implementiert (Datei/Komponente), Status, Bemerkungen |

### 4.4 Automatischer Prozess (Daemon, optional)

**Trigger:** Linear Issue auf "In Progress" → Webhook → Automation Queue → Daemon

Der Daemon nutzt denselben Flow wie `/implement`, aber **ueberspringt Schritt 4** (Operator-Approval).

### 4.5 Git-Workflow

```
1. Branch erstellen:    feature/{issue-id}-{slug}
2. Implementieren:      Auf Branch arbeiten
3. Commit:              "v{VERSION} — {ISSUE-ID}: {Titel}"
4. Push:                git push -u origin "feature/..."
5. Merge:               Feature-Branch → main
```

### 4.6 Aenderungs-Checkliste (PFLICHT nach jeder Code-Aenderung)

- [ ] **Dokumentation aktualisieren** — Alle DOC_FILES auf aktuelle VERSION bringen
- [ ] **Git Commit + Push** — Code UND Doku gemeinsam committen
- [ ] **Obsidian Change-Log** — Eintrag mit Datum, Version, Beschreibung

**Bei neuer API-Integration:**
- [ ] API Key in `.env` + `.env.example` — **NIEMALS im Chat mitteilen**
- [ ] Rate Limiting implementieren
- [ ] Error-Logging: Keys sanitizen
- [ ] Timeout setzen (max 15s)
- [ ] Fallback bei API-Ausfall
- [ ] `API_INVENTORY.md` aktualisieren (falls vorhanden)

### 4.7 Maschinelle Enforcement-Hooks (empfohlen)

Git PreToolUse-Hooks erzwingen Governance-Regeln automatisch:

| Hook | Erzwingt |
|------|----------|
| `spec-gate.sh` | Spec-File muss existieren bevor Code committed wird |
| `weights-gate.sh` | Gewichte-Summe muss exakt 1.00 sein (domain-spezifisch) |

Diese Hooks liegen unter `.claude/hooks/` und werden in Claude Code settings.json registriert.

### 4.8 Handoff-Prozess (Entwickler → Operator)

```
Entwickler (Claude Code)          Operator (Mensch)           AI-Operator (Runtime)
    │                                  │                            │
    ├── 1. Code committen              │                            │
    ├── 2. CLAUDE.md updaten           │                            │
    │      (PFLICHT!)                  │                            │
    ├── 3. Operator informieren: ──────▶                            │
    │   "Feature X fertig"             │                            │
    │                                  ├── 4. AI-Operator ─────────▶│
    │                                  │   anweisen: "Lies           │
    │                                  │   CLAUDE.md nochmal"        │
    │                                  │                             ├── 5. Neue
    │                                  │                             │   Faehigkeiten
    │                                  │                             │   verstanden
```

---

## 5. Auto-Healing & Documentation Sync

### 5.1 Prinzip

Die `config.js → VERSION` ist die **Single Source of Truth**. Alle Dokumentationsdateien muessen dieselbe Version tragen. Ein Self-Healing Agent prueft das automatisch.

### 5.2 Check M — Versions-Sync (alle 15 Minuten)

```
Self-Healing Agent laeuft (Cron, alle 15 Min)
    │
    ├── M0: config.js lesbar + VERSION definiert?
    │
    ├── M1: Fuer jede Datei in DOC_FILES:
    │       → Version per Regex extrahieren
    │       → Vergleich gegen config.js VERSION
    │       → Bei Mismatch: Alert + Auto-Sync
    │
    └── M2: Komponenten-Count in Doku = aktive Dateien auf Filesystem?
            → Warning wenn unterschiedlich
```

### 5.3 Doc-Sync Module (lib/doc-sync.js)

Spiegelt Quell-Dokumentation ins Obsidian Vault:

1. Liest alle DOC_FILES
2. Ersetzt alte Version durch aktuelle in allen Dateien
3. Optional: Spiegelt ins Obsidian Vault (Frontmatter-Injection, Wikilinks)
4. Erstellt timestamped Changelog-Eintrag

### 5.4 Workflow: Version erhoehen

```
1. config.js: VERSION = 'X.Y.Z'  (erhoehen)
2. Self-Healing laeuft (oder manuell: node agents/self-healing.js)
3. Check M erkennt Mismatch in allen Dateien
4. lib/doc-sync.js: Ersetzt alte Version → neue Version in ALLEN Dateien
5. Git Commit + Push
```

---

## 6. Unverbruechliche Regeln

| # | Regel | Begruendung |
|---|-------|-------------|
| 1 | **NIEMALS einen Plan umsetzen ohne Issue.** | Jede Arbeit muss trackbar sein |
| 2 | **NIEMALS ein Issue schliessen ohne Change-Log.** | Aenderungshistorie muss lueckenlos sein |
| 3 | **NIEMALS Code aendern ohne vorherige Rueckfrage beim Operator.** | Human-in-the-Loop fuer Risiko-Kontrolle |
| 4 | **NIEMALS eine Umsetzung als abgeschlossen melden ohne Git-Push.** | Code muss immer im Remote-Repository sein |
| 5 | **NIEMALS ein Operator-Briefing kuerzen oder umformulieren beim Eintragen in Linear.** | Originaltext ist die Wahrheit |
| 6 | **NIEMALS ein Issue ohne Labels anlegen.** | Labels sind essentiell fuer Filterung |
| 7 | **NIEMALS einen Sub-Task direkt von Backlog → Done setzen.** | IMMER zuerst "In Progress" |
| 8 | **NIEMALS eine neue API-Integration ohne API-Inventar-Update.** | Alle externen Abhaengigkeiten muessen dokumentiert sein |

---

## 7. Skills-Uebersicht

Skills sind codierte, wiederholbare Workflows, gespeichert unter `.claude/skills/`. Jeder Skill hat:
- Eine `SKILL.md` mit Frontmatter (Name, Description, Version) und Workflow-Beschreibung
- Einen `references/`-Ordner mit Templates und Checklisten

### 7.1 Die Core Skills

| Skill | Trigger | Output | HitL? |
|-------|---------|--------|:-----:|
| `/ideation` | "Ich hab eine Idee" | Linear Issue + ADD | Ja |
| `/implement` | "los", "Hol dir ISSUE-XX" | Code + Doku + Push | Ja |
| `/backlog` | "Was steht an?" | Priorisierte Issue-Liste | Nein |
| `/architecture-review` | "Architektur pruefen" | 8-Dimensionen-Report | Nein |
| `/sprint-review` | "Sprint Review" | Komplett-Audit-Report | Nein |
| `/research` | "recherchiere" | Quellengestuetzte Ergebnisse | Nein |
| `/bootstrap` | "neues Projekt" | Vollstaendiges Governance-Setup | Ja |

### 7.2 Skill-Architektur

```
.claude/skills/
├── ideation/
│   ├── SKILL.md
│   └── references/
│       ├── story-template-feature.md
│       ├── story-template-fix.md
│       └── architecture-dimensions.md
│
├── implement/
│   ├── SKILL.md
│   └── references/
│       └── change-checklist.md
│
├── backlog/
│   └── SKILL.md
│
├── architecture-review/
│   └── SKILL.md
│
├── sprint-review/
│   └── SKILL.md
│
├── research/
│   └── SKILL.md
│
└── bootstrap/
    ├── SKILL.md
    └── references/
        ├── info-gathering.md
        ├── file-templates.md
        ├── skills-setup.md
        ├── governance-template.md      ← dieses Dokument als Template
        ├── self-healing-template.js    ← Self-Healing Starter
        ├── doc-sync-template.js        ← Doc-Sync Starter
        ├── issue-writing-guidelines-template.md
        └── global-registry-update.md
```

---

## 8. Setup-Anleitung fuer neue Projekte

### 8.1 Was du vom Operator brauchst

| Information | Beispiel | Wofuer |
|-------------|----------|--------|
| **GitHub Repository URL** | `github.com/org/project` | Code + Versionierung |
| **Linear Workspace** | `myteam` | Issue Tracking |
| **Obsidian Vault Pfad** | `/path/to/vault` | Dokumentations-Sync |
| **Projektname** | `MyProject` | Prefixes, Identitaet |
| **Issue-Prefix** | `PROJ-` | Issue-Nummern (z.B. PROJ-42) |
| **Start-Version** | `1.0.0` | config.js VERSION |
| **Projekt-Beschreibung** | "Ein System fuer..." | CLAUDE.md Identitaet |
| **Architektur-Dimensionen** | Welche der 8 sind relevant? | Quality Gates |
| **Telegram Bot Token** (optional) | `bot123:ABC...` | Alerts + Notifications |

### 8.2 Schritt-fuer-Schritt Setup

Verwende `/bootstrap` — der Skill fuehrt durch alle 5 Phasen:

1. **Phase 0:** Info-Gathering (alle Projekt-Infos sammeln)
2. **Phase 1:** Grundstruktur (Verzeichnisse, Git, Kern-Dateien)
3. **Phase 2:** Skills installieren (Symlinks oder Kopien)
4. **Phase 3:** Self-Healing + Doc-Sync einrichten
5. **Phase 4:** Automation Daemon (optional)
6. **Phase 5:** Global Registry aktualisieren

### 8.3 Technische Details

**Automation Daemon:** Benoetigt `CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC=1` in `.env` (verhindert nested session Fehler).

**Linear Webhook:** Settings → API → Webhooks, Events: "Issue updated", Secret als `LINEAR_WEBHOOK_SECRET` in `.env`.

**Spec-Gate Hook:** `.claude/hooks/spec-gate.sh` blockiert `git commit` wenn kein Spec-File existiert. In `settings.json` unter `hooks.PreToolUse` registrieren.

---

*Dieses Dokument ist Teil des OpenCLAW Governance Framework — open-source unter MIT License.*
*Source: github.com/vibercoder79/openclaw_trading*
