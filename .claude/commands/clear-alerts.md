Read CLAUDE.md fully, then clear alerts from the system based on the level specified in `$ARGUMENTS`.

## Usage

```
/clear-alerts [level]
```

`level` is optional. Valid values: `all`, `info`, `warning`, `critical`. Defaults to `all` if omitted.

Examples:
```
/clear-alerts              → clear all alerts
/clear-alerts info         → clear info-level alerts only
/clear-alerts warning      → clear warning-level alerts only
/clear-alerts critical     → clear critical-level alerts only
```

## Procedure

### Step 1 — Parse arguments

Read `$ARGUMENTS` and extract the level. If not provided or if the value is not one of `all`, `info`, `warning`, `critical`, ask the user:

```
Which alerts do you want to clear?
  [1] all       — delete every alert regardless of level
  [2] info      — delete info-level alerts only (routine noise)
  [3] warning   — delete warning-level alerts only
  [4] critical  — delete critical-level alerts only (confirm first)
  [5] cancel
```

### Step 2 — Show count before deleting

Before deleting, query the DB to show how many alerts will be affected:

```python
import sys
sys.path.insert(0, 'backend')
from app.database import SessionLocal
from app.models.alert import Alert

db = SessionLocal()
q = db.query(Alert)
if level != 'all':
    q = q.filter(Alert.level == level)
count = q.count()
db.close()
print(f"About to delete {count} alert(s) with level='{level}'.")
```

### Step 3 — Confirm before deleting criticals

If `level` is `critical` or `all` and there are critical alerts in scope, require explicit confirmation:

```
⚠️  This will permanently delete {N} critical alert(s).
Critical alerts may indicate ongoing production issues.
Type "yes" to confirm, or anything else to cancel:
```

Only proceed if the user types exactly `yes`.

For `info` or `warning` only — no confirmation required.

### Step 4 — Call the API

Use the running backend (port 8000) if available, otherwise query the DB directly.

**Via API:**
```bash
curl -s -X DELETE \
  "http://localhost:8000/admin/alerts/all?level=${level}" \
  -H "Authorization: Bearer $(python -c "
import sys; sys.path.insert(0,'backend')
from app.config import get_settings
from app.security.auth import create_access_token
s = get_settings()
# Get admin user token — read from .env or session
print(create_access_token({'sub': '1', 'role': 'admin'}))
")"
```

**Via DB directly** (if backend not running):
```python
db = SessionLocal()
try:
    q = db.query(Alert)
    if level != 'all':
        q = q.filter(Alert.level == level)
    alerts = q.all()
    deleted = len(alerts)
    for a in alerts:
        db.delete(a)
    db.commit()
    print(f"✅ Deleted {deleted} alert(s) (level={level}).")
finally:
    db.close()
```

### Step 5 — Confirm result

Print a confirmation:

```
✅ Cleared 4 info alert(s).
   Remaining unread alerts: 2 (1 critical, 1 warning)

The thermometer will update on the next 30s poll cycle.
Run /check-alerts to see the current state.
```

Or if nothing was deleted:

```
ℹ️  No alerts matched level='warning' — nothing to delete.
```

### Step 6 — Offer next action

After clearing, offer:

```
Next step?
  [1] Run fresh log analysis  (/run-log-analysis)
  [2] Check remaining alerts  (/check-alerts)
  [3] Done
```
