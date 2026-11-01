#!/usr/bin/env bash
# =============================================================================
# install.sh — install the arxys CLI
# Run from the repo root: bash install.sh
# =============================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BIN_DIR="${HOME}/.local/bin"
SYMLINK="${BIN_DIR}/arxys"
SHELL_RC=""

# ---------------------------------------------------------------------------
# Detect shell RC file
# ---------------------------------------------------------------------------
_detect_rc() {
  local shell_name
  shell_name="$(basename "${SHELL:-bash}")"
  case "$shell_name" in
    zsh)  echo "${ZDOTDIR:-$HOME}/.zshrc" ;;
    fish) echo "${XDG_CONFIG_HOME:-$HOME/.config}/fish/config.fish" ;;
    *)    echo "${HOME}/.bashrc" ;;
  esac
}

SHELL_RC="$(_detect_rc)"

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
_green()  { printf '\033[32m%s\033[0m\n' "$*"; }
_yellow() { printf '\033[33m%s\033[0m\n' "$*"; }
_bold()   { printf '\033[1m%s\033[0m\n'  "$*"; }
_dim()    { printf '\033[2m%s\033[0m\n'  "$*"; }

# ---------------------------------------------------------------------------
# 1. Create bin directory
# ---------------------------------------------------------------------------
if [[ ! -d "$BIN_DIR" ]]; then
  mkdir -p "$BIN_DIR"
  _green "✓ Created ${BIN_DIR}"
else
  _dim "  ${BIN_DIR} already exists"
fi

# ---------------------------------------------------------------------------
# 2. Create (or refresh) symlink
# ---------------------------------------------------------------------------
TARGET="${SCRIPT_DIR}/arxys"
[[ ! -f "$TARGET" ]] && { echo "Error: arxys script not found at ${TARGET}"; exit 1; }
chmod +x "$TARGET"

if [[ -L "$SYMLINK" ]]; then
  local_target="$(readlink "$SYMLINK")"
  if [[ "$local_target" == "$TARGET" ]]; then
    _dim "  Symlink already points to ${TARGET}"
  else
    ln -sf "$TARGET" "$SYMLINK"
    _green "✓ Updated symlink ${SYMLINK} → ${TARGET}"
  fi
elif [[ -e "$SYMLINK" ]]; then
  echo "Error: ${SYMLINK} exists and is not a symlink. Remove it manually and re-run."
  exit 1
else
  ln -s "$TARGET" "$SYMLINK"
  _green "✓ Created symlink ${SYMLINK} → ${TARGET}"
fi

# ---------------------------------------------------------------------------
# 3. Ensure PATH contains the bin directory
# ---------------------------------------------------------------------------
PATH_EXPORT='export PATH="$HOME/.local/bin:$PATH"'

# Check if it's already effective in this session
if echo ":${PATH}:" | grep -q ":${BIN_DIR}:"; then
  _dim "  ${BIN_DIR} is already in PATH"
else
  # Append to RC file if not already there
  if grep -qF "$PATH_EXPORT" "$SHELL_RC" 2>/dev/null; then
    _dim "  PATH export already in ${SHELL_RC}"
  else
    printf '\n# arxys CLI\n%s\n' "$PATH_EXPORT" >> "$SHELL_RC"
    _green "✓ Added PATH export to ${SHELL_RC}"
  fi

  _yellow ""
  _yellow "  PATH updated. Reload your shell or run:"
  _yellow "    source ${SHELL_RC}"
fi

# ---------------------------------------------------------------------------
# Done
# ---------------------------------------------------------------------------
echo ""
_bold "arxys installed."
_dim "  Run 'arxys help' to get started."
echo ""
