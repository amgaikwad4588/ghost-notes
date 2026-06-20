# GhostNotes

An invisible, always-on-top notes overlay for Windows. Excluded from screen capture/sharing, hidden from taskbar and alt-tab. Controlled entirely by global hotkeys and mouse.

## Features

- **Stealth overlay** — `setContentProtection(true)` blocks screen capture, `skipTaskbar` hides from taskbar/alt-tab, transparent frameless window
- **Rich text editing** — WYSIWYG editor with toolbar (bold, italic, headings, lists, quotes, code, links)
- **Single-instance** — second launch reveals existing window
- **Persistence** — notes saved to `%APPDATA%/ghost-notes/notes.json`
- **Adjustable font size** (A− / A+ in title bar)
- **Adjustable opacity** (slider in title bar + Ctrl+Shift+±)
- **Click-through mode** — mouse passes through the window (Ctrl+Shift+\)
- **Window positioning** — move with Ctrl+Shift+↑↓←→
- **Search** notes by title/body

## Hotkeys

| Shortcut | Action |
|---|---|
| `Ctrl+Z` | Toggle show/hide |
| `Ctrl+Shift+Enter` | New note |
| `Ctrl+Shift+Bksp` | Delete note |
| `Ctrl+B` / `Ctrl+I` | Bold / Italic |
| `Ctrl+Shift+S` | Focus search |
| `Ctrl+Shift+\` | Toggle click-through |
| `Ctrl+Shift+=` / `-` | Opacity up/down |
| `Ctrl+Shift+↑↓←→` | Move window |
| `Esc` | Hide window |

## Commands

```bash
npm start          # Run in development
npm run dist:portable   # Build portable .exe
npm run dist:installer  # Build NSIS installer
```

The portable exe is output to `dist/GhostNotes-portable.exe`.

## Future Scope

- **Themes** — light mode, custom accent colors
- **Auto-start** — option to launch on system boot
- **Export/import** — backup and restore notes as JSON
- **Pin notes** — sticky per-note pinning to top of list
- **Multi-monitor** — remember which display the window is on
- **System tray** — tray icon with context menu
- **Cloud sync** — optional sync via a file or cloud provider
# ghost-notes
