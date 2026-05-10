#!/usr/bin/env bash
# dump-ai-trace.sh — print the most recent AI conversation trace from the API
# log file. Reads /tmp/maple-api.log (or $LOG_FILE if set) and pulls the last
# block of [ai-tools] / [award-search] / [apify-awards] / [serpapi] entries
# into a markdown-formatted summary you can paste into a bug report.
#
# Usage:
#   ./scripts/dump-ai-trace.sh             # last conversation
#   ./scripts/dump-ai-trace.sh --raw       # raw log lines, no formatting
#   LOG_FILE=/var/log/api.log ./scripts/dump-ai-trace.sh
#
# Why bash instead of a Go CLI: 80% of the value at 20% of the effort. Reads
# the existing slog JSONL output directly. No new schema, no new build.

set -euo pipefail

LOG_FILE="${LOG_FILE:-/tmp/maple-api.log}"
RAW=0

for arg in "$@"; do
  case "$arg" in
    --raw) RAW=1 ;;
    -h|--help)
      grep '^#' "$0" | sed 's/^# \?//'
      exit 0 ;;
  esac
done

if [[ ! -f "$LOG_FILE" ]]; then
  echo "error: log file not found at $LOG_FILE" >&2
  echo "set LOG_FILE=/path/to/api.log if the binary writes elsewhere" >&2
  exit 1
fi

# Find the last chat round-1 line — anchor for the most recent conversation.
LAST_ANCHOR_LINE=$(grep -n '\[ai-tools\] round complete.*round=1' "$LOG_FILE" 2>/dev/null | tail -1 | cut -d: -f1 || true)

if [[ -z "$LAST_ANCHOR_LINE" ]]; then
  echo "error: no recent AI chat found in $LOG_FILE" >&2
  echo "is the binary writing to that file? try: tail -f $LOG_FILE" >&2
  exit 1
fi

# Pull from 5 lines before the anchor (covers serpapi/apify start logs that
# precede the first round-complete) through the next chat-stream POST line.
START=$(( LAST_ANCHOR_LINE > 5 ? LAST_ANCHOR_LINE - 5 : 1 ))
TRACE=$(sed -n "${START},\$p" "$LOG_FILE" | awk '/POST.*\/chat\/stream.*200/ {print; exit} {print}')

if [[ "$RAW" -eq 1 ]]; then
  echo "$TRACE"
  exit 0
fi

# Markdown-formatted summary.
echo "# AI Conversation Trace"
echo
echo "_Source: \`$LOG_FILE\` (lines from ${START})_"
echo

# Apify run details (if present).
APIFY_RUN=$(echo "$TRACE" | grep -oE 'runID=[A-Za-z0-9]+' | head -1 || true)
APIFY_RESULTS=$(echo "$TRACE" | grep -oE 'apify returned items=[0-9]+' | head -1 || true)
SERPAPI=$(echo "$TRACE" | grep -oE 'serpapi returned prices=[0-9]+' | head -1 || true)

if [[ -n "$APIFY_RUN" || -n "$SERPAPI" ]]; then
  echo "## External API calls"
  [[ -n "$APIFY_RUN" ]] && echo "- Apify $APIFY_RUN ($APIFY_RESULTS)"
  [[ -n "$SERPAPI" ]] && echo "- SerpAPI: $SERPAPI"
  echo
fi

# Tool dispatch (parses [ai-tools] search_award_space results lines).
TOOL_RESULTS=$(echo "$TRACE" | grep -oE 'search_award_space results[^"]*"\[[^]]+\]"' | head -1 || true)
if [[ -n "$TOOL_RESULTS" ]]; then
  echo "## Tool: search_award_space"
  echo "\`\`\`"
  echo "$TOOL_RESULTS" | tr ',' '\n' | sed 's/^[[:space:]]*//'
  echo "\`\`\`"
  echo
fi

# Round summaries.
ROUNDS=$(echo "$TRACE" | grep -E 'round complete' || true)
if [[ -n "$ROUNDS" ]]; then
  echo "## LLM rounds"
  echo "\`\`\`"
  echo "$ROUNDS" | sed 's/.*\[ai-tools\] /  /' | sed 's/2026[^ ]* INFO //'
  echo "\`\`\`"
  echo
fi

# Final HTTP response line.
RESP=$(echo "$TRACE" | grep -E 'POST.*\/chat\/stream.*200' | tail -1 || true)
if [[ -n "$RESP" ]]; then
  ELAPSED=$(echo "$RESP" | grep -oE 'in [^ ]+$' || true)
  BYTES=$(echo "$RESP" | grep -oE '200 [0-9]+B' | head -1 || true)
  echo "## Response"
  echo "- Status: 200"
  echo "- Size: $BYTES"
  echo "- Wall clock: $ELAPSED"
  echo
fi

echo "---"
echo "_paste this trace into a bug report; raw log lines: \`$0 --raw\`_"
