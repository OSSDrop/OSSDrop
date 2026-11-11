#!/usr/bin/env python3
"""Daily drip: promote due tools from data/queue.json into data/tools.json.

An entry in queue.json is a normal tool object plus a `publishOn` (YYYY-MM-DD).
Every day the nightly Action runs this first: any entry whose publishOn is today
or earlier is appended to tools.json (with `added` = its publishOn) and removed
from the queue. build_readme.py then rebuilds the README, and the site sync
imports the new tools — so the list grows on its own, no manual step.

A tool is due at its drop MOMENT, not at the start of its day: publishOn at
DROP_HOUR_UTC (14:00 UTC = 7 am Denver). The website reveals the same tool at the
same moment (web/src/lib/drop.ts), so the list and the site stay in step. An
earlier publishOn is always due.

Idempotent: entries already present in tools.json (by name) are dropped from the
queue without duplicating. Test hooks: PROMOTE_NOW=YYYY-MM-DDTHH:MM (UTC), or
PROMOTE_TODAY=YYYY-MM-DD (that day, after the drop hour).
"""
import json, os, sys, datetime

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TOOLS = os.path.join(HERE, "data", "tools.json")
QUEUE = os.path.join(HERE, "data", "queue.json")

# Keep in step with DROP_HOUR_UTC in web/src/lib/drop.ts.
DROP_HOUR_UTC = 14

if os.environ.get("PROMOTE_NOW"):
    now = datetime.datetime.fromisoformat(os.environ["PROMOTE_NOW"])
elif os.environ.get("PROMOTE_TODAY"):
    now = datetime.datetime.fromisoformat(os.environ["PROMOTE_TODAY"]).replace(hour=DROP_HOUR_UTC)
else:
    now = datetime.datetime.now(datetime.timezone.utc).replace(tzinfo=None)
today = now.date().isoformat()
drop_open = now.hour >= DROP_HOUR_UTC  # today's drop has happened

if not os.path.exists(QUEUE):
    print("No queue.json — nothing to promote.")
    sys.exit(0)

queue = json.load(open(QUEUE))
if not queue:
    print("Queue empty — nothing to promote.")
    sys.exit(0)

tools = json.load(open(TOOLS))
existing = {t["name"] for t in tools}

due, rest = [], []
for t in queue:
    day = t.get("publishOn", "9999-12-31")
    (due if day < today or (day == today and drop_open) else rest).append(t)

promoted = []
new_entries = []
for t in due:
    if t["name"] in existing:  # already listed — just drop from the queue
        continue
    entry = {k: v for k, v in t.items() if k != "publishOn"}
    entry["added"] = t.get("publishOn", today)
    new_entries.append(entry)
    existing.add(t["name"])
    promoted.append(f"{t['name']} ({t.get('publishOn')})")

# Append promoted entries to tools.json textually (preserve existing formatting).
if new_entries:
    text = open(TOOLS).read().rstrip()
    assert text.endswith("]"), "tools.json is malformed"
    head = text[:-1].rstrip()  # now ends with the last '}'
    block = ",\n".join(
        "  " + json.dumps(e, ensure_ascii=False, indent=2).replace("\n", "\n  ")
        for e in new_entries
    )
    open(TOOLS, "w").write(head + ",\n" + block + "\n]\n")

# Rewrite the queue with only the not-yet-due entries.
with open(QUEUE, "w") as f:
    json.dump(rest, f, ensure_ascii=False, indent=2)
    f.write("\n")

print(f"Date {today} {now:%H:%M} UTC (drop at {DROP_HOUR_UTC}:00): promoted {len(promoted)} tool(s); {len(rest)} left in queue.")
for p in promoted:
    print(f"  + {p}")
