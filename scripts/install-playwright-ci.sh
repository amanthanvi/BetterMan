#!/usr/bin/env bash

# Linux CI helper: requires GNU timeout semantics (`--kill-after` grace, and the
# signal reaching the whole process group). Ubuntu 26.04 ships uutils as
# `timeout` and keeps GNU's as `gnutimeout`, so either name is accepted when it
# is GNU coreutils. Local diagnostics should run test-install-playwright-ci.sh,
# which mocks both.
resolve_gnu_timeout() {
  local candidate
  local version

  for candidate in timeout gnutimeout; do
    if command -v "$candidate" >/dev/null 2>&1 &&
      version="$("$candidate" --version 2>&1)" &&
      [[ "$version" == *"GNU coreutils"* ]]; then
      printf '%s\n' "$candidate"
      return 0
    fi
  done
  return 1
}

install_playwright_ci() {
  local attempt
  local status
  local dependencies_ready=false
  local timeout_command

  if ! timeout_command="$(resolve_gnu_timeout)"; then
    echo "GNU timeout is required by the Linux CI Playwright installer; neither timeout nor gnutimeout is GNU coreutils." >&2
    return 127
  fi

  # A non-timeout apt/mirror failure gets one retry. A timeout stops
  # immediately so a possibly interrupted dpkg run cannot poison a second
  # attempt on the same runner.
  for attempt in 1 2; do
    status=0
    "$timeout_command" --kill-after=15s 165s \
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
    "$timeout_command" --kill-after=15s 165s \
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
