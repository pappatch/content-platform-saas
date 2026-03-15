Read CLAUDE.md fully, then produce a cost summary report by querying `backend/platform.db` directly.

## 1. Call counts per service — current month

```sql
SELECT
  service,
  COUNT(*) as total_calls,
  SUM(CASE WHEN success = 1 THEN 1 ELSE 0 END) as successful,
  SUM(CASE WHEN success = 0 THEN 1 ELSE 0 END) as failed
FROM api_usage_log
WHERE timestamp >= date('now', 'start of month')
GROUP BY service
ORDER BY total_calls DESC;
```

Show as a table: Service | Total | Successful | Failed

## 2. Call counts per service — today

```sql
SELECT
  service,
  COUNT(*) as calls_today
FROM api_usage_log
WHERE timestamp >= date('now')
GROUP BY service
ORDER BY calls_today DESC;
```

## 3. Anthropic token usage — current month

```sql
SELECT
  json_extract(meta, '$.model') as model,
  SUM(json_extract(meta, '$.input_tokens'))  as total_input_tokens,
  SUM(json_extract(meta, '$.output_tokens')) as total_output_tokens,
  COUNT(*) as api_calls
FROM api_usage_log
WHERE service = 'anthropic'
  AND success = 1
  AND timestamp >= date('now', 'start of month')
GROUP BY model;
```

Compute estimated cost:
- Input:  total_input_tokens  / 1,000,000 × $0.25
- Output: total_output_tokens / 1,000,000 × $1.25
- Total Anthropic cost this month

## 4. Daily call trend — last 7 days (all services)

```sql
SELECT
  date(timestamp) as day,
  service,
  COUNT(*) as calls
FROM api_usage_log
WHERE timestamp >= date('now', '-6 days')
GROUP BY date(timestamp), service
ORDER BY day DESC, calls DESC;
```

Show as a compact table: Day | Anthropic | Unsplash | Tavily | Google CSE | Google Trends | Stability AI

## 5. Estimated costs — current month

Apply these unit costs to the call counts from step 1:

| Service       | Unit cost              | Formula                                    |
|---------------|------------------------|--------------------------------------------|
| Anthropic     | token-based            | from step 3                                |
| Tavily        | $0.004 / search        | successful_calls × $0.004                  |
| Google CSE    | free ≤100/day          | max(0, calls – 100 × days_elapsed) / 1000 × $5 |
| Unsplash      | free                   | $0.00                                      |
| Stability AI  | $0.04 / image          | successful_calls × $0.04                   |
| Google Trends | free                   | $0.00                                      |

Use `SELECT julianday('now') - julianday(date('now', 'start of month'))` to get days_elapsed.

## 6. Recent failures — last 24 hours

```sql
SELECT
  service,
  endpoint,
  timestamp,
  json_extract(meta, '$.error')       as error,
  json_extract(meta, '$.http_status') as http_status
FROM api_usage_log
WHERE success = 0
  AND timestamp >= datetime('now', '-24 hours')
ORDER BY timestamp DESC
LIMIT 20;
```

Flag any service with > 3 failures in 24 hours as needing attention.

## Output format

Present all results in clean markdown tables. End with a one-paragraph cost summary: total estimated spend this month, which service is the largest contributor, any services with elevated failure rates, and a projected end-of-month cost based on the current daily average.

If the api_usage_log table is empty, note that it is populated when the platform makes actual API calls — trigger a scrape job or AI review to start tracking.
