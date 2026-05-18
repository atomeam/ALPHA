#!/usr/bin/env bash
# -----------------------------------------------------------
# alpha-launch.sh — Launch the ALPHA app (backend + frontend)
# -----------------------------------------------------------
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# Terminal emulator preference (first available wins)
pick_terminal() {
  for t in x-terminal-emulator gnome-terminal konsole xfce4-terminal xterm; do
    command -v "$t" &>/dev/null && echo "$t" && return
  done
  echo ""
}

TERM_EMU="$(pick_terminal)"

cd "$PROJECT_ROOT"

# Ensure dependencies are installed
if [ ! -d "node_modules" ]; then
  echo "[ALPHA] Installing dependencies..."
  pnpm install 2>&1 || true
fi

# Launch dev servers
if [ -n "$TERM_EMU" ]; then
  # Open in a visible terminal so the user can see logs
  case "$TERM_EMU" in
    gnome-terminal)
      gnome-terminal -- bash -c "cd '$PROJECT_ROOT' && echo '=== ALPHA Dev Server ===' && pnpm dev; exec bash"
      ;;
    konsole)
      konsole -e bash -c "cd '$PROJECT_ROOT' && echo '=== ALPHA Dev Server ===' && pnpm dev; exec bash"
      ;;
    xfce4-terminal)
      xfce4-terminal -e "bash -c \"cd '$PROJECT_ROOT' && echo '=== ALPHA Dev Server ===' && pnpm dev; exec bash\""
      ;;
    xterm)
      xterm -hold -e "cd '$PROJECT_ROOT' && echo '=== ALPHA Dev Server ===' && pnpm dev" &
      ;;
    *)
      $TERM_EMU -e "bash -c \"cd '$PROJECT_ROOT' && echo '=== ALPHA Dev Server ===' && pnpm dev; exec bash\""
      ;;
  esac
else
  # Fallback: run in background and open browser
  pnpm dev &
fi

# Wait briefly then open the frontend in the default browser
sleep 3
if command -v xdg-open &>/dev/null; then
  xdg-open "http://localhost:5173" 2>/dev/null || true
elif command -v google-chrome &>/dev/null; then
  google-chrome "http://localhost:5173" 2>/dev/null || true
fi
