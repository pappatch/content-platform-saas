# Skill: /doc-sync

Synchronise all project documentation to reflect the current state of the codebase.
Run after any task that adds routes, models, services, workers, settings, or components.

Invoke with: `/doc-sync` (full sync) or `/doc-sync [scope]` where scope is one of:
`claude`, `review`, `architecture`, `commands`, `all` (default).

---

## Step 1 — Audit what changed

Before syncing, establish what actually changed since the last commit:

```bash
git diff --name-only HEAD      # uncommitted changes
git log --oneline -3           # recent commits for context
```

Use this to decide which doc sections need updating. Proceed only for sections affected by real changes.

## Step 2 — Sync CLAUDE.md

Read the current CLAUDE.md fully, then update these sections:

### ✅ Completed
- For every feature built in this session that is not yet in Completed, add a one-line bullet.
- Format: `- **[Feature name]** ([date if significant]): [what it does, files changed]`
- Move any corresponding item from Next Steps to Completed.

### Architecture sections
- **Backend routes** — add any new `GET|POST|PATCH|DELETE` route with its path, auth level, and brief purpose.
- **Services** — add any new service file with its responsibility.
- **Workers** — add any new background worker with its interval and trigger.
- **Data Model** — add new ORM models; update field lists for changed models.
- **PlatformSettings** — update the key list and count if new settings were seeded.

### API Reference
- Add new routes in the correct section (auth / sites / cms / scraper / public / trends / settings / admin).
- Update changed route signatures (new query params, changed response schema).

### Next Steps
- Remove completed items.
- Add any new follow-up work identified during the session.
- Keep items in priority order.

### Last Session Summary
Update to reflect today:
```
**Date:** [today's date]

### What was built this session
| Feature | Files changed | Status |
|---------|--------------|--------|
| [feature] | [files] | ✅ Done |

### Current known issues / state
- [any open bugs, zero-state notes, or deferred items]

### Exact next steps to continue from
1. [most important next action]
2. [second action]
...
```

## Step 3 — Update REVIEW.md

Append a new section at the bottom:

```markdown
## Session Audit — [YYYY-MM-DD]

**Scope:** [what was built]

### Security Review

[For each new route: auth check verdict]
[For each new service: API key safety, error handling, injection risk]
[If nothing new: "No new routes or external services added — no security review required."]

### Code Quality Observations

[Any Q## numbered findings. If none: "No new findings."]

### Updated Overall Assessment

**Rating: GOOD with well-understood gaps**
[One sentence summary. List outstanding production blockers if unchanged.]
```

## Step 4 — Update Architecture.jsx

Open `frontend/src/apps/admin/Architecture.jsx` and make targeted edits for each change type:

| What changed | Where to update in Architecture.jsx |
|-------------|--------------------------------------|
| New route added | `ArchTab` → Backend layer routes list |
| Route removed or renamed | Same — update or remove the route line |
| New service file | `ArchTab` → Services section |
| New background worker | `ArchTab` → Workers section; update Workers stat in `StatsBar` |
| New ORM model | `ArchTab` → Database layer model cards |
| New PlatformSetting key | `ArchTab` → Platform Settings grid; update count label and `StatsBar` Settings value |
| New external API | `ArchTab` → External Services layer |
| New security control | `ArchTab` → Security Layer card; add to `STEP_DETAILS` in FlowTab |
| New flow step | `FlowTab` → add `FlowStep` node with `STEP_DETAILS` entry |
| New stat to track | `StatsBar` component |

After each edit, verify the file parses (no JSX syntax errors) by reading the changed section back.

## Step 5 — Update .claude/commands/

For each slash command, check if its SQL queries, API calls, or logic need updating:

| Command | Trigger to update |
|---------|------------------|
| `/scrape` | New scrape-job fields, changed auto-publish threshold logic |
| `/review` | Changed article schema, new status values |
| `/newsite` | New required site fields, new wizard steps |
| `/stats` | New tables or columns to include in the report |
| `/trends` | New trend fields, changed quota logic |
| `/api-costs` | New external services added to `api_usage_log` |
| `/deploy` | New deployment requirements or infrastructure |
| `/refactor` | New shared component patterns to scan for |

## Step 6 — Report

```
/doc-sync complete.

Files updated:
  ✅ CLAUDE.md — [sections changed]
  ✅ REVIEW.md — [new section appended]
  ✅ Architecture.jsx — [layers updated]
  ✅ .claude/commands/[file] — [what changed]
  ⏭  [file] — no changes needed

Total: N files updated, M skipped.
```

If any section could not be synced due to ambiguity, flag it explicitly for human review.
