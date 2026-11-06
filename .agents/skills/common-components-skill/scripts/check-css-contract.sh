#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../../../.." && pwd)"
RENDERER="$REPO_ROOT/apps/tauri/src/renderer"
TOKEN_DIR="$RENDERER/styles/tokens"
SEMANTIC="$TOKEN_DIR/semantic.css"
COMMON="$RENDERER/components/common"
FEATURES="$RENDERER/features"
FEATURES_REL="apps/tauri/src/renderer/features"
CSS_CONTRACT_BASE="${CSS_CONTRACT_BASE:-origin/main}"

DIRECT_COLOR_PATTERN='#[0-9a-fA-F]{3,8}\b|\b(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch|color|device-cmyk)\s*\('
NAMED_COLOR_PATTERN='(?ix)(?<![\w.-])(?:
  aliceblue|antiquewhite|aqua|aquamarine|azure|beige|bisque|black|blanchedalmond|blue|blueviolet|brown|burlywood|cadetblue|chartreuse|chocolate|coral|cornflowerblue|cornsilk|crimson|cyan|
  darkblue|darkcyan|darkgoldenrod|darkgray|darkgreen|darkgrey|darkkhaki|darkmagenta|darkolivegreen|darkorange|darkorchid|darkred|darksalmon|darkseagreen|darkslateblue|darkslategray|darkslategrey|darkturquoise|darkviolet|deeppink|deepskyblue|dimgray|dimgrey|dodgerblue|
  firebrick|floralwhite|forestgreen|fuchsia|gainsboro|ghostwhite|gold|goldenrod|gray|green|greenyellow|grey|honeydew|hotpink|indianred|indigo|ivory|khaki|lavender|lavenderblush|lawngreen|lemonchiffon|lightblue|lightcoral|lightcyan|lightgoldenrodyellow|lightgray|lightgreen|lightgrey|lightpink|lightsalmon|lightseagreen|lightskyblue|lightslategray|lightslategrey|lightsteelblue|lightyellow|lime|limegreen|linen|
  magenta|maroon|mediumaquamarine|mediumblue|mediumorchid|mediumpurple|mediumseagreen|mediumslateblue|mediumspringgreen|mediumturquoise|mediumvioletred|midnightblue|mintcream|mistyrose|moccasin|navajowhite|navy|oldlace|olive|olivedrab|orange|orangered|orchid|palegoldenrod|palegreen|paleturquoise|palevioletred|papayawhip|peachpuff|peru|pink|plum|powderblue|purple|rebeccapurple|red|rosybrown|royalblue|saddlebrown|salmon|sandybrown|seagreen|seashell|sienna|silver|skyblue|slateblue|slategray|slategrey|snow|springgreen|steelblue|tan|teal|thistle|tomato|turquoise|violet|wheat|white|whitesmoke|yellow|yellowgreen
)(?![\w-])'
TSX_NAMED_COLOR_PATTERN="(?ix)\\b(?:accentColor|background|backgroundColor|borderColor|boxShadow|caretColor|color|columnRuleColor|fill|floodColor|lightingColor|outlineColor|stopColor|stroke|textDecorationColor|textEmphasisColor|textShadow)\\s*[:=]\\s*['\"][^'\"]*${NAMED_COLOR_PATTERN}"

if [[ ! -d "$RENDERER" || ! -f "$SEMANTIC" ]]; then
  echo "[ERROR] transterm renderer or semantic.css was not found."
  echo "       Run this script from the transterm repository."
  exit 2
fi

failures=0
FEATURE_CSS_FILES=()

check_matches() {
  local label="$1"
  local pattern="$2"
  shift 2
  local output

  local status
  if output="$(rg -n --pcre2 --glob '*.css' --glob '*.tsx' "$pattern" "$@" 2>&1)"; then
    echo "[FAIL] $label"
    echo "$output"
    failures=$((failures + 1))
  else
    status=$?
    if (( status > 1 )); then
      echo "[ERROR] Could not check: $label (rg exited $status)"
      [[ -z "$output" ]] || echo "$output"
      failures=$((failures + 1))
    fi
  fi
}

check_css_matches() {
  local label="$1"
  local pattern="$2"
  shift 2
  local output

  local status
  if output="$(rg -n --pcre2 --glob '*.css' "$pattern" "$@" 2>&1)"; then
    echo "[FAIL] $label"
    echo "$output"
    failures=$((failures + 1))
  else
    status=$?
    if (( status > 1 )); then
      echo "[ERROR] Could not check: $label (rg exited $status)"
      [[ -z "$output" ]] || echo "$output"
      failures=$((failures + 1))
    fi
  fi
}

collect_changed_feature_css() {
  local base_commit changed_files untracked_files all_files file

  if ! base_commit="$(git -C "$REPO_ROOT" merge-base "$CSS_CONTRACT_BASE" HEAD 2>&1)"; then
    echo "[ERROR] Could not find merge-base for CSS_CONTRACT_BASE='$CSS_CONTRACT_BASE'."
    echo "$base_commit"
    failures=$((failures + 1))
    return
  fi
  if ! changed_files="$(git -C "$REPO_ROOT" diff --name-only --diff-filter=ACMRT "$base_commit" -- "$FEATURES_REL" 2>&1)"; then
    echo "[ERROR] Could not list changed feature files."
    echo "$changed_files"
    failures=$((failures + 1))
    return
  fi
  if ! untracked_files="$(git -C "$REPO_ROOT" ls-files --others --exclude-standard -- "$FEATURES_REL" 2>&1)"; then
    echo "[ERROR] Could not list untracked feature files."
    echo "$untracked_files"
    failures=$((failures + 1))
    return
  fi

  all_files="$(printf '%s\n%s\n' "$changed_files" "$untracked_files" | sort -u)"
  FEATURE_CSS_FILES=()
  while IFS= read -r file; do
    if [[ "$file" == "$FEATURES_REL/"*.css && -f "$REPO_ROOT/$file" ]]; then
      FEATURE_CSS_FILES+=("$REPO_ROOT/$file")
    fi
  done <<< "$all_files"
}

count_matches() {
  local label="$1"
  local pattern="$2"
  shift 2
  local output status

  if output="$(rg -n --pcre2 --glob '*.css' "$pattern" "$@" 2>&1)"; then
    MATCH_COUNT="$(printf '%s\n' "$output" | wc -l | tr -d ' ')"
  else
    status=$?
    if (( status == 1 )); then
      MATCH_COUNT=0
    else
      echo "[ERROR] Could not count: $label (rg exited $status)"
      [[ -z "$output" ]] || echo "$output"
      MATCH_COUNT=0
      failures=$((failures + 1))
    fi
  fi
}

check_matches "semantic.css contains a direct color value" \
  "$DIRECT_COLOR_PATTERN" \
  "$SEMANTIC"

check_matches "canonical common component code contains a direct color value" \
  "$DIRECT_COLOR_PATTERN" \
  "$COMMON"

check_css_matches "semantic.css contains a named CSS color" "$NAMED_COLOR_PATTERN" "$SEMANTIC"
check_css_matches "canonical common component CSS contains a named CSS color" "$NAMED_COLOR_PATTERN" "$COMMON"
check_matches "canonical common component TSX contains a named CSS color" "$TSX_NAMED_COLOR_PATTERN" "$COMMON"

collect_changed_feature_css
if ((${#FEATURE_CSS_FILES[@]} > 0)); then
  check_css_matches "changed feature CSS contains a direct color value" "$DIRECT_COLOR_PATTERN" "${FEATURE_CSS_FILES[@]}"
  check_css_matches "changed feature CSS contains a named CSS color" "$NAMED_COLOR_PATTERN" "${FEATURE_CSS_FILES[@]}"
else
  echo "[INFO] No changed feature CSS files to check against $CSS_CONTRACT_BASE."
fi

check_matches "canonical common component code skips the semantic layer" \
  'var\(--ref-[a-z0-9-]+' \
  "$COMMON"

if ((${#FEATURE_CSS_FILES[@]} > 0)); then
  check_css_matches "changed feature CSS skips the semantic layer" \
  'var\(--ref-[a-z0-9-]+' \
  "${FEATURE_CSS_FILES[@]}"
fi

check_matches "canonical common component code uses a legacy color alias" \
  'var\(--(primary|primary-hover|primary-active|bg-[a-z0-9-]+|text-main|accent-highlight|theme-(accent|surface|text)[a-z0-9-]*|danger([a-z0-9-]+)?|success([a-z0-9-]+)?|warning([a-z0-9-]+)?|info([a-z0-9-]+)?)\b' \
  "$COMMON"

if ((${#FEATURE_CSS_FILES[@]} > 0)); then
  check_css_matches "changed feature CSS uses a legacy color alias" \
    'var\(--(primary|primary-hover|primary-active|bg-[a-z0-9-]+|text-main|accent-highlight|theme-(accent|surface|text)[a-z0-9-]*|danger([a-z0-9-]+)?|success([a-z0-9-]+)?|warning([a-z0-9-]+)?|info([a-z0-9-]+)?)\b' \
    "${FEATURE_CSS_FILES[@]}"
fi

count_matches "!important occurrences" '!important' "$COMMON" "$FEATURES"
important_count="$MATCH_COUNT"
if [[ "$important_count" != "0" ]]; then
  echo "[WARN] canonical component/feature CSS contains $important_count !important occurrence(s)."
  echo "       Keep only documented native-control compatibility exceptions."
fi

count_matches "legacy direct color occurrences" "$DIRECT_COLOR_PATTERN|$NAMED_COLOR_PATTERN" \
  "$RENDERER/styles/features" \
  "$RENDERER/styles/global.css" \
  "$RENDERER/styles/workstation.css" \
  "$RENDERER/styles/app.css"
legacy_count="$MATCH_COUNT"
if [[ "$legacy_count" != "0" ]]; then
  echo "[INFO] legacy styles still contain approximately $legacy_count direct color occurrence(s)."
  echo "       This is migration debt; do not add new occurrences."
fi

for theme_file in \
  "$TOKEN_DIR/transterm-dark.css" \
  "$TOKEN_DIR/transterm-light.css" \
  "$TOKEN_DIR/codex-dark.css" \
  "$TOKEN_DIR/codex-light.css"; do
  if [[ ! -f "$theme_file" ]]; then
    echo "[FAIL] missing built-in theme file: $theme_file"
    failures=$((failures + 1))
  fi
done

if (( failures > 0 )); then
  echo "[ERROR] CSS contract failed with $failures blocking check(s)."
  exit 1
fi

echo "[OK] CSS contract passed. Warnings and legacy debt above are non-blocking."
