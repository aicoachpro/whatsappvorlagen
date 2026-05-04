# Issue Writing Guidelines — WhatsAppVorlagen SuperChat

**Version:** 1.0
**Purpose:** Standardized issue creation for Claude + Operator collaboration

---

## Quick Reference

### Title Format
```
[Action] [Component] — [Detail/Benefit]
```

**Examples:**
- "Build Auth Service — JWT-based Session Management"
- "Add Rate Limiting to API Gateway"
- "Fix Memory Leak in Worker Process"
- "Epic: Data Pipeline Refactor (5 Components)"

### Description Structure
```
## Was
[What is being built/changed? Technical overview]

## Warum
[Why does this matter? Business value? Performance gain?]

## Kontext
[Related issues? Dependencies? Background?]

## Workflow-Type
`direct` (build immediately) or `epic` (multiple sub-tasks)

## Komplexität
`low`, `medium`, or `high`

## Abhängigkeiten
- Benötigt: [ISSUE-XX] (must be done first)
- Beeinflusst: [ISSUE-YY] (affected by this change)

## Akzeptanzkriterien
- [ ] Specific requirement 1
- [ ] Specific requirement 2
- [ ] Documentation updated (CLAUDE.md + SYSTEM_ARCHITECTURE.md)
- [ ] Git Push

## Agent Team Setup
**Team nötig:** Ja/Nein — [reason]
```

---

## Detailed Format

### 1. Title

**Structure:**
```
[Action] [Component] — [Key Benefit/Detail]
```

**Action Types:**
- **Build:** "Build [Component]"
- **Add:** "Add [Feature] to [Component]"
- **Integrate:** "Integrate [Source] with [Target]"
- **Optimize:** "Optimize [Component]"
- **Fix:** "Fix [Issue] in [Component]"
- **Epic:** "Epic: [Large Architectural Theme]"

---

### 2. "Was" Section

**What to include:**
- Technical implementation details
- Architecture decisions
- Component breakdown
- Code references (files/functions)
- Data structures (if relevant)

**Template:**
```markdown
## Was

[Describe what is being built]

**Architecture:**
[Diagram or bullet points showing flow]

**Components:**
1. [Component 1]: [Purpose]
2. [Component 2]: [Purpose]
3. [Component 3]: [Purpose]

**Key Implementation Details:**
* [Detail 1]
* [Detail 2]
```

---

### 3. "Warum" Section

**What to include:**
- Business value / core benefit
- Performance improvements (quantified if possible)
- Risk reduction
- Comparison to current state

**Template:**
```markdown
## Warum

* [Benefit 1]: [Quantified if possible]
* [Benefit 2]: [Quantified if possible]

Compared to current solution:
| Aspect | Today | With this change |
|--------|-------|-----------------|
| [Metric 1] | [Current] | [Improved] |
```

---

### 4. "Kontext" Section

**What to include:**
- Related issues / epics
- Dependencies (what must happen first?)
- Risk considerations

**Template:**
```markdown
## Kontext

**Related Issues:**
* Depends on: [ISSUE-X], [ISSUE-Y]
* Blocks: [ISSUE-Z]
* Epic: [ISSUE-Epic]

**Trigger:**
Implement when [condition]. Currently [current state].

**Risks & Mitigation:**
* Risk 1 → Mitigation 1
* Risk 2 → Mitigation 2

**Workflow-Type:** `direct`
**Komplexität:** `high`
```

---

### 5. Acceptance Criteria

**Format:**
```markdown
## Akzeptanzkriterien

- [ ] Specific, testable requirement 1
- [ ] Specific, testable requirement 2
- [ ] Specific, testable requirement 3
- [ ] Documentation updated (CLAUDE.md + SYSTEM_ARCHITECTURE.md)
- [ ] Git Push
- [ ] [Optional: testing period, e.g., "48h parallel operation"]
```

**Rules:**
- Each checkbox must be testable/verifiable
- No ambiguous requirements
- Always include documentation updates
- Always include git push as final step

---

### 6. Agent Team Setup

```markdown
## Agent Team Setup

**Team nötig:** Ja — [reason]

| Rolle | Aufgabe |
|-------|---------|
| **Lead (Implementer)** | [Main task] |
| **Architect** | [Architecture task, if needed] |
```

For solo stories:
```markdown
## Agent Team Setup

**Team nötig:** Nein — [reason]

| Rolle | Aufgabe |
|-------|---------|
| **Solo (Implementer)** | [Task] |
```

**When is a team needed?**
| Criterion | Result |
|-----------|--------|
| Multiple files/layers affected | → Team (+ Architect) |
| Blocks other issues | → Team (+ Architect) |
| Infrastructure changes (Docker, DNS, ports) | → Team (+ Cloud Engineer) |
| Security-relevant (auth, permissions) | → Team (+ Architect) |
| Single component with clear template | → Solo |
| Pure documentation/review | → Solo |

---

### 7. Metadata (Before Creating in Linear)

```
Priority: [1=Urgent, 2=High, 3=Medium, 4=Low]
Labels: [relevant tags, e.g., feature, bug, architecture, infra]
Estimate: [hours, or leave empty if uncertain]
State: [Backlog, Current Sprint, etc.]
```

---

## When Claude Creates an Issue

Always add at the top of the description:

```markdown
> 🤖 **Ideation Source:** Claude AI Agent
> Created during [context]
> Recommendation: [priority suggestion]
```

---

## Anti-Patterns

| Bad | Good |
|-----|------|
| "Improve the system" | "Optimize Worker Loop — Add Delta-Based Change Detection" |
| "Build something cool" | "- [ ] Feature X implemented and tested" |
| "Add new component" | "Depends on ISSUE-50. Blocked until database deployed." |
| "Make it faster" | "Reduce latency from 150ms to <100ms" |
| "This will be great!" | "Risk: Single point of failure. Mitigation: Graceful degradation." |

---

## Full Template for Claude-Generated Issues

```markdown
> 🤖 **Ideation Source:** Claude AI Agent
> Proposed during [context]
> Recommendation: [e.g., "After ISSUE-42"]

## Was

[Technical implementation]

## Warum

[Business value + quantified benefits]

## Kontext

[Dependencies, triggers, risks]

**Workflow-Type:** `direct`
**Komplexität:** `medium`

## Abhängigkeiten
- Benötigt: [ISSUE-XX, if any]
- Beeinflusst: [ISSUE-YY, if any]

## Akzeptanzkriterien
- [ ] Specific requirement 1
- [ ] Specific requirement 2
- [ ] Documentation updated (CLAUDE.md + SYSTEM_ARCHITECTURE.md)
- [ ] Git Push

**Priority:** [1-4]
**Labels:** [relevant tags]
**Estimate:** [hours or TBD]
**Depends on:** [ISSUE-X, if any]

## Agent Team Setup

**Team nötig:** [Ja/Nein] — [reason]

| Rolle | Aufgabe |
|-------|---------|
| **Lead (Implementer)** | [Main task] |
```

---

*Issue Writing Guidelines — WhatsAppVorlagen SuperChat | Based on OpenCLAW Governance Framework*
