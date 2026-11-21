#!/usr/bin/env python3
"""Daily drip: promote due tools from data/queue.json into data/tools.json.

An entry in queue.json is a normal tool object plus a `publishOn` (YYYY-MM-DD).
Every day the nightly Action runs this first: any entry whose publishOn is today
or earlier is appended to tools.json (with `added` = its publishOn) and removed
from the queue. build_readme.py then rebuilds the README, and the site sync
imports the new tools — so the list grows on its own, no manual step.

A tool is due at its drop MOMENT, not at the start of its day: publishOn at
7:00 am Mountain Time (Salt Lake City / Denver), all year. The website reveals the
same tool at the same moment (web/src/lib/drop.ts), so the list and the site stay
in step. An earlier publishOn is always due.

Idempotent: entries already present in tools.json (by name) are dropped from the
queue without duplicating. Test hooks: PROMOTE_NOW=YYYY-MM-DDTHH:MM (UTC), or
PROMOTE_TODAY=YYYY-MM-DD (that day, at the drop moment).
"""
import json, os, sys, datetime

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TOOLS = os.path.join(HERE, "data", "tools.json")
QUEUE = os.path.join(HERE, "data", "queue.json")

import zoneinfo

# Keep in step with web/src/lib/drop.ts: the drop is 7:00 am Mountain Time all
# year (14:00 UTC in winter, 13:00 UTC in summer).
DROP_TZ = zoneinfo.ZoneInfo("America/Denver")
DROP_HOUR_LOCAL = 7


def drop_utc(day):
    """The drop moment of a date, as a naive UTC datetime."""
    local = datetime.datetime(day.year, day.month, day.day, DROP_HOUR_LOCAL, tzinfo=DROP_TZ)
    return local.astimezone(datetime.timezone.utc).replace(tzinfo=None)

if os.environ.get("PROMOTE_NOW"):
    now = datetime.datetime.fromisoformat(os.environ["PROMOTE_NOW"])
elif os.environ.get("PROMOTE_TODAY"):
    now = drop_utc(datetime.date.fromisoformat(os.environ["PROMOTE_TODAY"]))
else:
    now = datetime.datetime.now(datetime.timezone.utc).replace(tzinfo=None)
today = now.date().isoformat()

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
    try:
        is_due = now >= drop_utc(datetime.date.fromisoformat(day))
    except ValueError:  # not a date: never due
        is_due = False
    (due if is_due else rest).append(t)

# A due entry that would fail the list's format check is held in the queue, not
# promoted: one bad entry must not stop the whole list from publishing (a
# 147-character description did exactly that for nine days in November 2026). The
# hold is loud, so it gets fixed rather than forgotten.
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from build_readme import problems  # noqa: E402

promoted = []
new_entries = []
for t in list(due):
    if t["name"] in existing:
        continue
    entry = {k: v for k, v in t.items() if k != "publishOn"}
    entry["added"] = t.get("publishOn", today)  # what promotion will write
    bad = problems([entry])
    if bad:
        print(f"::warning title=Held in queue::{t['name']}: " + "; ".join(bad), file=sys.stderr)
        due.remove(t)
        rest.append(t)

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

print(f"Date {today} {now:%H:%M} UTC (drop at {DROP_HOUR_LOCAL}:00 Mountain): promoted {len(promoted)} tool(s); {len(rest)} left in queue.")
for p in promoted:
    print(f"  + {p}")
