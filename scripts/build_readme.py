#!/usr/bin/env python3
"""Generate README.md from data/tools.json.

Stdlib only. Fetches live star counts from the GitHub API, keeps a daily
snapshot in data/stars.json, and renders:

  hero -> showcase (Trending this week, or Latest drops until enough
  star history exists) -> one table per category -> footer.

Stars/licenses shown in the README are shields.io badges (rendered live
by GitHub); the API numbers fetched here are used only for sorting and
for computing 7-day trending deltas. Run: python scripts/build_readme.py
Optional: set GITHUB_TOKEN to raise the API rate limit.
"""

import json
import os
import sys
import urllib.request
from datetime import date, timedelta
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
TOOLS_FILE = ROOT / "data" / "tools.json"
STARS_FILE = ROOT / "data" / "stars.json"
README_FILE = ROOT / "README.md"

ICON_URL = "https://raw.githubusercontent.com/OSSDrop/.github/main/assets/ossdrop-icon.png"
PIN_API = "https://github-readme-stats.vercel.app/api/pin/"

CATEGORIES = [
    ("ai-coding-agents", "AI & Coding Agents", "ai"),
    ("developer-tools-cli", "Developer Tools & CLI", "cli"),
    ("data-databases", "Data & Databases", "data"),
    ("devops-self-hosted", "DevOps & Self-Hosted", "devops"),
    ("productivity", "Productivity", "productivity"),
    ("security-privacy", "Security & Privacy", "security"),
    ("web-apis", "Web & APIs", "web"),
    ("creator-media", "Creator / Media", "media"),
]

SHOWCASE_COUNT = 3
TREND_MIN_HISTORY_DAYS = 5  # need this much history before "Trending" is honest
SNAPSHOT_KEEP_DAYS = 35


def fetch_stars(repo):
    req = urllib.request.Request(
        f"https://api.github.com/repos/{repo}",
        headers={"User-Agent": "OSSDrop-list-builder", "Accept": "application/vnd.github+json"},
    )
    token = os.environ.get("GITHUB_TOKEN")
    if token:
        req.add_header("Authorization", f"Bearer {token}")
    with urllib.request.urlopen(req, timeout=30) as resp:
        data = json.load(resp)
    if data.get("archived"):
        print(f"WARNING: {repo} is archived — consider removing it", file=sys.stderr)
    return data["stargazers_count"]


def load_snapshots():
    if STARS_FILE.exists():
        return json.loads(STARS_FILE.read_text())["snapshots"]
    return {}


def save_snapshots(snapshots):
    cutoff = (date.today() - timedelta(days=SNAPSHOT_KEEP_DAYS)).isoformat()
    kept = {d: v for d, v in sorted(snapshots.items()) if d >= cutoff}
    STARS_FILE.write_text(json.dumps({"snapshots": kept}, indent=2) + "\n")


def week_ago_snapshot(snapshots):
    """Snapshot closest to 7 days ago, within a 5–10 day window."""
    today = date.today()
    best = None
    for d in snapshots:
        age = (today - date.fromisoformat(d)).days
        if 5 <= age <= 10 and (best is None or abs(age - 7) < abs(best[1] - 7)):
            best = (d, age)
    return snapshots[best[0]] if best else None


def badge(label, message, color):
    enc = lambda s: s.replace("-", "--").replace("_", "__").replace(" ", "_").replace("/", "%2F")
    if label:
        return f"https://img.shields.io/badge/{enc(label)}-{enc(message)}-{color}?style=flat-square"
    return f"https://img.shields.io/badge/{enc(message)}-{color}?style=flat-square"


def stars_badge(repo):
    return f"https://img.shields.io/github/stars/{repo}?style=flat-square&label=stars&color=2563EB"


def pin_card(tool, caption):
    owner, name = tool["repo"].split("/")
    base = f"{PIN_API}?username={owner}&repo={name}&show_owner=true"
    return (
        f'<a href="https://github.com/{tool["repo"]}">'
        f"<picture>"
        f'<source media="(prefers-color-scheme: dark)" srcset="{base}&theme=github_dark">'
        f'<img src="{base}" width="370" alt="{tool["name"]}">'
        f"</picture></a><br>"
        f'<sub>{caption}</sub>'
    )


def row(tool):
    owner = tool["repo"].split("/")[0]
    avatar = (
        f'<a href="https://github.com/{tool["repo"]}">'
        f'<img src="https://github.com/{owner}.png?size=40" width="20" height="20" alt=""></a>'
    )
    name = f'**[{tool["name"]}]({tool["homepage"]})**'
    lic = f'![{tool["license"]}]({badge("", tool["license"], "22C55E")})'
    stars = f'[![stars]({stars_badge(tool["repo"])})](https://github.com/{tool["repo"]}/stargazers)'
    links = [f'[code](https://github.com/{tool["repo"]})']
    links += [f'[{l["label"]}]({l["url"]})' for l in tool.get("links", [])]
    return f'| {avatar} {name} | {tool["description"]} | {lic} | {stars} | {" · ".join(links)} |'


def main():
    tools = json.loads(TOOLS_FILE.read_text())

    print(f"Fetching star counts for {len(tools)} repos…", file=sys.stderr)
    stars_now = {t["repo"]: fetch_stars(t["repo"]) for t in tools}

    snapshots = load_snapshots()
    snapshots[date.today().isoformat()] = stars_now
    save_snapshots(snapshots)

    # ---- showcase: trending (7-day star gain) or latest drops ----
    old = week_ago_snapshot(snapshots)
    history_days = (date.today() - date.fromisoformat(min(snapshots))).days
    if old and history_days >= TREND_MIN_HISTORY_DAYS:
        gains = [(stars_now[t["repo"]] - old.get(t["repo"], stars_now[t["repo"]]), t) for t in tools]
        gains = [(g, t) for g, t in gains if g > 0]
        gains.sort(key=lambda x: -x[0])
        showcase_title = "Trending this week"
        showcase_note = "The biggest star gains among listed tools in the last 7 days — measured, not editorialized."
        showcase = [(t, f'+{g:,} stars this week') for g, t in gains[:SHOWCASE_COUNT]]
    else:
        showcase_title = "Latest drops"
        showcase_note = "The most recent additions to the list. (Becomes “Trending this week” once a week of star history exists.)"
        latest = sorted(tools, key=lambda t: (t["added"], stars_now[t["repo"]]), reverse=True)
        showcase = [(t, f'added {t["added"]}') for t in latest[:SHOWCASE_COUNT]]

    # ---- render ----
    n = len(tools)
    nav = " · ".join(
        f"[{title}](#{title.lower().replace(' & ', '--').replace(' / ', '--').replace(' ', '-')})"
        for _, title, _ in CATEGORIES
    )
    out = []
    out.append("<!-- GENERATED FILE — do not edit README.md directly. -->")
    out.append("<!-- Edit data/tools.json and run scripts/build_readme.py (CI does this nightly). -->")
    out.append("")
    out.append('<div align="center">')
    out.append("")
    out.append(f'<a href="https://github.com/OSSDrop"><img src="{ICON_URL}" width="72" alt="OSSDrop"></a>')
    out.append("")
    out.append("# OSSDrop")
    out.append("")
    out.append("**Drop your open-source tool.**")
    out.append("A curated home for open-source tools — by the people who build them.")
    out.append("")
    out.append(" ".join([
        f'[![PRs welcome]({badge("PRs", "welcome", "22C55E")})](CONTRIBUTING.md)',
        f'![list]({badge("list", f"{n} tools", "2563EB")})',
        f'[![license]({badge("list license", "CC0-1.0", "6E7681")})](LICENSE)',
        f'[![reddit]({badge("reddit", "r/OSSDrop", "0E4CB0")})](https://www.reddit.com/r/OSSDrop/)',
        f'![web]({badge("ossdrop.com", "coming soon", "6E7681")})',
    ]))
    out.append("")
    out.append(f"<sub>{nav}</sub>")
    out.append("")
    out.append("</div>")
    out.append("")
    out.append(f"## {showcase_title}")
    out.append("")
    out.append(f"<sub>{showcase_note}</sub>")
    out.append("")
    out.append('<div align="center">')
    out.append("")
    for tool, caption in showcase:
        out.append(pin_card(tool, caption))
        out.append("")
    out.append("</div>")
    out.append("")

    for slug, title, icon in CATEGORIES:
        members = [t for t in tools if t["category"] == slug]
        members.sort(key=lambda t: -stars_now[t["repo"]])
        out.append(f'## <img src="assets/icons/{icon}.svg" width="18" alt=""> {title}')
        out.append("")
        if not members:
            out.append("_Nothing here yet — [drop the first one](CONTRIBUTING.md)._")
            out.append("")
            continue
        out.append("| Tool | What it is | License | Stars | Links |")
        out.append("| --- | --- | --- | --- | --- |")
        for t in members:
            out.append(row(t))
        out.append("")

    out.append("---")
    out.append("")
    out.append("## Drop yours")
    out.append("")
    out.append("Built something open source? Add one entry to [`data/tools.json`](data/tools.json)")
    out.append("and open a PR — see **[CONTRIBUTING.md](CONTRIBUTING.md)**. One tool per PR.")
    out.append("Stars, icons, and trending are computed automatically; descriptions stay honest.")
    out.append("")
    out.append("## License")
    out.append("")
    out.append("List content is [CC0-1.0](LICENSE) — free to reuse. Each linked tool keeps its own license.")
    out.append("")
    out.append("<sub>Curated by [Matily](https://matily.org). Star counts and licenses render live via")
    out.append("shields.io; trending is computed from daily snapshots in `data/stars.json`.</sub>")
    out.append("")

    README_FILE.write_text("\n".join(out))
    print(f"Wrote README.md ({n} tools, showcase: {showcase_title})", file=sys.stderr)


if __name__ == "__main__":
    main()
