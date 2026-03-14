Read CLAUDE.md fully, then perform the following:

1. Query the database (`backend/platform.db`) to list all scrape jobs with their IDs, site name, keywords, status, and last run time. Show this as a table so the user can pick one.

2. If the user has specified a job ID (via argument `$ARGUMENTS`), use that. Otherwise ask the user which job ID to run.

3. Trigger the job by calling:
   ```
   POST http://localhost:8000/scraper/jobs/{job_id}/run
   ```
   Include the Authorization header with a valid JWT. If you don't have a token, ask the user to provide one or instruct them to log in via `POST /auth/login`.

4. After the job completes (or times out after 60s), query the DB to show:
   - How many new articles were created in the last 5 minutes for this site
   - Their titles, AI scores, and auto-publish status (published vs pending)
   - Any articles that failed quality gates (< 3 paragraphs or < 100 words)

5. Show a summary: "X new articles scraped, Y auto-published (score ≥ 0.5), Z held for review (score < 0.5)"

If the backend server is not running, tell the user to start it first:
```bash
cd backend && source .venv/bin/activate
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```
