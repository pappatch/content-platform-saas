Read CLAUDE.md fully, then produce a complete platform statistics report by querying `backend/platform.db` directly.

## 1. Article counts by status

```sql
SELECT status, COUNT(*) as count FROM articles GROUP BY status;
```

Show as a summary: X published, Y pending review, Z removed, N total.

## 2. Articles per site

```sql
SELECT s.name, a.status, COUNT(*) as count
FROM articles a JOIN sites s ON a.site_id = s.id
GROUP BY s.name, a.status
ORDER BY s.name, a.status;
```

Show as a table with columns: Site | Published | Pending | Removed | Total

## 3. AI score distribution (pending articles only)

```sql
SELECT
  CASE
    WHEN ai_score < 0.2 THEN '0.0–0.2'
    WHEN ai_score < 0.4 THEN '0.2–0.4'
    WHEN ai_score < 0.5 THEN '0.4–0.5 (below threshold)'
    WHEN ai_score < 0.7 THEN '0.5–0.7'
    ELSE '0.7–1.0'
  END as bucket,
  COUNT(*) as count
FROM articles WHERE status = 'pending' AND ai_score IS NOT NULL
GROUP BY bucket ORDER BY bucket;
```

## 4. Scrape job status per site

```sql
SELECT s.name, j.id, j.status, j.frequency_minutes, j.last_run_at, j.last_error
FROM scrape_jobs j JOIN sites s ON j.site_id = s.id
ORDER BY s.name;
```

Flag any jobs with `status = 'failed'` or a non-null `last_error` as needing attention.

## 5. Recent activity (last 24 hours)

```sql
SELECT s.name, COUNT(*) as new_articles
FROM articles a JOIN sites s ON a.site_id = s.id
WHERE a.created_at >= datetime('now', '-24 hours')
GROUP BY s.name;
```

## 6. Analytics summary

```sql
SELECT s.name, COUNT(*) as page_views
FROM analytics_events e JOIN sites s ON e.site_id = s.id
GROUP BY s.name ORDER BY page_views DESC;
```

If the analytics table is empty, note that views are tracked when visitors use the public renderer.

## Output format

Present all results in clean markdown tables. End with a one-paragraph health summary: overall content volume, which sites are most active, any jobs needing attention, and the pending review backlog.
