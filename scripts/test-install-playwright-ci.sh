#!/usr/bin/env bash

set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# shellcheck source=scripts/install-playwright-ci.sh
source "${repo_root}/scripts/install-playwright-ci.sh"

declare -a fake_statuses=()
declare -a fake_commands=()
declare -a fake_sleeps=()
fake_timeout_version="timeout (GNU coreutils) test"
# Empty means gnutimeout is not installed. Ubuntu 26.04 runners have a real
# /usr/bin/gnutimeout, so the function has to shadow it in every case.
fake_gnutimeout_version=""

fake_timeout() {
  local name="$1"
  local version="$2"
  shift 2
  if [[ "${1:-}" == "--version" ]]; then
    if [[ -z "$version" ]]; then
      return 127
    fi
    printf '%s\n' "$version"
    return 0
  fi
  fake_commands+=("$name $*")
  local index=$((${#fake_commands[@]} - 1))
  return "${fake_statuses[$index]:-0}"
}

timeout() {
  fake_timeout timeout "$fake_timeout_version" "$@"
}

gnutimeout() {
  fake_timeout gnutimeout "$fake_gnutimeout_version" "$@"
}

sleep() {
  fake_sleeps+=("$1")
}

assert_equal() {
  local case_name="$1"
  local field="$2"
  local expected="$3"
  local actual="$4"

  if [[ "$actual" != "$expected" ]]; then
    printf '%s: expected %s=%q, got %q\n' "$case_name" "$field" "$expected" "$actual" >&2
    return 1
  fi
}

join_by_comma() {
  local IFS=,
  printf '%s' "$*"
}

run_case() {
  local case_name="$1"
  local expected_status="$2"
  local expected_stages="$3"
  local expected_sleeps="$4"
  local expected_timeout="${expected_timeout:-timeout}"
  shift 4

  fake_statuses=("$@")
  fake_commands=()
  fake_sleeps=()

  local status=0
  if install_playwright_ci >/dev/null 2>&1; then
    status=0
  else
    status=$?
  fi

  local -a stages=()
  local command
  for command in ${fake_commands[@]+"${fake_commands[@]}"}; do
    assert_equal "$case_name" timeout "$expected_timeout" "${command%% *}" || return 1
    if [[ "$command" == "$expected_timeout --kill-after=15s 165s pnpm -C nextjs exec playwright install-deps chromium" ]]; then
      stages+=(dependencies)
    elif [[ "$command" == "$expected_timeout --kill-after=15s 165s pnpm -C nextjs exec playwright install chromium" ]]; then
      stages+=(browser)
    else
      stages+=(unknown)
    fi
  done

  local stage_csv
  local sleep_csv
  stage_csv="$(join_by_comma "${stages[@]-}")"
  sleep_csv="$(join_by_comma "${fake_sleeps[@]-}")"

  assert_equal "$case_name" status "$expected_status" "$status" || return 1
  assert_equal "$case_name" stages "$expected_stages" "$stage_csv" || return 1
  assert_equal "$case_name" sleeps "$expected_sleeps" "$sleep_csv" || return 1
}

fake_timeout_version="BusyBox timeout"
run_case busybox-timeout 127 "" "" || exit 1
fake_timeout_version="timeout (uutils coreutils) 0.10.0"
run_case uutils-timeout 127 "" "" || exit 1
fake_gnutimeout_version="BusyBox timeout"
run_case non-gnu-gnutimeout 127 "" "" || exit 1
fake_gnutimeout_version="timeout (GNU coreutils) 9.7"
expected_timeout=gnutimeout run_case uutils-with-gnutimeout 0 dependencies,browser "" 0 0 || exit 1
expected_timeout=gnutimeout run_case gnutimeout-kill 137 dependencies "" 137 || exit 1
# GNU timeout wins even when gnutimeout is also GNU (both present).
fake_timeout_version="timeout (GNU coreutils) test"
run_case gnu-timeout-preferred 0 dependencies,browser "" 0 0 || exit 1
# Ubuntu 24.04: GNU timeout and no gnutimeout. The subshell drops the mock and
# empties PATH so command -v really finds nothing for gnutimeout.
(
  unset -f gnutimeout
  # shellcheck disable=SC2123 # every command the installer runs here is a mock
  PATH=/nonexistent
  run_case gnutimeout-not-on-path 0 dependencies,browser "" 0 0
) || exit 1
fake_gnutimeout_version=""

# The remaining cases run as on Ubuntu 24.04: GNU timeout, no gnutimeout.
run_case success 0 dependencies,browser "" 0 0 || exit 1
run_case dependency-retry 0 dependencies,dependencies,browser 5 1 0 0 || exit 1
run_case dependency-timeout 124 dependencies "" 124 || exit 1
run_case dependency-kill 137 dependencies "" 137 || exit 1
run_case dependency-exhausted 1 dependencies,dependencies 5 2 3 || exit 1
run_case browser-retry 0 dependencies,browser,browser 5 0 1 0 || exit 1
run_case browser-exhausted 1 dependencies,browser,browser 5 0 1 2 || exit 1

echo "Playwright CI installer tests passed (14 scenarios)."
