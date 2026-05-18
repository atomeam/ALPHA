#!/usr/bin/env bash
# -----------------------------------------------------------
# install-desktop-icon.sh — Install the ALPHA desktop launcher
# -----------------------------------------------------------
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

ICON_SRC="$PROJECT_ROOT/assets/alpha-icon-256.png"
ICON_SVG="$PROJECT_ROOT/assets/alpha-icon.svg"
LAUNCH_SCRIPT="$PROJECT_ROOT/scripts/alpha-launch.sh"
DESKTOP_FILE="$HOME/Desktop/alpha.desktop"

# Ensure Desktop directory exists
mkdir -p "$HOME/Desktop"

# Pick best icon (prefer PNG, fall back to SVG)
if [ -f "$ICON_SRC" ]; then
  ICON_PATH="$ICON_SRC"
elif [ -f "$ICON_SVG" ]; then
  ICON_PATH="$ICON_SVG"
else
  echo "[ERROR] No icon found in $PROJECT_ROOT/assets/"
  exit 1
fi

# Write the .desktop file with resolved paths
cat > "$DESKTOP_FILE" <<EOF
[Desktop Entry]
Version=1.0
Type=Application
Name=ALPHA
Comment=Launch the ALPHA AtoMind ecosystem (backend :8080, frontend :5173)
Exec=bash $LAUNCH_SCRIPT
Icon=$ICON_PATH
Terminal=false
Categories=Development;
StartupNotify=true
EOF

# Make it executable and trusted
chmod +x "$DESKTOP_FILE"

# Mark trusted for GNOME (suppresses "untrusted" warning)
if command -v gio &>/dev/null; then
  gio set "$DESKTOP_FILE" metadata::trusted true 2>/dev/null || true
fi

echo "[ALPHA] Desktop icon installed at $DESKTOP_FILE"
echo "[ALPHA] Icon: $ICON_PATH"
echo "[ALPHA] Launch script: $LAUNCH_SCRIPT"
