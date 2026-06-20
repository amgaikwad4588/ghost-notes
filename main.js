// GhostNotes — main process
// An invisible, always-on-top notes overlay, modeled on the techniques Cluely uses:
//   - setContentProtection(true)  -> excluded from screen capture / screen share
//   - skipTaskbar: true           -> not shown in the taskbar / alt-tab
//   - alwaysOnTop + type:'panel'  -> floats above everything
//   - frame:false + transparent   -> borderless overlay
// Controlled entirely by global hotkeys and the mouse.

const { app, BrowserWindow, globalShortcut, ipcMain, screen, dialog } = require('electron');
const path = require('path');
const fs = require('fs');

let win = null;
let clickThrough = false; // when true, mouse passes through the window

// ---- Persistence -----------------------------------------------------------
// Data is stored as { version: 2, notes: [...], folders: [...] } in notes.json.
// Old format (bare array) is migrated automatically on first load.

const dataFile = () => path.join(app.getPath('userData'), 'notes.json');
const backupDir = () => { const d = path.join(app.getPath('userData'), 'backups'); if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true }); return d; };
const MAX_BACKUPS = 20;

function loadData() {
  // Try main file first
  try {
    const raw = fs.readFileSync(dataFile(), 'utf-8');
    const parsed = JSON.parse(raw);
    // Old format: bare array of notes
    if (Array.isArray(parsed)) {
      return { notes: parsed, folders: [] };
    }
    // New format: { version, notes, folders }
    if (parsed && Array.isArray(parsed.notes)) {
      return { notes: parsed.notes, folders: parsed.folders || [] };
    }
  } catch (_) {}

  // Main file is empty or corrupt — try newest backup
  try {
    const dir = backupDir();
    const backups = fs.readdirSync(dir)
      .filter(f => f.startsWith('notes-') && f.endsWith('.json'))
      .sort()
      .reverse();
    for (const b of backups) {
      const raw = fs.readFileSync(path.join(dir, b), 'utf-8');
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        console.log('Recovered from backup:', b);
        const data = { version: 2, notes: parsed, folders: [] };
        fs.writeFileSync(dataFile(), JSON.stringify(data, null, 2), 'utf-8');
        return { notes: parsed, folders: [] };
      }
      if (parsed && Array.isArray(parsed.notes) && parsed.notes.length > 0) {
        console.log('Recovered from backup:', b);
        fs.writeFileSync(dataFile(), JSON.stringify(parsed, null, 2), 'utf-8');
        return { notes: parsed.notes, folders: parsed.folders || [] };
      }
    }
  } catch (_) {}

  return { notes: [], folders: [] };
}

function saveData(data) {
  try {
    // Backup existing file before overwriting
    try {
      const existing = fs.readFileSync(dataFile(), 'utf-8');
      const parsed = JSON.parse(existing);
      const hasContent = Array.isArray(parsed)
        ? parsed.length > 0
        : (parsed && Array.isArray(parsed.notes) && parsed.notes.length > 0);
      if (hasContent) {
        const dir = backupDir();
        const stamp = new Date().toISOString().replace(/[:.]/g, '-');
        fs.writeFileSync(path.join(dir, `notes-${stamp}.json`), existing, 'utf-8');
        const all = fs.readdirSync(dir).filter(f => f.startsWith('notes-') && f.endsWith('.json')).sort();
        while (all.length > MAX_BACKUPS) {
          fs.unlinkSync(path.join(dir, all.shift()));
        }
      }
    } catch (_) {}

    const payload = { version: 2, notes: data.notes || [], folders: data.folders || [] };
    fs.writeFileSync(dataFile(), JSON.stringify(payload, null, 2), 'utf-8');
    return true;
  } catch (err) {
    console.error('Failed to save notes:', err);
    return false;
  }
}

// ---- Window ----------------------------------------------------------------
function createWindow() {
  const display = screen.getPrimaryDisplay();
  const { workArea } = display;
  const width = 760;
  const height = 520;

  win = new BrowserWindow({
    width,
    height,
    x: workArea.x + Math.round((workArea.width - width) / 2),
    y: workArea.y + 60,
    minWidth: 480,
    minHeight: 320,
    frame: false,
    transparent: true,
    hasShadow: false,
    resizable: true,
    movable: true,
    fullscreenable: false,
    minimizable: false,
    maximizable: false,
    skipTaskbar: true,          // hidden from taskbar
    alwaysOnTop: true,
    show: false,
    title: 'GhostNotes',
    type: process.platform === 'darwin' ? 'panel' : undefined,
    hiddenInMissionControl: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  // The key trick: exclude this window from screen capture / screen sharing.
  win.setContentProtection(true);

  // Keep it pinned above full-screen apps too.
  win.setAlwaysOnTop(true, 'screen-saver');
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });

  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));

  // Symmetric zoom: Ctrl+= / Ctrl++ bigger, Ctrl+- smaller, Ctrl+0 reset.
  win.webContents.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown' || !input.control || input.shift || input.alt) return;
    const wc = win.webContents;
    const round1 = (n) => Math.round(n * 10) / 10;
    if (input.key === '=' || input.key === '+' || input.key === 'Add') {
      event.preventDefault();
      wc.setZoomFactor(Math.min(3, round1(wc.getZoomFactor() + 0.1)));
    } else if (input.key === '-' || input.key === 'Subtract') {
      event.preventDefault();
      wc.setZoomFactor(Math.max(0.5, round1(wc.getZoomFactor() - 0.1)));
    } else if (input.key === '0') {
      event.preventDefault();
      wc.setZoomFactor(1);
    }
  });

  win.once('ready-to-show', () => win.show());

  win.on('closed', () => { win = null; });
}

// ---- Window helpers --------------------------------------------------------
function toggleVisibility() {
  if (!win) return;
  if (win.isVisible()) {
    win.hide();
  } else {
    win.showInactive();
    win.show();
    win.focus();
  }
}

function moveWindow(dx, dy) {
  if (!win) return;
  const [x, y] = win.getPosition();
  win.setPosition(x + dx, y + dy);
}

function setOpacity(value) {
  if (!win) return;
  const next = Math.min(1, Math.max(0.1, value));
  win.setOpacity(next);
  win.webContents.send('opacity-changed', next);
}

function nudgeOpacity(delta) {
  if (!win) return;
  setOpacity(win.getOpacity() + delta);
}

function toggleClickThrough() {
  if (!win) return;
  clickThrough = !clickThrough;
  win.setIgnoreMouseEvents(clickThrough, { forward: true });
  win.webContents.send('clickthrough-changed', clickThrough);
}

// ---- Global hotkeys --------------------------------------------------------
function registerShortcuts() {
  const map = {
    'CommandOrControl+Shift+Z': toggleVisibility,
    'CommandOrControl+Shift+N': toggleVisibility,
    'CommandOrControl+Shift+Enter': () => win && win.webContents.send('new-note'),
    'CommandOrControl+Shift+Backspace': () => win && win.webContents.send('delete-note'),
    'CommandOrControl+Shift+S': () => win && win.webContents.send('focus-search'),
    'CommandOrControl+Shift+Up': () => moveWindow(0, -40),
    'CommandOrControl+Shift+Down': () => moveWindow(0, 40),
    'CommandOrControl+Shift+Left': () => moveWindow(-40, 0),
    'CommandOrControl+Shift+Right': () => moveWindow(40, 0),
    'CommandOrControl+Shift+=': () => nudgeOpacity(0.1),
    'CommandOrControl+Shift+-': () => nudgeOpacity(-0.1),
    'CommandOrControl+Shift+\\': toggleClickThrough
  };

  for (const [accelerator, handler] of Object.entries(map)) {
    const ok = globalShortcut.register(accelerator, handler);
    if (!ok) console.error('Failed to register shortcut:', accelerator);
  }
}

// ---- IPC -------------------------------------------------------------------
ipcMain.handle('notes:load', () => loadData());
ipcMain.handle('notes:save', (_e, data) => saveData(data));
ipcMain.handle('notes:restore', () => {
  const d = loadData();
  saveData(d);
  return d;
});
ipcMain.handle('notes:backups', () => {
  try {
    const dir = backupDir();
    return fs.readdirSync(dir).filter(f => f.startsWith('notes-') && f.endsWith('.json')).sort().reverse();
  } catch (_) { return []; }
});

ipcMain.handle('notes:export', async (_e, { filename, content }) => {
  if (!win) return false;
  try {
    const result = await dialog.showSaveDialog(win, {
      defaultPath: filename,
      filters: [
        { name: 'HTML File', extensions: ['html'] },
        { name: 'Plain Text', extensions: ['txt'] }
      ]
    });
    if (result.canceled || !result.filePath) return false;
    const ext = path.extname(result.filePath).toLowerCase();
    let out = content;
    if (ext === '.txt') {
      out = content
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<\/p>/gi, '\n')
        .replace(/<\/li>/gi, '\n')
        .replace(/<\/tr>/gi, '\n')
        .replace(/<\/td>/gi, '\t')
        .replace(/<[^>]+>/g, '')
        .replace(/&nbsp;/g, ' ')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&amp;/g, '&')
        .replace(/&quot;/g, '"')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
    }
    fs.writeFileSync(result.filePath, out, 'utf-8');
    return true;
  } catch (err) {
    console.error('Export failed:', err);
    return false;
  }
});

ipcMain.on('window:hide', () => win && win.hide());
ipcMain.on('window:quit', () => app.quit());
ipcMain.on('window:set-opacity', (_e, value) => { if (win) win.setOpacity(Math.min(1, Math.max(0.1, value))); });

// ---- App lifecycle ---------------------------------------------------------
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (win) { win.show(); win.focus(); }
  });

  app.whenReady().then(() => {
    createWindow();
    registerShortcuts();

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });
}

app.on('will-quit', () => globalShortcut.unregisterAll());

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
