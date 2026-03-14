Read CLAUDE.md fully, then perform the following:

1. Query `backend/platform.db` for all articles with `status = 'pending'`. Show a summary table grouped by site:

   | Site | Pending | Avg Score | Score < 0.5 | Score ≥ 0.5 |
   |------|---------|-----------|-------------|-------------|

2. Show the AI score distribution across all pending articles in 5 buckets:
   - 0.0–0.2, 0.2–0.4, 0.4–0.5 (below threshold), 0.5–0.7, 0.7–1.0

3. List up to 20 pending articles sorted by `ai_score` descending, showing:
   - ID, title (truncated to 60 chars), site, score, any flags (`ai_flags`), created_at

4. Ask the user what they want to do:
   - **Approve specific IDs** — call `PATCH /cms/articles/{id}` with `{"status": "published"}` for each
   - **Reject specific IDs** — call `PATCH /cms/articles/{id}` with `{"status": "removed"}` for each
   - **Approve all above threshold** — approve every pending article with `ai_score >= 0.5`
   - **Show full content** of a specific article — fetch `GET /cms/articles/{id}` and display title, content summary, SEO fields, and flags

5. After any approve/reject action, confirm how many articles were updated and show the new pending count.

Note: PATCH endpoints require authentication. If you don't have a JWT token, ask the user to provide one or log in via `POST /auth/login` with their editor/admin credentials.
