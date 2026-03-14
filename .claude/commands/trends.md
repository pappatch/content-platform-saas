Read CLAUDE.md fully, then perform the following:

1. Query `backend/platform.db` for all trends. Show a summary table:

   | Region | Language | Total | New | Used | Dismissed |
   |--------|----------|-------|-----|------|-----------|

2. Show today's new trends sorted by score descending:
   - ID, keyword, region, language, score, is_duplicate (seen before?), created_at

3. Show auto-site quota:
   - "X / Y auto-created sites used (limit = Y)"
   - List any sites created from trends: site_id, site name, keyword, trend_date

4. Ask the user what they want to do:
   - **Trigger a fetch now** — call `POST /trends/fetch` (requires auth token)
   - **Dismiss specific IDs** — call `POST /trends/{id}/dismiss` for each
   - **Create a site from trend ID** — call `GET /trends/{id}/site-config` first to preview,
     then `POST /trends/{id}/create-site` to confirm
   - **Show full trend history** — list all trends (all statuses) with pagination
   - **Nothing** — just show the report

5. After any action, confirm the result and show the updated pending-new count.

Note: POST endpoints require authentication. If you don't have a JWT token,
ask the user to provide one or log in via `POST /auth/login`.
