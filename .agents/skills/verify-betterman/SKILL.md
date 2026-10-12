---
name: verify-betterman
description: "Drive the BetterMan Next.js UI on a local dev server with Playwright. Use to launch the app, run the read-only doctor check, exercise search and man pages like a user, and capture screenshots and traces."
disable-model-invocation: true
---

# Verify BetterMan

BetterMan is a Next.js web app. Readers search Unix man pages, open a page, and use the palette, find bar, bookmarks, and reading preferences. There is no account system. Personal state lives in `localStorage` and cookies. Page data is read from a local Convex deployment.

The feature map is [`references/features/README.md`](references/features/README.md). Open the one file that matches the change. Walk the README top to bottom for a broad sweep, and finish with `journeys.md`.

A maintain pass (`maintain-verification-skill`) edits only this directory: `SKILL.md`, `references/features/`, `scripts/`, and `playwright.config.mjs`. Product code stays untouched. Outcomes are `clean`, `changed` (one PR), or `blocked`.

## Isolate

This skill owns one app on `http://127.0.0.1:3000`. Playwright gives each test a fresh browser context, so bookmarks, theme, and recent history stay inside that context. The Convex dataset is shared by every context on this machine.

When doctor already reports `READY`, launch reuses that server. Cleanup stops only the tmux sessions recorded in `/tmp/betterman-verify/run.json`. A server this skill did not start is left running.

Launch refuses a base URL other than port 3000 on loopback. It also refuses to start a second Next server when port 3000 is already taken by someone else. Seed runs only when `/api/v1/info` is a 404 or `pageCount` is 0, and only when `.env.local` points Convex at loopback.

## Launch

From the repo root, with Node 26 on `PATH`:

```bash
export PATH="${NVM_DIR:-$HOME/.nvm}/versions/node/v26.5.1/bin:$HOME/.local/bin:$PATH"
pnpm install --frozen-lockfile
bash scripts/install-playwright-ci.sh
pnpm verify:launch
```

`pnpm verify:launch` is `node .agents/skills/verify-betterman/scripts/launch.mjs`. It does the following:

1. If doctor is `READY`, print `REUSED` and exit 0.
2. If port 3000 is open and this skill did not start it, exit 2 and leave that process alone.
3. Run `pnpm install --frozen-lockfile` when `node_modules` is missing.
4. Run `CONVEX_AGENT_MODE=anonymous pnpm convex:check` when `.env.local` is missing.
5. Install Playwright Chromium (`pnpm -C nextjs exec playwright install chromium`). Set `VERIFY_SKIP_BROWSER_INSTALL=1` to skip. If Chromium's system libraries are missing, the command above `bash scripts/install-playwright-ci.sh` installs them.
6. Start tmux session `betterman-verify-convex` with `CONVEX_AGENT_MODE=anonymous npx convex dev --tail-logs disable` when ports from `.env.local` (`VITE_CONVEX_URL`, usually 3210, and `VITE_CONVEX_SITE_URL`, usually 3211) are closed. Ready means the log line `Convex functions ready`.
7. Start tmux session `betterman-verify-next` with the env from `.env.local` and `pnpm -C nextjs dev --hostname 127.0.0.1 --port 3000`. Ready means port 3000 accepts TCP and doctor can read the home page.
8. If doctor reports `empty-dataset`, run `npx convex env set CONVEX_INGEST_SECRET dev` and `BETTERMAN_E2E_SEED=1 CONVEX_INGEST_SECRET=dev CONVEX_HTTP_URL=... node scripts/seed-convex-e2e.mjs`, then restart only the Next session and run doctor again.

The seeded fixture publishes `tar(1)`, `gzip(1)`, alias `gunzip(1)`, `printf(1)`, `printf(3)`, `openssl(1ssl)`, `bash(1)`, and an EVP page for Debian, Ubuntu, and Fedora. Ubuntu `tar(1)` contains the sentence `Ubuntu variant: this page is intentionally different for E2E testing.` The license package list is empty.

Logs and state:

- `/tmp/betterman-verify/run.json` lists sessions this launch started
- `/tmp/betterman-verify/betterman-verify-convex.log`
- `/tmp/betterman-verify/betterman-verify-next.log`
- `/tmp/betterman-verify/evidence/` is created at launch and kept by cleanup

`pnpm next:dev` (`convex dev --start "pnpm -C nextjs dev"`) is the README command. The helper splits Convex and Next so the dataset can be seeded before Next caches an empty render. Use the helper.

## Doctor

Run this first whenever a drive looks wrong. It only sends GET requests.

```bash
pnpm verify:doctor
```

`READY` (exit 0) means all of the following:

- `GET /` is 200 and the HTML contains `Search man pages`
- `GET /api/v1/info` is 200 and `pageCount` is greater than 0
- `GET /api/v1/search?q=tar&limit=5` is 200 and includes `tar` in section `1`

Anything else prints `NOT_READY` and exits 2. Codes:

| Code | Meaning |
| --- | --- |
| `unreachable` | Nothing answered on the base URL |
| `home-unhealthy` | The home page is up without the search box, or the status is not 200 |
| `empty-dataset` | Info is 404 or `pageCount` is 0. Launch may seed. A stranger's server is left alone |
| `info-unreadable` | Info did not return the expected JSON |
| `search-missing-tar` | The dataset does not contain `tar(1)`. Launch does not overwrite it |

```bash
node .agents/skills/verify-betterman/scripts/doctor.mjs --help
node .agents/skills/verify-betterman/scripts/doctor.mjs --json
node .agents/skills/verify-betterman/scripts/doctor.mjs --base-url http://127.0.0.1:3000
```

Doctor also prints `ss -ltnp` for port 3000 when `ss` is available. A video or screenshot taken while doctor is `NOT_READY` is not evidence.

## Drive

Prefer the Playwright runner in this skill. It uses the same accessible names and `data-bm-*` hooks as `nextjs/e2e/` and `DESIGN.md`.

Fast path (home, search `tar`, open `tar(1)`):

```bash
pnpm verify:smoke
```

Feature sweep (every file under `references/features/` except the production-only service worker registration):

```bash
pnpm verify:drive
```

Both commands run doctor first. If doctor exits 2, the browser does not open.

One feature, after doctor is `READY`:

```bash
E2E_BASE_URL=http://127.0.0.1:3000 \
VERIFY_EVIDENCE_DIR=/tmp/betterman-verify/evidence \
pnpm -C nextjs exec playwright test \
  --config .agents/skills/verify-betterman/playwright.config.mjs \
  .agents/skills/verify-betterman/scripts/drive.spec.ts \
  -g "find in page"
```

Run that from the repo root. The config file is `playwright.config.mjs` next to this skill.

Stable handles:

- Roles and names from `DESIGN.md`: banner `Site header`, contentinfo `Site footer`, searchbox `Search man pages`, combobox `Command palette input`, textbox `Find in page`, button `Cycle theme`, `Search`, `Find in page`, `Reading preferences`, `Open contents`, `Load more results`, link names like `tar(1)`.
- Hooks: `[data-bm-app-header]`, `[data-bm-app-footer]`, `[data-bm-sidebar]`, `[data-bm-findbar]`, `[data-bm-home-search]`, `[data-bm-page-search]`, `mark[data-bm-find]`, `mark[data-bm-opt]`, `body[data-bm-font-size]`.
- Single-key shortcuts (`?`, `/`, `d`, `b`, `t`, `h`, `p`, `m`) are ignored while focus is in a text field or `<select>`. Blur the active element, or click the page, before sending them. Wait until `Cycle theme` is visible so the shell listener is attached.
- Palette modes: plain text searches, `>` actions, `#` headings, `@ubuntu tar` switches distro inside the query. `Escape` closes the palette and the find bar.
- The header control named `Search` opens the palette. The home search box submits to `/search`.

The full e2e contract remains `pnpm next:e2e`. Use it when the change touches a behavior the sweep does not list. `verify:smoke` is the short loop.

## Evidence

Proof artifacts go to `/tmp/betterman-verify/evidence/` (override with `VERIFY_EVIDENCE_DIR`). Cleanup never deletes that directory.

- `*.png` screenshots taken by the specs at named paths (`smoke-home.png`, `smoke-search.png`, `smoke-tar.png`, and the drive shots such as `man-tar.png`)
- `test-results/` Playwright traces (`trace.zip` per test, trace is `on`)
- `playwright-report/` HTML report

A proof exercises the user path: type in the search box, click a result, press the shortcut, change the select. Reading `/api/v1/info` is the doctor check, not the proof that search works.

Capture the action and the end state. Examples: the search box filled, then the `tar(1)` heading; the bookmark button pressed, then the Bookmarks region on `/#bookmarks` after a reload or navigation; `localStorage['bm-theme']` after cycling theme and again after reload.

Side effects worth reading:

- URL, heading, and `aria-current`
- `localStorage` keys `bm-theme`, `bm-bookmarks`, `bm-recent`
- `document.documentElement.dataset.theme`
- `body` dataset `bmFontSize` (`data-bm-font-size`)
- clipboard text after Copy code block or Copy link
- `GET /api/v1/search?q=` with no query returns 400, while the empty search page shows try links

The E2E seed is the local dataset behind the same Convex reads production uses. Do not stub those reads. `pnpm next:dev` does not register `/sw.js` (`NODE_ENV` is development). Service-worker caching is `INCONCLUSIVE` on the dev server. Observe it with `pnpm -C nextjs build && pnpm -C nextjs start` only when that production path is what you are proving. The offline banner still updates from the browser `offline` event in dev.

## Cleanup

```bash
pnpm verify:cleanup
```

That runs `node .agents/skills/verify-betterman/scripts/cleanup.mjs`. It `tmux kill-session`s only `betterman-verify-convex` and `betterman-verify-next` when `run.json` lists them. It does not kill processes by name. It leaves `/tmp/betterman-verify/evidence/` in place and prints that path. After every failed launch or drive, run cleanup before starting again so a half-started session does not keep the ports.

Confirm the evidence directory still exists after cleanup before citing it.

## Helpers

| Command | Script |
| --- | --- |
| `pnpm verify:launch` | `scripts/launch.mjs` |
| `pnpm verify:doctor` | `scripts/doctor.mjs` |
| `pnpm verify:smoke` | `scripts/smoke.mjs` (doctor, then `smoke.spec.ts`) |
| `pnpm verify:drive` | `scripts/smoke.mjs --drive` (doctor, then `drive.spec.ts`) |
| `pnpm verify:cleanup` | `scripts/cleanup.mjs` |

```bash
node .agents/skills/verify-betterman/scripts/launch.mjs --help
node .agents/skills/verify-betterman/scripts/doctor.mjs --help
node .agents/skills/verify-betterman/scripts/smoke.mjs --help
node .agents/skills/verify-betterman/scripts/cleanup.mjs --help
```

`scripts/smoke.mjs --drive` is the long sweep. `scripts/evidence.ts` writes screenshots into `VERIFY_EVIDENCE_DIR`.

## How to report

Put a Proof section on the pull request:

```markdown
### Proof
- Commands: the exact commands, including `pnpm verify:doctor` and the drive you ran
- Evidence: screenshot and trace paths that still exist after cleanup
- Results: pass or fail per command, plus the observable end state (URL, heading, storage, attribute)
- INCONCLUSIVE: any step that could not run, and the concrete reason (port busy, dataset refused, browser missing, dev server has no service worker)
```

A missing check is `INCONCLUSIVE`. Do not describe it as passed.

## Feature map

[`references/features/README.md`](references/features/README.md) is the sweep order. Each feature file has the same four headings: Sub-features, How to get to it (user POV), Driving it with Playwright, Gotchas.
