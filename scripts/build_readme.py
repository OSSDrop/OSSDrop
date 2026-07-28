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

ICON_URL = "assets/ossdrop-mark.svg"  # the brand mark lives in this repo; masters in workspace branding/
CARDS_DIR = ROOT / "assets" / "cards"  # showcase cards, self-rendered (no third-party image service)

LANG_COLORS = {
    "Python": "#3572A5", "JavaScript": "#f1e05a", "TypeScript": "#3178c6",
    "Go": "#00ADD8", "Rust": "#dea584", "C": "#555555", "C++": "#f34b7d",
    "Java": "#b07219", "Shell": "#89e051", "Ruby": "#701516", "PHP": "#4F5D95",
    "C#": "#178600", "Vue": "#41b883", "Svelte": "#ff3e00", "Kotlin": "#A97BFF",
    "Swift": "#F05138", "HTML": "#e34c26", "CSS": "#563d7c", "Lua": "#000080",
}

CATEGORIES = [
    ("ai-coding-agents", "AI & Coding Agents", "ai"),
    ("developer-tools-cli", "Developer Tools & CLI", "cli"),
    ("web-apis", "Web & APIs", "web"),
    ("data-databases", "Data & Databases", "data"),
    ("devops-self-hosted", "DevOps & Self-Hosted", "devops"),
    ("files-sync", "Files & Sync", "files"),
    ("security-privacy", "Security & Privacy", "security"),
    ("productivity", "Productivity", "productivity"),
    ("notes-knowledge", "Notes & Knowledge", "notes"),
    ("communication-social", "Communication & Social", "comms"),
    ("automation-iot", "Automation & IoT", "automation"),
    ("finance-business", "Finance & Business", "finance"),
    ("science-education", "Science & Education", "science"),
    ("creator-media", "Creator / Media", "media"),
]

SHOWCASE_COUNT = 3  # total cards incl. pinned — exactly one row of three on GitHub
MOST_STARRED_COUNT = 3  # second showcase row: top-starred tools not already shown
TREND_MIN_HISTORY_DAYS = 5  # need this much history before "Trending" is honest
SNAPSHOT_KEEP_DAYS = 35
DESCRIPTION_MAX = 140  # one honest sentence; CONTRIBUTING.md documents this


def validate(tools):
    slugs = {c[0] for c in CATEGORIES}
    errors = []
    seen_repos = set()
    for t in tools:
        name = t.get("name", "<missing name>")
        for field in ("name", "repo", "homepage", "category", "description", "license", "added"):
            if not t.get(field):
                errors.append(f"{name}: missing required field '{field}'")
        if t.get("category") and t["category"] not in slugs:
            errors.append(f"{name}: unknown category slug '{t['category']}'")
        desc = t.get("description", "")
        if len(desc) > DESCRIPTION_MAX:
            errors.append(f"{name}: description is {len(desc)} chars (max {DESCRIPTION_MAX})")
        if t.get("repo") in seen_repos:
            errors.append(f"{name}: duplicate repo '{t['repo']}'")
        seen_repos.add(t.get("repo"))
    if errors:
        sys.exit("tools.json validation failed:\n  " + "\n  ".join(errors))


def fetch_repo(repo):
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
    return {"stars": data["stargazers_count"], "language": data.get("language") or ""}


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


def esc(s):
    return s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


def fmt_stars(n):
    return f"{n/1000:.1f}k" if n >= 1000 else str(n)


def wrap2(text, width=56):
    """Wrap into at most 2 lines; ellipsize the second."""
    words, lines, cur = text.split(), [], ""
    for w in words:
        if len(cur) + len(w) + 1 <= width:
            cur = f"{cur} {w}".strip()
        else:
            lines.append(cur)
            cur = w
            if len(lines) == 2:
                break
    if cur and len(lines) < 2:
        lines.append(cur)
    if len(lines) == 2 and " ".join(lines) != text.strip() and len(" ".join(lines).split()) < len(words):
        lines[1] = lines[1][: width - 1].rstrip() + "…"
    return lines


THEMES = {
    "dark":  {"bg": "#0E1A38", "border": "#1E2C4F", "name": "#58a6ff", "text": "#9DB6D8", "meta": "#7D96BD"},
    "light": {"bg": "#FFFFFF", "border": "#d0d7de", "name": "#0969da", "text": "#57606a", "meta": "#57606a"},
}

STAR_PATH = ("M8 .8l2 4.1 4.5.6-3.2 3.2.7 4.5L8 11.1 4 13.2l.7-4.5L1.5 5.5 6 4.9 8 .8z")


def render_card(tool, info, caption, theme):
    t = THEMES[theme]
    owner, name = tool["repo"].split("/")
    lang = info["language"]
    lang_color = LANG_COLORS.get(lang, "#8b949e")
    pinned = tool.get("pinned")
    caption_color = "#22C55E" if pinned else t["meta"]
    lines = wrap2(tool["description"], width=42)
    desc = "".join(
        f'<text x="14" y="{57 + i * 14.5}" font-size="10.8" fill="{t["text"]}">{esc(line)}</text>'
        for i, line in enumerate(lines)
    )
    lang_part = (
        f'<circle cx="19" cy="98" r="4" fill="{lang_color}"/>'
        f'<text x="28" y="101.5" font-size="10" fill="{t["meta"]}">{esc(lang)}</text>'
        if lang else ""
    )
    return f'''<svg xmlns="http://www.w3.org/2000/svg" width="265" height="118" viewBox="0 0 265 118"
     font-family="-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif">
  <rect x="0.5" y="0.5" width="264" height="117" rx="9" fill="{t['bg']}" stroke="{t['border']}"/>
  <rect x="14" y="13" width="11" height="11" rx="3" fill="#22C55E"/>
  <text x="31" y="23" font-size="12.5" fill="{t['name']}">
    <tspan>{esc(owner)}/</tspan><tspan font-weight="600">{esc(name)}</tspan>
  </text>
  <text x="14" y="38.5" font-size="9" letter-spacing="0.5" fill="{caption_color}">{esc(caption.upper())}</text>
  {desc}
  {lang_part}
  <text x="132" y="101.5" font-size="10" text-anchor="middle" fill="{t['meta']}">{esc(tool['license'])}</text>
  <path transform="translate(216 90.5) scale(0.75)" d="{STAR_PATH}" fill="none" stroke="{t['meta']}" stroke-width="1.4"/>
  <text x="231" y="101.5" font-size="10" fill="{t['meta']}">{fmt_stars(info['stars'])}</text>
</svg>
'''


def pin_card(tool, info, caption):
    slug = tool["repo"].replace("/", "-").lower()
    for theme in THEMES:
        (CARDS_DIR / f"{slug}-{theme}.svg").write_text(render_card(tool, info, caption, theme))
    base = f"assets/cards/{slug}"
    return (
        f'<a href="https://github.com/{tool["repo"]}">'
        f"<picture>"
        f'<source media="(prefers-color-scheme: dark)" srcset="{base}-dark.svg">'
        f'<img src="{base}-light.svg" width="265" alt="{tool["name"]}">'
        f"</picture></a>"
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
    validate(tools)

    print(f"Fetching repo data for {len(tools)} repos…", file=sys.stderr)
    repo_info = {t["repo"]: fetch_repo(t["repo"]) for t in tools}
    stars_now = {r: i["stars"] for r, i in repo_info.items()}

    snapshots = load_snapshots()
    snapshots[date.today().isoformat()] = stars_now
    save_snapshots(snapshots)

    # ---- showcase: pinned card + trending (7-day star gain) or latest drops ----
    pinned = [t for t in tools if t.get("pinned")]
    pool = [t for t in tools if not t.get("pinned")]
    take = max(0, SHOWCASE_COUNT - len(pinned))
    old = week_ago_snapshot(snapshots)
    history_days = (date.today() - date.fromisoformat(min(snapshots))).days
    if old and history_days >= TREND_MIN_HISTORY_DAYS:
        gains = [(stars_now[t["repo"]] - old.get(t["repo"], stars_now[t["repo"]]), t) for t in pool]
        gains = [(g, t) for g, t in gains if g > 0]
        gains.sort(key=lambda x: -x[0])
        showcase_title = "Trending this week"
        showcase_note = "The biggest star gains among listed tools in the last 7 days — measured, not editorialized."
        showcase = [(t, f'+{g:,} stars this week') for g, t in gains[:take]]
    else:
        showcase_title = "Latest drops"
        showcase_note = "The most recent additions to the list. (Becomes “Trending this week” once a week of star history exists.)"
        latest = sorted(pool, key=lambda t: (t["added"], stars_now[t["repo"]]), reverse=True)
        showcase = [(t, f'added {t["added"]}') for t in latest[:take]]
    showcase = [(t, "pinned · from the curators") for t in pinned] + showcase

    CARDS_DIR.mkdir(parents=True, exist_ok=True)
    for stale in CARDS_DIR.glob("*.svg"):
        stale.unlink()

    # ---- render ----
    n = len(tools)
    populated = [c for c in CATEGORIES if any(t["category"] == c[0] for t in tools)]
    open_cats = [c for c in CATEGORIES if c not in populated]
    # category headings start with an <img>, which GitHub slugs as a leading "-"
    nav = " · ".join(
        f"[{title}](#-{title.lower().replace(' & ', '--').replace(' / ', '--').replace(' ', '-')})"
        for _, title, _ in populated
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
    out.append("Discover, share, and discuss open-source software — a curated home for the")
    out.append("tools developers actually use.")
    out.append("")
    out.append(" ".join([
        f'[![PRs welcome]({badge("PRs", "welcome", "22C55E")})](CONTRIBUTING.md)',
        f'![list]({badge("list", f"{n} tools", "2563EB")})',
        f'[![license]({badge("list license", "CC0-1.0", "6E7681")})](LICENSE)',
        f'[![reddit]({badge("reddit", "r/OSSDrop", "0E4CB0")})](https://www.reddit.com/r/OSSDrop/)',
        f'[![web]({badge("ossdrop.com", "Live", "22C55E")})](https://ossdrop.com)',
    ]))
    out.append("")
    out.append(f"<sub>{nav}</sub>")
    out.append("")
    out.append("</div>")
    out.append("")
    out.append("## What is OSSDrop?")
    out.append("")
    out.append("**OSSDrop is a curated home for open-source tools** — a community-maintained")
    out.append("place to discover, share, and discuss developer tools, self-hosted apps, and")
    out.append("libraries. Makers drop their own project with a single pull request. Every entry")
    out.append("is a real open-source project: public repository, OSI license, honest one-line")
    out.append("description. Star counts, icons, and trending update automatically, and no")
    out.append("placement on this list is paid.")
    out.append("")
    out.append("Browse by category below, explore the same tools ranked at")
    out.append("[ossdrop.com](https://ossdrop.com), discuss on")
    out.append("[r/OSSDrop](https://www.reddit.com/r/OSSDrop/), or [drop your tool](CONTRIBUTING.md)")
    out.append("— it takes one PR and it's free.")
    out.append("")
    out.append(f"## {showcase_title}")
    out.append("")
    out.append(f"<sub>{showcase_note}</sub>")
    out.append("")
    cards = "&nbsp;".join(pin_card(t, repo_info[t["repo"]], c) for t, c in showcase)
    out.append(f'<div align="center">{cards}</div>')
    out.append("")

    shown = {t["repo"] for t, _ in showcase}
    most_starred = sorted(
        (t for t in tools if t["repo"] not in shown),
        key=lambda t: -stars_now[t["repo"]],
    )[:MOST_STARRED_COUNT]
    if most_starred:
        out.append("## Most starred")
        out.append("")
        out.append("<sub>The heaviest hitters on the list — recomputed nightly.</sub>")
        out.append("")
        cards = "&nbsp;".join(
            pin_card(t, repo_info[t["repo"]], "most starred") for t in most_starred
        )
        out.append(f'<div align="center">{cards}</div>')
        out.append("")

    for slug, title, icon in populated:
        members = [t for t in tools if t["category"] == slug]
        members.sort(key=lambda t: -stars_now[t["repo"]])
        out.append(f'## <img src="assets/icons/{icon}.svg" width="18" alt=""> {title}')
        out.append("")
        out.append("| Tool | What it is | License | Stars | Links |")
        out.append("| --- | --- | --- | --- | --- |")
        for t in members:
            out.append(row(t))
        out.append("")

    if open_cats:
        out.append("## Open categories")
        out.append("")
        out.append("Waiting for their first drop — [yours?](CONTRIBUTING.md)")
        out.append("")
        out.append("<p>" + "&ensp;·&ensp;".join(
            f'<img src="assets/icons/{icon}.svg" width="15" alt=""> <a href="CONTRIBUTING.md">{title}</a>'
            for _, title, icon in open_cats
        ) + "</p>")
        out.append("")

    out.append("---")
    out.append("")
    out.append("## Drop yours")
    out.append("")
    out.append("Built something open source? Add one entry to [`data/tools.json`](data/tools.json)")
    out.append("and open a PR — see **[CONTRIBUTING.md](CONTRIBUTING.md)**. One tool per PR.")
    out.append("Stars, icons, and trending are computed automatically; descriptions stay honest.")
    out.append("")
    out.append("## Frequently asked questions")
    out.append("")
    out.append("**What is OSSDrop?**")
    out.append("OSSDrop is a curated, community-maintained list of open-source tools, organized")
    out.append("into categories spanning AI and coding agents, developer tools and CLI utilities,")
    out.append("web and APIs, data and databases, DevOps and self-hosted software, files and sync,")
    out.append("security and privacy, productivity, notes and knowledge, communication and social,")
    out.append("automation and IoT, finance and business, science and education, and creator and")
    out.append("media tools.")
    out.append("")
    out.append("**Is OSSDrop a Product Hunt alternative for open source?**")
    out.append("People often describe it that way. Like a product-launch site, OSSDrop is a place")
    out.append("to discover new open-source software — developer tools, self-hosted apps, and")
    out.append("libraries — and give the good ones votes and discussion. The difference: OSSDrop")
    out.append("lists only projects with a public repository and an OSI-approved open-source")
    out.append("license, and listing is always free.")
    out.append("")
    out.append("**How do I add my open-source tool to the list?**")
    out.append("Fork this repository, add one JSON object to `data/tools.json`, and open a pull")
    out.append("request. Requirements: a public repository and an OSI-approved license. See")
    out.append("[CONTRIBUTING.md](CONTRIBUTING.md).")
    out.append("")
    out.append("**Is listing free? Can rankings be bought?**")
    out.append("Listing is free and rankings cannot be bought. Tables are sorted by live GitHub")
    out.append("star count and “Trending this week” is computed from daily star snapshots.")
    out.append("The one pinned showcase card is always labeled as pinned.")
    out.append("")
    out.append("**Where else does OSSDrop live?**")
    out.append("On the web at [ossdrop.com](https://ossdrop.com) — now live — where the same tools")
    out.append("are ranked and open for discussion, and on Reddit at")
    out.append("[r/OSSDrop](https://www.reddit.com/r/OSSDrop/). The GitHub organization is")
    out.append("[github.com/OSSDrop](https://github.com/OSSDrop).")
    out.append("")
    out.append("**Can I reuse this list's data?**")
    out.append("Yes — the list content is public domain ([CC0-1.0](LICENSE)), and")
    out.append("[`data/tools.json`](data/tools.json) is the machine-readable source of truth.")
    out.append("Each linked tool keeps its own license.")
    out.append("")
    out.append("<sub>Star counts and licenses render live via shields.io; trending is computed")
    out.append("from daily snapshots in `data/stars.json`.</sub>")
    out.append("")

    README_FILE.write_text("\n".join(out))
    print(f"Wrote README.md ({n} tools, showcase: {showcase_title})", file=sys.stderr)


if __name__ == "__main__":
    main()
