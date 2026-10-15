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

When doctor already reports `READY` and the process on port 3000 matches the recorded pid and start time, and its cwd or an argv equals this repo root or starts with that root plus a path separator, launch reuses that server. A `READY` server that fails that check is not reused. Cleanup stops only the tmux sessions recorded in this checkout's `run.json`. A server this skill did not start is left running.

Listener pid, start time, and cwd are read from Linux `/proc` when the base URL is loopback. On macOS and every other platform, that loopback check exits 2 and prints `Linux-only`. A doctor URL that is not loopback skips the listener check and still reports HTTP health. The skill does not guess ownership.

State and session names are per checkout. The id is `VERIFY_ID` when that is set, otherwise the first 8 hex characters of the sha256 of the repo root. The state directory is `/tmp/betterman-verify-<id>/` and the tmux sessions are `bmv-<id>-convex` and `bmv-<id>-next`. Two checkouts do not share them.

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

1. If doctor is `READY` and the listener pid and start time in `run.json` match the process on port 3000, and that process is under this repo, print `REUSED` and exit 0. `READY` includes an IPv4 listen socket, `pageCount` greater than 0, and a hydration probe. A `READY` server whose pid, start time, or repo does not match is refused. An IPv6-only server is not reused.
2. If port 3000 is open and doctor reports `empty-dataset`, seed only when the live listener belongs to this repo (its cwd or an argv equals this repo root or starts with that root plus a path separator) or this checkout already owns it (recorded pid, start time, repo, and Next session). A sibling directory such as `<repoRoot>-other` does not belong to this checkout, and neither does an argument that merely contains the root, such as `--config=<repoRoot>/nextjs`. On `READY`, print `SEEDED` and leave that Next process running. If the listener does not belong to this repo, exit 2, do not seed, and do not stop the process. The message says to stop that process yourself, then run `pnpm verify:launch` again.
3. If port 3000 is open for any other reason and this skill did not start it, exit 2, leave that process alone, and print the same next step.
4. Run `pnpm install --frozen-lockfile` when `node_modules` is missing.
5. Run `CONVEX_AGENT_MODE=anonymous pnpm convex:check` when `.env.local` is missing.
6. Install Playwright Chromium (`pnpm -C nextjs exec playwright install chromium`). Set `VERIFY_SKIP_BROWSER_INSTALL=1` to skip. If Chromium's system libraries are missing, the command above `bash scripts/install-playwright-ci.sh` installs them.
7. Start tmux session `bmv-<id>-convex` with `npx convex dev --tail-logs disable` when ports from `.env.local` (`VITE_CONVEX_URL`, usually 3210, and `VITE_CONVEX_SITE_URL`, usually 3211) are closed. The session name is written to `run.json` immediately, before the ready wait. The shell unsets `CONVEX_DEPLOY_KEY`, `CONVEX_DEPLOYMENT`, `CONVEX_URL`, every `CONVEX_DEPLOY*` variable, and the other remote Convex variables, then exports only `CONVEX_AGENT_MODE=anonymous`, an `anonymous:` deployment name when `.env.local` has one, and the loopback URLs from that file. Ready means the log line `Convex functions ready`.
8. Start tmux session `bmv-<id>-next` with `pnpm -C nextjs dev --hostname 127.0.0.1 --port 3000`. That session is recorded in `run.json` as soon as it starts. After `.env.local` is sourced, the shell unsets inherited Convex variables again and exports only the anonymous deployment name and loopback URLs. `--hostname 127.0.0.1` is required. A `next dev` bound only to IPv6 `::` can still answer `http://127.0.0.1:3000` for documents, while Playwright's HMR websocket fails with `ERR_INVALID_HTTP_RESPONSE` and clicks never reach React. Doctor treats that listener as `NOT_READY` `ipv6-only`. It also opens Chromium, waits until `Cycle theme` has React props, and clicks it. `READY` requires `localStorage['bm-theme']` to change. Launch will not reuse an IPv6-only server. Stop that process yourself, then run launch again.
9. If doctor reports `empty-dataset` for a Next process this skill started, seed only when `.env.local` names an `anonymous:` deployment or has no deployment name, both Convex URLs are loopback, and no deploy key is configured. `npx convex env set` receives a minimal environment built from an allowlist (`PATH`, `HOME`, `USER`, `LOGNAME`, `SHELL`, locale and temp variables, `NVM_DIR`, `PNPM_HOME`) plus `CONVEX_AGENT_MODE=anonymous`, an `anonymous:` deployment name, and the loopback Convex URLs. It does not receive `BETTERMAN_DATASET_STAGE` or `CONVEX_DEPLOY_KEY`. The seed process uses that same environment and sets `BETTERMAN_DATASET_STAGE=prod` itself, along with the anonymous deployment name and loopback URLs (`127.0.0.1`, `localhost`, or `[::1]`). It does not receive `CONVEX_DEPLOY_KEY` or a cloud `CONVEX_URL`. Launch then stops Next, waits until `127.0.0.1:3000` is closed, deletes `nextjs/.next/dev/cache/fetch-cache`, starts Next again, and waits until that address is bound by a process whose cwd or an argv equals the repo root or starts with that root plus a path separator. It records that pid and start time, then waits until `/api/v1/info` reports `pageCount` greater than 0 and doctor reports hydration. A cached `pageCount` of 0 is `NOT_READY` `info-stale` even when search already returns `tar(1)`. Launch clears that cache and restarts up to three times. A fixed sleep is not the ready check. Reuse also requires the live listener pid and start time to match `run.json`.

The seeded fixture publishes `tar(1)`, `gzip(1)`, alias `gunzip(1)`, `printf(1)`, `printf(3)`, `openssl(1ssl)`, `bash(1)`, and an EVP page for Debian, Ubuntu, and Fedora. Ubuntu `tar(1)` contains the sentence `Ubuntu variant: this page is intentionally different for E2E testing.` The license package list is empty.

Logs and state:

- `/tmp/betterman-verify-<id>/` is mode `0700` and must be owned by the current user. Launch refuses a pre-created directory owned by someone else. Set `VERIFY_ID` to choose the id, or `VERIFY_STATE_DIR` to choose the directory.
- `run.json` is written mode `0600`. It lists sessions this launch started, including a Convex session that failed before Next opened port 3000, plus the Next listener pid and start time
- `bmv-<id>-convex.log` and `bmv-<id>-next.log`
- `evidence/` is created at launch and kept by cleanup. Override the directory with `VERIFY_EVIDENCE_DIR`. When that is unset, Playwright hashes the repo root, the same id as launch, not the shell's current directory. Specs do not import the ESM runtime, because the test runner loads them as CommonJS. `VERIFY_ID` is 3 to 32 characters. `ci` is rejected. The manual smoke workflow sets `VERIFY_ID=cix`, so its evidence directory is `/tmp/betterman-verify-cix/evidence`.

`pnpm next:dev` (`convex dev --start "pnpm -C nextjs dev"`) is the README command. The helper splits Convex and Next so the dataset can be seeded before Next caches an empty render. Use the helper.

## Doctor

Run this first whenever a drive looks wrong. It sends GET requests, checks that port 3000 is listening on IPv4, and opens a throwaway Chromium window to confirm the page hydrated. It does not seed data or start servers.

```bash
pnpm verify:doctor
```

`READY` (exit 0) means all of the following:

- `GET /` is 200 and the HTML contains `Search man pages`
- `GET /api/v1/search?q=tar&limit=5` is 200 and includes `tar` in section `1`
- `GET /api/v1/info` is 200 and `pageCount` is greater than 0
- `/proc/net/tcp` shows an IPv4 listen socket for port 3000, and a TCP connect to `127.0.0.1` succeeds. IPv6 `::` alone is `ipv6-only`
- Chromium sees React props on `Cycle theme`, and clicking it writes `bm-theme`

`GET /api/v1/info` is printed every time. `pageCount` of 0 is not ready. Search can return `tar(1)` from a fresher cache while info still says `uninitialized` for up to an hour, because info is cached under `nextjs/.next/dev/cache/fetch-cache`. That result is `NOT_READY` `info-stale`.

Anything else prints `NOT_READY` and exits 2. Codes:

| Code | Meaning |
| --- | --- |
| `unreachable` | Nothing answered on the base URL |
| `home-unhealthy` | The home page is up without the search box, or the status is not 200, and this is not an empty dataset |
| `empty-dataset` | Search has no `tar(1)` and info is 404 or `pageCount` is 0, or the home error says the dataset release is missing. Launch seeds only when the listener belongs to this repo or this checkout owns it. Otherwise it refuses and leaves the process running |
| `info-stale` | Search returns `tar(1)`, but info is 404 or `pageCount` is 0. Launch clears the Next fetch cache and restarts a Next process it started. It does not call that server `READY` |
| `info-unreadable` | Home rendered, but info did not return the expected JSON and search did not prove `tar(1)` |
| `search-missing-tar` | Info reports pages, and `tar(1)` is absent. Launch does not overwrite that dataset |
| `ipv6-only` | Port 3000 is listening on IPv6 `::` and not on IPv4. Launch does not reuse it |
| `ipv4-unreachable` | Documents answered, but TCP to `127.0.0.1` on that port failed |
| `not-hydrated` | The search API is fine, but Cycle theme did not write `bm-theme` or the page threw |
| `hydration-unproven` | Playwright Chromium is missing, so hydration could not be checked |

```bash
node .agents/skills/verify-betterman/scripts/doctor.mjs --help
node .agents/skills/verify-betterman/scripts/doctor.mjs --json
node .agents/skills/verify-betterman/scripts/doctor.mjs --base-url http://127.0.0.1:3000
```

Doctor prints who is listening on port 3000. It uses `ss -ltnp` when `ss` exists, and otherwise reads `/proc/net/tcp`. A screenshot taken while doctor is `NOT_READY` is not evidence.

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

Both commands run doctor first. If doctor exits 2, the browser does not open. When doctor is `READY`, smoke still refuses unless the listener pid, start time, and repo match this checkout's `run.json` and the recorded Next session is the one this skill started. That refusal says to stop that process yourself, then run `pnpm verify:launch` again.

One feature, after doctor is `READY`:

```bash
pnpm verify:drive -- -g "find in page"
```

Run that from the repo root. The wrapper passes an absolute `--config` and sets `NODE_PATH` to `nextjs/node_modules`. A `pageerror` event fails the test.

Stable handles:

- Roles and names from `DESIGN.md`: banner `Site header`, contentinfo `Site footer`, searchbox `Search man pages`, combobox `Command palette input`, textbox `Find in page`, button `Cycle theme`, `Search`, `Find in page`, `Reading preferences`, `Open contents`, `Load more results`, link names like `tar(1)`.
- Hooks: `[data-bm-app-header]`, `[data-bm-app-footer]`, `[data-bm-sidebar]`, `[data-bm-findbar]`, `[data-bm-home-search]`, `[data-bm-page-search]`, `mark[data-bm-find]`, `mark[data-bm-opt]`, `body[data-bm-font-size]`.
- Single-key shortcuts (`?`, `/`, `d`, `b`, `t`, `h`, `p`, `m`) are ignored while focus is in a text field or `<select>`. Blur the active element, or click the page, before sending them. Wait until `Cycle theme` is visible so the shell listener is attached.
- Palette modes: plain text searches, `>` actions, `#` headings, `@ubuntu tar` switches distro inside the query. `Escape` closes the palette and the find bar.
- The header control named `Search` opens the palette. The home search box submits to `/search`.

The full e2e contract remains `pnpm next:e2e`. Use it when the change touches a behavior the sweep does not list. `verify:smoke` is the short loop.

## Evidence

Proof artifacts go to `/tmp/betterman-verify-<id>/evidence/` (override with `VERIFY_EVIDENCE_DIR`). Cleanup never deletes that directory. Launch prints the path.

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

That runs `node .agents/skills/verify-betterman/scripts/cleanup.mjs`. It `tmux kill-session`s only `bmv-<id>-convex` and `bmv-<id>-next` when `run.json` lists them, including a session recorded before its ready check failed. It does not kill processes by name. It waits until the recorded Next pid is gone, then restores generated files. It leaves the evidence directory in place and prints that path. After every failed launch or drive, run cleanup before starting again so a half-started session does not keep the ports.

`next dev` rewrites `nextjs/next-env.d.ts` and creates `nextjs/AGENTS.md` and `nextjs/CLAUDE.md`. The generated `AGENTS.md` says to commit that file. Do not. Launch writes `generated-snapshot.json` only after it owns the Next server, and only before that server starts. A launch that exits before that ownership unlinks `generated-snapshot.json`, including a snapshot left by an earlier run. A successful reuse leaves an existing snapshot in place. Cleanup restores an owned snapshot after the sessions stop. If a file changed since a snapshot that this checkout does not own, cleanup leaves the file in place, prints a warning, and copies it under `generated-backup/` in the state directory. A verification run should leave `git status` clean.

Confirm the evidence directory still exists after cleanup before citing it.

## Helpers

| Command | Script |
| --- | --- |
| `pnpm verify:launch` | `scripts/launch.mjs` |
| `pnpm verify:doctor` | `scripts/doctor.mjs` |
| `pnpm verify:smoke` | `scripts/smoke.mjs` (doctor, then `smoke.spec.ts`) |
| `pnpm verify:drive` | `scripts/smoke.mjs --drive` (doctor, then `drive.spec.ts`) |
| `pnpm verify:cleanup` | `scripts/cleanup.mjs` |
| `pnpm verify:test` | `scripts/snapshot.test.mjs` |
| `pnpm verify:typecheck` | `tsc --noEmit -p .agents/skills/verify-betterman/tsconfig.json` |

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
