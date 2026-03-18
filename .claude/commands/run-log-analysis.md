Read CLAUDE.md fully, then run the alert log analyzer directly against the database and report results.

## Purpose

Triggers an immediate on-demand analysis cycle — the same logic the `alert_worker` runs every 5 minutes — without waiting for the next scheduled cycle. Useful after a deployment, after fixing an error condition, or to verify the alert system is working.

## Procedure

### Step 1 — Set up the Python path

```bash
cd /Users/Elad.Cohen/platform/backend
source .venv/bin/activate
```

### Step 2 — Run analysis and print results

```python
import sys
sys.path.insert(0, '.')
from app.database import SessionLocal
from app.services.log_analyzer import analyze_logs, ALERT_RULES

db = SessionLocal()
try:
    triggered = analyze_logs(db)
    if not triggered:
        print("✅ No new alerts — all rules passed cleanly.")
        print(f"   Evaluated {len(ALERT_RULES)} rules.")
    else:
        print(f"⚠️  {len(triggered)} new alert(s) triggered:")
        for a in triggered:
            level_icon = {'critical': '🔴', 'warning': '🟠', 'info': '🔵'}.get(a['level'], '⚪')
            print(f"   {level_icon} [{a['level'].upper()}] {a['title']} (source: {a['source']})")
            print(f"      {a['message'][:120]}{'...' if len(a['message']) > 120 else ''}")
finally:
    db.close()
```

Run this in the Python REPL or as a one-shot script via `python -c "..."`.

### Step 3 — Show rule evaluation summary

Print a rule-by-rule summary so it is clear what was checked:

```
Rules evaluated (7 total):
  ✅ articles_stuck_pending    — 2 pending articles >30m (threshold: 5)  → not triggered
  ✅ scrape_job_failed         — 0 jobs in failed state                  → not triggered
  ✅ no_articles_saved_2h      — 14 articles in last 2h                  → not triggered
  ✅ anthropic_errors          — 0 api_log failures (last 30m)           → not triggered
  ✅ unsplash_errors           — 2 api_log failures (last 60m, need 5)   → not triggered
  ⚠️  google_cse_errors        — 4 api_log failures (last 6h, need 3)    → TRIGGERED
  ✅ db_connection_error       — 0 log-buffer matches                    → not triggered
```

If a rule is on cooldown (was already alerted recently), note it:

```
  ⏸  google_cse_errors  — on cooldown (last alerted 47m ago, cooldown: 360m)
```

### Step 4 — Insert new alerts into DB (if any triggered)

If `triggered` is non-empty, insert the Alert rows exactly as `alert_worker._run_analysis()` does:

```python
from app.models.alert import Alert
from datetime import datetime, timezone

db = SessionLocal()
try:
    now = datetime.now(timezone.utc)
    for alert_data in triggered:
        alert = Alert(
            level      = alert_data['level'],
            title      = alert_data['title'],
            message    = alert_data['message'],
            source     = alert_data['source'],
            is_read    = False,
            created_at = now,
        )
        db.add(alert)
    db.commit()
    print(f"\n✅ Inserted {len(triggered)} alert(s) into DB.")
    print("   Refresh the admin UI — thermometer should update within 30s.")
except Exception as e:
    db.rollback()
    print(f"❌ Failed to insert alerts: {e}")
finally:
    db.close()
```

### Step 5 — Final summary

```
Log analysis complete.
  Rules evaluated : 7
  Rules triggered : 1
  Alerts inserted : 1
  DB state        : 3 total unread alerts now in DB

Run /check-alerts for a full formatted view of all unread alerts.
```
