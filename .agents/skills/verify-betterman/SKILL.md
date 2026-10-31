---
name: verify-betterman
description: "Launch BetterMan locally, health-check it, and drive it with the Playwright specs in nextjs/e2e. Use when a change needs end-to-end evidence. Screenshots, traces, and logs stay in this skill's evidence directory."
---

# Verify BetterMan

Drive the running app the way a reader does, then keep the evidence here. The behavioral contract is `nextjs/e2e/`. Seeded-page checks and documented counts are `.agents/skills/render-man-page/SKILL.md`. Toolchain, the anonymous Convex loop, and pull-request guards are `AGENTS.md`, `docs/runbooks/e2e-debug.md`, and `docs/agents/`. This skill only sequences those and points Playwright at a directory it owns.

Open one file under `references/features/` for the surface you changed. Walk `references/features/README.md` top to bottom for a broad pass.

## Evidence

`BM_VERIFY_EVIDENCE` is `<repo>/.agents/skills/verify-betterman/evidence` (gitignored). Launch replaces that directory. Screenshots, traces, the HTML report, and command logs go there. Cleanup leaves the directory in place and stops only the processes launch recorded.

Run Playwright from `nextjs/`. The root `pnpm next:e2e` script inserts a `--`, and Playwright then treats later flags as file names.

## Install

From the repo root, with Node 26 and pnpm 10.34 on `PATH` (see `AGENTS.md`):

```bash
pnpm install --frozen-lockfile
bash scripts/install-playwright-ci.sh
```

The CI installer needs GNU `timeout` (or `gnutimeout`) and apt. When those are missing and Chromium is already installed, use the fallback in `AGENTS.md`:

```bash
pnpm -C nextjs exec playwright install chromium
```

## Launch

The specs run against the production server from the `e2e` job in `.github/workflows/ci.yml`: `next build`, then `next start`. `pnpm next:dev` is the loop in `AGENTS.md` and in the render-man-page skill. It is the wrong server for this drive. Man-page CSP checks expect no Next dev runtime.

Stop this checkout's `pnpm next:dev` before building. `convex dev --start` relaunches Next if you stop only the child. Leave a server from another checkout alone.

```bash
set -euo pipefail
export PATH="${NVM_DIR:-$HOME/.nvm}/versions/node/v26.5.1/bin:${HOME}/.local/bin:${PATH}"
cd "$(git rev-parse --show-toplevel)"

EVIDENCE="$(pwd)/.agents/skills/verify-betterman/evidence"
rm -rf "$EVIDENCE"
mkdir -p "$EVIDENCE"
chmod 700 "$EVIDENCE"

kill_tree() {
  local pid="$1" child
  for child in $(ps -o pid= --ppid "$pid"); do
    kill_tree "$child"
  done
  kill "$pid" 2>/dev/null || true
}

while read -r pid; do
  [[ -n "$pid" ]] || continue
  echo "stopping pnpm next:dev pid $pid"
  kill_tree "$pid"
done < <(ps -eo pid=,cmd= | awk '/pnpm next:dev/ && $0 !~ /awk/ { print $1 }')

for _ in $(seq 1 30); do
  if ! curl -fsS --max-time 1 http://127.0.0.1:3000/robots.txt >/dev/null 2>&1; then
    break
  fi
  sleep 1
done
if curl -fsS --max-time 1 http://127.0.0.1:3000/robots.txt >/dev/null 2>&1; then
  echo "port 3000 is still serving; stop that process before launch" >&2
  exit 2
fi

export CONVEX_AGENT_MODE=anonymous
export BETTERMAN_E2E_SEED=1
export BETTERMAN_DATASET_STAGE=prod
export CONVEX_INGEST_SECRET=e2e-secret
export RATE_LIMIT_TAG_KEY=e2e-rate-limit-key

npx convex dev --once 2>&1 | tee "$EVIDENCE/convex-once.log"
npx convex env set CONVEX_INGEST_SECRET "$CONVEX_INGEST_SECRET"
npx convex env set RATE_LIMIT_TAG_KEY "$RATE_LIMIT_TAG_KEY"

nohup npx convex dev --tail-logs disable >"$EVIDENCE/convex.log" 2>&1 &
echo $! >"$EVIDENCE/convex.pid"
for _ in $(seq 1 60); do
  if grep -q "Convex functions ready" "$EVIDENCE/convex.log"; then
    break
  fi
  sleep 1
done
grep -q "Convex functions ready" "$EVIDENCE/convex.log"

set -a
# shellcheck disable=SC1091
. ./.env.local
set +a
export CONVEX_URL="${CONVEX_URL:-$VITE_CONVEX_URL}"
export NEXT_PUBLIC_CONVEX_URL="$CONVEX_URL"
export PUBLIC_BASE_URL="http://127.0.0.1:3000"
CONVEX_HTTP_URL="${CONVEX_SITE_URL:-$VITE_CONVEX_SITE_URL}" node scripts/seed-convex-e2e.mjs 2>&1 | tee "$EVIDENCE/seed.log"

rm -rf nextjs/.next
pnpm next:build 2>&1 | tee "$EVIDENCE/build.log"

nohup pnpm -C nextjs exec next start -p 3000 >"$EVIDENCE/next.log" 2>&1 &
echo $! >"$EVIDENCE/next.pid"
for _ in $(seq 1 60); do
  if curl -fsS --max-time 1 http://127.0.0.1:3000/robots.txt >/dev/null 2>&1; then
    break
  fi
  sleep 1
done
curl -fsS --max-time 2 http://127.0.0.1:3000/robots.txt >/dev/null
```

`next build` can rewrite `nextjs/next-env.d.ts`. That file is generated. Do not commit it. Cleanup restores it when the diff is only that rewrite.

If `git status` shows `convex/_generated` drift after `convex dev --once`, the committed copy is stale. Report it. Do not include it in this skill's change.

## Health

```bash
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"
EVIDENCE="$(pwd)/.agents/skills/verify-betterman/evidence"
curl -fsS -o "$EVIDENCE/robots.txt" -w "%{http_code}\n" http://127.0.0.1:3000/robots.txt | tee "$EVIDENCE/health-robots.status"
curl -fsS http://127.0.0.1:3000/api/v1/info | tee "$EVIDENCE/info.json"
echo
node --input-type=module -e 'import fs from "node:fs"; const info=JSON.parse(fs.readFileSync(process.argv[1],"utf8")); if (!(info.pageCount>0)) { console.error(info); process.exit(1) } console.log("pageCount", info.pageCount, "release", info.datasetReleaseId)' "$EVIDENCE/info.json" | tee "$EVIDENCE/health-info.txt"
curl -fsS -G http://127.0.0.1:3000/api/v1/search --data-urlencode "q=tar" --data-urlencode "limit=5" | tee "$EVIDENCE/search-tar.json"
echo
node --input-type=module -e 'import fs from "node:fs"; const body=fs.readFileSync(process.argv[1],"utf8"); if (!body.includes("tar")) { console.error(body.slice(0,500)); process.exit(1) } console.log("search tar ok")' "$EVIDENCE/search-tar.json"
```

A missing `RATE_LIMIT_TAG_KEY` on the Next process answers 429. The value has to match the Convex env set during launch.

## Drive

One config layers screenshots and this evidence directory onto `nextjs/playwright.config.ts`. The product config stays the contract. `--config` is passed twice on purpose: the `e2e` script pins the product file, and the later flag selects the skill file.

```bash
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"
EVIDENCE="$(pwd)/.agents/skills/verify-betterman/evidence"
CONFIG="$(pwd)/.agents/skills/verify-betterman/evidence.config.ts"
export BM_VERIFY_EVIDENCE="$EVIDENCE"
export E2E_BASE_URL="http://127.0.0.1:3000"
pnpm -C nextjs e2e --config "$CONFIG" 2>&1 | tee "$EVIDENCE/e2e.log"
```

A passing run stores one screenshot per test under `evidence/test-results/` and the HTML report under `evidence/playwright-report/`. Traces are kept when a test fails (`trace: retain-on-failure`).

Capture a trace of a passing reader path as well:

```bash
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"
EVIDENCE="$(pwd)/.agents/skills/verify-betterman/evidence"
CONFIG="$(pwd)/.agents/skills/verify-betterman/evidence.config.ts"
export BM_VERIFY_EVIDENCE="$EVIDENCE"
export E2E_BASE_URL="http://127.0.0.1:3000"
pnpm -C nextjs e2e --config "$CONFIG" --trace on --output "$EVIDENCE/home-trace" e2e/home.spec.ts 2>&1 | tee "$EVIDENCE/home-trace.log"
```

For one feature, pass that spec's path (see the feature file), for example `e2e/search.spec.ts`.

## Render a man page

When the server from Launch is already healthy, follow the Render and Counts sections of `.agents/skills/render-man-page/SKILL.md`. Use this server. Do not start `pnpm next:dev` on port 3000 while it is running.

## Clean up

```bash
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"
EVIDENCE="$(pwd)/.agents/skills/verify-betterman/evidence"

kill_tree() {
  local pid="$1" child
  for child in $(ps -o pid= --ppid "$pid"); do
    kill_tree "$child"
  done
  kill "$pid" 2>/dev/null || true
}

for name in next convex; do
  file="$EVIDENCE/$name.pid"
  [[ -f "$file" ]] || continue
  pid="$(cat "$file")"
  echo "stopping $name pid $pid"
  kill_tree "$pid"
done

rm -rf nextjs/test-results nextjs/playwright-report
if ! git diff --quiet -- nextjs/next-env.d.ts; then
  git checkout -- nextjs/next-env.d.ts
fi
echo "evidence remains at $EVIDENCE"
```

## Report

Name the base URL, the `pageCount` line, the Playwright summary line from `evidence/e2e.log`, and any failed spec. Point at the evidence directory. For a rendering or count change, add the render-man-page report. A pull request's Proof section cites the head SHA (`docs/agents/pr-guards.md`).
