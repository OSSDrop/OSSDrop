# Drop your tool

The README is **generated** — don't edit it directly. Your tool lives as one
JSON object in [`data/tools.json`](data/tools.json); CI rebuilds the page
nightly with live stars, icons, and trending.

## How

1. It must be **open source** (public repo + an OSI license; open-core is OK if
   the core is genuinely usable).
2. **Fork → add one object to `data/tools.json` → open a PR.** One tool per PR.
3. Use this shape:

```json
{
  "name": "ripgrep",
  "repo": "BurntSushi/ripgrep",
  "homepage": "https://github.com/BurntSushi/ripgrep",
  "category": "developer-tools-cli",
  "description": "Fast recursive regex search over directories that respects your .gitignore.",
  "license": "Unlicense/MIT",
  "links": [{ "label": "docs", "url": "https://example.com/docs" }],
  "added": "2026-07-10"
}
```

- `repo` — `owner/name` on GitHub. Your avatar and live star count come from
  this automatically; **never** put star numbers anywhere.
- `homepage` — project site, or the repo URL if there isn't one.
- `category` — one slug from the table below. Pick the single best fit for
  what the tool **does**, not what it's built with (an AI-powered note app
  goes in `notes-knowledge`, not `ai-coding-agents`).

  | Slug | What goes here | For example |
  | --- | --- | --- |
  | `ai-coding-agents` | Tools whose job is AI: coding agents and assistants, LLM runtimes/frameworks, agent infrastructure | Aider, projectmem, Ollama |
  | `developer-tools-cli` | Tools for developers: terminal utilities, editors, git tooling, build/search/debug helpers | ripgrep, fzf, lazygit |
  | `web-apis` | Building, testing, and serving web apps and APIs: HTTP clients, API tooling, web frameworks/servers | HTTPie, Hoppscotch |
  | `data-databases` | Storing and querying data: databases, search engines, analytics, ETL, data pipelines | DuckDB, Meilisearch |
  | `devops-self-hosted` | Running software: deployment, containers, CI/CD, monitoring, self-hosting platforms and dashboards | Uptime Kuma, Docker-adjacent tools |
  | `files-sync` | Moving and keeping files: sync, backup, file transfer/sharing, object storage | Syncthing, restic |
  | `security-privacy` | Protecting things: password managers, encryption, VPN/proxy, auth/SSO, scanning | KeePassXC |
  | `productivity` | Getting personal/team work done: tasks, calendars, writing aids, time tracking, dashboards | GemType |
  | `notes-knowledge` | Capturing and organizing knowledge: note-taking, wikis, PKM, document management, bookmarks | Joplin-style apps |
  | `communication-social` | Talking to people: chat, email, video calls, forums, fediverse/social platforms | Matrix/Mastodon-style tools |
  | `automation-iot` | Making things happen automatically: workflow automation, home automation, IoT platforms | Home-Assistant-style tools, n8n-style tools |
  | `finance-business` | Running money or a business: budgeting, invoicing, e-commerce, CRM/ERP/HR | Firefly-III-style apps |
  | `science-education` | Research and learning: scientific/GIS/data-viz tooling, courseware, health and study tools | AcadGIS |
  | `creator-media` | Making and playing media: audio/video/image editing, streaming, photography, design, games | OBS Studio |

  If nothing fits, pick the closest and say so in the PR — categories grow
  when real tools need them.
- `description` — one sentence, **max 140 characters** (CI rejects longer):
  what it does + for whom. Say what it is, not "the best ever." No feature
  lists, no superlatives, no emoji.
- `license` — the SPDX id from your LICENSE file (e.g. `MIT`, `Apache-2.0`).
- `links` — optional extras (docs, paper). Omit if none.
- `added` — today's date, `YYYY-MM-DD`.

4. **You can add your own tool.** That's encouraged — this list is for makers.
5. **Tool not on GitHub?** (GitLab, Codeberg, Hugging Face, self-hosted…)
   Open the PR anyway and mention it — we'll add support for your forge.

## Reviewed for

- Valid JSON, correct category
- A working, public repo link
- A valid OSI license that matches the `license` field
- An honest description

## Not accepted

- Closed-source or paywalled-core tools
- Dead or abandoned repos
- Duplicate entries
- Pure marketing copy

## How "Trending" works

No editors, no pay-to-rank: CI snapshots every listed tool's star count daily
(`data/stars.json`) and the README showcases the biggest 7-day gains. Getting
listed is how you become eligible.

That's it. Welcome aboard.
