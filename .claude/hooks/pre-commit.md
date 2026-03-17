# Pre-Commit Checklist

**Run through every item before executing `git commit`.**
This hook is referenced by Working Rule 10 in CLAUDE.md.

Fail fast — if any item is ❌, fix it before committing.

---

## Security checks

- [ ] **No hardcoded API keys or passwords** — search staged files for `sk-`, `tvly-`, `AIza`, `Bearer `, `password =`, `secret =` (not from env/settings)
  ```bash
  git diff --cached | grep -iE '(api_key|secret_key|password)\s*=\s*["\x27][^"\x27]{8,}'
  ```
- [ ] **No .env file staged** — `.env` must never be committed
  ```bash
  git diff --cached --name-only | grep '\.env'
  ```
- [ ] **All new backend routes have auth decorators** — every new `@router.*` in `app/routes/` (except `/public/*` and `/health`) has `Depends(get_current_user)`, `require_admin`, or `require_editor`
- [ ] **All new external API calls have try/except** — any call to `httpx`, `anthropic`, `requests`, or `aiohttp` in a service file is wrapped in try/except with logging

## Code quality checks

- [ ] **No empty files or stub components** — no staged file is empty or contains only `# TODO`, `pass`, or placeholder text (Working Rule 12)
- [ ] **No broken imports** — if any export was renamed or deleted, all consumers are updated
  ```bash
  # Check for imports of non-existent names (run from frontend/):
  # grep for the old name across src/
  ```
- [ ] **No unused imports in changed files** — quickly scan each staged `.py` and `.jsx` file
- [ ] **No hardcoded business logic values** — thresholds, limits, and intervals belong in PlatformSettings (Working Rule 11)

## Database checks

- [ ] **Alembic migration exists for any model change** — if any `app/models/*.py` file was modified (new column, new table, changed type), there is a corresponding new file in `alembic/versions/`
  ```bash
  git diff --cached --name-only | grep 'app/models/'
  # If any match → verify alembic/versions/ has a new file too
  ```
- [ ] **Migration does not use `create_all` or `drop_all`** — only `op.*` calls via Alembic (Working Rule 8)

## Documentation checks

- [ ] **CLAUDE.md is updated** — if this commit adds a feature or changes architecture, CLAUDE.md reflects it (Completed section, Architecture, API Reference, or Next Steps)
- [ ] **REVIEW.md is updated** — a new session audit entry exists for today's date (Working Rule 2)
- [ ] **Architecture.jsx is updated** — if routes, models, services, or workers changed, the diagram reflects the new state

## Commit message format

```
<type>: <short description>

[optional body]

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
```

Types: `feat` (new feature), `fix` (bug fix), `chore` (maintenance), `refactor` (code reorganisation), `docs` (documentation only), `security` (security fix)

Message must be descriptive enough that the `git log` alone tells the story of what changed and why.

---

**All items checked? You may commit.**
