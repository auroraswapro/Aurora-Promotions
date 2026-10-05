/* Aurora Promotions — Team Tracker front-end (vanilla JS, no build step).
 * Sign-in is by email one-time code; data access goes through backend.js. */
(() => {
  'use strict';

  /* =========================================================
   * Constants
   * ======================================================= */
  const STATUSES = [
    { key: 'todo', label: 'To Do', color: 'var(--st-todo)' },
    { key: 'in_progress', label: 'In Progress', color: 'var(--st-progress)' },
    { key: 'review', label: 'In Review', color: 'var(--st-review)' },
    { key: 'blocked', label: 'Blocked', color: 'var(--st-blocked)' },
    { key: 'done', label: 'Done', color: 'var(--st-done)' },
  ];
  const STATUS = Object.fromEntries(STATUSES.map((s) => [s.key, s]));
  const PRIORITIES = [
    { key: 'low', label: 'Low', rank: 0 },
    { key: 'medium', label: 'Medium', rank: 1 },
    { key: 'high', label: 'High', rank: 2 },
    { key: 'urgent', label: 'Urgent', rank: 3 },
  ];
  const PRIORITY = Object.fromEntries(PRIORITIES.map((p) => [p.key, p]));
  const PROJECT_STATUSES = [
    { key: 'planning', label: 'Planning', color: 'var(--st-todo)' },
    { key: 'active', label: 'Active', color: 'var(--st-progress)' },
    { key: 'on_hold', label: 'On Hold', color: 'var(--st-review)' },
    { key: 'completed', label: 'Completed', color: 'var(--st-done)' },
  ];
  const PROJECT_STATUS = Object.fromEntries(PROJECT_STATUSES.map((s) => [s.key, s]));
  const SWATCHES = ['#6d4aff', '#0ea5a4', '#e0569b', '#f08c2e', '#2f7de1', '#16a34a', '#9b5de5', '#d9480f', '#0f766e', '#be123c'];
  const LOGO_URL = 'logo.png';

  const ICON = {
    dashboard: '<path d="M3 13h8V3H3zM13 21h8V11h-8zM3 21h8v-6H3zM13 3v6h8V3z"/>',
    my: '<path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>',
    board: '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M9 3v18M15 3v18"/>',
    list: '<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>',
    folder: '<path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>',
    team: '<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>',
    user: '<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    search: '<circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/>',
    menu: '<path d="M3 12h18M3 6h18M3 18h18"/>',
    x: '<path d="M18 6L6 18M6 6l12 12"/>',
    edit: '<path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z"/>',
    trash: '<path d="M3 6h18M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6M10 11v6M14 11v6M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>',
    calendar: '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>',
    back: '<path d="M19 12H5M12 19l-7-7 7-7"/>',
    logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/>',
    mail: '<rect x="2" y="4" width="20" height="16" rx="2"/><path d="M22 6l-10 7L2 6"/>',
    sparkle: '<path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z"/>',
  };
  const icon = (name) =>
    `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICON[name]}</svg>`;

  /* =========================================================
   * State
   * ======================================================= */
  const api = window.APBackend.create();
  const state = {
    phase: 'loading', // loading | signin | not_invited | ready
    signin: { step: 'email', email: '', busy: false, error: '', resendAt: 0 },
    meId: null,
    myEmail: '',
    members: [],
    projects: [],
    tasks: [],
    activity: [],
    invites: [],
    route: 'dashboard',
    filters: {
      tasks: { q: '', project: '', assignee: '', status: 'open', priority: '', sort: 'dueDate', dir: 1 },
      board: { project: '', assignee: '', priority: '' },
      projects: 'all',
    },
  };

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  /* =========================================================
   * Helpers
   * ======================================================= */
  const esc = (s) =>
    String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const safeColor = (c, fallback = '#6d4aff') => (/^#[0-9a-f]{6}$/i.test(String(c)) ? c : fallback);
  const nowIso = () => new Date().toISOString();
  const str = (v, max = 500) => (v == null ? '' : String(v).trim().slice(0, max));
  const dateOrNull = (v) => (/^\d{4}-\d{2}-\d{2}$/.test(String(v || '')) ? String(v) : null);

  const readOnly = () => !state.meId;
  const memberDoc = (id) => state.members.find((m) => m.id === id);
  const isManagerId = (id) => memberDoc(id)?.role === 'admin';
  const isAdmin = () => !readOnly() && isManagerId(state.meId) && memberDoc(state.meId)?.active !== false;

  function userById(id) {
    if (!id) return null;
    const m = memberDoc(id);
    return {
      id,
      name: str(m?.displayName, 80) || (m ? str(m.email, 120).split('@')[0] : 'Former member'),
      title: str(m?.title, 80),
      color: safeColor(m?.color, '#80849b'),
      role: isManagerId(id) ? 'admin' : 'member',
      active: !!m && m.active !== false,
    };
  }
  const me = () => userById(state.meId);
  const projectById = (id) => state.projects.find((p) => p.id === id);
  const taskById = (id) => state.tasks.find((t) => t.id === id);
  const activeUsers = () => state.members.filter((m) => m.active !== false).map((m) => userById(m.id)).sort((a, b) => a.name.localeCompare(b.name));
  const canEditTask = (t) => !readOnly() && (isAdmin() || t.assigneeId === state.meId || t.createdBy === state.meId);
  const canDeleteTask = (t) => !readOnly() && (isAdmin() || t.createdBy === state.meId);

  function initials(name) {
    const parts = String(name || '?').trim().split(/\s+/);
    return ((parts[0] || '?')[0] + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
  }
  function avatar(u, size = '') {
    if (!u) return `<span class="avatar none ${size}" title="Unassigned">?</span>`;
    return `<span class="avatar ${size}" style="--c:${u.color}" title="${esc(u.name)}">${esc(initials(u.name))}</span>`;
  }

  const pad = (n) => String(n).padStart(2, '0');
  const dayKey = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const todayStr = () => dayKey(new Date());
  function parseDay(s) {
    if (!dateOrNull(s)) return null;
    const [y, m, d] = s.split('-').map(Number);
    return new Date(y, m - 1, d);
  }
  function daysUntil(s) {
    const d = parseDay(s);
    return d ? Math.round((d - parseDay(todayStr())) / 864e5) : null;
  }
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  function fmtDay(s, withYear = false) {
    const d = parseDay(s);
    if (!d) return '—';
    const y = withYear || d.getFullYear() !== new Date().getFullYear() ? `, ${d.getFullYear()}` : '';
    return `${MONTHS[d.getMonth()]} ${d.getDate()}${y}`;
  }
  function relTime(iso) {
    const t = new Date(iso).getTime();
    if (!Number.isFinite(t)) return '';
    const diff = (Date.now() - t) / 1000;
    if (diff < 60) return 'just now';
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    if (diff < 172800) return 'yesterday';
    if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
    const d = new Date(iso);
    return `${MONTHS[d.getMonth()]} ${d.getDate()}`;
  }

  const isOpen = (t) => t.status !== 'done';
  const isOverdue = (t) => isOpen(t) && t.dueDate && t.dueDate < todayStr();

  function dueBadge(t) {
    if (!t.dueDate) return '<span class="muted small">No due date</span>';
    if (!isOpen(t)) return `<span class="muted small">Due ${fmtDay(t.dueDate)}</span>`;
    const n = daysUntil(t.dueDate);
    if (n < 0) return `<span class="badge overdue">Overdue ${-n}d</span>`;
    if (n === 0) return '<span class="badge soon">Due today</span>';
    if (n === 1) return '<span class="badge soon">Due tomorrow</span>';
    if (n <= 3) return `<span class="badge soon">Due in ${n} days</span>`;
    return `<span class="muted small">Due ${fmtDay(t.dueDate)}</span>`;
  }
  const statusBadge = (s) => `<span class="badge st-${esc(s)}"><span class="dot"></span>${esc(STATUS[s]?.label || s)}</span>`;
  const priorityBadge = (p) => `<span class="badge pr-${esc(p)}">${esc(PRIORITY[p]?.label || p)}</span>`;
  const projectStatusBadge = (s) =>
    `<span class="badge" style="--c:${PROJECT_STATUS[s]?.color || 'var(--muted)'}"><span class="dot"></span>${esc(PROJECT_STATUS[s]?.label || s)}</span>`;
  function projectChip(p) {
    if (!p) return '<span class="chip-project muted">No project</span>';
    return `<span class="chip-project" style="--c:${safeColor(p.color)}"><i></i><span>${esc(p.name)}</span></span>`;
  }
  function pbar(pct, color = '', cls = '') {
    const c = color ? `style="--c:${color}"` : '';
    return `<div class="pbar ${cls}" ${c} role="progressbar" aria-valuenow="${pct}" aria-valuemin="0" aria-valuemax="100"><span style="width:${pct}%"></span></div>`;
  }
  const avg = (arr) => (arr.length ? Math.round(arr.reduce((a, b) => a + b, 0) / arr.length) : 0);
  const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;

  function memberStats(uid) {
    const mine = state.tasks.filter((t) => t.assigneeId === uid);
    const open = mine.filter(isOpen);
    const weekAgo = Date.now() - 7 * 864e5;
    return {
      all: mine,
      open,
      done: mine.filter((t) => !isOpen(t)),
      overdue: open.filter(isOverdue),
      blocked: open.filter((t) => t.status === 'blocked'),
      doneWeek: mine.filter((t) => t.completedAt && new Date(t.completedAt).getTime() >= weekAgo),
      avgOpen: avg(open.map((t) => t.progress)),
    };
  }
  function workload(openCount) {
    if (openCount === 0) return { label: 'Available', c: 'var(--st-done)' };
    if (openCount <= 3) return { label: 'Light load', c: 'var(--st-progress)' };
    if (openCount <= 6) return { label: 'Balanced', c: 'var(--st-review)' };
    return { label: 'Heavy load', c: 'var(--st-blocked)' };
  }
  function projectStats(pid) {
    const ts = state.tasks.filter((t) => t.projectId === pid);
    return {
      tasks: ts,
      done: ts.filter((t) => !isOpen(t)).length,
      open: ts.filter(isOpen).length,
      overdue: ts.filter(isOverdue).length,
      progress: avg(ts.map((t) => t.progress)),
      members: [...new Set(ts.map((t) => t.assigneeId).filter(Boolean))].map(userById).filter(Boolean),
    };
  }
  function sortTasksForWork(a, b) {
    const da = a.dueDate || '9999-99-99';
    const db = b.dueDate || '9999-99-99';
    if (da !== db) return da < db ? -1 : 1;
    return (PRIORITY[b.priority]?.rank || 0) - (PRIORITY[a.priority]?.rank || 0);
  }

  /* Normalise documents from the shared store (shared data is untrusted). */
  function cleanTask(x) {
    return {
      id: str(x.id, 64),
      projectId: str(x.projectId, 64),
      title: str(x.title, 200) || 'Untitled task',
      description: str(x.description, 8000),
      assigneeId: x.assigneeId ? str(x.assigneeId, 200) : null,
      status: STATUS[x.status] ? x.status : 'todo',
      priority: PRIORITY[x.priority] ? x.priority : 'medium',
      progress: Math.max(0, Math.min(100, Math.round(Number(x.progress) || 0))),
      startDate: dateOrNull(x.startDate),
      dueDate: dateOrNull(x.dueDate),
      estimateHours: Number.isFinite(Number(x.estimateHours)) && x.estimateHours !== null && x.estimateHours !== '' ? Number(x.estimateHours) : null,
      createdBy: x.createdBy ? str(x.createdBy, 200) : null,
      createdAt: str(x.createdAt, 40),
      updatedAt: str(x.updatedAt, 40),
      completedAt: x.completedAt ? str(x.completedAt, 40) : null,
      example: !!x.example,
    };
  }
  function cleanProject(x) {
    return {
      id: str(x.id, 64),
      name: str(x.name, 120) || 'Untitled project',
      client: str(x.client, 120),
      description: str(x.description, 4000),
      color: safeColor(x.color),
      status: PROJECT_STATUS[x.status] ? x.status : 'active',
      startDate: dateOrNull(x.startDate),
      dueDate: dateOrNull(x.dueDate),
      leadId: x.leadId ? str(x.leadId, 200) : null,
      createdAt: str(x.createdAt, 40),
      example: !!x.example,
    };
  }
  function cleanActivity(x) {
    return {
      id: str(x.id, 64),
      type: str(x.type, 40),
      userId: str(x.userId, 200),
      taskId: x.taskId ? str(x.taskId, 64) : null,
      projectId: x.projectId ? str(x.projectId, 64) : null,
      text: str(x.text, 4000),
      to: str(x.to, 40),
      createdAt: str(x.createdAt, 40),
    };
  }

  /* =========================================================
   * Toasts, tooltip, modal, confetti
   * ======================================================= */
  function toast(msg, type = 'success') {
    const el = document.createElement('div');
    el.className = `toast ${type}`;
    el.textContent = msg;
    $('#toast-root').appendChild(el);
    setTimeout(() => el.remove(), type === 'error' ? 6000 : 2600);
  }

  const tip = $('#tooltip');
  document.addEventListener('mousemove', (e) => {
    const el = e.target.closest && e.target.closest('[data-tip]');
    if (!el) { tip.hidden = true; return; }
    tip.innerHTML = el.getAttribute('data-tip');
    tip.hidden = false;
    const r = tip.getBoundingClientRect();
    let x = e.clientX + 14;
    let y = e.clientY - r.height - 10;
    if (x + r.width > window.innerWidth - 8) x = e.clientX - r.width - 14;
    if (y < 8) y = e.clientY + 18;
    tip.style.left = `${x}px`;
    tip.style.top = `${y}px`;
  });

  let modalCleanup = null;
  function openModal(html, { wide = false, onMount } = {}) {
    closeModal();
    const root = $('#modal-root');
    root.innerHTML = `<div class="modal-backdrop"><div class="modal ${wide ? 'wide' : ''}" role="dialog" aria-modal="true">${html}</div></div>`;
    const backdrop = root.firstElementChild;
    backdrop.addEventListener('mousedown', (e) => { if (e.target === backdrop) closeModal(); });
    const onKey = (e) => { if (e.key === 'Escape') closeModal(); };
    document.addEventListener('keydown', onKey);
    modalCleanup = () => document.removeEventListener('keydown', onKey);
    const modal = backdrop.firstElementChild;
    if (onMount) onMount(modal);
    const first = modal.querySelector('input:not([type=hidden]):not([disabled]):not([type=radio]), textarea:not([disabled]), select:not([disabled])');
    if (first && !('ontouchstart' in window)) first.focus();
    return modal;
  }
  function closeModal() {
    if (modalCleanup) modalCleanup();
    modalCleanup = null;
    $('#modal-root').innerHTML = '';
    if (pendingRender) scheduleRender();
  }
  const modalOpen = () => !!$('#modal-root').firstElementChild;

  function confirmDialog(title, message, okLabel = 'Delete') {
    return new Promise((resolve) => {
      const m = openModal(`
        <div class="modal-head"><h2>${esc(title)}</h2></div>
        <div class="modal-body"><p style="margin:0;color:var(--text-2)">${esc(message)}</p></div>
        <div class="modal-foot">
          <button class="btn" data-x="cancel">Cancel</button>
          <button class="btn primary" style="background:var(--danger);border-color:var(--danger)" data-x="ok">${esc(okLabel)}</button>
        </div>`);
      m.addEventListener('click', (e) => {
        const b = e.target.closest('[data-x]');
        if (!b) return;
        closeModal();
        resolve(b.dataset.x === 'ok');
      });
    });
  }

  function formData(form) {
    const out = {};
    new FormData(form).forEach((v, k) => (out[k] = typeof v === 'string' ? v.trim() : v));
    return out;
  }

  function confetti() {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const c = document.createElement('canvas');
    c.id = 'confetti';
    document.body.appendChild(c);
    const ctx = c.getContext('2d');
    const W = (c.width = window.innerWidth);
    const H = (c.height = window.innerHeight);
    const colors = ['#14e0c5', '#7c4dff', '#ff5fa2', '#f08c2e', '#2f7de1', '#ffd23f'];
    const bits = Array.from({ length: 140 }, () => ({
      x: W / 2 + (Math.random() - 0.5) * 120, y: H * 0.35,
      vx: (Math.random() - 0.5) * 14, vy: -Math.random() * 12 - 4,
      r: Math.random() * 6 + 4, a: Math.random() * Math.PI, va: (Math.random() - 0.5) * 0.3,
      c: colors[Math.floor(Math.random() * colors.length)],
    }));
    let frame = 0;
    (function tick() {
      ctx.clearRect(0, 0, W, H);
      bits.forEach((b) => {
        b.vy += 0.35; b.vx *= 0.99; b.x += b.vx; b.y += b.vy; b.a += b.va;
        ctx.save(); ctx.translate(b.x, b.y); ctx.rotate(b.a);
        ctx.fillStyle = b.c; ctx.fillRect(-b.r / 2, -b.r / 4, b.r, b.r / 2);
        ctx.restore();
      });
      if (++frame < 150) requestAnimationFrame(tick);
      else c.remove();
    })();
  }

  /* =========================================================
   * Writes
   * ======================================================= */
  function friendlyError(e) {
    const code = e && e.code;
    const msg = String((e && e.message) || '');
    if (code === '42501' || /row-level security|permission/i.test(msg)) return 'You don’t have permission to change that. Ask a manager.';
    if (/at least one admin/i.test(msg)) return 'There must be at least one manager on the team.';
    if (/duplicate key|already exists/i.test(msg)) return 'That already exists.';
    if (/fetch|network/i.test(msg)) return 'Could not reach the server. Check your internet connection and try again.';
    return 'Could not save. Please try again.';
  }
  async function save(fn, okMsg) {
    try {
      const r = await fn();
      if (okMsg) toast(okMsg);
      return r ?? true;
    } catch (e) {
      console.error(e);
      toast(friendlyError(e), 'error');
      return false;
    }
  }

  /* Reload one or more tables from the backend and redraw. */
  const loaders = {
    members: async () => { state.members = await api.load('members'); },
    projects: async () => { state.projects = (await api.load('projects')).map(cleanProject).sort((a, b) => (a.createdAt || '').localeCompare(b.createdAt || '')); },
    tasks: async () => { state.tasks = (await api.load('tasks')).map(cleanTask); },
    activity: async () => { state.activity = (await api.load('activity')).map(cleanActivity); },
    invites: async () => { state.invites = isAdmin() ? await api.load('invites') : []; },
  };
  // Coalesces bursts of change notifications into one reload; every caller's promise settles.
  const pendingKinds = new Set();
  let waiters = [];
  let refreshTimer = null;
  function refresh(...kinds) {
    kinds.forEach((k) => pendingKinds.add(k));
    clearTimeout(refreshTimer);
    return new Promise((resolve) => {
      waiters.push(resolve);
      refreshTimer = setTimeout(async () => {
        const ks = [...pendingKinds];
        const done = waiters;
        pendingKinds.clear();
        waiters = [];
        try { await Promise.all(ks.map((k) => loaders[k] && loaders[k]())); } catch (e) { console.warn('refresh failed', e); }
        scheduleRender();
        done.forEach((r) => r());
      }, 120);
    });
  }

  async function logActivity(entry) {
    try {
      await api.save('activity', null, entry);
    } catch (e) {
      console.warn('activity not saved', e);
    }
  }
  let pruned = false;
  async function pruneActivity() {
    // Keep the activity log tidy: drop entries older than 120 days.
    if (pruned || !isAdmin()) return;
    pruned = true;
    try { await api.pruneActivity(new Date(Date.now() - 120 * 864e5).toISOString()); } catch (_) { /* best effort */ }
  }

  async function saveTask(id, patch, note) {
    const prev = id ? taskById(id) : null;
    const base = prev || {
      projectId: null, title: '', description: '', assigneeId: null, status: 'todo', priority: 'medium',
      progress: 0, startDate: null, dueDate: null, estimateHours: null, completedAt: null, example: false,
    };
    const t = { ...base, ...patch };
    if (patch.progress !== undefined) t.progress = Math.max(0, Math.min(100, Math.round(Number(patch.progress) || 0)));
    if (patch.status === undefined && t.status === 'todo' && t.progress > 0) t.status = 'in_progress';
    if (t.status === 'done') t.progress = 100;
    else if (patch.status !== undefined && prev?.status === 'done' && patch.progress === undefined && t.progress === 100) t.progress = 90;
    const newlyDone = t.status === 'done' && prev?.status !== 'done';
    if (newlyDone) t.completedAt = nowIso();
    if (t.status !== 'done') t.completedAt = null;
    t.updatedAt = nowIso();

    const tid = await api.save('tasks', id, t);
    if (newlyDone) confetti();
    if (!prev) await logActivity({ type: 'task_created', taskId: tid, projectId: t.projectId, text: 'created the task' });
    else {
      if (prev.assigneeId !== t.assigneeId) {
        const who = t.assigneeId ? userById(t.assigneeId).name : 'nobody';
        await logActivity({ type: 'assigned', taskId: tid, projectId: t.projectId, text: `assigned the task to ${who}` });
      }
      if (prev.status !== t.status) await logActivity({ type: 'status', taskId: tid, projectId: t.projectId, to: t.status, text: `moved the task to ${STATUS[t.status].label}` });
      if (prev.progress !== t.progress && t.status !== 'done') await logActivity({ type: 'progress', taskId: tid, projectId: t.projectId, text: `updated progress to ${t.progress}%` });
    }
    if (note) await logActivity({ type: 'comment', taskId: tid, projectId: t.projectId, text: str(note, 4000) });
    pruneActivity();
    await refresh('tasks', 'activity');
    return tid;
  }

  async function deleteTask(t) {
    await api.remove('tasks', t.id);
    await logActivity({ type: 'task_deleted', projectId: t.projectId, text: `deleted task “${t.title}”` });
    closeModal();
    await refresh('tasks', 'activity');
  }

  async function deleteProject(p) {
    await api.remove('projects', p.id);
    await logActivity({ type: 'project_deleted', text: `deleted project “${p.name}”` });
    await refresh('projects', 'tasks', 'activity');
  }

  async function addExampleProject() {
    const today = new Date();
    const d = (off) => { const x = new Date(today); x.setDate(x.getDate() + off); return dayKey(x); };
    const pid = await api.save('projects', null, {
      name: 'Example: Summer Sale Campaign', client: 'Example client', example: true,
      description: 'An example project so you can see how the tracker works. Remove it from the Projects page whenever you like.',
      color: '#e0569b', status: 'active', startDate: d(-7), dueDate: d(14), leadId: state.meId, updatedAt: nowIso(),
    });
    const items = [
      ['Campaign moodboard & concept', 'done', 'high', 100, -6, -2],
      ['Design sale banners for Instagram & Facebook', 'in_progress', 'high', 60, -3, 2],
      ['Write email newsletter copy', 'review', 'medium', 90, -2, 1],
      ['Schedule social posts for launch week', 'todo', 'medium', 0, 1, 5],
      ['Promo teaser video (15s)', 'blocked', 'urgent', 30, -4, -1],
      ['In-store poster print files', 'todo', 'low', 0, 3, 9],
    ];
    for (const [title, status, priority, progress, s, due] of items) {
      await api.save('tasks', null, {
        projectId: pid, title, description: '', assigneeId: state.meId, status, priority, progress,
        startDate: d(s), dueDate: d(due), estimateHours: null, example: true, updatedAt: nowIso(),
        completedAt: status === 'done' ? new Date(Date.now() - 2 * 864e5).toISOString() : null,
      });
    }
    await logActivity({ type: 'project_created', projectId: pid, text: 'added an example project to explore' });
    await refresh('projects', 'tasks', 'activity');
  }
  async function removeExamples() {
    for (const p of state.projects.filter((x) => x.example)) await api.remove('projects', p.id);
    for (const t of state.tasks.filter((x) => x.example && !projectById(x.projectId)?.example)) await api.remove('tasks', t.id);
    await refresh('projects', 'tasks', 'activity');
  }

  /* =========================================================
   * Router (in-page; the viewer only passes plain #tokens on first load)
   * ======================================================= */
  function parseRoute() {
    const [page, id] = state.route.split('/');
    return { page: page || 'dashboard', id };
  }
  function go(r) {
    state.route = String(r).replace(/^#\/?/, '') || 'dashboard';
    closeModal();
    const shell = $('.shell');
    if (shell) shell.classList.remove('nav-open');
    render(true);
  }

  /* =========================================================
   * Render root
   * ======================================================= */
  let pendingRender = false;
  let renderQueued = false;
  function scheduleRender() {
    if (renderQueued) return;
    renderQueued = true;
    requestAnimationFrame(() => {
      renderQueued = false;
      const a = document.activeElement;
      // Don't yank the page from under someone who is typing or dragging.
      if ((a && $('#app').contains(a) && ['INPUT', 'TEXTAREA', 'SELECT'].includes(a.tagName)) || dragging) {
        pendingRender = true;
        return;
      }
      pendingRender = false;
      render();
    });
  }
  document.addEventListener('focusout', () => { if (pendingRender) setTimeout(scheduleRender, 50); });

  let renderSeq = 0;
  async function render(scrollTop = false) {
    const seq = ++renderSeq;
    const app = $('#app');
    if (state.phase === 'loading') {
      app.innerHTML = `<div class="center-page"><div><img src="${LOGO_URL}" alt="" width="56" height="56"><p>Loading your team workspace…</p></div></div>`;
      return;
    }
    if (state.phase === 'signin') {
      app.innerHTML = authPage(signinForm());
      bindSignin();
      return;
    }
    if (state.phase === 'not_invited') {
      app.innerHTML = authPage(`
        <div class="login-form stack">
          <div><h2>You're not on the team yet</h2>
          <div class="muted">You signed in as <b>${esc(state.myEmail)}</b>, but this email hasn't been added to the Aurora team.</div></div>
          <p style="margin:0;color:var(--text-2)">Ask your manager to add this email on the <b>Team</b> page, then sign in again. If you used a different email for work, sign out and try that one.</p>
          <div class="row wrap"><button class="btn primary" data-action="retry-join">Try again</button><button class="btn" data-action="logout">Sign out</button></div>
        </div>`);
      return;
    }
    if (!str(memberDoc(state.meId)?.displayName)) {
      app.innerHTML = authPage(joinForm());
      app.dataset.page = 'join';
      bindJoin();
      return;
    }

    const { page, id } = parseRoute();
    const views = {
      dashboard: [dashboardView, 'Dashboard', 'Team overview'],
      my: [myTasksView, 'My Tasks', 'Your work, at a glance'],
      board: [boardView, 'Task Board', 'Drag cards to update status'],
      tasks: [tasksView, 'All Tasks', 'Search and filter every task'],
      projects: [id ? projectDetailView : projectsView, 'Projects', 'Client campaigns & projects'],
      team: [id ? memberDetailView : teamView, 'Team', 'Who is working on what'],
      profile: [profileView, 'My Profile', 'How you appear to the team'],
    };
    const [view, title, crumb] = views[page] || views.dashboard;
    const scrollY = window.scrollY;
    app.innerHTML = shellView(page, title, crumb, view(id));
    app.dataset.page = state.route;
    window.scrollTo(0, scrollTop ? 0 : scrollY);
    afterRender(page);
  }

  function shellView(page, title, crumb, content) {
    const u = me();
    const myOpen = state.meId ? state.tasks.filter((t) => t.assigneeId === state.meId && isOpen(t)).length : 0;
    const link = (key, label, ic, count) =>
      `<a href="#" data-go="#/${key}" class="${page === key ? 'active' : ''}">${icon(ic)}<span>${label}</span>${count ? `<span class="count">${count}</span>` : ''}</a>`;
    return `
    <div class="shell">
      <aside class="sidebar" aria-label="Main navigation">
        <div class="brand">
          <img src="${LOGO_URL}" alt="">
          <div><div class="brand-name">Aurora Promotions</div><div class="brand-sub">Team Tracker</div></div>
        </div>
        <nav class="nav">
          ${link('dashboard', 'Dashboard', 'dashboard')}
          ${readOnly() ? '' : link('my', 'My Tasks', 'my', myOpen)}
          ${link('board', 'Task Board', 'board')}
          ${link('projects', 'Projects', 'folder')}
          ${link('team', 'Team', 'team')}
        </nav>
        <div class="sidebar-foot">
          ${u && !readOnly() ? `<a class="me-chip" href="#" data-go="#/profile" style="text-decoration:none">
            ${avatar(u)}
            <div class="who"><div>${esc(u.name)}</div><div class="role">${isAdmin() ? 'Manager' : esc(u.title || 'Team member')}</div></div>
          </a>` : ''}
          <button class="btn ghost sm" data-action="logout" style="color:var(--sidebar-text);justify-content:flex-start">${icon('logout')} Sign out</button>
        </div>
      </aside>
      <main class="main">
        <header class="topbar">
          <button class="icon-btn menu-btn" data-action="menu" aria-label="Open menu">${icon('menu')}</button>
          <div><div class="crumb">${esc(crumb)}</div><h1>${esc(title)}</h1></div>
          <div class="spacer"></div>
          <label class="search">${icon('search')}<input id="global-search" type="search" placeholder="Search tasks…" aria-label="Search tasks" value="${page === 'tasks' ? esc(state.filters.tasks.q) : ''}"></label>
          ${readOnly() ? '' : `<button class="btn aurora" data-action="new-task">${icon('plus')}<span class="topbar-new-label">New Task</span></button>`}
        </header>
        <div class="content">
          ${api.mode === 'demo' ? `<div class="banner">🧪 <div><b>Demo mode.</b> This is sample data kept only in your browser, so your changes aren't shared yet. The live version goes on once the online database is connected. <button class="btn sm" data-action="reset-demo">Reset demo</button></div></div>` : ''}
          ${content}
        </div>
      </main>
    </div>`;
  }

  /* =========================================================
   * Sign-in (email + one-time code) and first-time profile
   * ======================================================= */
  function authPage(inner) {
    return `
    <div class="login-page">
      <section class="login-art">
        <div class="brand" style="padding:0">
          <div><div class="brand-name" style="font-size:18px">Aurora Promotions</div><div class="brand-sub">Team Tracker</div></div>
        </div>
        <div>
          <img class="big-logo" src="${LOGO_URL}" alt="Aurora Promotions logo">
          <h1>See your whole team's progress in one place.</h1>
          <p>Plan campaigns, assign tasks and follow every team member's progress live.</p>
          <ul>
            <li>Live dashboard of team progress and deadlines</li>
            <li>Kanban board with drag &amp; drop</li>
            <li>One-tap progress updates for team members</li>
            <li>Overdue and blocked work shown up front</li>
          </ul>
        </div>
        <div class="small" style="color:#9d98cf">© ${new Date().getFullYear()} Aurora Promotions</div>
      </section>
      <section class="login-form-wrap">${inner}</section>
    </div>`;
  }

  function signinForm() {
    const si = state.signin;
    const demo = api.mode === 'demo' ? '<div class="banner small">🧪 Demo mode: use any email, and any 6-digit code (e.g. 123456).</div>' : '';
    if (si.step === 'email') {
      return `
        <form class="login-form stack" id="signin-form" novalidate>
          <div><h2>Welcome 👋</h2><div class="muted">Sign in with your work email. We'll email you a one-time code, so there's no password to remember.</div></div>
          ${demo}
          <div class="field"><label for="si-email">Email address</label><input class="input" id="si-email" name="email" type="email" autocomplete="email" inputmode="email" value="${esc(si.email)}" placeholder="you@example.com" required></div>
          <div class="error" id="si-error">${esc(si.error)}</div>
          <button class="btn aurora" type="submit" style="height:44px" ${si.busy ? 'disabled' : ''}>${si.busy ? 'Sending…' : 'Email me a code'}</button>
        </form>`;
    }
    const wait = Math.max(0, Math.ceil((si.resendAt - Date.now()) / 1000));
    return `
      <form class="login-form stack" id="signin-form" novalidate>
        <div><h2>Check your email ✉️</h2><div class="muted">We sent a sign-in code to <b>${esc(si.email)}</b>. It can take a minute to arrive, so also check Spam or Promotions.</div></div>
        ${demo}
        <div class="field"><label for="si-code">Sign-in code</label><input class="input" id="si-code" name="code" inputmode="numeric" autocomplete="one-time-code" maxlength="8" placeholder="123456" style="font-size:22px;letter-spacing:6px;height:52px;font-family:var(--display)" required></div>
        <div class="error" id="si-error">${esc(si.error)}</div>
        <button class="btn aurora" type="submit" style="height:44px" ${si.busy ? 'disabled' : ''}>${si.busy ? 'Checking…' : 'Sign in'}</button>
        <div class="row between small">
          <button type="button" class="btn ghost sm" data-action="signin-back">← Use a different email</button>
          <button type="button" class="btn ghost sm" data-action="resend-code" ${wait ? 'disabled' : ''}>${wait ? `Resend in ${wait}s` : 'Send a new code'}</button>
        </div>
      </form>`;
  }

  let resendTimer = null;
  function bindSignin() {
    const form = $('#signin-form');
    const si = state.signin;
    clearInterval(resendTimer);
    if (si.step === 'code' && si.resendAt > Date.now()) {
      resendTimer = setInterval(() => {
        const b = $('[data-action="resend-code"]');
        const wait = Math.max(0, Math.ceil((si.resendAt - Date.now()) / 1000));
        if (!b) return clearInterval(resendTimer);
        b.disabled = wait > 0;
        b.textContent = wait ? `Resend in ${wait}s` : 'Send a new code';
        if (!wait) clearInterval(resendTimer);
      }, 1000);
    }
    const input = form.querySelector('input');
    if (input && !('ontouchstart' in window)) input.focus();
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (si.busy) return;
      const d = formData(form);
      si.error = '';
      if (si.step === 'email') {
        const email = String(d.email || '').toLowerCase();
        if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { si.error = 'Please enter a valid email address.'; return render(); }
        si.email = email;
        await sendCode();
      } else {
        const code = String(d.code || '').replace(/\s/g, '');
        if (!/^\d{6,8}$/.test(code)) { si.error = 'Enter the code from the email (numbers only).'; return render(); }
        si.busy = true; render();
        try {
          const sess = await api.verifyCode(si.email, code);
          si.busy = false;
          await startSession(sess);
        } catch (err) {
          si.busy = false;
          si.error = err.message || 'That code did not work. Try again.';
          render();
        }
      }
    });
  }
  async function sendCode() {
    const si = state.signin;
    si.busy = true; render();
    try {
      await api.sendCode(si.email);
      si.step = 'code';
      si.resendAt = Date.now() + 60000;
    } catch (err) {
      si.error = err.message || 'Could not send the code.';
    }
    si.busy = false;
    render();
  }

  function joinForm() {
    const m = memberDoc(state.meId);
    const color = safeColor(m?.color, SWATCHES[state.members.length % SWATCHES.length]);
    const first = state.members.length <= 1;
    return `
        <form class="login-form stack" id="join-form" novalidate>
          <div>
            <h2>${first ? 'Set up your workspace ✨' : 'Welcome to the team 👋'}</h2>
            <div class="muted">${first ? 'You are the first one here, so you are the manager. Add your details, then invite your team from the Team page.' : 'Tell your teammates who you are.'}</div>
          </div>
          <div class="field"><label for="j-name">Your name</label><input class="input" id="j-name" name="displayName" maxlength="80" value="${esc(m?.displayName || '')}" placeholder="e.g. Sara Khan" required></div>
          <div class="field"><label for="j-title">Job title</label><input class="input" id="j-title" name="title" maxlength="80" value="${esc(m?.title || '')}" placeholder="e.g. Graphic Designer"></div>
          <div class="field"><label>Pick your colour</label>${swatchPicker('color', color)}</div>
          <button class="btn aurora" type="submit" style="height:44px">Let's go</button>
        </form>`;
  }
  function bindJoin() {
    const form = $('#join-form');
    bindSwatches(form);
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const d = formData(form);
      if (!d.displayName) { toast('Please add your name.', 'error'); return; }
      const btn = form.querySelector('button[type=submit]');
      btn.disabled = true;
      const ok = await save(async () => {
        await api.save('members', state.meId, { displayName: str(d.displayName, 80), title: str(d.title, 80), color: safeColor(d.color) });
        await logActivity({ type: 'member_joined', text: 'joined the team' });
        await refresh('members', 'activity');
      }, 'Welcome to the team!');
      if (ok) { state.route = state.members.length > 1 ? 'my' : 'dashboard'; confetti(); }
      else btn.disabled = false;
    });
  }

  /* =========================================================
   * Dashboard
   * ======================================================= */
  function greeting() {
    const h = new Date().getHours();
    return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
  }

  function starOfWeek() {
    let best = null;
    activeUsers().forEach((u) => {
      const n = memberStats(u.id).doneWeek.length;
      if (n > 0 && (!best || n > best.n)) best = { u, n };
    });
    return best;
  }

  function onboarding() {
    if (!isAdmin() || api.mode === 'demo') return '';
    const hasProject = state.projects.length > 0;
    const hasTeam = activeUsers().length > 1;
    const hasTask = state.tasks.some((t) => !t.example);
    if (hasProject && hasTeam && hasTask) return '';
    const step = (done, n, title, text, action) => `
      <div class="card step ${done ? 'done' : ''}">
        <div class="n">${done ? '✓' : n}</div><h4>${title}</h4><p>${text}</p>${done ? '' : action}
      </div>`;
    return `
      <div class="onboard">
        ${step(hasProject, 1, 'Create a project', 'A project is a client campaign, e.g. “Nova Café launch”.',
          `<div class="row wrap"><button class="btn primary sm" data-action="new-project">${icon('plus')} New project</button>${!state.projects.some((p) => p.example) ? '<button class="btn sm" data-action="add-example">See an example</button>' : ''}</div>`)}
        ${step(hasTeam, 2, 'Invite your team', 'Add each team member’s email on the Team page. They open this website, type their email and get a sign-in code.', `<div><button class="btn primary sm" data-action="new-member">${icon('plus')} Add team member</button></div>`)}
        ${step(hasTask, 3, 'Add tasks', 'Add tasks to a project and assign them. Your team updates progress from <b>My Tasks</b>.',
          `<div><button class="btn primary sm" data-action="new-task">${icon('plus')} New task</button></div>`)}
      </div>`;
  }

  function dashboardView() {
    const u = me();
    const tasks = state.tasks;
    const open = tasks.filter(isOpen);
    const overdue = open.filter(isOverdue);
    const inProgress = tasks.filter((t) => t.status === 'in_progress');
    const blocked = tasks.filter((t) => t.status === 'blocked');
    const weekAgo = Date.now() - 7 * 864e5;
    const doneWeek = tasks.filter((t) => t.completedAt && new Date(t.completedAt).getTime() >= weekAgo);
    const activeProjects = state.projects.filter((p) => p.status === 'active');
    const teamAvg = avg(open.map((t) => t.progress));
    const mineOpen = state.meId ? open.filter((t) => t.assigneeId === state.meId) : [];
    const mineDueSoon = mineOpen.filter((t) => t.dueDate && daysUntil(t.dueDate) <= 2);
    const dateLine = new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
    const star = starOfWeek();

    const kpi = (label, value, hint, color, cls = '', go_ = '') =>
      `<div class="card kpi ${go_ ? 'clickable' : ''}" ${go_ ? `data-go="${go_}"` : ''}>
        <div class="label"><i style="background:${color}"></i>${label}</div>
        <div class="value">${value}</div>
        <div class="hint ${cls}">${hint}</div>
      </div>`;

    return `
    <section class="hero">
      <div class="small hero-date">${esc(dateLine)}</div>
      <h2>${greeting()}${u && !readOnly() ? `, ${esc(u.name.split(' ')[0])}` : ''} ✨</h2>
      <p>${readOnly() ? '' : mineOpen.length
        ? `You have <b>${plural(mineOpen.length, 'open task')}</b>${mineDueSoon.length ? `, <b>${mineDueSoon.length}</b> due within 2 days` : ''}. `
        : 'You have no open tasks right now. '}
        The team has <b>${plural(open.length, 'task')}</b> in flight across <b>${plural(activeProjects.length, 'active project')}</b>.</p>
      ${star ? `<div class="star-chip">${avatar(star.u, 'sm')}<span>⭐ Star of the week: <b>${esc(star.u.name)}</b>, ${plural(star.n, 'task')} completed</span></div>` : ''}
      <div class="row wrap">
        ${readOnly() ? '' : `<button class="btn aurora" data-go="#/my">${icon('my')} Update my tasks</button>`}
        <button class="btn" data-go="#/board">${icon('board')} Open task board</button>
      </div>
    </section>

    ${onboarding()}

    <div class="kpis four">
      ${kpi('Open tasks', open.length, `${tasks.length} total`, 'var(--st-todo)', '', '#/tasks')}
      ${kpi('In progress', inProgress.length, blocked.length ? `${blocked.length} blocked` : 'Nothing blocked', 'var(--st-progress)', blocked.length ? 'bad' : 'good', '#/board')}
      ${kpi('Overdue', overdue.length, overdue.length ? 'Needs attention' : 'All on schedule', 'var(--st-blocked)', overdue.length ? 'bad' : 'good')}
      ${kpi('Done this week', doneWeek.length, `Team average progress ${teamAvg}%`, 'var(--st-done)')}
    </div>

    <div class="dash-grid">
      <section class="card span-7">
        <div class="card-head"><h3>Team progress</h3><span class="sub">Average progress on each member's open tasks</span><div class="spacer"></div><a class="small" href="#" data-go="#/team">View team →</a></div>
        <div class="card-body">${teamProgressList()}</div>
      </section>
      <section class="card span-5">
        <div class="card-head"><h3>Deadlines</h3><span class="sub">Overdue & next 7 days</span></div>
        <div class="card-body">${deadlineList()}</div>
      </section>
      <section class="card span-7">
        <div class="card-head"><h3>Project progress</h3><div class="spacer"></div><a class="small" href="#" data-go="#/projects">All projects →</a></div>
        <div class="card-body">${projectProgressList()}</div>
      </section>
      <section class="card span-5">
        <div class="card-head"><h3>Tasks by status</h3><span class="sub">${plural(tasks.length, 'task')}</span></div>
        <div class="card-body">${statusBreakdown(tasks)}</div>
      </section>
      <section class="card span-12">
        <div class="card-head"><h3>Latest updates from the team</h3></div>
        <div class="card-body">${feedView(state.activity.slice(0, 10))}</div>
      </section>
    </div>`;
  }

  function teamProgressList() {
    const members = activeUsers();
    if (!members.length) return '<div class="empty"><div class="big">👥</div><h4>No one has joined yet</h4>Add your team members by email on the Team page.</div>';
    const rows = members
      .map((u) => ({ u, s: memberStats(u.id) }))
      .sort((a, b) => b.s.open.length - a.s.open.length || a.u.name.localeCompare(b.u.name));
    return `<div class="member-rows">${rows
      .map(({ u, s }) => `
        <div class="member-row" data-go="#/team/${esc(u.id)}" role="link" tabindex="0">
          <div class="who">${avatar(u)}<div style="min-width:0"><div class="n">${esc(u.name)}</div><div class="t">${esc(u.title || 'Team member')}</div></div></div>
          <div class="bars" data-tip="<b>${esc(esc(u.name))}</b><br>${plural(s.open.length, 'open task')} · avg ${s.avgOpen}% complete">
            ${s.open.length ? `${pbar(s.avgOpen, u.color)}<span class="ptext">${s.avgOpen}%</span>` : '<span class="muted small">No open tasks, all caught up 🎉</span>'}
          </div>
          <div class="stats">
            <span class="mini-stat"><b>${s.open.length}</b> open</span>
            <span class="mini-stat"><b>${s.done.length}</b> done</span>
            ${s.overdue.length ? `<span class="mini-stat bad"><b>${s.overdue.length}</b> overdue</span>` : ''}
            ${s.blocked.length ? `<span class="mini-stat bad"><b>${s.blocked.length}</b> blocked</span>` : ''}
          </div>
        </div>`)
      .join('')}</div>`;
  }

  function statusBreakdown(tasks) {
    const total = tasks.length;
    if (!total) return '<div class="empty"><div class="big">📋</div><h4>No tasks yet</h4>Create your first task to see the breakdown.</div>';
    const counts = STATUSES.map((s) => ({ ...s, n: tasks.filter((t) => t.status === s.key).length }));
    const bar = counts
      .filter((c) => c.n)
      .map((c) => `<span style="flex:${c.n};background:${c.color}" data-tip="<b>${c.label}</b>: ${plural(c.n, 'task')} (${Math.round((c.n / total) * 100)}%)"></span>`)
      .join('');
    return `
      <div class="stackbar" role="img" aria-label="Tasks by status">${bar}</div>
      <div class="legend">${counts
        .map((c) => `<div class="legend-row" style="--c:${c.color}"><i></i><span>${c.label}</span><b>${c.n}</b><span class="pct">${Math.round((c.n / total) * 100)}%</span></div>`)
        .join('')}</div>`;
  }

  function deadlineList() {
    const items = state.tasks
      .filter((t) => isOpen(t) && t.dueDate && daysUntil(t.dueDate) <= 7)
      .sort(sortTasksForWork)
      .slice(0, 8);
    if (!items.length) return '<div class="empty"><div class="big">🗓️</div><h4>Nothing due this week</h4>No overdue tasks either. Nice work!</div>';
    return `<div class="list">${items
      .map((t) => {
        const d = parseDay(t.dueDate);
        return `<div class="list-item" data-task="${esc(t.id)}">
          <div class="date-box ${isOverdue(t) ? 'overdue' : ''}"><div class="m">${MONTHS[d.getMonth()]}</div><div class="d">${d.getDate()}</div></div>
          <div class="main-col"><div class="title">${esc(t.title)}</div><div class="row" style="gap:8px">${projectChip(projectById(t.projectId))}</div></div>
          <div class="row" style="gap:8px">${dueBadge(t)}${avatar(userById(t.assigneeId), 'sm')}</div>
        </div>`;
      })
      .join('')}</div>`;
  }

  function projectProgressList() {
    const ps = state.projects.filter((p) => p.status !== 'completed');
    if (!ps.length) return `<div class="empty"><div class="big">📁</div><h4>No active projects</h4>${isAdmin() ? '<button class="btn primary sm" data-action="new-project">Create a project</button>' : ''}</div>`;
    return `<div class="list">${ps
      .map((p) => {
        const s = projectStats(p.id);
        return `<div class="list-item" data-go="#/projects/${esc(p.id)}">
          <div class="main-col">
            <div class="row between"><div class="title">${esc(p.name)}</div><span class="ptext">${s.progress}%</span></div>
            <div class="row" style="margin:5px 0 4px">${pbar(s.progress, p.color)}</div>
            <div class="row small muted wrap" style="gap:6px">${esc(p.client || '')}${p.client ? ' ·' : ''} ${s.done}/${s.tasks.length} tasks done ${s.overdue ? `· <span style="color:var(--danger);font-weight:600">${s.overdue} overdue</span>` : ''} ${p.dueDate ? `· due ${fmtDay(p.dueDate)}` : ''}</div>
          </div>
          <div class="avatars hide-sm">${s.members.slice(0, 4).map((u) => avatar(u, 'sm')).join('')}</div>
        </div>`;
      })
      .join('')}</div>`;
  }

  function feedView(items) {
    if (!items.length) return '<div class="empty">No activity yet.</div>';
    return `<div class="feed">${items
      .map((a) => {
        const u = userById(a.userId);
        const who = `<b>${esc(u?.name || 'Someone')}</b>`;
        const t = a.taskId ? taskById(a.taskId) : null;
        const tl = t ? `<a href="#" data-task="${esc(t.id)}">${esc(t.title)}</a>` : '';
        let body;
        if (a.type === 'comment') body = `${who} posted an update${t ? ` on ${tl}` : ''}<div class="quote">${esc(a.text)}</div>`;
        else if (a.type === 'task_created') body = `${who} created ${t ? tl : 'a task'}`;
        else if (a.type === 'status' && STATUS[a.to]) body = `${who} moved ${t ? tl : 'a task'} to ${statusBadge(a.to)}`;
        else body = `${who} ${esc(a.text)}${t ? ` on ${tl}` : ''}`;
        return `<div class="feed-item">${avatar(u, 'sm')}<div class="body">${body}<div class="when">${relTime(a.createdAt)}</div></div></div>`;
      })
      .join('')}</div>`;
  }

  /* =========================================================
   * My Tasks
   * ======================================================= */
  function myTasksView() {
    if (readOnly()) return dashboardView();
    const mine = state.tasks.filter((t) => t.assigneeId === state.meId);
    const s = memberStats(state.meId);
    const twoWeeks = Date.now() - 14 * 864e5;
    const attention = mine.filter((t) => isOpen(t) && (isOverdue(t) || t.status === 'blocked'));
    const attnIds = new Set(attention.map((t) => t.id));
    const groups = [
      { title: '⚠️ Needs attention', items: attention },
      { title: 'In progress', items: mine.filter((t) => t.status === 'in_progress' && !attnIds.has(t.id)) },
      { title: 'To do', items: mine.filter((t) => t.status === 'todo' && !attnIds.has(t.id)) },
      { title: 'In review', items: mine.filter((t) => t.status === 'review' && !attnIds.has(t.id)) },
      { title: '🎉 Completed recently', items: mine.filter((t) => t.status === 'done' && t.completedAt && new Date(t.completedAt).getTime() >= twoWeeks) },
    ];

    const head = `
      <div class="kpis four">
        <div class="card kpi"><div class="label"><i style="background:var(--st-todo)"></i>Open tasks</div><div class="value">${s.open.length}</div><div class="hint">${s.doneWeek.length} finished this week</div></div>
        <div class="card kpi"><div class="label"><i style="background:var(--brand)"></i>My avg. progress</div><div class="value">${s.avgOpen}%</div>${pbar(s.avgOpen, '', 'aurora')}</div>
        <div class="card kpi"><div class="label"><i style="background:var(--st-blocked)"></i>Overdue</div><div class="value">${s.overdue.length}</div><div class="hint ${s.overdue.length ? 'bad' : 'good'}">${s.overdue.length ? 'Please update these' : 'You are on track'}</div></div>
        <div class="card kpi"><div class="label"><i style="background:var(--st-done)"></i>Completed</div><div class="value">${s.done.length}</div><div class="hint">All time</div></div>
      </div>
      <div class="row between wrap" style="margin-bottom:14px">
        <div class="muted">Drag the slider to update progress. Changes save automatically and your team sees them right away.</div>
        <button class="btn primary" data-action="new-task">${icon('plus')} Add task</button>
      </div>`;

    if (!mine.length) {
      return head + `<div class="card"><div class="empty"><div class="big">🌤️</div><h4>No tasks assigned to you yet</h4>${isAdmin() ? 'Create a task and assign it to yourself or a teammate.' : 'Your manager will assign tasks here, or you can add one yourself.'}</div></div>`;
    }
    return head + groups
      .filter((g) => g.items.length)
      .map((g) => `
        <section class="mytask-group">
          <h3>${g.title} <span class="badge">${g.items.length}</span></h3>
          <div class="mytask-list">${g.items.sort(sortTasksForWork).map(myTaskRow).join('')}</div>
        </section>`)
      .join('');
  }

  function myTaskRow(t) {
    const p = projectById(t.projectId);
    const id = esc(t.id);
    return `
      <div class="card mytask" style="--pc:${p ? p.color : 'var(--border)'}">
        <div style="min-width:0">
          <div class="t-title" data-task="${id}">${esc(t.title)}</div>
          <div class="t-meta">${projectChip(p)} ${priorityBadge(t.priority)} ${dueBadge(t)}</div>
        </div>
        <div class="prog">
          <input type="range" class="progress-range" id="prog-${id}" min="0" max="100" step="5" value="${t.progress}" style="--val:${t.progress}%" data-progress="${id}" aria-label="Progress for ${esc(t.title)}">
          <span class="ptext" data-ptext="${id}">${t.progress}%</span>
        </div>
        <div class="actions">
          <select class="input" id="st-${id}" data-status="${id}" aria-label="Status">${STATUSES.map((s) => `<option value="${s.key}" ${s.key === t.status ? 'selected' : ''}>${s.label}</option>`).join('')}</select>
          ${t.status !== 'done' ? `<button class="btn sm primary" data-action="mark-done" data-id="${id}" title="Mark as done">✓ Done</button>` : ''}
          <button class="btn sm" data-task="${id}">Add note</button>
        </div>
      </div>`;
  }

  /* =========================================================
   * Board (Kanban)
   * ======================================================= */
  function filterSelects(f, scope, { status = false } = {}) {
    return `
      <select class="input" id="${scope}-f-project" data-filter="${scope}.project" aria-label="Filter by project">
        <option value="">All projects</option>
        ${state.projects.map((p) => `<option value="${esc(p.id)}" ${f.project === p.id ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}
      </select>
      <select class="input" id="${scope}-f-assignee" data-filter="${scope}.assignee" aria-label="Filter by team member">
        <option value="">Everyone</option>
        ${readOnly() ? '' : `<option value="me" ${f.assignee === 'me' ? 'selected' : ''}>Only me</option>`}
        <option value="none" ${f.assignee === 'none' ? 'selected' : ''}>Unassigned</option>
        ${activeUsers().map((u) => `<option value="${esc(u.id)}" ${f.assignee === u.id ? 'selected' : ''}>${esc(u.name)}</option>`).join('')}
      </select>
      ${status ? `<select class="input" id="${scope}-f-status" data-filter="${scope}.status" aria-label="Filter by status">
        <option value="open" ${f.status === 'open' ? 'selected' : ''}>Open tasks</option>
        <option value="" ${f.status === '' ? 'selected' : ''}>All statuses</option>
        <option value="overdue" ${f.status === 'overdue' ? 'selected' : ''}>Overdue</option>
        ${STATUSES.map((s) => `<option value="${s.key}" ${f.status === s.key ? 'selected' : ''}>${s.label}</option>`).join('')}
      </select>` : ''}
      <select class="input" id="${scope}-f-priority" data-filter="${scope}.priority" aria-label="Filter by priority">
        <option value="">Any priority</option>
        ${PRIORITIES.map((p) => `<option value="${p.key}" ${f.priority === p.key ? 'selected' : ''}>${p.label}</option>`).join('')}
      </select>`;
  }

  function applyFilters(tasks, f) {
    return tasks.filter((t) => {
      if (f.project && t.projectId !== f.project) return false;
      if (f.assignee === 'me' && t.assigneeId !== state.meId) return false;
      if (f.assignee === 'none' && t.assigneeId) return false;
      if (f.assignee && !['me', 'none'].includes(f.assignee) && t.assigneeId !== f.assignee) return false;
      if (f.priority && t.priority !== f.priority) return false;
      if (f.status === 'open' && !isOpen(t)) return false;
      if (f.status === 'overdue' && !isOverdue(t)) return false;
      if (f.status && !['open', 'overdue'].includes(f.status) && t.status !== f.status) return false;
      if (f.q) {
        const q = f.q.toLowerCase();
        const p = projectById(t.projectId);
        const u = userById(t.assigneeId);
        if (![t.title, t.description, p?.name, p?.client, u?.name].some((x) => (x || '').toLowerCase().includes(q))) return false;
      }
      return true;
    });
  }

  function boardView() {
    const f = state.filters.board;
    const tasks = applyFilters(state.tasks, f);
    const monthAgo = Date.now() - 30 * 864e5;
    return `
      <div class="toolbar">
        ${filterSelects(f, 'board')}
        <div class="spacer"></div>
        <span class="muted small hide-sm">Showing ${plural(tasks.length, 'task')} · completed tasks older than 30 days are hidden</span>
      </div>
      <div class="board">
        ${STATUSES.map((s) => {
          let items = tasks.filter((t) => t.status === s.key);
          if (s.key === 'done') items = items.filter((t) => !t.completedAt || new Date(t.completedAt).getTime() >= monthAgo);
          items.sort(s.key === 'done' ? (a, b) => (b.completedAt || '').localeCompare(a.completedAt || '') : sortTasksForWork);
          return `
          <section class="column" aria-label="${s.label}">
            <div class="column-head" style="--c:${s.color}"><span class="badge st-${s.key}"><span class="dot"></span>${s.label}</span><span class="count">${items.length}</span></div>
            <div class="column-body" data-drop="${s.key}">
              ${items.map(boardCard).join('') || `<div class="muted small" style="text-align:center;padding:18px 0">${readOnly() ? 'No tasks' : 'Drop tasks here'}</div>`}
            </div>
          </section>`;
        }).join('')}
      </div>`;
  }

  function boardCard(t) {
    const p = projectById(t.projectId);
    const id = esc(t.id);
    return `
      <article class="task-card" style="--pc:${p ? p.color : 'var(--border)'}" data-task="${id}" ${canEditTask(t) ? 'draggable="true"' : ''} data-drag="${id}">
        <div class="t-meta">${projectChip(p)}</div>
        <div class="t-title">${esc(t.title)}</div>
        <div class="t-meta">${priorityBadge(t.priority)} ${dueBadge(t)}</div>
        <div class="t-foot">${pbar(t.progress, p?.color)}<span class="ptext">${t.progress}%</span>${avatar(userById(t.assigneeId), 'sm')}</div>
      </article>`;
  }

  /* =========================================================
   * All tasks (table)
   * ======================================================= */
  function tasksView() {
    const f = state.filters.tasks;
    return `
      <div class="toolbar">
        <input class="input" type="search" id="tasks-q" placeholder="Search title, project, person…" value="${esc(f.q)}" style="min-width:220px" aria-label="Search tasks">
        ${filterSelects(f, 'tasks', { status: true })}
        <div class="spacer"></div>
        ${readOnly() ? '' : `<button class="btn primary" data-action="new-task">${icon('plus')} New task</button>`}
      </div>
      <div class="card"><div class="table-wrap" id="tasks-table">${tasksTable()}</div></div>`;
  }

  function tasksTable() {
    const f = state.filters.tasks;
    const rows = applyFilters(state.tasks, f);
    const val = (t) => {
      switch (f.sort) {
        case 'title': return t.title.toLowerCase();
        case 'project': return (projectById(t.projectId)?.name || '').toLowerCase();
        case 'assignee': return (userById(t.assigneeId)?.name || '~').toLowerCase();
        case 'status': return STATUSES.findIndex((s) => s.key === t.status);
        case 'priority': return PRIORITY[t.priority].rank;
        case 'progress': return t.progress;
        case 'dueDate': return t.dueDate || '9999';
        default: return t.updatedAt;
      }
    };
    rows.sort((a, b) => (val(a) < val(b) ? -1 : val(a) > val(b) ? 1 : 0) * f.dir);
    if (!rows.length) return '<div class="empty"><div class="big">🔍</div><h4>No tasks match</h4>Try clearing a filter.</div>';
    const th = (k, label) => `<th data-sort="${k}">${label} ${f.sort === k ? `<span class="arrow">${f.dir > 0 ? '▲' : '▼'}</span>` : ''}</th>`;
    return `
      <table class="data">
        <thead><tr>${th('title', 'Task')}${th('project', 'Project')}${th('assignee', 'Assignee')}${th('status', 'Status')}${th('priority', 'Priority')}${th('progress', 'Progress')}${th('dueDate', 'Due')}</tr></thead>
        <tbody>${rows.map((t) => {
          const u = userById(t.assigneeId);
          return `<tr data-task="${esc(t.id)}">
            <td><div class="t-title">${esc(t.title)}</div></td>
            <td>${projectChip(projectById(t.projectId))}</td>
            <td><div class="row" style="gap:8px">${avatar(u, 'sm')}<span>${esc(u?.name || 'Unassigned')}</span></div></td>
            <td>${statusBadge(t.status)}</td>
            <td>${priorityBadge(t.priority)}</td>
            <td><div class="prog-cell">${pbar(t.progress)}<span class="ptext">${t.progress}%</span></div></td>
            <td>${dueBadge(t)}</td>
          </tr>`;
        }).join('')}</tbody>
      </table>
      <div class="muted small" style="padding:10px 14px">${plural(rows.length, 'task')}</div>`;
  }

  /* =========================================================
   * Projects
   * ======================================================= */
  function projectsView() {
    const filter = state.filters.projects;
    const list = state.projects.filter((p) => filter === 'all' || p.status === filter);
    const seg = [['all', 'All'], ...PROJECT_STATUSES.map((s) => [s.key, s.label])]
      .map(([k, l]) => `<button class="${filter === k ? 'on' : ''}" data-pfilter="${k}">${l}</button>`)
      .join('');
    const hasExamples = state.projects.some((p) => p.example);
    return `
      <div class="toolbar">
        <div class="seg">${seg}</div>
        <div class="spacer"></div>
        ${isAdmin() && hasExamples ? `<button class="btn danger" data-action="remove-examples">${icon('trash')} Remove example data</button>` : ''}
        ${isAdmin() ? `<button class="btn primary" data-action="new-project">${icon('plus')} New project</button>` : ''}
      </div>
      ${list.length ? `<div class="cards-grid">${list.map(projectCard).join('')}</div>`
        : `<div class="card"><div class="empty"><div class="big">📁</div><h4>No projects here</h4>${isAdmin() ? 'Create a project to start organising tasks.' : 'No one has created a project in this category yet.'}</div></div>`}`;
  }

  function projectCard(p) {
    const s = projectStats(p.id);
    const lead = userById(p.leadId);
    return `
      <article class="card project-card" style="--pc:${p.color}" data-go="#/projects/${esc(p.id)}">
        <div class="stripe"></div>
        <div class="inner">
          <div class="row between">${projectStatusBadge(p.status)}${p.dueDate ? `<span class="muted small">${icon('calendar').replace('<svg', '<svg style="width:13px;height:13px;vertical-align:-2px"')} ${fmtDay(p.dueDate)}</span>` : ''}</div>
          <h3>${esc(p.name)}</h3>
          <div class="client">${esc(p.client || '—')}${lead ? ` · Lead: ${esc(lead.name)}` : ''}</div>
          <div class="desc">${esc(p.description || 'No description.')}</div>
          <div class="row"><div style="flex:1">${pbar(s.progress, p.color, 'lg')}</div><span class="ptext">${s.progress}%</span></div>
          <div class="foot">
            <div class="counts"><div><b>${s.tasks.length}</b>tasks</div><div><b>${s.done}</b>done</div><div><b ${s.overdue ? 'style="color:var(--danger)"' : ''}>${s.overdue}</b>overdue</div></div>
            <div class="avatars">${s.members.slice(0, 5).map((u) => avatar(u, 'sm')).join('')}</div>
          </div>
        </div>
      </article>`;
  }

  function projectDetailView(id) {
    const p = projectById(id);
    if (!p) return `<div class="card"><div class="empty"><h4>Project not found</h4><a href="#" data-go="#/projects">Back to projects</a></div></div>`;
    const s = projectStats(p.id);
    const lead = userById(p.leadId);
    const contrib = s.members.map((u) => {
      const ts = s.tasks.filter((t) => t.assigneeId === u.id);
      return { u, n: ts.length, done: ts.filter((t) => !isOpen(t)).length, prog: avg(ts.map((t) => t.progress)) };
    });
    const sorted = [...s.tasks].sort((a, b) => (isOpen(a) === isOpen(b) ? sortTasksForWork(a, b) : isOpen(a) ? -1 : 1));
    return `
      <button class="btn ghost sm" style="margin-bottom:12px" data-go="#/projects">${icon('back')} All projects</button>
      <section class="card" style="overflow:hidden;margin-bottom:18px">
        <div style="height:6px;background:${p.color}"></div>
        <div class="profile-head">
          <div style="min-width:0;flex:1">
            <div class="row wrap">${projectStatusBadge(p.status)}<span class="muted small">${esc(p.client || '')}</span></div>
            <h2 style="margin-top:6px">${esc(p.name)}</h2>
            <div class="muted small" style="margin-top:4px">${p.startDate ? fmtDay(p.startDate, true) : '—'} → ${p.dueDate ? fmtDay(p.dueDate, true) : '—'}${lead ? ` · Lead: <b style="color:var(--text)">${esc(lead.name)}</b>` : ''}</div>
            ${p.description ? `<p style="color:var(--text-2);margin:10px 0 0;white-space:pre-wrap">${esc(p.description)}</p>` : ''}
          </div>
          <div class="row wrap">
            ${readOnly() ? '' : `<button class="btn primary" data-action="new-task" data-project="${esc(p.id)}">${icon('plus')} Add task</button>`}
            ${isAdmin() ? `<button class="btn" data-action="edit-project" data-id="${esc(p.id)}">${icon('edit')} Edit</button>` : ''}
          </div>
        </div>
        <div style="padding:0 22px 22px"><div class="row"><div style="flex:1">${pbar(s.progress, p.color, 'lg')}</div><span class="ptext" style="font-size:16px">${s.progress}%</span></div></div>
      </section>
      <div class="kpis four">
        <div class="card kpi"><div class="label"><i style="background:var(--brand)"></i>Tasks</div><div class="value">${s.tasks.length}</div></div>
        <div class="card kpi"><div class="label"><i style="background:var(--st-progress)"></i>Open</div><div class="value">${s.open}</div></div>
        <div class="card kpi"><div class="label"><i style="background:var(--st-done)"></i>Done</div><div class="value">${s.done}</div></div>
        <div class="card kpi"><div class="label"><i style="background:var(--st-blocked)"></i>Overdue</div><div class="value">${s.overdue}</div></div>
      </div>
      <div class="dash-grid">
        <section class="card span-8">
          <div class="card-head"><h3>Tasks</h3></div>
          <div class="card-body" style="padding-top:8px">${sorted.length ? `<div class="list">${sorted.map(taskListItem).join('')}</div>` : '<div class="empty">No tasks yet in this project.</div>'}</div>
        </section>
        <section class="card span-4">
          <div class="card-head"><h3>Team on this project</h3></div>
          <div class="card-body">${contrib.length ? `<div class="list">${contrib.map(({ u, n, done, prog }) => `
            <div class="list-item" data-go="#/team/${esc(u.id)}">${avatar(u)}<div class="main-col"><div class="title">${esc(u.name)}</div>
            <div class="row" style="margin-top:4px">${pbar(prog, u.color)}<span class="ptext">${prog}%</span></div>
            <div class="muted small">${done}/${n} tasks done</div></div></div>`).join('')}</div>` : '<div class="empty">No one assigned yet.</div>'}</div>
        </section>
      </div>`;
  }

  function taskListItem(t) {
    return `<div class="list-item" data-task="${esc(t.id)}">
      ${avatar(userById(t.assigneeId), 'sm')}
      <div class="main-col">
        <div class="title" ${!isOpen(t) ? 'style="text-decoration:line-through;color:var(--muted)"' : ''}>${esc(t.title)}</div>
        <div class="row wrap" style="gap:8px;margin-top:3px">${statusBadge(t.status)} ${priorityBadge(t.priority)} ${dueBadge(t)}</div>
      </div>
      <div class="row hide-sm" style="width:140px">${pbar(t.progress)}<span class="ptext">${t.progress}%</span></div>
    </div>`;
  }

  /* =========================================================
   * Team
   * ======================================================= */
  function teamView() {
    const members = activeUsers();
    return `
      <div class="toolbar">
        <div class="muted">${plural(members.length, 'team member')}</div>
        <div class="spacer"></div>
        ${isAdmin() ? `<button class="btn primary" data-action="new-member">${icon('plus')} Add team member</button>` : ''}
      </div>
      ${isAdmin() && state.invites.length ? `
        <section class="card" style="margin-bottom:18px">
          <div class="card-head"><h3>Waiting to sign in</h3><span class="sub">Added, but haven't signed in yet</span></div>
          <div class="card-body" style="padding-top:8px"><div class="list">${state.invites.map((i) => `
            <div class="list-item" style="cursor:default">
              <span class="avatar none sm">${icon('mail').replace('<svg', '<svg style="width:12px;height:12px"')}</span>
              <div class="main-col"><div class="title">${esc(i.displayName || i.email)}</div><div class="muted small">${esc(i.email)}${i.title ? ` · ${esc(i.title)}` : ''}${i.role === 'admin' ? ' · Manager' : ''}</div></div>
              <button class="btn ghost sm danger" data-action="revoke-invite" data-email="${esc(i.email)}">Cancel</button>
            </div>`).join('')}</div></div>
        </section>` : ''}
      ${members.length ? `<div class="cards-grid">${members.map((u) => {
        const s = memberStats(u.id);
        const w = workload(s.open.length);
        return `
          <article class="card member-card" data-go="#/team/${esc(u.id)}">
            ${avatar(u, 'lg')}
            <h3>${esc(u.name)}</h3>
            <div class="title">${esc(u.title || 'Team member')} ${u.role === 'admin' ? '<span class="badge role-admin">Manager</span>' : ''}</div>
            <div class="row" data-tip="Average progress on open tasks">${pbar(s.avgOpen, u.color)}<span class="ptext">${s.avgOpen}%</span></div>
            <div class="counts"><div><b>${s.open.length}</b>open</div><div><b>${s.doneWeek.length}</b>done this week</div><div><b ${s.overdue.length ? 'style="color:var(--danger)"' : ''}>${s.overdue.length}</b>overdue</div></div>
            <div class="workload" style="--c:${w.c}"><i></i>${w.label}</div>
          </article>`;
      }).join('')}</div>` : '<div class="card"><div class="empty"><div class="big">👥</div><h4>No one has joined yet</h4>Add your team members by email, then send them the website link.</div></div>'}`;
  }

  function memberDetailView(id) {
    const u = userById(id);
    if (!u || !memberDoc(id)) return `<div class="card"><div class="empty"><h4>Team member not found</h4><a href="#" data-go="#/team">Back to team</a></div></div>`;
    const s = memberStats(u.id);
    const w = workload(s.open.length);
    const acts = state.activity.filter((a) => a.userId === u.id).slice(0, 15);
    const open = [...s.open].sort(sortTasksForWork);
    const done = [...s.done].sort((a, b) => (b.completedAt || '').localeCompare(a.completedAt || '')).slice(0, 10);
    return `
      <button class="btn ghost sm" style="margin-bottom:12px" data-go="#/team">${icon('back')} Team</button>
      <section class="card" style="margin-bottom:18px">
        <div class="profile-head">
          ${avatar(u, 'xl')}
          <div style="min-width:0">
            <h2>${esc(u.name)} ${!u.active ? '<span class="badge">Removed</span>' : ''}</h2>
            <div class="muted">${esc(u.title || 'Team member')} ${u.role === 'admin' ? '<span class="badge role-admin">Manager</span>' : ''}</div>
            <div class="workload" style="--c:${w.c}"><i></i>${w.label} · ${plural(s.open.length, 'open task')}</div>
          </div>
          <div class="spacer"></div>
          <div class="row wrap">
            ${isAdmin() && u.active ? `<button class="btn primary" data-action="new-task" data-assignee="${esc(u.id)}">${icon('plus')} Assign task</button>
            <button class="btn" data-action="edit-member" data-id="${esc(u.id)}">${icon('edit')} Edit</button>` : ''}
          </div>
        </div>
      </section>
      <div class="kpis four">
        <div class="card kpi"><div class="label"><i style="background:${u.color}"></i>Avg. progress (open)</div><div class="value">${s.avgOpen}%</div>${pbar(s.avgOpen, u.color)}</div>
        <div class="card kpi"><div class="label"><i style="background:var(--st-progress)"></i>Open tasks</div><div class="value">${s.open.length}</div><div class="hint">${s.blocked.length ? `<span style="color:var(--danger)">${s.blocked.length} blocked</span>` : 'None blocked'}</div></div>
        <div class="card kpi"><div class="label"><i style="background:var(--st-done)"></i>Done this week</div><div class="value">${s.doneWeek.length}</div><div class="hint">${s.done.length} all time</div></div>
        <div class="card kpi"><div class="label"><i style="background:var(--st-blocked)"></i>Overdue</div><div class="value">${s.overdue.length}</div><div class="hint ${s.overdue.length ? 'bad' : 'good'}">${s.overdue.length ? 'Behind schedule' : 'On schedule'}</div></div>
      </div>
      <div class="dash-grid">
        <section class="card span-7">
          <div class="card-head"><h3>Current tasks</h3></div>
          <div class="card-body" style="padding-top:8px">${open.length ? `<div class="list">${open.map(taskListItem).join('')}</div>` : '<div class="empty">No open tasks.</div>'}</div>
          ${done.length ? `<div class="card-head"><h3>Recently completed</h3></div><div class="card-body" style="padding-top:8px"><div class="list">${done.map(taskListItem).join('')}</div></div>` : ''}
        </section>
        <section class="card span-5">
          <div class="card-head"><h3>Recent activity</h3></div>
          <div class="card-body">${feedView(acts)}</div>
        </section>
      </div>`;
  }

  /* =========================================================
   * Profile
   * ======================================================= */
  function profileView() {
    if (readOnly()) return dashboardView();
    const u = me();
    const m = memberDoc(state.meId) || {};
    return `
      <div class="dash-grid">
        <section class="card span-6">
          <div class="card-head"><h3>How you appear to the team</h3></div>
          <form class="card-body stack" id="profile-form">
            <div class="row">${avatar(u, 'lg')}<div><b>${esc(u.name)}</b><div class="muted small">${esc(state.myEmail)} · ${isAdmin() ? 'Manager' : 'Team member'}</div></div></div>
            <div class="grid-2">
              <div class="field"><label for="pf-name">Name</label><input class="input" id="pf-name" name="displayName" value="${esc(m.displayName || '')}" placeholder="Your name" maxlength="80"></div>
              <div class="field"><label for="pf-title">Job title</label><input class="input" id="pf-title" name="title" value="${esc(m.title || '')}" maxlength="80"></div>
            </div>
            <div class="field"><label>Colour</label>${swatchPicker('color', u.color)}</div>
            <div><button class="btn primary" type="submit">Save profile</button></div>
          </form>
        </section>
        <section class="card span-6">
          <div class="card-head"><h3>Tips</h3></div>
          <div class="card-body stack" style="color:var(--text-2)">
            <div>📌 Update <b>My Tasks</b> at the end of each day: move the slider and add a short note.</div>
            <div>🚧 Stuck on something? Set the task to <b>Blocked</b> and say why, so your manager sees it on the dashboard.</div>
            <div>⌨️ Press <b>N</b> anywhere to add a new task.</div>
            <div>🌓 Light and dark mode follow your Claude settings.</div>
          </div>
        </section>
      </div>`;
  }

  function swatchPicker(name, value) {
    const v = String(value).toLowerCase();
    return `<div class="row wrap" role="radiogroup">${SWATCHES.map((c, i) => `
      <label style="cursor:pointer" title="${c}">
        <input type="radio" id="sw-${name}-${i}" name="${name}" value="${c}" ${c === v ? 'checked' : ''} class="sr-only">
        <span style="display:inline-block;width:28px;height:28px;border-radius:50%;background:${c};box-shadow:0 0 0 2px var(--surface), 0 0 0 ${c === v ? '4px var(--text)' : '0 transparent'}"></span>
      </label>`).join('')}</div>`;
  }
  function bindSwatches(root) {
    $$('input[type=radio]', root).forEach((r) =>
      r.addEventListener('change', () => {
        $$(`input[name="${r.name}"]`, root).forEach((o) => {
          o.nextElementSibling.style.boxShadow = `0 0 0 2px var(--surface), 0 0 0 ${o.checked ? '4px var(--text)' : '0 transparent'}`;
        });
      })
    );
  }

  /* =========================================================
   * Task modal
   * ======================================================= */
  function openTaskModal(taskId, defaults = {}) {
    const existing = taskId ? taskById(taskId) : null;
    if (taskId && !existing) return toast('That task no longer exists.', 'error');
    if (!existing && readOnly()) return;
    if (!existing && !state.projects.length) {
      if (isAdmin()) { toast('Create a project first, then add tasks to it.', 'error'); return openProjectModal(); }
      return toast('No projects yet. Ask your manager to create one.', 'error');
    }
    const t = existing || {
      title: '', description: '', status: 'todo', priority: 'medium', progress: 0,
      projectId: defaults.projectId || state.filters.board.project || state.projects.find((p) => p.status === 'active')?.id || state.projects[0].id,
      assigneeId: defaults.assigneeId || state.meId,
      startDate: todayStr(), dueDate: '', estimateHours: '',
    };
    const editable = !existing || canEditTask(existing);
    const admin = isAdmin();
    const dis = editable ? '' : 'disabled';
    const creator = existing ? userById(existing.createdBy) : null;
    const canComment = !readOnly();

    const html = `
      <div class="modal-head">
        <h2>${existing ? 'Task details' : 'New task'}</h2>
        ${existing ? statusBadge(existing.status) : ''}
        <button class="icon-btn" data-x="close" aria-label="Close">${icon('x')}</button>
      </div>
      <form id="task-form" novalidate>
        <div class="${existing ? 'task-layout' : ''}">
          <div class="stack" ${existing ? '' : 'style="padding:20px 22px"'}>
            ${!editable ? `<div class="badge" style="align-self:flex-start;white-space:normal">${canComment ? 'View only: you can comment, but only the assignee or a manager can edit.' : 'View only.'}</div>` : ''}
            <div class="field"><label for="t-title">What needs to be done?</label><input class="input" id="t-title" name="title" value="${esc(t.title)}" placeholder="e.g. Design Instagram story set" required maxlength="200" ${dis}></div>
            <div class="field"><label for="t-desc">Details (optional)</label><textarea class="input" id="t-desc" name="description" placeholder="Details, links, requirements…" maxlength="8000" ${dis}>${esc(t.description)}</textarea></div>
            <div class="grid-2">
              <div class="field"><label for="t-project">Project</label><select class="input" id="t-project" name="projectId" ${dis}>
                ${state.projects.map((p) => `<option value="${esc(p.id)}" ${p.id === t.projectId ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}
              </select></div>
              <div class="field"><label for="t-assignee">Who is doing it?</label><select class="input" id="t-assignee" name="assigneeId" ${editable && admin ? '' : 'disabled'}>
                <option value="">Unassigned</option>
                ${activeUsers().map((u) => `<option value="${esc(u.id)}" ${u.id === t.assigneeId ? 'selected' : ''}>${esc(u.name)}</option>`).join('')}
              </select></div>
              <div class="field"><label for="t-priority">Priority</label><select class="input" id="t-priority" name="priority" ${dis}>
                ${PRIORITIES.map((p) => `<option value="${p.key}" ${p.key === t.priority ? 'selected' : ''}>${p.label}</option>`).join('')}
              </select></div>
              <div class="field"><label for="t-due">Due date</label><input class="input" id="t-due" type="date" name="dueDate" value="${t.dueDate || ''}" ${dis}></div>
            </div>
            <details class="more-opts">
              <summary>More options (start date, time estimate)</summary>
              <div class="grid-2" style="margin-top:12px">
                <div class="field"><label for="t-start">Start date</label><input class="input" id="t-start" type="date" name="startDate" value="${t.startDate || ''}" ${dis}></div>
                <div class="field"><label for="t-est">Time estimate (hours)</label><input class="input" id="t-est" type="number" min="0" max="1000" step="0.5" name="estimateHours" value="${t.estimateHours ?? ''}" ${dis}></div>
              </div>
            </details>
            <div class="field"><label>Status</label>
              <div class="status-pills">${STATUSES.map((s) => `<button type="button" class="${s.key === t.status ? 'on' : ''}" style="--c:${s.color}" data-st="${s.key}" ${dis}><i></i>${s.label}</button>`).join('')}</div>
              <input type="hidden" name="status" value="${t.status}">
            </div>
            <div class="progress-box">
              <div class="row between"><label for="t-prog" style="font-weight:600;font-size:12px;color:var(--text-2)">Progress</label><span class="big num" id="prog-val">${t.progress}%</span></div>
              <input type="range" class="progress-range" id="t-prog" name="progress" min="0" max="100" step="5" value="${t.progress}" style="--val:${t.progress}%" ${dis}>
              <div class="quick-pcts">${[0, 25, 50, 75, 100].map((n) => `<button type="button" data-pct="${n}" ${dis}>${n}%</button>`).join('')}</div>
            </div>
            ${existing && editable ? `<div class="field"><label for="t-note">Add a progress note (optional)</label><textarea class="input" id="t-note" name="note" style="min-height:64px" placeholder="What did you get done? Anything blocking you?" maxlength="4000"></textarea></div>` : ''}
            ${existing ? `<div class="muted small">Created ${relTime(existing.createdAt)}${creator ? ` by ${esc(creator.name)}` : ''} · updated ${relTime(existing.updatedAt)}</div>` : ''}
          </div>
          ${existing ? `
          <div class="stack">
            <h3 style="font-size:15px">Updates & comments</h3>
            <div id="task-activity"><div class="muted small">Loading…</div></div>
            ${canComment ? `<div class="field">
              <textarea class="input" id="comment-text" placeholder="Write a comment or update…" style="min-height:70px" maxlength="4000" aria-label="Comment"></textarea>
              <div><button type="button" class="btn sm" id="comment-send">Post comment</button></div>
            </div>` : ''}
          </div>` : ''}
        </div>
        <div class="modal-foot">
          ${existing && canDeleteTask(existing) ? `<button type="button" class="btn danger" data-x="delete">${icon('trash')} Delete</button>` : ''}
          <div class="spacer"></div>
          <button type="button" class="btn" data-x="close">${editable ? 'Cancel' : 'Close'}</button>
          ${editable ? `<button type="submit" class="btn primary">${existing ? 'Save changes' : 'Create task'}</button>` : ''}
        </div>
      </form>`;

    openModal(html, {
      wide: !!existing,
      onMount(modal) {
        const form = $('#task-form', modal);
        const range = form.elements.progress;
        const statusInput = form.elements.status;
        const setProgress = (v) => {
          range.value = v;
          range.style.setProperty('--val', `${v}%`);
          $('#prog-val', modal).textContent = `${v}%`;
        };
        const setStatus = (s) => {
          statusInput.value = s;
          $$('.status-pills button', modal).forEach((b) => b.classList.toggle('on', b.dataset.st === s));
        };
        range.addEventListener('input', () => {
          setProgress(range.value);
          if (+range.value === 100 && statusInput.value !== 'done') setStatus('review');
          else if (+range.value > 0 && statusInput.value === 'todo') setStatus('in_progress');
        });
        modal.addEventListener('click', async (e) => {
          const st = e.target.closest('[data-st]');
          if (st && !st.disabled) {
            setStatus(st.dataset.st);
            if (st.dataset.st === 'done') setProgress(100);
            return;
          }
          const pct = e.target.closest('[data-pct]');
          if (pct && !pct.disabled) {
            setProgress(pct.dataset.pct);
            range.dispatchEvent(new Event('input'));
            return;
          }
          const x = e.target.closest('[data-x]');
          if (!x) return;
          if (x.dataset.x === 'close') closeModal();
          if (x.dataset.x === 'delete') {
            const ok = await confirmDialog('Delete task?', `“${existing.title}” and its comments will be permanently deleted.`);
            if (ok) await save(() => deleteTask(existing), 'Task deleted');
          }
        });
        form.addEventListener('submit', async (e) => {
          e.preventDefault();
          if (!editable) return;
          const d = formData(form);
          if (!d.title) { toast('Please add a title.', 'error'); form.elements.title.focus(); return; }
          const patch = {
            title: str(d.title, 200), description: str(d.description, 8000), projectId: d.projectId, priority: d.priority,
            startDate: dateOrNull(d.startDate), dueDate: dateOrNull(d.dueDate),
            estimateHours: d.estimateHours === '' ? null : Math.max(0, Math.min(1000, Number(d.estimateHours) || 0)),
            status: d.status, progress: Number(d.progress),
          };
          if (admin) patch.assigneeId = d.assigneeId || null;
          else if (!existing) patch.assigneeId = state.meId;
          const btn = form.querySelector('button[type=submit]');
          btn.disabled = true;
          const ok = await save(() => saveTask(existing ? existing.id : null, patch, d.note), existing ? 'Task updated' : 'Task created');
          if (ok) closeModal();
          else btn.disabled = false;
        });
        if (existing) {
          loadTaskActivity(existing.id);
          const send = $('#comment-send', modal);
          if (send) send.addEventListener('click', async () => {
            const ta = $('#comment-text', modal);
            const text = ta.value.trim();
            if (!text) return ta.focus();
            send.disabled = true;
            const ok = await save(async () => {
              await api.save('activity', null, { type: 'comment', taskId: existing.id, projectId: existing.projectId, text: str(text, 4000) });
              refresh('activity');
            }, 'Comment posted');
            send.disabled = false;
            if (ok) { ta.value = ''; loadTaskActivity(existing.id); }
          });
        }
      },
    });
  }

  async function loadTaskActivity(taskId) {
    let items;
    try {
      items = (await api.taskActivity(taskId)).map(cleanActivity);
    } catch (_) {
      items = state.activity.filter((a) => a.taskId === taskId);
    }
    const el = $('#task-activity');
    if (el) el.innerHTML = feedView(items);
  }

  /* =========================================================
   * Project modal
   * ======================================================= */
  function openProjectModal(projectId) {
    const existing = projectId ? projectById(projectId) : null;
    const p = existing || { name: '', client: '', description: '', color: SWATCHES[state.projects.length % SWATCHES.length], status: 'active', startDate: todayStr(), dueDate: '', leadId: state.meId };
    openModal(`
      <div class="modal-head"><h2>${existing ? 'Edit project' : 'New project'}</h2><button class="icon-btn" data-x="close" aria-label="Close">${icon('x')}</button></div>
      <form id="project-form" novalidate>
        <div class="modal-body stack">
          <div class="field"><label for="p-name">Project name</label><input class="input" id="p-name" name="name" value="${esc(p.name)}" placeholder="e.g. Winter Campaign 2026" required maxlength="120"></div>
          <div class="grid-2">
            <div class="field"><label for="p-client">Client</label><input class="input" id="p-client" name="client" value="${esc(p.client)}" placeholder="Client or brand name" maxlength="120"></div>
            <div class="field"><label for="p-lead">Project lead</label><select class="input" id="p-lead" name="leadId"><option value="">—</option>${activeUsers().map((u) => `<option value="${esc(u.id)}" ${u.id === p.leadId ? 'selected' : ''}>${esc(u.name)}</option>`).join('')}</select></div>
            <div class="field"><label for="p-status">Status</label><select class="input" id="p-status" name="status">${PROJECT_STATUSES.map((s) => `<option value="${s.key}" ${s.key === p.status ? 'selected' : ''}>${s.label}</option>`).join('')}</select></div>
            <div></div>
            <div class="field"><label for="p-start">Start date</label><input class="input" id="p-start" type="date" name="startDate" value="${p.startDate || ''}"></div>
            <div class="field"><label for="p-due">Due date</label><input class="input" id="p-due" type="date" name="dueDate" value="${p.dueDate || ''}"></div>
          </div>
          <div class="field"><label for="p-desc">Description</label><textarea class="input" id="p-desc" name="description" maxlength="4000" placeholder="Goals, deliverables, notes…">${esc(p.description)}</textarea></div>
          <div class="field"><label>Colour</label>${swatchPicker('color', p.color)}</div>
        </div>
        <div class="modal-foot">
          ${existing ? `<button type="button" class="btn danger" data-x="delete">${icon('trash')} Delete</button>` : ''}
          <div class="spacer"></div>
          <button type="button" class="btn" data-x="close">Cancel</button>
          <button type="submit" class="btn primary">${existing ? 'Save changes' : 'Create project'}</button>
        </div>
      </form>`, {
      onMount(modal) {
        bindSwatches(modal);
        const form = $('#project-form', modal);
        modal.addEventListener('click', async (e) => {
          const x = e.target.closest('[data-x]');
          if (!x) return;
          if (x.dataset.x === 'close') closeModal();
          if (x.dataset.x === 'delete') {
            const n = projectStats(existing.id).tasks.length;
            const ok = await confirmDialog('Delete project?', `“${existing.name}” and its ${plural(n, 'task')} will be permanently deleted.`);
            if (ok && await save(() => deleteProject(existing), 'Project deleted')) go('#/projects');
          }
        });
        form.addEventListener('submit', async (e) => {
          e.preventDefault();
          const d = formData(form);
          if (!d.name) return toast('Please add a project name.', 'error');
          const body = {
            name: str(d.name, 120), client: str(d.client, 120), description: str(d.description, 4000),
            color: safeColor(d.color), status: PROJECT_STATUS[d.status] ? d.status : 'active',
            startDate: dateOrNull(d.startDate), dueDate: dateOrNull(d.dueDate), leadId: d.leadId || null,
            updatedAt: nowIso(),
          };
          const ok = await save(async () => {
            if (existing) {
              await api.save('projects', existing.id, body);
              if (existing.status !== body.status) await logActivity({ type: 'project_status', projectId: existing.id, text: `marked project “${body.name}” as ${PROJECT_STATUS[body.status].label}` });
              await refresh('projects', 'activity');
              return existing.id;
            }
            const pid = await api.save('projects', null, { ...body, example: false });
            await logActivity({ type: 'project_created', projectId: pid, text: `created project “${body.name}”` });
            await refresh('projects', 'activity');
            return pid;
          }, existing ? 'Project updated' : 'Project created');
          if (ok) { closeModal(); if (!existing) go(`#/projects/${ok}`); }
        });
      },
    });
  }

  /* =========================================================
   * Member modal (managers)
   * ======================================================= */
  function openMemberModal(userId) {
    const u = userById(userId);
    const m = memberDoc(userId);
    if (!u || !m) return;
    const isSelf = userId === state.meId;
    openModal(`
      <div class="modal-head"><h2>Edit team member</h2><button class="icon-btn" data-x="close" aria-label="Close">${icon('x')}</button></div>
      <form id="member-form" novalidate>
        <div class="modal-body stack">
          <div class="row">${avatar(u, 'lg')}<div><b>${esc(u.name)}</b><div class="muted small">${u.role === 'admin' ? 'Manager' : 'Team member'}</div></div></div>
          <div class="field"><label for="m-title">Job title</label><input class="input" id="m-title" name="title" value="${esc(m.title || '')}" maxlength="80"></div>
          ${!isSelf ? `<div class="field"><label for="m-role">Role</label><select class="input" id="m-role" name="role">
              <option value="member" ${u.role !== 'admin' ? 'selected' : ''}>Team member: updates own tasks</option>
              <option value="admin" ${u.role === 'admin' ? 'selected' : ''}>Manager: creates projects and assigns tasks</option>
            </select></div>` : ''}
        </div>
        <div class="modal-foot">
          ${!isSelf ? `<button type="button" class="btn danger" data-x="delete">${icon('trash')} Remove from team</button>` : ''}
          <div class="spacer"></div>
          <button type="button" class="btn" data-x="close">Cancel</button>
          <button type="submit" class="btn primary">Save changes</button>
        </div>
      </form>`, {
      onMount(modal) {
        const form = $('#member-form', modal);
        modal.addEventListener('click', async (e) => {
          const x = e.target.closest('[data-x]');
          if (!x) return;
          if (x.dataset.x === 'close') closeModal();
          if (x.dataset.x === 'delete') {
            const ok = await confirmDialog('Remove team member?', `${u.name} will be taken off the team. They won't be able to see the tracker any more. Their open tasks become unassigned; their history is kept.`, 'Remove');
            if (!ok) return;
            const done = await save(async () => {
              for (const t of state.tasks.filter((x2) => x2.assigneeId === userId && isOpen(x2))) {
                await api.save('tasks', t.id, { assigneeId: null, updatedAt: nowIso() });
              }
              await api.save('members', userId, { active: false });
              await logActivity({ type: 'member_removed', text: `removed ${u.name} from the team` });
              await refresh('members', 'tasks', 'activity');
            }, 'Team member removed');
            if (done) go('#/team');
          }
        });
        form.addEventListener('submit', async (e) => {
          e.preventDefault();
          const d = formData(form);
          const ok = await save(async () => {
            await api.save('members', userId, { title: str(d.title, 80), ...(d.role ? { role: d.role === 'admin' ? 'admin' : 'member' } : {}) });
            await refresh('members');
          }, 'Team member updated');
          if (ok) closeModal();
        });
      },
    });
  }

  /* =========================================================
   * Invite modal (managers)
   * ======================================================= */
  function openInviteModal() {
    const link = location.href.split('#')[0];
    openModal(`
      <div class="modal-head"><h2>Add team member</h2><button class="icon-btn" data-x="close" aria-label="Close">${icon('x')}</button></div>
      <form id="invite-form" novalidate>
        <div class="modal-body stack">
          <div class="grid-2">
            <div class="field"><label for="i-name">Full name</label><input class="input" id="i-name" name="displayName" maxlength="80" placeholder="e.g. Hina Malik" required></div>
            <div class="field"><label for="i-title">Job title</label><input class="input" id="i-title" name="title" maxlength="80" placeholder="e.g. Graphic Designer"></div>
          </div>
          <div class="field"><label for="i-email">Their email address</label><input class="input" id="i-email" name="email" type="email" maxlength="120" placeholder="name@example.com" required></div>
          <div class="field"><label for="i-role">Role</label><select class="input" id="i-role" name="role">
            <option value="member">Team member: updates own tasks</option>
            <option value="admin">Manager: creates projects and assigns tasks</option>
          </select></div>
          <div class="progress-box small" style="color:var(--text-2)">
            <b style="color:var(--text)">What happens next:</b> send them this website link. They type this email, receive a 6-digit code, and they're in.
            <div class="row" style="margin-top:8px"><input class="input" id="i-link" readonly value="${esc(link)}" aria-label="Website link"><button type="button" class="btn sm" data-x="copy">Copy link</button></div>
          </div>
        </div>
        <div class="modal-foot">
          <div class="spacer"></div>
          <button type="button" class="btn" data-x="close">Cancel</button>
          <button type="submit" class="btn primary">Add to team</button>
        </div>
      </form>`, {
      onMount(modal) {
        const form = $('#invite-form', modal);
        modal.addEventListener('click', async (e) => {
          const x = e.target.closest('[data-x]');
          if (!x) return;
          if (x.dataset.x === 'close') closeModal();
          if (x.dataset.x === 'copy') {
            const inp = $('#i-link', modal);
            try { await navigator.clipboard.writeText(inp.value); toast('Link copied'); } catch (_) { inp.select(); }
          }
        });
        form.addEventListener('submit', async (e) => {
          e.preventDefault();
          const d = formData(form);
          const email = String(d.email || '').toLowerCase();
          if (!d.displayName) return toast('Please add their name.', 'error');
          if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return toast('Please enter a valid email address.', 'error');
          if (state.members.some((m) => (m.email || '').toLowerCase() === email && m.active !== false)) return toast('That person is already on the team.', 'error');
          if (state.invites.some((i) => i.email === email)) await api.remove('invites', email).catch(() => {});
          const ok = await save(async () => {
            await api.save('invites', null, { email, displayName: str(d.displayName, 80), title: str(d.title, 80), role: d.role === 'admin' ? 'admin' : 'member' });
            await refresh('invites');
          }, `${str(d.displayName, 80)} can now sign in with ${email}`);
          if (ok) closeModal();
        });
      },
    });
  }

  /* =========================================================
   * Events (delegated)
   * ======================================================= */
  function afterRender(page) {
    if (page === 'profile' && $('#profile-form')) {
      const pf = $('#profile-form');
      bindSwatches(pf);
      pf.addEventListener('submit', async (e) => {
        e.preventDefault();
        const d = formData(pf);
        if (!d.displayName) return toast('Please add your name.', 'error');
        await save(async () => {
          await api.save('members', state.meId, { displayName: str(d.displayName, 80), title: str(d.title, 80), color: safeColor(d.color) });
          await refresh('members');
        }, 'Profile saved');
      });
    }
    if (page === 'tasks') {
      const q = $('#tasks-q');
      q.addEventListener('input', () => {
        state.filters.tasks.q = q.value;
        $('#tasks-table').innerHTML = tasksTable();
      });
    }
    if (page === 'board') bindBoardDnD();
  }

  document.addEventListener('click', async (e) => {
    const t = e.target;
    if (t.closest('.modal-backdrop')) return;

    const act = t.closest('[data-action]');
    if (act) {
      e.preventDefault();
      const a = act.dataset.action;
      if (a === 'new-task') {
        const r = parseRoute();
        openTaskModal(null, {
          projectId: act.dataset.project || (r.page === 'projects' && projectById(r.id) ? r.id : undefined),
          assigneeId: act.dataset.assignee || (r.page === 'team' && isAdmin() && memberDoc(r.id) ? r.id : undefined),
        });
      }
      else if (a === 'new-project') openProjectModal();
      else if (a === 'mark-done') { act.disabled = true; await save(() => saveTask(act.dataset.id, { status: 'done' }), 'Nice work! Task marked as done 🎉'); }
      else if (a === 'edit-project') openProjectModal(act.dataset.id);
      else if (a === 'edit-member') openMemberModal(act.dataset.id);
      else if (a === 'new-member') openInviteModal();
      else if (a === 'revoke-invite') {
        const em = act.dataset.email;
        if (await confirmDialog('Cancel invitation?', `${em} will no longer be able to join the team.`, 'Cancel invitation')) {
          await save(async () => { await api.remove('invites', em); await refresh('invites'); }, 'Invitation cancelled');
        }
      }
      else if (a === 'logout') { await api.signOut(); location.reload(); }
      else if (a === 'retry-join') { state.phase = 'loading'; render(); startSession(await api.getSession()); }
      else if (a === 'signin-back') { state.signin = { step: 'email', email: state.signin.email, busy: false, error: '', resendAt: 0 }; render(); }
      else if (a === 'resend-code') sendCode();
      else if (a === 'reset-demo') { if (api.reset) { api.reset(); location.reload(); } }
      else if (a === 'menu') $('.shell').classList.toggle('nav-open');
      else if (a === 'add-example') { act.disabled = true; await save(addExampleProject, 'Example project added. Have a look around!'); }
      else if (a === 'remove-examples') {
        if (await confirmDialog('Remove example data?', 'The example project and its tasks will be deleted. Your own projects are not affected.', 'Remove')) {
          await save(removeExamples, 'Example data removed');
        }
      }
      return;
    }
    const pf = t.closest('[data-pfilter]');
    if (pf) { state.filters.projects = pf.dataset.pfilter; return render(); }

    const sort = t.closest('th[data-sort]');
    if (sort) {
      const f = state.filters.tasks;
      if (f.sort === sort.dataset.sort) f.dir *= -1;
      else { f.sort = sort.dataset.sort; f.dir = 1; }
      $('#tasks-table').innerHTML = tasksTable();
      return;
    }
    if (t.closest('input, select, textarea, label')) return;

    const task = t.closest('[data-task]');
    if (task) { e.preventDefault(); return openTaskModal(task.dataset.task); }

    const g = t.closest('[data-go]');
    if (g) { e.preventDefault(); return go(g.dataset.go); }

    const shell = $('.shell.nav-open');
    if (shell && !t.closest('.sidebar')) shell.classList.remove('nav-open');
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && e.target.matches && e.target.matches('[data-go][tabindex]')) go(e.target.dataset.go);
    if (e.key === 'Enter' && e.target.id === 'global-search') {
      state.filters.tasks.q = e.target.value.trim();
      e.target.blur();
      go('#/tasks');
    }
    const tag = document.activeElement?.tagName;
    if (e.key === 'n' && !modalOpen() && state.phase === 'ready' && !readOnly() && !['INPUT', 'TEXTAREA', 'SELECT'].includes(tag) && !e.metaKey && !e.ctrlKey && !e.altKey && $('.shell')) {
      e.preventDefault();
      const r = parseRoute();
      openTaskModal(null, { projectId: r.page === 'projects' && projectById(r.id) ? r.id : undefined });
    }
  });

  document.addEventListener('change', async (e) => {
    const t = e.target;
    if (t.closest('.modal-backdrop')) return;
    if (t.dataset.filter) {
      const [scope, key] = t.dataset.filter.split('.');
      state.filters[scope][key] = t.value;
      if (scope === 'tasks') $('#tasks-table').innerHTML = tasksTable();
      else render();
      return;
    }
    if (t.dataset.progress) {
      const v = Number(t.value);
      t.blur();
      await save(() => saveTask(t.dataset.progress, { progress: v }), `Progress saved: ${v}%`);
      return;
    }
    if (t.dataset.status) {
      const v = t.value;
      t.blur();
      await save(() => saveTask(t.dataset.status, { status: v }), `Moved to ${STATUS[v].label}`);
    }
  });

  document.addEventListener('input', (e) => {
    const t = e.target;
    if (t.dataset && t.dataset.progress) {
      t.style.setProperty('--val', `${t.value}%`);
      const lbl = $(`[data-ptext="${CSS.escape(t.dataset.progress)}"]`);
      if (lbl) lbl.textContent = `${t.value}%`;
    }
  });

  let dragging = false;
  function bindBoardDnD() {
    let dragId = null;
    $$('[data-drag][draggable="true"]').forEach((card) => {
      card.addEventListener('dragstart', (e) => {
        dragId = card.dataset.drag;
        dragging = true;
        card.classList.add('dragging');
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', dragId);
      });
      card.addEventListener('dragend', () => {
        card.classList.remove('dragging');
        dragging = false;
        if (pendingRender) scheduleRender();
      });
    });
    $$('[data-drop]').forEach((col) => {
      col.addEventListener('dragover', (e) => {
        if (!dragId) return;
        e.preventDefault();
        col.classList.add('over');
      });
      col.addEventListener('dragleave', (e) => {
        if (!col.contains(e.relatedTarget)) col.classList.remove('over');
      });
      col.addEventListener('drop', async (e) => {
        e.preventDefault();
        col.classList.remove('over');
        const id = dragId;
        dragId = null;
        dragging = false;
        const task = taskById(id);
        const status = col.dataset.drop;
        if (!task || task.status === status) return;
        await save(() => saveTask(id, { status }), `Moved to ${STATUS[status].label}`);
      });
    });
  }

  /* =========================================================
   * Boot: restore the session, join the team, load data, listen for changes
   * ======================================================= */
  let listening = false;
  async function startSession(sess) {
    if (!sess) {
      state.phase = 'signin';
      return render();
    }
    state.meId = sess.userId;
    state.myEmail = sess.email || '';
    state.phase = 'loading';
    render();
    try {
      await api.joinTeam();
    } catch (err) {
      if (err.code === 'not_invited') { state.phase = 'not_invited'; return render(); }
      console.error(err);
      toast('Could not connect to the team workspace. Please reload the page.', 'error');
      state.phase = 'signin';
      return render();
    }
    await loaders.members();
    await Promise.all([loaders.projects(), loaders.tasks(), loaders.activity(), loaders.invites()]).catch((e) => console.warn(e));
    state.phase = 'ready';
    if (!listening) {
      listening = true;
      api.onChange((kind) => refresh(kind));
      // Safety net in case the live connection drops: quietly refresh every minute.
      setInterval(() => { if (!document.hidden && state.phase === 'ready') refresh('members', 'projects', 'tasks', 'activity', 'invites'); }, 60000);
    }
    render(true);
  }

  async function boot() {
    const initial = (location.hash || '').replace(/^#\/?/, '');
    if (/^(dashboard|my|board|tasks|projects|team|profile)$/.test(initial)) state.route = initial;
    render();
    let sess = null;
    try { sess = await api.getSession(); } catch (_) { /* treat as signed out */ }
    startSession(sess);
  }
  boot();
})();
