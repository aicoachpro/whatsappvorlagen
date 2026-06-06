# Skills — WhatsAppVorlagen SuperChat

## Status

Auf dieser Maschine sind die OpenCLAW-Skills (außer `bootstrap`) **nicht global** unter
`/Users/togglodyte/.claude/skills/` installiert. Sie müssen separat besorgt werden.

## Empfohlenes Standard-Set (Phase 2 des Bootstraps)

- `ideation`
- `implement`
- `backlog`
- `architecture-review`
- `sprint-review`
- `research`

## Installation

**Option A — Symlinks** (wenn Skills global liegen):
```bash
cd /Users/togglodyte/developer/whatsappvorlagen
ln -s /Users/togglodyte/.claude/skills/ideation .claude/skills/ideation
ln -s /Users/togglodyte/.claude/skills/implement .claude/skills/implement
ln -s /Users/togglodyte/.claude/skills/backlog .claude/skills/backlog
ln -s /Users/togglodyte/.claude/skills/architecture-review .claude/skills/architecture-review
ln -s /Users/togglodyte/.claude/skills/sprint-review .claude/skills/sprint-review
ln -s /Users/togglodyte/.claude/skills/research .claude/skills/research
```

**Option B — Aus dem OpenCLAW-Repo klonen**:
```bash
git clone https://github.com/vibercoder79/openclaw_trading /tmp/openclaw_skills
cp -r /tmp/openclaw_skills/.claude/skills/{ideation,implement,backlog,architecture-review,sprint-review,research} \
      /Users/togglodyte/developer/whatsappvorlagen/.claude/skills/
```

## Nach der Installation: Anpassungen für dieses Projekt

| Datei | Anpassen |
|-------|----------|
| `ideation/references/architecture-dimensions.md` | Compliance-Dimension ergänzen (Meta WhatsApp + DSGVO) |
| `ideation/references/story-template-feature.md` | Sektionen für WhatsApp-Templates / PocketBase-Sync |
| `implement/references/change-checklist.md` | Compliance-Pre-Send-Check |
| `backlog/SKILL.md` | Linear Team `wav`, Prefix `WAVS-` |
