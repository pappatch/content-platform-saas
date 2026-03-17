Read CLAUDE.md fully, then guide the user through creating a new site on the platform step by step.

## Step 1 — Gather site details

Ask the user for the following (or parse from `$ARGUMENTS` if provided as JSON):

| Field | Options / Notes |
|-------|----------------|
| **Name** | Human-readable site name (e.g. "Golden Retriever World") |
| **Domain** | Unique domain string (e.g. "goldenretriever.com") |
| **Template** | A (Newspaper), B (Magazine), C (Blog), D (Cards), E (Sidebar) — describe each briefly |
| **Language** | `en` (English), `he` (Hebrew), `ar` (Arabic), `fr` (French) — he/ar auto-set RTL |
| **Primary color** | Hex color for nav/header (e.g. `#1a56db`) |
| **Secondary color** | Hex color for accents/badges (e.g. `#f05252`) |
| **Keywords** | Comma-separated list for the scrape job (e.g. "golden retriever, dog training, puppy care") |
| **Scrape frequency** | Minutes between auto-scrapes (suggest: 60 for active, 360 for slow) |

## Step 2 — Create the site

Call `POST http://localhost:8000/sites` with:
```json
{
  "name": "<name>",
  "domain": "<domain>",
  "template_id": "template-<a|b|c|d|e>",
  "language": "<lang>",
  "config": {
    "primary_color": "<hex>",
    "secondary_color": "<hex>"
  }
}
```
Include Authorization header (ask user for JWT if needed).

Show the created site's ID on success.

## Step 3 — Create the scrape job

Call `POST http://localhost:8000/scraper/jobs` with:
```json
{
  "site_id": <site_id>,
  "keywords": ["keyword1", "keyword2", ...],
  "language": "<lang>",
  "frequency_minutes": <frequency>
}
```

## Step 4 — Set up the site renderer

Tell the user how to spin up a renderer for the new site:

1. Determine the next free port (5174 is site 1, 5175 is site 2, etc.)
2. Create `site-renderer/.env.site<N>`:
   ```
   VITE_SITE_ID=<site_id>
   VITE_API_BASE=http://localhost:8000
   ```
3. Run:
   ```bash
   cd site-renderer && VITE_SITE_ID=<site_id> npm run dev -- --port <port>
   ```

## Step 5 — Summary

Show a summary table of what was created:
- Site ID, name, domain, template, language, direction
- Scrape job ID, keywords, frequency
- Renderer URL
- Remind user to update the Local Dev Ports table in CLAUDE.md

## Step 6 — Post-creation sync

Run `/doc-sync` to automatically:
- Add the new site to CLAUDE.md "Current Sites" table
- Update the Local Dev Ports table with the new renderer port
- Update Architecture.jsx stats bar (Sites count)
- Append a REVIEW.md entry confirming the new site was created with correct auth and config

Then run `/image-fix [new_site_id]` once the first scrape job has run to ensure all initial articles have topic-specific images.
