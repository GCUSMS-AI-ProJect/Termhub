set -eu
printf '%s\n' 'TERMHUB_REA_STAGE:checking-runtime' >&2
export PATH="$HOME/.local/bin:$HOME/.volta/bin:/usr/local/bin:/opt/homebrew/bin:$PATH"
# Non-interactive SSH shells often omit an existing nvm installation from PATH.
if ! command -v node >/dev/null 2>&1; then
  for rea_node_bin in "$HOME"/.nvm/versions/node/*/bin; do
    if [ -x "$rea_node_bin/node" ] && "$rea_node_bin/node" -e 'const [a,b]=process.versions.node.split(".").map(Number);process.exit((a===22&&b>=19)||(a===24&&b>=11)||a>=26?0:1)'; then
      export PATH="$rea_node_bin:$PATH"
      break
    fi
  done
fi
if ! command -v node >/dev/null 2>&1 || ! command -v npm >/dev/null 2>&1; then
  printf '%s\n' 'REA_NODE_REQUIRED: Install Node.js 22.19+, 24.11+ or 26+ and npm for this SSH login user.' >&2
  exit 72
fi
node -e 'const [a,b]=process.versions.node.split(".").map(Number);process.exit((a===22&&b>=19)||(a===24&&b>=11)||a>=26?0:1)' || {
  printf '%s\n' 'REA_NODE_VERSION: Node.js must be 22.19+, 24.11+ or 26+.' >&2
  exit 72
}
rea_cache="${XDG_CACHE_HOME:-$HOME/.cache}/transterm/rea/6.7.0"
rea_entry="$rea_cache/node_modules/rea-agents/scripts/rea.mjs"
if [ ! -f "$rea_cache/.ready" ] || [ ! -f "$rea_entry" ]; then
  printf '%s\n' 'TERMHUB_REA_STAGE:preparing-package' >&2
  mkdir -p "$rea_cache"
  rea_lock="$rea_cache/.install-lock"
  rea_attempt=0
  until mkdir "$rea_lock" 2>/dev/null; do
    rea_attempt=$((rea_attempt + 1))
    if [ "$rea_attempt" -gt 120 ]; then
      printf '%s\n' 'REA_PREPARING: another installation is running; retry after it finishes. If it was interrupted, remove the empty .install-lock directory in the REA user cache.' >&2
      exit 73
    fi
    sleep 1
  done
  trap 'rmdir "$rea_lock" 2>/dev/null || true' EXIT HUP INT TERM
  # Per-user fixed version; never register agents or use a global npm install.
  if [ ! -f "$rea_cache/.ready" ] || [ ! -f "$rea_entry" ]; then
    npm install --prefix "$rea_cache" --no-audit --no-fund --ignore-scripts --package-lock=true rea-agents@6.7.0 >&2
    test -f "$rea_cache/node_modules/rea-agents/dist/mcp/main.js"
    touch "$rea_cache/.ready"
  fi
  rmdir "$rea_lock"
  trap - EXIT HUP INT TERM
fi
export REA_MCP_MAX_RESPONSE_BYTES=16777216
export REA_MCP_OUTPUT_SCHEMA_PROFILE=off
printf '%s\n' 'TERMHUB_REA_STAGE:starting' >&2
exec node "$rea_entry" mcp
