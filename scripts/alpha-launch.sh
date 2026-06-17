#!/usr/bin/env bash
# -----------------------------------------------------------
# alpha-launch.sh — Launch the ALPHA app (backend + frontend)
# -----------------------------------------------------------
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# Ensure Node/pnpm are on PATH (desktop launchers skip .bashrc)
if [ -s "$HOME/.nvm/nvm.sh" ]; then
  export NVM_DIR="$HOME/.nvm"
  . "$NVM_DIR/nvm.sh"
elif [ -d "$HOME/.local/share/nvm" ]; then
  export NVM_DIR="$HOME/.local/share/nvm"
  . "$NVM_DIR/nvm.sh"
fi

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
  pnpm install
fi

# Launch dev servers
if [ -n "$TERM_EMU" ]; then
  # Open in a visible terminal so the user can see logs
  case "$TERM_EMU" in
    gnome-terminal)
      gnome-terminal -- bash -lc "cd '$PROJECT_ROOT' && echo '=== ALPHA Dev Server ===' && pnpm dev; exec bash"
      ;;
    konsole)
      konsole -e bash -lc "cd '$PROJECT_ROOT' && echo '=== ALPHA Dev Server ===' && pnpm dev; exec bash"
      ;;
    xfce4-terminal)
      xfce4-terminal -e "bash -lc \"cd '$PROJECT_ROOT' && echo '=== ALPHA Dev Server ===' && pnpm dev; exec bash\""
      ;;
    xterm)
      xterm -hold -e "bash -lc 'cd \"$PROJECT_ROOT\" && echo \"=== ALPHA Dev Server ===\" && pnpm dev'" &
      ;;
    *)
      $TERM_EMU -e "bash -lc \"cd '$PROJECT_ROOT' && echo '=== ALPHA Dev Server ===' && pnpm dev; exec bash\""
      ;;
  esac
else
  # Fallback: run in background and open browser
  pnpm dev &
fi

# Poll until the frontend is reachable (timeout after 30s)
for i in $(seq 1 30); do
  if curl -s -o /dev/null --max-time 1 http://localhost:5173 2>/dev/null; then
    if command -v xdg-open &>/dev/null; then
      xdg-open "http://localhost:5173" 2>/dev/null || true
    elif command -v google-chrome &>/dev/null; then
      google-chrome "http://localhost:5173" 2>/dev/null || true
    fi
    break
  fi
  sleep 1
done
