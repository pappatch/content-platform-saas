Read CLAUDE.md, then use the `/code-review` skill to perform a deep quality scan, followed by the structural refactor below.

**Note:** `/code-review` handles per-file issues (unused imports, hardcoded values, missing error handling). This command handles *structural* issues (duplicated components, misplaced shared code). Run `/code-review` first, then continue with the steps below.

---

Scan the entire `frontend/src/` directory and identify:

(a) Any JSX component defined inline in a page/app file that is also used or duplicated elsewhere
(b) Any copy-pasted logic blocks across files (badge renderers, date formatters, mutation patterns, etc.)
(c) Any component defined inside `apps/` that is used by more than one file and should be moved to `components/`

For each finding, output a table row with:

| File | Line | Type | Description | Recommended fix |
|------|------|------|-------------|----------------|

Then group findings by priority:
- **P0 — Extract now**: used in 3+ places or causes a bug if inconsistent
- **P1 — Extract soon**: used in 2 places, low effort
- **P2 — Consider**: single use but clearly generic

After the table, ask: "Should I perform the refactor automatically? (yes / no / select by number)"

If yes: for each P0 and P1 finding, create the shared component/util in `components/` or `utils/`, update all import paths, and remove the inline definitions. Do not touch P2 without explicit confirmation.

After the refactor, run `/doc-sync` to update CLAUDE.md (Completed section) and REVIEW.md (Q## findings for any duplicate-component issues resolved).
