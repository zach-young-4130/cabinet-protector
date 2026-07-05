#!/bin/sh
# Claude Code Stop hook: type-check ppt-web before ending a turn.
#
#   ppt-web (tsc) -> BLOCKING: a type error stops the turn and is fed back to
#                    Claude to fix (JSON decision: block).
#
# RuboCop was intentionally removed here: it ran on every changed .rb file and
# re-surfaced ALL offenses in them (incl. pre-existing legacy), not just ones
# introduced this turn — so any edit to a legacy file spammed the same debt on
# every Stop. It was non-blocking anyway, and Overcommit is the real commit gate
# for parent-protech-api. To restore: re-add a `git diff --name-only HEAD -- '*.rb'`
# pass, but filter offenses to *added lines* (`git diff -U0`) so it honors
# "fix what you introduced."

ROOT="${CLAUDE_PROJECT_DIR:-/Users/zachyoung/Documents/parent-pro-tech}"
WEB="$ROOT/ppt-web"

tsc_err=""

# --- Web: tsc whole-program check when a .ts changed (blocking) ---
if [ -d "$WEB/.git" ]; then
  ts=$( { git -C "$WEB" diff --name-only --diff-filter=ACM HEAD -- '*.ts' 2>/dev/null
          git -C "$WEB" ls-files --others --exclude-standard -- '*.ts' 2>/dev/null; } )
  if [ -n "$ts" ]; then
    out=$( cd "$WEB" && npx tsc -p tsconfig.app.json --noEmit 2>&1 )
    [ $? -ne 0 ] && tsc_err="$out"
  fi
fi

# Emit the Stop-hook JSON (block on tsc only).
TSC_ERR="$tsc_err" ruby -rjson -e '
ts = ENV["TSC_ERR"].to_s
unless ts.empty?
  puts JSON.generate({ decision: "block", reason: "TypeScript errors in ppt-web — fix before finishing:\n#{ts}" })
end
'
exit 0
