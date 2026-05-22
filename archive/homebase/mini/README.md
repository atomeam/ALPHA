# HomeBase Mini

A single-button desktop app. One HTML file, one launcher, no build, no server, no dependencies.

## Run it

1. Download this repo as a ZIP: <https://github.com/atomeam/HomeBase-/archive/refs/heads/main.zip>
2. Unzip. Open the `mini/` folder inside.
3. **Windows:** double-click `HomeBase.bat`.
4. **macOS:** first `chmod +x HomeBase.command`, then double-click it.

Your default browser opens the app. Click the button. Spacebar also clicks. Double-click the click counter to reset. Click count persists in your browser's localStorage.

## Pin it to your taskbar / dock

**Windows**
- Right-click `HomeBase.bat` → **Send to** → **Desktop (create shortcut)**.
- Right-click the new shortcut → **Properties** → **Change Icon...** to give it a custom look.
- Drag the shortcut onto the taskbar.

**macOS**
- Drag `HomeBase.command` to the Dock (right side, near Trash).

## What's in the folder

- `index.html` — the entire app (HTML + CSS + JS, ~5KB)
- `HomeBase.bat` — Windows launcher
- `HomeBase.command` — macOS launcher
- `README.md` — this file

That's everything. No `node_modules`. No build step. No API keys. Edit `index.html` in any text editor and reload to change the app.
