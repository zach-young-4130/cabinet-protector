#!/usr/bin/env bash
#
# deploy-production.sh — Build the ppt-web Angular app (production config) and
# deploy the static bundle to S3 + invalidate CloudFront. Production sibling of
# deploy-staging.sh, mirroring the master branch of
# .github/workflows/frontend-deploy.yml.
#
# This is the STATIC S3/CloudFront path (SPA). It does NOT deploy SSR/ECS.
#
# !!! THIS DEPLOYS TO PRODUCTION (app.parentprotech.com). !!!
# The S3 sync uses --delete, which removes anything in the bucket that is not
# in the freshly built bundle. Make sure you are on the intended commit.
#
# Usage:
#   ./deploy-production.sh                 # interactive confirm
#   FORCE=1 ./deploy-production.sh         # skip the confirmation prompt (CI)
#   DRYRUN=1 ./deploy-production.sh        # show what would sync, change nothing
#
# Configuration (env vars or a .env file next to this script). Defaults below
# match the live production resources; override only if they change.
#   AWS_REGION                  default: us-east-2
#   S3_BUCKET                   default: app.parentprotech.com
#   CLOUDFRONT_DISTRIBUTION_ID  default: E1RGPSIKF73B7V (invalidated if set)
#
# Optional:
#   APP_DIR        path to the ppt-web repo (default: ../ppt-web relative to this script)
#   AWS_PROFILE    passed through to the aws CLI if you use named profiles
#   SKIP_BUILD=1   reuse an existing dist/ build instead of rebuilding
#   FORCE=1        skip the interactive production confirmation
#   DRYRUN=1       run `aws s3 sync --dryrun` and skip the invalidation
set -euo pipefail

# --- locate things -----------------------------------------------------------
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_DIR="${APP_DIR:-$SCRIPT_DIR/../ppt-web}"

# Load a local .env (untracked) if present, for convenience.
if [[ -f "$SCRIPT_DIR/.env" ]]; then
  # shellcheck disable=SC1091
  set -a; source "$SCRIPT_DIR/.env"; set +a
fi

# --- production defaults (override via env / .env if resources change) -------
AWS_REGION="${AWS_REGION:-us-east-2}"
S3_BUCKET="${S3_BUCKET:-app.parentprotech.com}"
CLOUDFRONT_DISTRIBUTION_ID="${CLOUDFRONT_DISTRIBUTION_ID:-E1RGPSIKF73B7V}"

# --- validate config ---------------------------------------------------------
fail() { echo "ERROR: $*" >&2; exit 1; }

[[ -d "$APP_DIR" ]] || fail "APP_DIR not found: $APP_DIR"
command -v aws >/dev/null 2>&1 || fail "aws CLI not found on PATH"
command -v npm >/dev/null 2>&1 || fail "npm not found on PATH"

echo "==> TARGET:         PRODUCTION"
echo "==> App dir:        $APP_DIR"
echo "==> AWS region:     $AWS_REGION"
echo "==> S3 bucket:      $S3_BUCKET"
echo "==> CloudFront:     ${CLOUDFRONT_DISTRIBUTION_ID:-<none, skipping invalidation>}"
echo "==> AWS profile:    ${AWS_PROFILE:-<default>}"
echo "==> Dry run:        ${DRYRUN:-0}"

# --- verify credentials before doing any work --------------------------------
echo "==> Verifying AWS credentials..."
CALLER_ARN="$(aws sts get-caller-identity --region "$AWS_REGION" --query Arn --output text 2>/dev/null)" \
  || fail "AWS credentials not valid. Configure them (aws configure / AWS_PROFILE / SSO)."
echo "==> Caller identity: $CALLER_ARN"

# --- report the commit being shipped -----------------------------------------
if git -C "$APP_DIR" rev-parse --git-dir >/dev/null 2>&1; then
  GIT_BRANCH="$(git -C "$APP_DIR" rev-parse --abbrev-ref HEAD)"
  GIT_SHA="$(git -C "$APP_DIR" rev-parse --short HEAD)"
  GIT_DIRTY=""
  git -C "$APP_DIR" diff --quiet --ignore-submodules HEAD 2>/dev/null || GIT_DIRTY=" (uncommitted changes present)"
  echo "==> Commit:         $GIT_BRANCH @ $GIT_SHA$GIT_DIRTY"
fi

# --- confirmation gate -------------------------------------------------------
if [[ "${FORCE:-0}" != "1" && "${DRYRUN:-0}" != "1" ]]; then
  echo
  echo "About to deploy to PRODUCTION bucket '$S3_BUCKET' with --delete."
  read -r -p "Type the bucket name to confirm: " CONFIRM
  [[ "$CONFIRM" == "$S3_BUCKET" ]] || fail "Confirmation did not match; aborting."
fi

cd "$APP_DIR"

# --- build -------------------------------------------------------------------
if [[ "${SKIP_BUILD:-0}" == "1" ]]; then
  echo "==> SKIP_BUILD=1, reusing existing dist/"
else
  echo "==> Installing dependencies (npm ci --legacy-peer-deps)..."
  npm ci --legacy-peer-deps
  echo "==> Building Angular (production config)..."
  npm run build:prod
fi

# --- locate the static browser bundle ----------------------------------------
BUILD_DIR="$(find dist -type d -name browser | head -n1)"
[[ -n "$BUILD_DIR" && -d "$BUILD_DIR" ]] || fail "Could not find a dist/**/browser build dir. Did the build succeed?"
[[ -f "$BUILD_DIR/index.html" ]] || fail "No index.html in $BUILD_DIR; refusing to sync an incomplete build."
echo "==> Uploading from: $BUILD_DIR"

# --- sync to S3 --------------------------------------------------------------
# 1) Upload everything with a long, immutable cache. Angular content-hashes
#    bundles/assets, so a given URL never changes — safe to cache for a year.
SYNC_ARGS=(--delete --region "$AWS_REGION" --cache-control "public, max-age=31536000, immutable")
[[ "${DRYRUN:-0}" == "1" ]] && SYNC_ARGS+=(--dryrun)
aws s3 sync "$BUILD_DIR" "s3://${S3_BUCKET}/" "${SYNC_ARGS[@]}"

# 2) Re-upload the service-worker control files + app shell with no-cache so
#    the PWA always revalidates them and can detect new releases. cp (not sync)
#    forces the metadata even when the bytes are unchanged. Only files that
#    exist in the build are updated. Skipped on DRYRUN since `aws s3 cp` has no
#    dry-run mode.
if [[ "${DRYRUN:-0}" == "1" ]]; then
  echo "==> DRYRUN: skipping no-cache re-upload of control files."
else
  for f in ngsw.json ngsw-worker.js safety-worker.js worker-basic.min.js index.html index.csr.html manifest.webmanifest; do
    [[ -f "$BUILD_DIR/$f" ]] || continue
    case "$f" in
      *.html)        CT=text/html ;;
      *.js)          CT=text/javascript ;;
      *.json)        CT=application/json ;;
      *.webmanifest) CT=application/manifest+json ;;
      *)             CT=application/octet-stream ;;
    esac
    aws s3 cp "$BUILD_DIR/$f" "s3://${S3_BUCKET}/$f" \
      --region "$AWS_REGION" \
      --cache-control "no-cache, max-age=0, must-revalidate" \
      --content-type "$CT"
  done
fi

# --- invalidate CloudFront (optional) ----------------------------------------
if [[ "${DRYRUN:-0}" == "1" ]]; then
  echo "==> DRYRUN: skipping CloudFront invalidation."
elif [[ -n "${CLOUDFRONT_DISTRIBUTION_ID:-}" ]]; then
  echo "==> Invalidating CloudFront cache..."
  aws cloudfront create-invalidation \
    --distribution-id "$CLOUDFRONT_DISTRIBUTION_ID" \
    --paths "/*" \
    --region "$AWS_REGION"
fi

echo "==> Done. Production deploy complete. Verify https://app.parentprotech.com"