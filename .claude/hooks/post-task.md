# Post-Task Hook

**Follow these steps after EVERY task, without exception.**
This hook is referenced by Working Rule 2 in CLAUDE.md.
You may invoke the `/code-review` and `/doc-sync` skills to fulfil steps 1–2 and 3–4 respectively.

---

## Step 1 — Code review on changed files

For every file modified during this task, check:

| Check | What to look for |
|-------|-----------------|
| Unused imports | Any `import` statement whose symbol is never referenced in the file |
| Hardcoded values | Magic strings/numbers that belong in PlatformSettings or .env (Working Rule 11) |
| Missing error handling | `await`/`fetch`/external calls without `try/except` or `.catch()` |
| N+1 queries | Loops that call the DB per iteration instead of a single bulk query |
| Empty files or stubs | Any file with no real content (Working Rule 12) |
| Broken imports | References to symbols from deleted or renamed exports |

Auto-fix any **critical** issues (unused imports, hardcoded values, missing try/except on new external calls) before committing.
Report **warnings** (N+1, style) as findings for human review.

## Step 2 — Security review on changed files

For every new or modified backend route or service:

| Check | Requirement |
|-------|-------------|
| Auth decorator | Every non-public route has `Depends(get_current_user)`, `require_admin`, or `require_editor` |
| External API calls | Wrapped in `try/except`; API key loaded from `settings`, never hardcoded |
| No keys in logs | `logger.*` calls do not contain API keys, passwords, or tokens |
| Input validated | Request body uses a Pydantic schema; no raw dict access without validation |
| HTML written to DB | Passed through `sanitize_html()` before storage |

If any check fails, fix it before proceeding.

## Step 3 — Update CLAUDE.md

Update the following sections as applicable:

- **✅ Completed** — move any "Next Steps" items that are now done; add a one-line entry per new feature
- **Architecture** — update the relevant subsection (Backend routes, Frontend components, Services, Workers, Data Model) to reflect new/changed code
- **API Reference** — add any new routes; update changed route signatures
- **Data Model** — update if any ORM model fields were added or changed
- **PlatformSettings** — update the key list if new settings were seeded
- **Next Steps** — remove items that are done; add any newly discovered follow-up work
- **Last Session Summary** — update "What was built this session" table; update "Current known issues"

## Step 4 — Update REVIEW.md

Append a new session audit section at the bottom of REVIEW.md:

```
## Session Audit — [YYYY-MM-DD]

**Scope:** [brief description of what was built]

### Security Review
[For each new route/service: verdict + reasoning. If nothing new: "No new routes or services — no security review required."]

### Code Quality Observations
[Any Q## findings from step 1–2. If none: "No new findings."]

### Updated Overall Assessment
[One sentence on current security posture and outstanding production blockers.]
```

Never leave REVIEW.md without a new entry, even if all findings are "none."

## Step 5 — Update Architecture.jsx

If any of the following changed, update `frontend/src/apps/admin/Architecture.jsx`:

| Change type | What to update |
|-------------|---------------|
| New backend route | Add to FlowTab or ArchTab routes list |
| New service or worker | Add to ArchTab Services / Workers section |
| New ORM model | Add to ArchTab Database layer |
| New PlatformSetting key | Update count (currently 21) and ArchTab settings grid |
| New external API integration | Add to ArchTab External Services layer |
| New security control | Add to Security Layer and STEP_DETAILS |
| Stats changed | Update StatsBar hardcoded values (Workers=4, Settings=21, Templates=5) |

## Step 6 — Update .claude/commands/

If any of the following changed, update the relevant slash command:

| Change | Commands to update |
|--------|--------------------|
| New route or changed API signature | `/scrape`, `/review`, `/stats`, `/trends`, `/api-costs` as applicable |
| New site wizard step | `/newsite` |
| New deployment requirement | `/deploy` |
| New shared component | `/refactor` |

## Step 7 — Commit and push

```bash
git add [specific changed files — never git add -A blindly; list them explicitly]
git status  # verify no secrets or unintended files are staged
git commit -m "[feat|fix|chore|refactor]: [descriptive message following project conventions]"
git push
```

Pre-commit checklist (see also `.claude/hooks/pre-commit.md`):
- [ ] No API keys or passwords in any staged file
- [ ] No empty files or stub components
- [ ] CLAUDE.md updated
- [ ] REVIEW.md updated
- [ ] Architecture.jsx updated (if structure changed)

---

**Task is complete only when all 7 steps are done.**
