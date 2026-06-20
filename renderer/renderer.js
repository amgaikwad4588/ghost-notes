// GhostNotes — renderer logic

const els = {
  list: document.getElementById('noteList'),
  search: document.getElementById('search'),
  searchBtn: document.getElementById('searchBtn'),
  title: document.getElementById('noteTitle'),
  body: document.getElementById('noteBody'),
  empty: document.getElementById('emptyState'),
  editor: document.getElementById('editor'),
  status: document.getElementById('status'),
  sidebarHead: document.querySelector('.sidebar-head'),
  newBtn: document.getElementById('newBtn'),
  themeBtn: document.getElementById('themeBtn'),
  hideBtn: document.getElementById('hideBtn'),
  quitBtn: document.getElementById('quitBtn'),
  fontUp: document.getElementById('fontUp'),
  fontDown: document.getElementById('fontDown'),
  opacity: document.getElementById('opacity'),
  notebookPills: document.getElementById('notebookPills'),
  wordCount: document.getElementById('wordCount'),
  noteNotebook: document.getElementById('noteNotebook'),
  notebookTag: document.getElementById('notebookTag'),
  notebookTagDropdown: document.getElementById('notebookTagDropdown'),
  ctxMenu: document.getElementById('ctxMenu')
};

let notes = [];
let folders = [];
let activeId = null;
let activeFolder = null; // null = "All"
let saveTimer = null;
let dragSrcId = null;
let pendingNewId = null;

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
  await window.bridge.saveNotes({ notes, folders });
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

// ---- Checkbox serialization ------------------------------------------------
// innerHTML serialization does not preserve .checked DOM property — only the
// `checked` HTML attribute (which reflects the default/initial state). We sync
// the attribute before every read so saved HTML reflects actual toggle state.
function syncCheckboxes() {
  els.body.querySelectorAll('input.todo-cb[type="checkbox"]').forEach((cb) => {
    if (cb.checked) cb.setAttribute('checked', '');
    else cb.removeAttribute('checked');
    // Sync parent label done class
    const label = cb.closest('.todo-item');
    if (label) label.classList.toggle('done', cb.checked);
  });
}

// ---- Word count ------------------------------------------------------------
function updateWordCount() {
  const n = activeNote();
  if (!n) { els.wordCount.textContent = ''; return; }
  const text = (els.body.innerText || '').trim();
  const words = text ? text.split(/\s+/).filter(Boolean).length : 0;
  if (!words) { els.wordCount.textContent = ''; return; }
  const mins = Math.max(1, Math.round(words / 200));
  els.wordCount.textContent = `${words} words · ${mins} min read`;
}

// ---- Notebooks bar ---------------------------------------------------------
function renderNotebookBar() {
  els.notebookPills.innerHTML = '';

  // "All" pill
  const all = document.createElement('button');
  all.className = 'nb-pill' + (activeFolder === null ? ' active' : '');
  all.textContent = 'All';
  all.addEventListener('click', () => { activeFolder = null; renderNotebookBar(); renderList(); });
  els.notebookPills.appendChild(all);

  for (const f of folders) {
    const pill = document.createElement('button');
    pill.className = 'nb-pill' + (activeFolder === f.id ? ' active' : '');
    pill.textContent = f.name;
    pill.title = f.name;
    pill.addEventListener('click', () => { activeFolder = f.id; renderNotebookBar(); renderList(); });
    pill.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      showCtxMenu(e.clientX, e.clientY, f);
    });
    els.notebookPills.appendChild(pill);
  }

  // "+ New" pill at end of row — uses inline prompt (prompt() is blocked by
  // the always-on-top window level on Windows).
  const addPill = document.createElement('button');
  addPill.className = 'nb-pill nb-new-pill';
  addPill.textContent = '+ New';
  addPill.title = 'New notebook';
  addPill.addEventListener('click', () => {
    showInlinePrompt(addPill, 'Notebook name…', '', (name) => {
      if (!name) return;
      const f = { id: uid(), name };
      folders.push(f);
      activeFolder = f.id;
      renderNotebookBar();
      renderList();
      persist();
    });
  });
  els.notebookPills.appendChild(addPill);
}

function showCtxMenu(x, y, folder) {
  els.ctxMenu.innerHTML = '';

  const rename = document.createElement('button');
  rename.textContent = 'Rename';
  rename.addEventListener('click', () => {
    hideCtxMenu();
    // Find the pill so we can anchor the inline prompt near it
    const pills = [...els.notebookPills.querySelectorAll('.nb-pill:not(.nb-new-pill)')];
    const anchor = pills.find((p) => p.textContent === folder.name) || els.notebookPills;
    showInlinePrompt(anchor, 'Notebook name…', folder.name, (name) => {
      if (name) { folder.name = name; renderNotebookBar(); persist(); }
    });
  });

  const del = document.createElement('button');
  del.textContent = 'Delete notebook';
  del.className = 'danger';
  // Two-step confirmation inside the menu (no native confirm() needed)
  del.addEventListener('click', () => {
    del.textContent = `Delete "${folder.name}"?`;
    del.style.pointerEvents = 'none';
    del.style.opacity = '0.6';

    const confirmBtn = document.createElement('button');
    confirmBtn.textContent = 'Yes, delete';
    confirmBtn.className = 'danger';
    confirmBtn.addEventListener('click', () => {
      hideCtxMenu();
      notes.forEach((n) => { if (n.folderId === folder.id) n.folderId = null; });
      folders = folders.filter((f) => f.id !== folder.id);
      if (activeFolder === folder.id) activeFolder = null;
      renderNotebookBar();
      renderList();
      persist();
    });

    els.ctxMenu.appendChild(confirmBtn);
  });

  els.ctxMenu.appendChild(rename);
  els.ctxMenu.appendChild(del);
  els.ctxMenu.style.left = x + 'px';
  els.ctxMenu.style.top = y + 'px';
  els.ctxMenu.classList.remove('hidden');
}

function hideCtxMenu() { els.ctxMenu.classList.add('hidden'); }

document.addEventListener('click', (e) => {
  if (!els.ctxMenu.contains(e.target)) hideCtxMenu();
});


// ---- Note list -------------------------------------------------------------
function renderList() {
  const q = els.search.value.trim().toLowerCase();
  let visible = q
    ? notes.filter((n) => n.title.toLowerCase().includes(q) || n.body.toLowerCase().includes(q))
           .sort((a, b) => b.updated - a.updated)
    : [...notes];

  if (!q && activeFolder !== null) {
    visible = visible.filter((n) => n.folderId === activeFolder);
  }

  els.list.innerHTML = '';
  for (const n of visible) {
    const li = document.createElement('li');
    li.dataset.id = n.id;
    if (n.id === activeId) li.classList.add('active');
    if (n.id === pendingNewId) { li.classList.add('note-new'); pendingNewId = null; }

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

    // Show folder badge when viewing "All Notes"
    if (activeFolder === null && n.folderId) {
      const folder = folders.find((f) => f.id === n.folderId);
      if (folder) {
        const fb = document.createElement('div');
        fb.className = 'li-folder';
        fb.textContent = '📁 ' + folder.name;
        li.appendChild(fb);
      }
    }

    li.addEventListener('click', () => selectNote(n.id));
    els.list.appendChild(li);
  }
}

// ---- Editor ----------------------------------------------------------------
function renderEditor() {
  const n = activeNote();
  if (!n) {
    els.empty.classList.remove('hidden');
    els.noteNotebook.classList.add('hidden');
    els.title.value = '';
    els.body.innerHTML = '';
    els.title.disabled = true;
    els.body.contentEditable = 'false';
    updateWordCount();
    return;
  }
  els.empty.classList.add('hidden');
  els.title.disabled = false;
  els.body.contentEditable = 'true';
  els.title.value = n.title;
  els.body.innerHTML = n.body || '';
  updateNotebookTag(n);
  updateWordCount();
}

function updateNotebookTag(n) {
  els.noteNotebook.classList.remove('hidden');
  const folder = n.folderId ? folders.find((f) => f.id === n.folderId) : null;
  els.notebookTag.textContent = (folder ? folder.name : 'No notebook') + ' ▾';
}

function selectNote(id) {
  if (id === activeId) return;
  els.editor.classList.remove('note-ready');
  els.editor.classList.add('switching');
  setTimeout(() => {
    activeId = id;
    renderList();
    renderEditor();
    els.editor.classList.remove('switching');
    requestAnimationFrame(() => {
      els.editor.classList.add('note-ready');
    });
  }, 110);
}

function newNote() {
  const n = { id: uid(), title: '', body: '', updated: Date.now(), folderId: activeFolder };
  notes.unshift(n);
  activeId = n.id;
  pendingNewId = n.id;
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
  // Select next visible note
  const visibleIds = [...els.list.querySelectorAll('li')].map((li) => li.dataset.id);
  const nextId = visibleIds[Math.min(idx, visibleIds.length - 1)] || (notes.length ? notes[0].id : null);
  activeId = nextId;
  renderList();
  renderEditor();
  persist();
}

function onEdit() {
  const n = activeNote();
  if (!n) return;
  syncCheckboxes();
  n.title = els.title.value;
  n.body = els.body.innerHTML;
  n.updated = Date.now();
  renderList();
  updateWordCount();
  updateNotebookTag(n);
  scheduleSave();
}

// ---- Notebook tag dropdown (move note) -------------------------------------
function renderNotebookTagDropdown() {
  els.notebookTagDropdown.innerHTML = '';
  const n = activeNote();

  const noneBtn = document.createElement('button');
  noneBtn.textContent = 'No notebook';
  if (!n || !n.folderId) noneBtn.className = 'active-nb';
  noneBtn.addEventListener('click', () => {
    if (n) { n.folderId = null; onEdit(); updateNotebookTag(n); renderList(); }
    els.notebookTagDropdown.classList.add('hidden');
  });
  els.notebookTagDropdown.appendChild(noneBtn);

  for (const f of folders) {
    const btn = document.createElement('button');
    btn.textContent = f.name;
    if (n && n.folderId === f.id) btn.className = 'active-nb';
    btn.addEventListener('click', () => {
      if (n) { n.folderId = f.id; onEdit(); updateNotebookTag(n); renderList(); }
      els.notebookTagDropdown.classList.add('hidden');
    });
    els.notebookTagDropdown.appendChild(btn);
  }
}

els.notebookTag.addEventListener('click', () => {
  renderNotebookTagDropdown();
  els.notebookTagDropdown.classList.toggle('hidden');
});

document.addEventListener('click', (e) => {
  if (!els.notebookTagDropdown.contains(e.target) && e.target !== els.notebookTag) {
    els.notebookTagDropdown.classList.add('hidden');
  }
});

// ---- Font size & opacity ---------------------------------------------------
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

// ---- Utilities -------------------------------------------------------------
function escapeHtml(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// Insert a DOM node at the current cursor position inside #noteBody.
function insertNodeAtCursor(node) {
  const sel = window.getSelection();
  if (sel && sel.rangeCount > 0) {
    const range = sel.getRangeAt(0);
    range.collapse(false);
    range.insertNode(node);
    range.setStartAfter(node);
    range.collapse(true);
    sel.removeAllRanges();
    sel.addRange(range);
  } else {
    els.body.appendChild(node);
  }
}

// Lightweight inline text-input widget (replaces prompt() which is blocked by
// the always-on-top window level on Windows). Anchors below anchorEl.
function showInlinePrompt(anchorEl, placeholder, initial, callback) {
  const old = document.getElementById('gnInlinePrompt');
  if (old) old.remove();

  const wrap = document.createElement('div');
  wrap.id = 'gnInlinePrompt';
  wrap.className = 'gn-inline-prompt';

  const input = document.createElement('input');
  input.type = 'text';
  input.value = initial || '';
  input.placeholder = placeholder || '';
  input.className = 'gn-inline-prompt-input';

  const ok = document.createElement('button');
  ok.textContent = '✓';
  ok.className = 'gn-inline-prompt-ok';
  ok.title = 'Confirm (Enter)';

  wrap.appendChild(input);
  wrap.appendChild(ok);

  const rect = anchorEl.getBoundingClientRect();
  wrap.style.position = 'fixed';
  wrap.style.top  = (rect.bottom + 5) + 'px';
  wrap.style.left = rect.left + 'px';

  document.body.appendChild(wrap);
  input.focus();
  if (initial) input.select();

  const finish = (confirmed) => {
    wrap.remove();
    document.removeEventListener('mousedown', onOutside);
    callback(confirmed ? input.value.trim() : null);
  };

  ok.addEventListener('mousedown', (e) => { e.preventDefault(); finish(true); });

  input.addEventListener('keydown', (e) => {
    e.stopPropagation();
    if (e.key === 'Enter')  { e.preventDefault(); finish(true);  }
    if (e.key === 'Escape') { e.preventDefault(); finish(false); }
  });

  // Close on outside click (setTimeout so this listener doesn't fire immediately)
  const onOutside = (e) => { if (!wrap.contains(e.target)) finish(false); };
  setTimeout(() => document.addEventListener('mousedown', onOutside), 0);
}

// ---- Toolbar button handlers -----------------------------------------------
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
  // Prevent the button click from stealing focus off #noteBody so execCommand
  // still has a live selection to operate on.
  btn.addEventListener('mousedown', (e) => e.preventDefault());

  btn.addEventListener('click', async () => {
    const type = btn.dataset.md;

    if (type === 'export') {
      const n = activeNote();
      if (!n) return;
      const title = n.title.trim() || 'Untitled';
      const htmlContent = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>${escapeHtml(title)}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; max-width: 700px; margin: 40px auto; padding: 0 20px; color: #1c1c1e; line-height: 1.7; }
    h1 { font-size: 28px; font-weight: 700; margin-bottom: 24px; }
    table { border-collapse: collapse; width: 100%; margin: 12px 0; }
    td, th { border: 1px solid #d1d1d6; padding: 6px 12px; }
    img { max-width: 100%; border-radius: 6px; }
    blockquote { border-left: 3px solid #0a84ff; padding-left: 14px; color: #555; margin: 8px 0; }
    code { background: #f2f2f7; padding: 2px 6px; border-radius: 4px; font-family: monospace; }
    input[type="checkbox"] { accent-color: #0a84ff; }
  </style>
</head>
<body>
  <h1>${escapeHtml(title)}</h1>
  ${n.body}
</body>
</html>`;
      const ok = await window.bridge.exportNote(title + '.html', htmlContent);
      if (ok) flashStatus('exported');
      return;
    }

    // Link needs to capture selection BEFORE showing the prompt widget
    if (type === 'link') {
      const selObj = window.getSelection();
      const selText = selObj ? selObj.toString() : '';
      const savedRange = (selObj && selObj.rangeCount > 0)
        ? selObj.getRangeAt(0).cloneRange() : null;
      showInlinePrompt(btn, 'https://…', '', (url) => {
        if (!url) return;
        els.body.focus();
        if (savedRange) { selObj.removeAllRanges(); selObj.addRange(savedRange); }
        if (selText) {
          document.execCommand('createLink', false, url);
        } else {
          const a = document.createElement('a');
          a.href = url;
          a.textContent = url;
          insertNodeAtCursor(a);
        }
        onEdit();
      });
      return;
    }

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
      case 'code': {
        const sel = window.getSelection().toString();
        const code = document.createElement('code');
        code.textContent = sel || 'code';
        if (sel) document.execCommand('delete');
        insertNodeAtCursor(code);
        break;
      }
      case 'ulist':
        document.execCommand('insertUnorderedList');
        break;
      case 'olist':
        document.execCommand('insertOrderedList');
        break;
      case 'todo': {
        const label = document.createElement('label');
        label.className = 'todo-item';
        const cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.className = 'todo-cb';
        label.appendChild(cb);
        label.appendChild(document.createTextNode(' '));
        insertNodeAtCursor(label);
        insertNodeAtCursor(document.createElement('br'));
        break;
      }
      case 'table': {
        const table = document.createElement('table');
        table.className = 'note-table';
        const tbody = document.createElement('tbody');
        for (let r = 0; r < 3; r++) {
          const tr = document.createElement('tr');
          for (let c = 0; c < 3; c++) {
            const td = document.createElement('td');
            td.appendChild(document.createElement('br'));
            tr.appendChild(td);
          }
          tbody.appendChild(tr);
        }
        table.appendChild(tbody);
        insertNodeAtCursor(table);
        insertNodeAtCursor(document.createElement('br'));
        break;
      }
    }
    onEdit();
  });
});

// ---- Checkbox toggle in contenteditable ------------------------------------
// We use mousedown to detect the checkbox click before the browser moves focus.
els.body.addEventListener('mousedown', (e) => {
  if (e.target.classList.contains('todo-cb')) {
    // Let the click happen naturally; sync after
    setTimeout(() => {
      syncCheckboxes();
      onEdit();
    }, 0);
  }
});

// ---- Image paste -----------------------------------------------------------
// execCommand('insertHTML') is not allowed inside async callbacks in modern
// Chromium — it's not a user-gesture context. Use direct DOM insertion instead,
// and save the selection range synchronously before handing off to FileReader.
els.body.addEventListener('paste', (e) => {
  const items = e.clipboardData && e.clipboardData.items;
  if (!items) return;
  const imageItem = [...items].find((it) => it.type.startsWith('image/'));
  if (!imageItem) return;
  e.preventDefault();
  const file = imageItem.getAsFile();
  if (!file) return;

  const sel = window.getSelection();
  const savedRange = (sel && sel.rangeCount > 0) ? sel.getRangeAt(0).cloneRange() : null;

  const reader = new FileReader();
  reader.onload = (ev) => {
    const img = document.createElement('img');
    img.src = ev.target.result;
    img.className = 'note-img';
    img.alt = 'pasted image';
    if (savedRange) {
      savedRange.collapse(false);
      savedRange.insertNode(img);
      const r = document.createRange();
      r.setStartAfter(img);
      r.collapse(true);
      sel.removeAllRanges();
      sel.addRange(r);
    } else {
      els.body.appendChild(img);
    }
    onEdit();
  };
  reader.readAsDataURL(file);
});

// ---- Image drag-and-drop ---------------------------------------------------
els.body.addEventListener('dragover', (e) => {
  const hasImage = e.dataTransfer && [...(e.dataTransfer.items || [])].some((it) => it.type.startsWith('image/'));
  if (hasImage) e.preventDefault();
});

els.body.addEventListener('drop', (e) => {
  const files = e.dataTransfer && e.dataTransfer.files;
  if (!files) return;
  const imageFile = [...files].find((f) => f.type.startsWith('image/'));
  if (!imageFile) return;
  e.preventDefault();
  e.stopPropagation();

  // Determine drop insertion point using the drop coordinates
  const sel = window.getSelection();
  const dropRange = document.caretRangeFromPoint
    ? document.caretRangeFromPoint(e.clientX, e.clientY)
    : null;

  const reader = new FileReader();
  reader.onload = (ev) => {
    const img = document.createElement('img');
    img.src = ev.target.result;
    img.className = 'note-img';
    img.alt = 'dropped image';
    if (dropRange) {
      dropRange.collapse(true);
      dropRange.insertNode(img);
      const r = document.createRange();
      r.setStartAfter(img);
      r.collapse(true);
      sel.removeAllRanges();
      sel.addRange(r);
    } else {
      els.body.appendChild(img);
    }
    onEdit();
  };
  reader.readAsDataURL(imageFile);
});

// ---- Editor events ---------------------------------------------------------
els.title.addEventListener('input', onEdit);
els.body.addEventListener('input', onEdit);
els.body.addEventListener('blur', onEdit);

// ---- Search ----------------------------------------------------------------
function openSearch() {
  els.sidebarHead.classList.add('search-open');
  setTimeout(() => { els.search.focus(); els.search.select(); }, 200);
}

function closeSearch() {
  els.sidebarHead.classList.remove('search-open');
  els.search.value = '';
  renderList();
}

els.searchBtn.addEventListener('click', openSearch);
els.search.addEventListener('input', renderList);
els.search.addEventListener('blur', () => { if (!els.search.value) closeSearch(); });
els.search.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeSearch(); });

// ---- Other controls --------------------------------------------------------
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

// ---- Resizable sidebar -----------------------------------------------------
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

divider.addEventListener('mousedown', () => {
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

// ---- Init ------------------------------------------------------------------
(async function init() {
  const data = await window.bridge.loadNotes();
  notes = data.notes || [];
  folders = data.folders || [];

  if (notes.length) activeId = [...notes].sort((a, b) => b.updated - a.updated)[0].id;

  renderNotebookBar();
  renderList();
  renderEditor();
})();
