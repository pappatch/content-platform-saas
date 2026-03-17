# Skill: /session-handoff

Perform a clean end-of-session wrap-up so the next Claude Code instance can immediately continue without any context loss.

Invoke with: `/session-handoff` at the end of any working session.

---

## Step 1 — Verify all Working Rules are satisfied

Read CLAUDE.md Working Rules 1–13 and confirm each is satisfied for this session:

| Rule | Check |
|------|-------|
| 1 — Pre-task hook | Was `pre-task.md` followed at the start? (If not, note it) |
| 2 — Post-task hook | Has CLAUDE.md, REVIEW.md, Architecture.jsx been updated for every task this session? |
| 3 — Env vars | Any new env vars added to both `config.py` and `.env`? |
| 4 — Modular services | Any new service file with multiple responsibilities? |
| 5 — Error handling | All new background work wrapped in try/except? |
| 6 — Auto-publish threshold | Is `AI_REVIEW_THRESHOLD=0.5` still in `.env`? |
| 7 — Soft deletes | No hard DELETEs on articles or sites? |
| 8 — No DB drops | No `create_all` or `drop_all`? |
| 9 — Reusability | Any new component used in 2+ places is in `components/` or `services/`? |
| 10 — Git discipline | All work committed and pushed? |
| 11 — Configuration discipline | No new hardcoded business values? |
| 12 — No empty files | No empty files or stubs created? |
| 13 — Available skills | Skills used where applicable instead of ad-hoc instructions? |

For any rule that is NOT satisfied, fix the violation before completing handoff.

## Step 2 — Verify git is clean

```bash
git status
git log --oneline -3
```

Expected result: `nothing to commit, working tree clean`

If uncommitted changes exist:
1. Run `/code-review` on the changed files
2. Run the `pre-commit.md` checklist
3. Commit and push

Only proceed to step 3 once git is clean.

## Step 3 — Update "Last Session Summary" in CLAUDE.md

Replace the entire **Last Session Summary** section with an accurate, complete summary of this session:

```markdown
## Last Session Summary

**Date:** [YYYY-MM-DD]

### What was built this session

| Feature | Files changed | Status |
|---------|--------------|--------|
| [feature name] | [comma-separated file list] | ✅ Done |
| [feature name] | [comma-separated file list] | ✅ Done |

### Current known issues / state

- **[Issue name]** — [one-line description and impact]. [What to do about it.]
- **[Zero state note]** — [e.g. "API usage dashboard shows zeros until a scrape is run"]

### Exact next steps to continue from

1. [Most important — specific action, not vague]
2. [Second action]
3. [Third action]
...
```

Rules for the "Exact next steps" list:
- Each step must be specific enough that a new Claude instance with only CLAUDE.md as context can execute it without asking questions
- Start with the most impactful or time-sensitive item
- Reference specific file names, route paths, or UI locations where applicable
- Maximum 10 items; prune anything no longer relevant

## Step 4 — Print handoff summary

Output the following block verbatim (filling in the values). This is what the next Claude instance will read to orient itself:

```
════════════════════════════════════════════════════
  SESSION HANDOFF — [YYYY-MM-DD]
════════════════════════════════════════════════════

PROJECT: Multi-site SaaS content platform
BRANCH:  main (clean)
LAST COMMIT: [hash] — [message]

WHAT WAS DONE TODAY:
[2–4 bullet points summarising the session work]

OPEN ISSUES:
[1–5 bullet points of known problems or incomplete work]

NEXT SESSION SHOULD START WITH:
1. [First action]
2. [Second action]
3. [Third action]

WORKING RULES STATUS: all satisfied ✅
  (or: Rule N violated — [what and why])

DOCS STATUS:
  CLAUDE.md    ✅ updated
  REVIEW.md    ✅ updated
  Architecture ✅ updated
  git          ✅ clean

Ready for next session. Start by invoking the pre-task hook.
════════════════════════════════════════════════════
```

---

**Handoff is complete.** The next session can begin immediately from "NEXT SESSION SHOULD START WITH" above.
