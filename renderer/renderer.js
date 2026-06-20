// GhostNotes — renderer logic (sidebar + editor + persistence)

const els = {
  list: document.getElementById('noteList'),
  search: document.getElementById('search'),
  searchBtn: document.getElementById('searchBtn'),
  title: document.getElementById('noteTitle'),
  body: document.getElementById('noteBody'),
  empty: document.getElementById('emptyState'),
  editor: document.getElementById('editor'),
  status: document.getElementById('status'),
  newBtn: document.getElementById('newBtn'),
  themeBtn: document.getElementById('themeBtn'),
  hideBtn: document.getElementById('hideBtn'),
  quitBtn: document.getElementById('quitBtn'),
  fontUp: document.getElementById('fontUp'),
  fontDown: document.getElementById('fontDown'),
  opacity: document.getElementById('opacity')
};

let notes = [];
let activeId = null;
let saveTimer = null;
let dragSrcId = null;

const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const fmtDate = (ts) => {
  const d = new Date(ts);
  const now = new Date();
  if (d.toDateString() === now.toDateString())
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const yest = new Date(now); yest.setDate(now.getDate() - 1);
  if (d.toDateString() === yest.toDateString()) return 'Yesterday';
  if (now - d < 7 * 864e5) return d.toLocaleDateString([], { weekday: 'long' });
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
};

async function persist() {
  await window.bridge.saveNotes(notes);
  flashStatus('saved');
}

function scheduleSave() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(persist, 400);
}

let statusTimer = null;
function flashStatus(text) {
  els.status.textContent = text;
  clearTimeout(statusTimer);
  statusTimer = setTimeout(() => { els.status.textContent = ''; }, 1200);
}

function activeNote() {
  return notes.find((n) => n.id === activeId) || null;
}

function renderList() {
  const q = els.search.value.trim().toLowerCase();
  const visible = q
    ? notes.filter((n) => n.title.toLowerCase().includes(q) || n.body.toLowerCase().includes(q))
           .sort((a, b) => b.updated - a.updated)
    : [...notes];

  els.list.innerHTML = '';
  for (const n of visible) {
    const li = document.createElement('li');
    li.dataset.id = n.id;
    if (n.id === activeId) li.classList.add('active');

    if (!q) {
      li.draggable = true;
      li.addEventListener('dragstart', (e) => {
        dragSrcId = n.id;
        e.dataTransfer.effectAllowed = 'move';
        setTimeout(() => li.classList.add('dragging'), 0);
      });
      li.addEventListener('dragend', () => {
        li.classList.remove('dragging');
        els.list.querySelectorAll('.drag-over').forEach((el) => el.classList.remove('drag-over'));
      });
      li.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        if (dragSrcId === n.id) return;
        els.list.querySelectorAll('.drag-over').forEach((el) => el.classList.remove('drag-over'));
        li.classList.add('drag-over');
      });
      li.addEventListener('drop', (e) => {
        e.preventDefault();
        li.classList.remove('drag-over');
        if (!dragSrcId || dragSrcId === n.id) return;
        const srcIdx = notes.findIndex((x) => x.id === dragSrcId);
        const dstIdx = notes.findIndex((x) => x.id === n.id);
        if (srcIdx === -1 || dstIdx === -1) return;
        const [moved] = notes.splice(srcIdx, 1);
        notes.splice(dstIdx, 0, moved);
        dragSrcId = null;
        renderList();
        persist();
      });
    }

    const t = document.createElement('div');
    t.className = 'li-title';
    t.textContent = n.title.trim() || 'Untitled note';
    li.appendChild(t);

    const tmp = document.createElement('div');
    tmp.innerHTML = n.body || '';
    const plain = (tmp.textContent || '').replace(/\s+/g, ' ').trim();
    if (plain) {
      const p = document.createElement('div');
      p.className = 'li-preview';
      p.textContent = plain;
      li.appendChild(p);
    }

    const d = document.createElement('div');
    d.className = 'li-date';
    d.textContent = fmtDate(n.updated);
    li.appendChild(d);

    li.addEventListener('click', () => selectNote(n.id));
    els.list.appendChild(li);
  }
}

function renderEditor() {
  const n = activeNote();
  if (!n) {
    els.empty.classList.remove('hidden');
    els.title.value = '';
    els.body.innerHTML = '';
    els.title.disabled = els.body.contentEditable = false;
    return;
  }
  els.empty.classList.add('hidden');
  els.title.disabled = false;
  els.body.contentEditable = true;
  els.title.value = n.title;
  els.body.innerHTML = n.body || '';
}

function selectNote(id) {
  activeId = id;
  renderList();
  renderEditor();
}

function newNote() {
  const n = { id: uid(), title: '', body: '', updated: Date.now() };
  notes.unshift(n);
  activeId = n.id;
  renderList();
  renderEditor();
  els.title.focus();
  scheduleSave();
}

function deleteActive() {
  if (!activeId) return;
  const idx = notes.findIndex((n) => n.id === activeId);
  if (idx === -1) return;
  notes.splice(idx, 1);
  activeId = notes.length ? notes[Math.min(idx, notes.length - 1)].id : null;
  renderList();
  renderEditor();
  persist();
}

function onEdit() {
  const n = activeNote();
  if (!n) return;
  n.title = els.title.value;
  n.body = els.body.innerHTML;
  n.updated = Date.now();
  renderList();
  scheduleSave();
}

const FONT_MIN = 12, FONT_MAX = 26;

function applyFontSize(px) {
  const clamped = Math.min(FONT_MAX, Math.max(FONT_MIN, px));
  document.documentElement.style.setProperty('--fs', clamped + 'px');
  localStorage.setItem('gn.fontSize', String(clamped));
  document.execCommand('defaultParagraphSeparator', false, 'p');
  return clamped;
}

function changeFont(delta) {
  const current = parseInt(localStorage.getItem('gn.fontSize') || '15', 10);
  const next = applyFontSize(current + delta);
  flashStatus(next + 'px');
}

function applyOpacity(value, fromWindow) {
  const v = Math.min(1, Math.max(0.1, Number(value)));
  els.opacity.value = String(v);
  localStorage.setItem('gn.opacity', String(v));
  if (!fromWindow) window.bridge.setOpacity(v);
}

function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  localStorage.setItem('gn.theme', theme);
  els.themeBtn.textContent = theme === 'dark' ? '☀' : '☾';
  els.themeBtn.title = theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme';
}

els.fontUp.addEventListener('click', () => changeFont(1));
els.fontDown.addEventListener('click', () => changeFont(-1));
els.opacity.addEventListener('input', (e) => applyOpacity(e.target.value, false));
els.themeBtn.addEventListener('click', () => {
  applyTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark');
});

window.bridge.onOpacityChanged((v) => applyOpacity(v, true));

applyFontSize(parseInt(localStorage.getItem('gn.fontSize') || '15', 10));
applyTheme(localStorage.getItem('gn.theme') || 'dark');
{
  const savedOpacity = localStorage.getItem('gn.opacity');
  if (savedOpacity) applyOpacity(savedOpacity, false);
}

document.execCommand('defaultParagraphSeparator', false, 'p');

document.querySelectorAll('.md-btn[data-md]').forEach(btn => {
  btn.addEventListener('click', () => {
    const type = btn.dataset.md;
    els.body.focus();
    switch (type) {
      case 'bold':
        document.execCommand('bold');
        break;
      case 'italic':
        document.execCommand('italic');
        break;
      case 'heading':
        document.execCommand('formatBlock', false, 'h3');
        break;
      case 'quote':
        document.execCommand('formatBlock', false, 'blockquote');
        break;
      case 'code':
        document.execCommand('insertHTML', false, '<code>' + (window.getSelection().toString() || 'code') + '</code>');
        break;
      case 'ulist':
        document.execCommand('insertUnorderedList');
        break;
      case 'olist':
        document.execCommand('insertOrderedList');
        break;
      case 'link': {
        const sel = window.getSelection().toString();
        if (sel) {
          document.execCommand('createLink', false, prompt('Enter URL:', 'https://'));
        } else {
          document.execCommand('insertHTML', false, '<a href="' + (prompt('Enter URL:', 'https://') || '#') + '">link</a>');
        }
        break;
      }
    }
    onEdit();
  });
});

els.title.addEventListener('input', onEdit);
els.body.addEventListener('input', onEdit);
els.body.addEventListener('blur', onEdit);
function openSearch() {
  els.search.classList.remove('hidden');
  els.searchBtn.classList.add('hidden');
  els.search.focus();
  els.search.select();
}

function closeSearch() {
  els.search.value = '';
  renderList();
  els.search.classList.add('hidden');
  els.searchBtn.classList.remove('hidden');
}

els.searchBtn.addEventListener('click', openSearch);
els.search.addEventListener('input', renderList);
els.search.addEventListener('blur', () => { if (!els.search.value) closeSearch(); });
els.search.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeSearch(); });
els.newBtn.addEventListener('click', newNote);
els.hideBtn.addEventListener('click', () => window.bridge.hideWindow());
els.quitBtn.addEventListener('click', () => window.bridge.quit());

document.getElementById('deleteBtn').addEventListener('click', deleteActive);

window.bridge.onNewNote(() => newNote());
window.bridge.onDeleteNote(() => deleteActive());
window.bridge.onFocusSearch(() => openSearch());
window.bridge.onClickThroughChanged((on) => flashStatus(on ? 'click-through ON' : 'click-through OFF'));

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') window.bridge.hideWindow();
});

// ---- Resizable sidebar ----------------------------------------------------
const divider = document.getElementById('sidebar-divider');
const sidebar = document.getElementById('sidebar');
const SIDEBAR_MIN = 140;
const SIDEBAR_MAX = 500;

let dragActive = false;

function initSidebarWidth() {
  const saved = parseInt(localStorage.getItem('gn.sidebarWidth'), 10);
  if (saved >= SIDEBAR_MIN && saved <= SIDEBAR_MAX) sidebar.style.width = saved + 'px';
}
initSidebarWidth();

divider.addEventListener('mousedown', (e) => {
  dragActive = true;
  divider.classList.add('dragging');
  document.body.style.cursor = 'col-resize';
  document.body.style.userSelect = 'none';
});

document.addEventListener('mousemove', (e) => {
  if (!dragActive) return;
  const rect = document.getElementById('main').getBoundingClientRect();
  const w = Math.min(SIDEBAR_MAX, Math.max(SIDEBAR_MIN, e.clientX - rect.left));
  sidebar.style.width = w + 'px';
});

document.addEventListener('mouseup', () => {
  if (!dragActive) return;
  dragActive = false;
  divider.classList.remove('dragging');
  document.body.style.cursor = '';
  document.body.style.userSelect = '';
  localStorage.setItem('gn.sidebarWidth', sidebar.style.width.replace('px', ''));
});

(async function init() {
  notes = await window.bridge.loadNotes();
  if (notes.length) activeId = notes.sort((a, b) => b.updated - a.updated)[0].id;
  renderList();
  renderEditor();
})();
