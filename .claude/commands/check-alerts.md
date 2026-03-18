Read CLAUDE.md fully, then perform a live alert health check for the platform.

## Procedure

### Step 1 — Fetch current alerts

Call `GET /admin/alerts?limit=200&is_read=false` via the API client (requires admin JWT from `.env` or the running session). If the backend is not running, query the DB directly:

```python
import sys
sys.path.insert(0, 'backend')
from app.database import SessionLocal
from app.models.alert import Alert
from sqlalchemy import desc

db = SessionLocal()
alerts = db.query(Alert).filter(Alert.is_read == False).order_by(desc(Alert.created_at)).all()
db.close()
```

### Step 2 — Display thermometer status

Derive severity from the unread alerts:

| Condition | Status | Symbol |
|-----------|--------|--------|
| No unread alerts | 🟢 NORMAL | `●●○○` |
| Info alerts only | 🔵 INFO | `●●●○` |
| At least one warning | 🟠 WARNING | `●●●●` |
| At least one critical | 🔴 CRITICAL | `████` |

Print the thermometer line:

```
System Health: 🔴 CRITICAL  [████]  3 critical · 1 warning · 2 info  (6 unread)
```

### Step 3 — Summary table grouped by level

Print a grouped summary table:

```
┌─────────────────────────────────────────────────────────────────────┐
│ UNREAD ALERTS — 2026-03-18 14:32 UTC                                │
├──────────┬────────────────────────────────┬──────────┬─────────────┤
│ Level    │ Title                          │ Source   │ Age         │
├──────────┼────────────────────────────────┼──────────┼─────────────┤
│ CRITICAL │ Anthropic API errors detected  │ anthropic│ 5m ago      │
│ CRITICAL │ Database connection error      │ database │ 12m ago     │
│ WARNING  │ Articles stuck in pending      │ ai_review│ 8m ago      │
│ INFO     │ Google CSE quota hit           │ google.. │ 2h ago      │
└──────────┴────────────────────────────────┴──────────┴─────────────┘
```

Show criticals first, then warnings, then info. Within each level, sort newest first.

### Step 4 — Suggested fixes

For each unread alert, print a fix suggestion based on the `source` field:

| Source | Suggested fix |
|--------|--------------|
| `anthropic` | Check `ANTHROPIC_API_KEY` in `.env`; verify Anthropic account credits; check `api_usage_log` for error details |
| `unsplash` | Demo key rate-limited (50 req/hour); articles will get images on next image_worker cycle; upgrade key if persistent |
| `google_cse` | Free CSE quota (100/day) hit; scraper falls back to Tavily only; resets at midnight UTC |
| `scraper` | Check Scrape Jobs at `/admin/scrape-jobs`; look for `status=failed`; re-run job or fix keywords |
| `ai_review` | AI review worker may be stalled; check `review_worker` logs; verify Anthropic key; restart backend if needed |
| `database` | SQLite may be locked by another process; check for lingering connections; restart backend |
| `test` | Test alert — safe to delete via `/clear-alerts info` or via AlertBell "Delete all" |

### Step 5 — Actions offered

After showing the summary, ask:

```
Options:
  [1] Mark all alerts as read  (PATCH /admin/alerts/read-all)
  [2] Clear all info alerts     (/clear-alerts info)
  [3] Run fresh log analysis    (/run-log-analysis)
  [4] Exit — no action
```

Wait for user input and execute the chosen action. Confirm the result.

### Step 6 — Final status line

Print one closing line:

```
✅ Alert check complete — 6 unread (3 critical, 1 warning, 2 info). Backend: http://localhost:8000
```

or

```
✅ Alert check complete — all clear. System health: NORMAL 🟢
```
