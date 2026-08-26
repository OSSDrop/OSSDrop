#!/usr/bin/env python3
"""Hold newly-merged PR tools until the next drip window.

Contributors add their tool to data/tools.json, which used to publish it the
moment the PR merged — so a day with merges pushed extra tools out while the
curated drip was pacing 6, and a maker's launch landed at whatever hour the merge
happened. This moves anything a human added into data/queue.json with
publishOn = tomorrow, so every tool goes live in a drip window.

The baseline is the last commit made by the BOT, not the push's before-sha.
That distinction matters and was learned the hard way on 2026-08-26: four PRs
merged within a minute, GitHub cancelled the queued runs, and the one run that
did execute had its push rejected — the retry then reset to origin/main, which
silently threw the deferral away. All four tools published immediately.

Comparing against the last bot commit is stable under both failures. A cancelled
run simply means the next run still sees those tools as new and defers them, and
a reset-and-retry recomputes the same answer instead of losing it. The trade-off
is that a tool may be briefly visible between merge and the next run, which is
acceptable; silently publishing it for good is not.
"""
import json, os, subprocess, sys, datetime

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TOOLS = os.path.join(HERE, "data", "tools.json")
QUEUE = os.path.join(HERE, "data", "queue.json")
# git --author is a REGEX, so "github-actions[bot]" would treat [bot] as a
# character class and match nothing. Escape it.
BOT = r"github-actions\[bot\]"


def git(*args):
    return subprocess.run(["git", *args], cwd=HERE, capture_output=True, text=True)


def last_bot_commit():
    """Most recent commit authored by the bot — our last known-published state."""
    r = git("log", f"--author={BOT}", "--format=%H", "-n", "1")
    return r.stdout.strip() if r.returncode == 0 else ""


def json_at(sha, path):
    r = git("show", f"{sha}:{path}")
    if r.returncode != 0:
        return None
    try:
        return json.loads(r.stdout)
    except json.JSONDecodeError:
        return None


base = last_bot_commit()
if not base:
    print("No previous bot commit to compare against — skipping deferral.")
    sys.exit(0)

prev_tools = json_at(base, "data/tools.json")
prev_queue = json_at(base, "data/queue.json")
if prev_tools is None:
    print(f"Could not read tools.json at {base[:8]} — skipping deferral.")
    sys.exit(0)

previous = {t["name"] for t in prev_tools}
# A tool the drip promoted was in that queue, so it must never be deferred back —
# doing so would un-publish live tools. Only something in NEITHER list is new.
previously_queued = {t["name"] for t in (prev_queue or [])}

tools = json.load(open(TOOLS))
queue = json.load(open(QUEUE)) if os.path.exists(QUEUE) else []
queued = {t["name"] for t in queue}

added = [t for t in tools if t["name"] not in previous and t["name"] not in previously_queued]
if not added:
    print("No newly-added tools since the last bot commit — nothing to defer.")
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
