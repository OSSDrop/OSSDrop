#!/usr/bin/env python3
"""Hold newly-merged PR tools until the next drip window.

Contributors add their tool to data/tools.json, which used to publish it the
moment the PR merged — so a day with merges pushed 8 tools out while the curated
drip was pacing 6, and a maker's launch landed at whatever hour the merge
happened. This moves anything a push just added into data/queue.json with
publishOn = tomorrow, so every tool goes live in a drip window and the pace stays
even.

It reads the push's BEFORE_SHA to see exactly what that push added; anything
promoted out of the queue by promote_queue.py is untouched, because this runs
first, while tools.json still only holds what was already published.

No-op unless BEFORE_SHA is set to a real commit, so schedule and
workflow_dispatch runs (which push nothing) skip it.
"""
import json, os, subprocess, sys, datetime

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TOOLS = os.path.join(HERE, "data", "tools.json")
QUEUE = os.path.join(HERE, "data", "queue.json")

before = (os.environ.get("BEFORE_SHA") or "").strip()
if not before or set(before) <= {"0"}:
    print("No BEFORE_SHA (not a push) — nothing to defer.")
    sys.exit(0)

r = subprocess.run(["git", "show", f"{before}:data/tools.json"],
                   cwd=HERE, capture_output=True, text=True)
if r.returncode != 0:
    # A force-push or a missing object: skip rather than guess and defer a tool
    # that was already published.
    print(f"Could not read tools.json at {before[:8]} — skipping deferral.")
    sys.exit(0)

previous = {t["name"] for t in json.loads(r.stdout)}

# Also read the queue as it was BEFORE the push. A tool the drip just promoted
# was sitting in that queue, so it must never be deferred back — doing so would
# un-publish live tools every time this ran after promotion (or if the bot's own
# push re-triggered the workflow). Only something in NEITHER list is a genuinely
# new submission.
rq = subprocess.run(["git", "show", f"{before}:data/queue.json"],
                    cwd=HERE, capture_output=True, text=True)
previously_queued = {t["name"] for t in json.loads(rq.stdout)} if rq.returncode == 0 else set()

tools = json.load(open(TOOLS))
queue = json.load(open(QUEUE)) if os.path.exists(QUEUE) else []
queued = {t["name"] for t in queue}

added = [t for t in tools if t["name"] not in previous and t["name"] not in previously_queued]
if not added:
    print("Push added no new tools — nothing to defer.")
    sys.exit(0)

# The next window, not the back of the queue: a maker who opens a PR should not
# wait behind the curated backlog.
tomorrow = (datetime.date.today() + datetime.timedelta(days=1)).isoformat()

deferred = []
for t in added:
    if t["name"] in queued:  # already waiting; drop the duplicate copy
        continue
    entry = dict(t)
    entry["publishOn"] = tomorrow
    entry.pop("added", None)
    queue.append(entry)
    deferred.append(t["name"])

if not deferred:
    print("Nothing to defer (all already queued).")
    sys.exit(0)

keep = [t for t in tools if t["name"] not in set(deferred)]
open(TOOLS, "w").write(json.dumps(keep, indent=2, ensure_ascii=False) + "\n")
open(QUEUE, "w").write(json.dumps(queue, indent=2, ensure_ascii=False) + "\n")
print(f"Deferred to {tomorrow}: {', '.join(deferred)}")
