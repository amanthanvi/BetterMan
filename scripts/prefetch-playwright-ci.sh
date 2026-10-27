#!/usr/bin/env bash

set -euo pipefail
cache_dir="$HOME/.cache/playwright-apt"
mkdir -p "$cache_dir"
sudo apt-get update -qq
if compgen -G "$cache_dir/*.deb" >/dev/null; then
  sudo cp "$cache_dir"/*.deb /var/cache/apt/archives/
fi
# The dry run exits 1 when packages are missing, so its status is not
# an error signal; its output is.
dry_run="$(pnpm -C nextjs exec playwright install-deps --dry-run chromium 2>&1)" || true
packages=()
while IFS= read -r package; do
  packages+=("$package")
done < <(sed -n 's/^  \([a-z0-9][a-z0-9.+:-]*\)$/\1/p' <<<"$dry_run")
if ((${#packages[@]} == 0)); then
  if [[ "$dry_run" == *"All system dependencies are installed."* ]]; then
    echo "No Playwright system packages to fetch."
  else
    echo "::warning::Playwright's dependency dry run listed no packages, so nothing was prefetched."
    tail -n 20 <<<"$dry_run"
  fi
  exit 0
fi
echo "Fetching ${#packages[@]} packages: ${packages[*]}"
for attempt in 1 2 3; do
  if sudo apt-get install --download-only -y -q --no-install-recommends "${packages[@]}"; then
    cp /var/cache/apt/archives/*.deb "$cache_dir"/ 2>/dev/null || true
    exit 0
  fi
  echo "Package prefetch attempt ${attempt}/3 failed." >&2
  sleep 5
done
exit 1
