#!/usr/bin/env bash

set -uo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# shellcheck source=scripts/install-playwright-ci.sh
source "${repo_root}/scripts/install-playwright-ci.sh"

declare -a fake_statuses=()
declare -a fake_commands=()
declare -a fake_sleeps=()

timeout() {
  fake_commands+=("$*")
  local index=$((${#fake_commands[@]} - 1))
  return "${fake_statuses[$index]:-0}"
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
  for command in "${fake_commands[@]}"; do
    if [[ "$command" == *" install-deps chromium" ]]; then
      stages+=(dependencies)
    elif [[ "$command" == *" install chromium" ]]; then
      stages+=(browser)
    else
      stages+=(unknown)
    fi
  done

  local stage_csv
  local sleep_csv
  stage_csv="$(join_by_comma "${stages[@]}")"
  sleep_csv="$(join_by_comma "${fake_sleeps[@]-}")"

  assert_equal "$case_name" status "$expected_status" "$status" || return 1
  assert_equal "$case_name" stages "$expected_stages" "$stage_csv" || return 1
  assert_equal "$case_name" sleeps "$expected_sleeps" "$sleep_csv" || return 1
}

run_case success 0 dependencies,browser "" 0 0 || exit 1
run_case dependency-retry 0 dependencies,dependencies,browser 5 1 0 0 || exit 1
run_case dependency-timeout 124 dependencies "" 124 || exit 1
run_case dependency-kill 137 dependencies "" 137 || exit 1
run_case dependency-exhausted 1 dependencies,dependencies 5 2 3 || exit 1
run_case browser-retry 0 dependencies,browser,browser 5 0 1 0 || exit 1
run_case browser-exhausted 1 dependencies,browser,browser 5 0 1 2 || exit 1

echo "Playwright CI installer tests passed (7 scenarios)."
