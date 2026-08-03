#!/usr/bin/env bash

set -euo pipefail

if [[ ! -f "nextjs/vercel.json" ]]; then
  echo "Run this script from the repository root so Vercel can apply rootDirectory=nextjs exactly once." >&2
  exit 1
fi

required_env=(
  BETTERMAN_DEPLOY_REF
  BETTERMAN_DEPLOY_SHA
  BETTERMAN_PRODUCTION_DOMAIN
  VERCEL_ORG_ID
  VERCEL_PROJECT_ID
  VERCEL_TOKEN
)

for name in "${required_env[@]}"; do
  if [[ -z "${!name:-}" ]]; then
    echo "Missing required environment variable: ${name}" >&2
    exit 1
  fi
done

for command in curl git jq vercel; do
  if ! command -v "$command" >/dev/null 2>&1; then
    echo "Required command is unavailable: ${command}" >&2
    exit 1
  fi
done

checkout_sha="$(git rev-parse HEAD)"
if [[ "$checkout_sha" != "$BETTERMAN_DEPLOY_SHA" ]]; then
  echo "Refusing to deploy: checkout ${checkout_sha} does not match requested SHA ${BETTERMAN_DEPLOY_SHA}." >&2
  exit 1
fi

vercel pull \
  --yes \
  --environment=production \
  --token="$VERCEL_TOKEN"

previous_production_json="$(
  vercel inspect "$BETTERMAN_PRODUCTION_DOMAIN" \
    --json \
    --token="$VERCEL_TOKEN"
)"
previous_production_id="$(jq -r '.id // .deployment.id // empty' <<<"$previous_production_json")"
if [[ -z "$previous_production_id" ]]; then
  echo "Unable to resolve the current production deployment for ${BETTERMAN_PRODUCTION_DOMAIN}." >&2
  exit 1
fi

PUBLIC_BASE_URL="https://${BETTERMAN_PRODUCTION_DOMAIN}" \
  VERCEL_GIT_COMMIT_REF="$BETTERMAN_DEPLOY_REF" \
  VERCEL_GIT_COMMIT_SHA="$BETTERMAN_DEPLOY_SHA" \
  vercel build --prod --yes --token="$VERCEL_TOKEN"

deployment_json="$(
  vercel deploy \
    --prebuilt \
    --prod \
    --skip-domain \
    --archive=tgz \
    --yes \
    --json \
    --env "PUBLIC_BASE_URL=https://${BETTERMAN_PRODUCTION_DOMAIN}" \
    --meta "githubCommitSha=${BETTERMAN_DEPLOY_SHA}" \
    --meta "githubCommitRef=${BETTERMAN_DEPLOY_REF}" \
    --token="$VERCEL_TOKEN"
)"

deployment_id="$(jq -r '.id // .deployment.id // empty' <<<"$deployment_json")"
deployment_url="$(jq -r '.url // .deployment.url // empty' <<<"$deployment_json")"

if [[ -z "$deployment_id" || -z "$deployment_url" ]]; then
  echo "Vercel returned no deployment ID or URL." >&2
  jq . <<<"$deployment_json" >&2
  exit 1
fi

if [[ "$deployment_url" != https://* ]]; then
  deployment_url="https://${deployment_url}"
fi

inspection_json="$(vercel inspect "$deployment_id" --wait --timeout=5m --json --token="$VERCEL_TOKEN")"
ready_state="$(jq -r '.readyState // .state // .deployment.readyState // .deployment.state // empty' <<<"$inspection_json")"
deployment_record="$(
  vercel api "/v13/deployments/${deployment_id}" \
    --raw \
    --token="$VERCEL_TOKEN"
)"
deployed_sha="$(jq -r '.meta.githubCommitSha // empty' <<<"$deployment_record")"

if [[ "$ready_state" != "READY" ]]; then
  echo "Deployment ${deployment_id} did not become READY (state=${ready_state:-unknown})." >&2
  exit 1
fi

if [[ "$deployed_sha" != "$BETTERMAN_DEPLOY_SHA" ]]; then
  echo "Deployment metadata SHA ${deployed_sha:-missing} does not match ${BETTERMAN_DEPLOY_SHA}." >&2
  exit 1
fi

smoke_dir="$(mktemp -d "${RUNNER_TEMP:-/tmp}/betterman-vercel-smoke.XXXXXX")"

vercel curl /api/v1/info \
  --deployment "$deployment_url" \
  --yes \
  -- --fail --silent --show-error >"${smoke_dir}/info.json"
jq -e '.datasetReleaseId | select(type == "string" and length > 0 and . != "uninitialized")' \
  "${smoke_dir}/info.json" >/dev/null

vercel curl /robots.txt \
  --deployment "$deployment_url" \
  --yes \
  -- --fail --silent --show-error >"${smoke_dir}/robots.txt"
grep -qi '^User-agent:' "${smoke_dir}/robots.txt"
grep -Fqi "Sitemap: https://${BETTERMAN_PRODUCTION_DOMAIN}/sitemap.xml" "${smoke_dir}/robots.txt"

vercel curl /sitemap.xml \
  --deployment "$deployment_url" \
  --yes \
  -- --fail --silent --show-error >"${smoke_dir}/sitemap.xml"
grep -qi '<sitemapindex' "${smoke_dir}/sitemap.xml"
grep -Fqi "<loc>https://${BETTERMAN_PRODUCTION_DOMAIN}/" "${smoke_dir}/sitemap.xml"

vercel curl /man/tar/1 \
  --deployment "$deployment_url" \
  --yes \
  -- --fail --silent --show-error >"${smoke_dir}/man.html"
grep -qi '<title>.*tar' "${smoke_dir}/man.html"
grep -Fqi 'id="bm-jsonld:' "${smoke_dir}/man.html"
if grep -Fqi 'Not found — BetterMan' "${smoke_dir}/man.html"; then
  echo "Representative man-page smoke returned the not-found view." >&2
  exit 1
fi

if [[ "${BETTERMAN_REQUIRE_CURRENT_MAIN:-false}" == "true" ]]; then
  current_main_sha="$(git ls-remote --exit-code origin refs/heads/main | awk '{print $1}')"
  if [[ "$current_main_sha" != "$BETTERMAN_DEPLOY_SHA" ]]; then
    echo "Refusing to promote stale SHA ${BETTERMAN_DEPLOY_SHA}; current main is ${current_main_sha:-unknown}." >&2
    exit 1
  fi
fi

promotion_verified=false
rollback_on_failure() {
  status="${1:-$?}"
  trap - EXIT INT TERM
  if [[ "$status" -ne 0 && "$promotion_verified" != "true" && "$previous_production_id" != "$deployment_id" ]]; then
    echo "Production promotion or verification failed; rolling back to ${previous_production_id}." >&2
    vercel rollback "$previous_production_id" --yes --token="$VERCEL_TOKEN" >&2 || \
      echo "Automatic rollback failed; restore ${previous_production_id} manually." >&2
  fi
  exit "$status"
}

trap rollback_on_failure EXIT
trap 'rollback_on_failure 130' INT
trap 'rollback_on_failure 143' TERM
vercel promote "$deployment_id" \
  --yes \
  --timeout=5m \
  --token="$VERCEL_TOKEN"

for domain in "$BETTERMAN_PRODUCTION_DOMAIN" "www.${BETTERMAN_PRODUCTION_DOMAIN}"; do
  production_id=""
  for _ in {1..12}; do
    production_json="$(vercel inspect "$domain" --json --token="$VERCEL_TOKEN" 2>/dev/null || true)"
    [[ -n "$production_json" ]] || production_json='{}'
    production_id="$(jq -r '.id // .deployment.id // empty' <<<"$production_json")"
    if [[ "$production_id" == "$deployment_id" ]]; then
      break
    fi
    sleep 5
  done

  if [[ "$production_id" != "$deployment_id" ]]; then
    echo "Production alias ${domain} points to ${production_id:-unknown}, expected ${deployment_id}." >&2
    exit 1
  fi

  vercel curl /api/v1/info \
    --deployment "https://${domain}" \
    --yes \
    -- --fail --location --silent --show-error >"${smoke_dir}/${domain}-info.json"
  jq -e '.datasetReleaseId | select(type == "string" and length > 0 and . != "uninitialized")' \
    "${smoke_dir}/${domain}-info.json" >/dev/null
done

promotion_verified=true
trap - EXIT INT TERM

if [[ -n "${GITHUB_OUTPUT:-}" ]]; then
  {
    printf 'deployment_id=%s\n' "$deployment_id"
    printf 'deployment_url=%s\n' "$deployment_url"
    printf 'sha=%s\n' "$deployed_sha"
  } >>"$GITHUB_OUTPUT"
fi

printf 'Vercel production READY: %s (%s)\n' "$deployment_url" "$deployed_sha"
