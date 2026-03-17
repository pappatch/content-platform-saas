# Pre-Task Hook

**Follow these steps at the start of EVERY task, without exception.**
This hook is referenced by Working Rule 1 in CLAUDE.md.

---

## Step 1 — Read project context

1. Read `CLAUDE.md` fully (every section — Working Rules, Architecture, API Reference, Data Model, Next Steps).
2. Read the **last section only** of `REVIEW.md` to catch the most recent security and quality findings.
   - If REVIEW.md is long, use `tail` or read from the final `---` separator onward.

## Step 2 — Check repository state

Run `git status` and `git log --oneline -5` to establish the current state.

Identify and note:
- Any uncommitted changes (staged or unstaged)
- The current branch name
- The hash and message of the most recent commit

If there are uncommitted changes from a prior session, ask the user whether to commit them first or continue on top.

## Step 3 — State task context aloud

Before writing a single line of code or making any tool call related to the actual task, output this statement (fill in the bracketed values):

```
Starting task: [brief task name, e.g. "add bulk CMS actions endpoint"]
Current branch: [branch name]
Last commit: [short hash] — [commit message]
Uncommitted changes: [none | list of files]
Relevant CLAUDE.md sections: [e.g. "API Reference — /cms/articles, Data Model — Article"]
Recent review finding to watch: [one-line summary of last REVIEW.md entry, or "none"]
```

## Step 4 — Identify risk level

Classify the task before starting:

| Risk | Criteria | Action |
|------|----------|--------|
| **Low** | Read-only, frontend-only, docs | Proceed |
| **Medium** | New route, new component, config change | Note auth + validation requirements |
| **High** | New model, DB migration, external API, security-related | Confirm approach with user before coding |
| **Critical** | Drops data, changes auth, modifies migrations | Explicit user confirmation required |

---

**You are now ready to begin the task.**
