#!/usr/bin/env bash

# Linux CI helper: requires GNU timeout semantics (`--kill-after`). Local
# diagnostics should run test-install-playwright-ci.sh, which mocks timeout.
install_playwright_ci() {
  local attempt
  local status
  local dependencies_ready=false
  local timeout_version

  if ! command -v timeout >/dev/null 2>&1; then
    echo "GNU timeout is required by the Linux CI Playwright installer." >&2
    return 127
  fi
  if ! timeout_version="$(timeout --version 2>&1)" ||
    [[ "$timeout_version" != *"GNU coreutils"* ]]; then
    echo "GNU timeout is required by the Linux CI Playwright installer." >&2
    return 127
  fi

  # A non-timeout apt/mirror failure gets one retry. A timeout stops
  # immediately so a possibly interrupted dpkg run cannot poison a second
  # attempt on the same runner.
  for attempt in 1 2; do
    status=0
    timeout --kill-after=15s 165s \
      pnpm -C nextjs exec playwright install-deps chromium || status=$?
    if ((status == 0)); then
      dependencies_ready=true
      break
    fi

    echo "Playwright dependency install failed (attempt ${attempt}/2, status ${status})." >&2
    if ((status == 124 || status == 137)); then
      echo "Dependency setup timed out; refusing an unsafe dpkg retry." >&2
      return "$status"
    fi
    if ((attempt < 2)); then sleep 5; fi
  done

  if [[ "$dependencies_ready" != true ]]; then
    return 1
  fi

  # Browser downloads are unprivileged and safe to retry. timeout owns the
  # process group and allows 15 seconds for cleanup after each 165-second run.
  for attempt in 1 2; do
    status=0
    timeout --kill-after=15s 165s \
      pnpm -C nextjs exec playwright install chromium || status=$?
    if ((status == 0)); then
      return 0
    fi

    echo "Playwright browser install failed (attempt ${attempt}/2, status ${status})." >&2
    if ((attempt < 2)); then sleep 5; fi
  done

  return 1
}

if [[ "${BASH_SOURCE[0]}" == "$0" ]]; then
  set -euo pipefail
  install_playwright_ci
fi
