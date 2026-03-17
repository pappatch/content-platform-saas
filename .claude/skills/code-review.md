# Skill: /code-review

Scan all recently changed files for code quality and security issues. Report findings by severity and auto-fix critical issues.

Invoke with: `/code-review` (scans `git diff HEAD` by default) or `/code-review [file-or-glob]` to target specific files.

---

## Step 1 — Identify files to scan

If `$ARGUMENTS` is provided, use it as the file pattern.
Otherwise, get the list of changed files:

```bash
git diff --name-only HEAD     # uncommitted changes
git diff --name-only HEAD~1   # files changed in last commit
```

Filter to: `.py`, `.jsx`, `.js`, `.ts`, `.tsx` — skip lock files, migrations, and compiled output.

## Step 2 — Static analysis pass

For each file, check every item in the following table. Mark each finding with its severity.

### Python files (`.py`)

| Check | Severity | Pattern to look for |
|-------|----------|---------------------|
| Unused import | Warning | `import X` where `X` never appears in the file body |
| Missing docstring on public function | Info | `def ` at module level without a following `"""` |
| Hardcoded string that looks like a threshold/limit | Critical | Numeric literal in business logic (not in a constant or PlatformSettings call) |
| External HTTP call without try/except | Critical | `httpx.`, `requests.get/post`, `aiohttp.` not inside a try block |
| DB query in a loop | Warning | `.query(` or `.filter(` inside a `for ` loop |
| `print()` instead of `logger.*` | Info | `print(` in non-test file |
| Raw SQL string | Critical | `text("SELECT` or `f"SELECT` or `f'SELECT` |
| API key in code | Critical | Any string matching `sk-`, `tvly-`, `AIza`, `Bearer ` as a literal |
| `except:` bare except | Warning | `except:` without an exception type |
| Missing `logger.exception` in except | Warning | `except Exception` block without `logger.exception(` or `logger.error(` |

### JSX/JS/TS files

| Check | Severity | Pattern to look for |
|-------|----------|---------------------|
| Unused import | Warning | `import X from` where X never appears below |
| `console.log` left in | Info | `console.log(` in non-test file |
| `dangerouslySetInnerHTML` without comment | Warning | Usage without a `// SAFE:` or `// sanitized` comment explaining why |
| Hardcoded API URL | Critical | `http://` or `https://` as a string literal (not from `import.meta.env`) |
| Missing `.catch()` or `try/catch` on async | Warning | `await fetch(` or `.mutate(` without error handling |
| Prop types not validated | Info | Component with >3 props and no PropTypes or TypeScript types |

## Step 3 — Report findings

Output a table sorted by severity (Critical first):

```
## Code Review Report — [date]

### Critical (auto-fix applied)
| File | Line | Issue | Fix applied |
|------|------|-------|-------------|

### Warning (review recommended)
| File | Line | Issue | Suggested fix |
|------|------|-------|---------------|

### Info (optional improvements)
| File | Line | Issue | Suggestion |
|------|------|-------|------------|

Summary: X critical (fixed), Y warnings, Z info items.
```

## Step 4 — Auto-fix critical issues

For each **Critical** finding, apply the fix immediately:

| Critical issue | Auto-fix action |
|----------------|----------------|
| Missing try/except on external call | Wrap the call in `try/except Exception as e: logger.exception(...)` |
| Hardcoded URL | Replace with `import.meta.env.VITE_API_URL` or `settings.*` |
| Raw SQL string | Rewrite using SQLAlchemy ORM expression |
| API key literal | Move to `settings.*` and note the env var name |
| Unused import (Python) | Remove the import line |
| Unused import (JS) | Remove the import line |

After auto-fixing, re-read the file to confirm the fix is correct and does not break other usage.

## Step 5 — Output summary

```
/code-review complete.
Files scanned: N
Critical issues found: X (all auto-fixed)
Warnings: Y (listed above — review recommended)
Info: Z (optional)
```

If any critical issue could not be auto-fixed safely, explain why and provide the exact manual fix the human should apply.
