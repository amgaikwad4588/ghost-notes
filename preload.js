// Secure bridge between the renderer and the main process.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('bridge', {
  // persistence — data shape: { notes: [...], folders: [...] }
  loadNotes: () => ipcRenderer.invoke('notes:load'),
  saveNotes: (data) => ipcRenderer.invoke('notes:save', data),
  restoreNotes: () => ipcRenderer.invoke('notes:restore'),
  listBackups: () => ipcRenderer.invoke('notes:backups'),

  // export
  exportNote: (filename, content) => ipcRenderer.invoke('notes:export', { filename, content }),

  // window controls
  hideWindow: () => ipcRenderer.send('window:hide'),
  quit: () => ipcRenderer.send('window:quit'),
  setOpacity: (value) => ipcRenderer.send('window:set-opacity', value),

  // events pushed from main (global hotkeys)
  onNewNote: (cb) => ipcRenderer.on('new-note', cb),
  onDeleteNote: (cb) => ipcRenderer.on('delete-note', cb),
  onFocusSearch: (cb) => ipcRenderer.on('focus-search', cb),
  onClickThroughChanged: (cb) => ipcRenderer.on('clickthrough-changed', (_e, v) => cb(v)),
  onOpacityChanged: (cb) => ipcRenderer.on('opacity-changed', (_e, v) => cb(v))
});
