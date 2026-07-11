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
- `category` — one of: `ai-coding-agents`, `developer-tools-cli`,
  `data-databases`, `devops-self-hosted`, `productivity`, `security-privacy`,
  `web-apis`, `creator-media`.
- `description` — one honest line: what it does, for whom. Say what it is,
  not "the best ever."
- `license` — the SPDX id from your LICENSE file (e.g. `MIT`, `Apache-2.0`).
- `links` — optional extras (docs, paper). Omit if none.
- `added` — today's date, `YYYY-MM-DD`.

4. **You can add your own tool.** That's encouraged — this list is for makers.

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
