/* Aurora Promotions — Team Tracker front-end (vanilla JS, no build step) */
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
    logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/>',
    moon: '<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>',
    sun: '<circle cx="12" cy="12" r="5"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/>',
    menu: '<path d="M3 12h18M3 6h18M3 18h18"/>',
    x: '<path d="M18 6L6 18M6 6l12 12"/>',
    edit: '<path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z"/>',
    trash: '<path d="M3 6h18M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6M10 11v6M14 11v6M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>',
    calendar: '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>',
    back: '<path d="M19 12H5M12 19l-7-7 7-7"/>',
    refresh: '<path d="M23 4v6h-6M1 20v-6h6"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>',
  };
  const icon = (name) =>
    `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICON[name]}</svg>`;

  /* =========================================================
   * State
   * ======================================================= */
  const state = {
    me: null,
    users: [],
    projects: [],
    tasks: [],
    activity: [],
    ready: false,
    filters: {
      tasks: { q: '', project: '', assignee: '', status: 'open', priority: '', sort: 'dueDate', dir: 1 },
      board: { project: '', assignee: '', priority: '' },
      projects: 'all',
    },
  };

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  /* =========================================================
   * API
   * ======================================================= */
  async function api(method, url, body) {
    const res = await fetch(url, {
      method,
      headers: body !== undefined || method !== 'GET' ? { 'Content-Type': 'application/json' } : {},
      body: body !== undefined ? JSON.stringify(body) : method !== 'GET' ? '{}' : undefined,
      credentials: 'same-origin',
    });
    let data = {};
    try { data = await res.json(); } catch (_) { /* empty */ }
    if (res.status === 401 && url !== '/api/login') {
      state.me = null;
      render();
    }
    if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
    return data;
  }

  async function loadAll() {
    const data = await api('GET', '/api/bootstrap');
    state.me = data.me;
    state.users = data.users;
    state.projects = data.projects;
    state.tasks = data.tasks;
    state.activity = data.activity;
    state.ready = true;
  }

  /* =========================================================
   * Helpers
   * ======================================================= */
  const esc = (s) =>
    String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  const userById = (id) => state.users.find((u) => u.id === id);
  const projectById = (id) => state.projects.find((p) => p.id === id);
  const taskById = (id) => state.tasks.find((t) => t.id === id);
  const activeUsers = () => state.users.filter((u) => u.active);
  const isAdmin = () => state.me && state.me.role === 'admin';
  const canEditTask = (t) => isAdmin() || t.assigneeId === state.me.id || t.createdBy === state.me.id;
  const canDeleteTask = (t) => isAdmin() || t.createdBy === state.me.id;

  function initials(name) {
    const parts = String(name || '?').trim().split(/\s+/);
    return ((parts[0] || '')[0] + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
  }
  function avatar(u, size = '') {
    if (!u) return `<span class="avatar none ${size}" title="Unassigned">?</span>`;
    return `<span class="avatar ${size}" style="--c:${esc(u.color)}" title="${esc(u.name)}">${esc(initials(u.name))}</span>`;
  }

  function pad(n) { return String(n).padStart(2, '0'); }
  function todayStr() {
    const d = new Date();
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }
  function parseDay(s) {
    if (!s) return null;
    const [y, m, d] = s.split('-').map(Number);
    return new Date(y, m - 1, d);
  }
  function daysUntil(s) {
    const d = parseDay(s);
    if (!d) return null;
    return Math.round((d - parseDay(todayStr())) / 864e5);
  }
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  function fmtDay(s, withYear = false) {
    const d = parseDay(s);
    if (!d) return '—';
    const y = withYear || d.getFullYear() !== new Date().getFullYear() ? `, ${d.getFullYear()}` : '';
    return `${MONTHS[d.getMonth()]} ${d.getDate()}${y}`;
  }
  function relTime(iso) {
    const diff = (Date.now() - new Date(iso).getTime()) / 1000;
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
  const statusBadge = (s) => `<span class="badge st-${s}"><span class="dot"></span>${esc(STATUS[s]?.label || s)}</span>`;
  const priorityBadge = (p) => `<span class="badge pr-${p}">${esc(PRIORITY[p]?.label || p)}</span>`;
  const projectStatusBadge = (s) =>
    `<span class="badge" style="--c:${PROJECT_STATUS[s]?.color}"><span class="dot"></span>${esc(PROJECT_STATUS[s]?.label || s)}</span>`;
  function projectChip(p) {
    if (!p) return '<span class="chip-project muted">No project</span>';
    return `<span class="chip-project" style="--c:${esc(p.color)}"><i></i><span>${esc(p.name)}</span></span>`;
  }
  function pbar(pct, color = '', cls = '') {
    const c = color ? `style="--c:${color}"` : '';
    return `<div class="pbar ${cls}" ${c} role="progressbar" aria-valuenow="${pct}" aria-valuemin="0" aria-valuemax="100"><span style="width:${pct}%"></span></div>`;
  }
  const avg = (arr) => (arr.length ? Math.round(arr.reduce((a, b) => a + b, 0) / arr.length) : 0);

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
      completion: avg(mine.map((t) => t.progress)),
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
    return PRIORITY[b.priority].rank - PRIORITY[a.priority].rank;
  }

  /* =========================================================
   * Toasts, tooltip, modal
   * ======================================================= */
  function toast(msg, type = 'success') {
    const el = document.createElement('div');
    el.className = `toast ${type}`;
    el.textContent = msg;
    $('#toast-root').appendChild(el);
    setTimeout(() => el.remove(), type === 'error' ? 5000 : 2600);
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
    const first = modal.querySelector('input:not([type=hidden]):not([disabled]), textarea:not([disabled]), select:not([disabled])');
    if (first && !('ontouchstart' in window)) first.focus();
    return modal;
  }
  function closeModal() {
    if (modalCleanup) modalCleanup();
    modalCleanup = null;
    $('#modal-root').innerHTML = '';
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

  /* =========================================================
   * Router
   * ======================================================= */
  function parseRoute() {
    const hash = location.hash.replace(/^#\/?/, '') || 'dashboard';
    const [page, id] = hash.split('/');
    return { page, id };
  }
  const go = (h) => { location.hash = h; };

  /* =========================================================
   * Render root
   * ======================================================= */
  function render() {
    const app = $('#app');
    if (!state.me) {
      closeModal();
      app.innerHTML = loginView();
      bindLogin();
      return;
    }
    if (!state.ready) {
      app.innerHTML = '<div class="empty" style="padding-top:30vh">Loading…</div>';
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
      profile: [profileView, 'My Profile', 'Account & preferences'],
    };
    const [view, title, crumb] = views[page] || views.dashboard;
    const scrollY = window.scrollY;
    const samePage = app.dataset.page === location.hash;
    app.innerHTML = shellView(page, title, crumb, view(id));
    app.dataset.page = location.hash;
    if (samePage) window.scrollTo(0, scrollY);
    afterRender(page);
  }

  function shellView(page, title, crumb, content) {
    const me = state.me;
    const myOpen = state.tasks.filter((t) => t.assigneeId === me.id && isOpen(t)).length;
    const link = (key, label, ic, count) =>
      `<a href="#/${key}" class="${page === key ? 'active' : ''}">${icon(ic)}<span>${label}</span>${count ? `<span class="count">${count}</span>` : ''}</a>`;
    const dark = currentTheme() === 'dark';
    return `
    <div class="shell">
      <aside class="sidebar" aria-label="Main navigation">
        <div class="brand">
          <img src="/logo.svg" alt="">
          <div><div class="brand-name">Aurora</div><div class="brand-sub">Promotions</div></div>
        </div>
        <nav class="nav">
          <div class="nav-label">Overview</div>
          ${link('dashboard', 'Dashboard', 'dashboard')}
          ${link('my', 'My Tasks', 'my', myOpen)}
          <div class="nav-label">Work</div>
          ${link('board', 'Task Board', 'board')}
          ${link('tasks', 'All Tasks', 'list')}
          ${link('projects', 'Projects', 'folder')}
          ${link('team', 'Team', 'team')}
        </nav>
        <div class="sidebar-foot">
          <div class="me-chip">
            ${avatar(me)}
            <div class="who"><div><a href="#/profile" style="color:#fff">${esc(me.name)}</a></div><div class="role">${me.role === 'admin' ? 'Admin' : esc(me.title || 'Team member')}</div></div>
            <button class="icon-btn" data-action="theme" title="Switch to ${dark ? 'light' : 'dark'} mode" aria-label="Toggle theme">${icon(dark ? 'sun' : 'moon')}</button>
            <button class="icon-btn" data-action="logout" title="Sign out" aria-label="Sign out">${icon('logout')}</button>
          </div>
        </div>
      </aside>
      <main class="main">
        <header class="topbar">
          <button class="icon-btn menu-btn" data-action="menu" aria-label="Open menu">${icon('menu')}</button>
          <div><div class="crumb">${esc(crumb)}</div><h1>${esc(title)}</h1></div>
          <div class="spacer"></div>
          <label class="search">${icon('search')}<input id="global-search" type="search" placeholder="Search tasks…" aria-label="Search tasks" value="${page === 'tasks' ? esc(state.filters.tasks.q) : ''}"></label>
          <button class="btn aurora" data-action="new-task">${icon('plus')}<span class="topbar-new-label">New Task</span></button>
        </header>
        <div class="content">${content}</div>
      </main>
    </div>`;
  }

  /* =========================================================
   * Login
   * ======================================================= */
  function loginView() {
    return `
    <div class="login-page">
      <section class="login-art">
        <div class="brand" style="padding:0">
          <img src="/logo.svg" alt="" style="width:46px;height:46px">
          <div><div class="brand-name" style="font-size:18px">Aurora Promotions</div><div class="brand-sub">Team Tracker</div></div>
        </div>
        <div>
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
      <section class="login-form-wrap">
        <form class="login-form stack" id="login-form" novalidate>
          <div>
            <h2>Welcome back 👋</h2>
            <div class="muted">Sign in to your Aurora workspace</div>
          </div>
          <div class="field"><label for="l-email">Email</label><input class="input" id="l-email" name="email" type="email" autocomplete="username" required></div>
          <div class="field"><label for="l-pass">Password</label><input class="input" id="l-pass" name="password" type="password" autocomplete="current-password" required></div>
          <div class="error" id="login-error"></div>
          <button class="btn aurora" type="submit" style="height:44px">Sign in</button>
          <div class="muted small">Forgot your password? Ask your admin to reset it from the Team page.</div>
        </form>
      </section>
    </div>`;
  }
  function bindLogin() {
    const form = $('#login-form');
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const btn = form.querySelector('button[type=submit]');
      btn.disabled = true;
      $('#login-error').textContent = '';
      try {
        await api('POST', '/api/login', formData(form));
        await loadAll();
        if (!location.hash) location.hash = state.me.role === 'admin' ? '#/dashboard' : '#/my';
        render();
      } catch (err) {
        $('#login-error').textContent = err.message;
        btn.disabled = false;
      }
    });
  }

  /* =========================================================
   * Dashboard
   * ======================================================= */
  function greeting() {
    const h = new Date().getHours();
    return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
  }

  function dashboardView() {
    const me = state.me;
    const tasks = state.tasks;
    const open = tasks.filter(isOpen);
    const overdue = open.filter(isOverdue);
    const inProgress = tasks.filter((t) => t.status === 'in_progress');
    const blocked = tasks.filter((t) => t.status === 'blocked');
    const weekAgo = Date.now() - 7 * 864e5;
    const doneWeek = tasks.filter((t) => t.completedAt && new Date(t.completedAt).getTime() >= weekAgo);
    const activeProjects = state.projects.filter((p) => p.status === 'active');
    const teamAvg = avg(open.map((t) => t.progress));
    const mineOpen = open.filter((t) => t.assigneeId === me.id);
    const mineDueSoon = mineOpen.filter((t) => t.dueDate && daysUntil(t.dueDate) <= 2);
    const d = new Date();
    const dateLine = d.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });

    const kpi = (label, value, hint, color, cls = '', go_ = '') =>
      `<div class="card kpi ${go_ ? 'clickable' : ''}" ${go_ ? `data-go="${go_}"` : ''}>
        <div class="label"><i style="background:${color}"></i>${label}</div>
        <div class="value">${value}</div>
        <div class="hint ${cls}">${hint}</div>
      </div>`;

    return `
    <section class="hero">
      <div class="small" style="color:#bdb6ff">${esc(dateLine)}</div>
      <h2>${greeting()}, ${esc(me.name.split(' ')[0])} ✨</h2>
      <p>${mineOpen.length
        ? `You have <b>${mineOpen.length}</b> open task${mineOpen.length === 1 ? '' : 's'}${mineDueSoon.length ? `, <b>${mineDueSoon.length}</b> due within 2 days` : ''}.`
        : 'You have no open tasks right now.'}
        The team has <b>${open.length}</b> task${open.length === 1 ? '' : 's'} in flight across <b>${activeProjects.length}</b> active project${activeProjects.length === 1 ? '' : 's'}.</p>
      <div class="row wrap">
        <a class="btn aurora" href="#/my">${icon('my')} Update my tasks</a>
        <a class="btn" href="#/board">${icon('board')} Open task board</a>
      </div>
    </section>

    <div class="kpis">
      ${kpi('Active projects', activeProjects.length, `${state.projects.length} total`, 'var(--brand)', '', '#/projects')}
      ${kpi('Open tasks', open.length, `${tasks.length} total`, 'var(--st-todo)', '', '#/tasks')}
      ${kpi('In progress', inProgress.length, blocked.length ? `${blocked.length} blocked` : 'Nothing blocked', 'var(--st-progress)', blocked.length ? 'bad' : 'good', '#/board')}
      ${kpi('Overdue', overdue.length, overdue.length ? 'Needs attention' : 'All on schedule', 'var(--st-blocked)', overdue.length ? 'bad' : 'good')}
      ${kpi('Completed · 7 days', doneWeek.length, 'Tasks finished', 'var(--st-done)')}
      ${kpi('Avg. progress', `${teamAvg}%`, 'Across open tasks', 'var(--teal)')}
    </div>

    <div class="dash-grid">
      <section class="card span-7">
        <div class="card-head"><h3>Team progress</h3><span class="sub">Average progress on each member's open tasks</span><div class="spacer"></div><a class="small" href="#/team">View team →</a></div>
        <div class="card-body">${teamProgressList()}</div>
      </section>

      <section class="card span-5">
        <div class="card-head"><h3>Tasks by status</h3><span class="sub">${tasks.length} tasks</span></div>
        <div class="card-body">${statusBreakdown(tasks)}</div>
      </section>

      <section class="card span-7">
        <div class="card-head"><h3>Tasks completed</h3><span class="sub">Last 14 days</span></div>
        <div class="card-body">${completedChart(14)}</div>
      </section>

      <section class="card span-5">
        <div class="card-head"><h3>Deadlines</h3><span class="sub">Overdue & next 7 days</span></div>
        <div class="card-body">${deadlineList()}</div>
      </section>

      <section class="card span-7">
        <div class="card-head"><h3>Project progress</h3><div class="spacer"></div><a class="small" href="#/projects">All projects →</a></div>
        <div class="card-body">${projectProgressList()}</div>
      </section>

      <section class="card span-5">
        <div class="card-head"><h3>Recent activity</h3></div>
        <div class="card-body">${feedView(state.activity.slice(-12).reverse())}</div>
      </section>
    </div>`;
  }

  function teamProgressList() {
    const members = activeUsers();
    if (!members.length) return '<div class="empty">No team members yet.</div>';
    const rows = members
      .map((u) => ({ u, s: memberStats(u.id) }))
      .sort((a, b) => b.s.open.length - a.s.open.length || a.u.name.localeCompare(b.u.name));
    return `<div class="member-rows">${rows
      .map(({ u, s }) => `
        <div class="member-row" data-go="#/team/${u.id}" role="link" tabindex="0">
          <div class="who">${avatar(u)}<div style="min-width:0"><div class="n">${esc(u.name)}</div><div class="t">${esc(u.title || (u.role === 'admin' ? 'Admin' : 'Team member'))}</div></div></div>
          <div class="bars" data-tip="<b>${esc(u.name)}</b><br>${s.open.length} open task${s.open.length === 1 ? '' : 's'} · avg ${s.avgOpen}% complete">
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
      .map((c) => `<span style="flex:${c.n};background:${c.color}" data-tip="<b>${c.label}</b>: ${c.n} task${c.n === 1 ? '' : 's'} (${Math.round((c.n / total) * 100)}%)"></span>`)
      .join('');
    return `
      <div class="stackbar" role="img" aria-label="Tasks by status">${bar}</div>
      <div class="legend">${counts
        .map((c) => `<div class="legend-row" style="--c:${c.color}"><i></i><span>${c.label}</span><b>${c.n}</b><span class="pct">${Math.round((c.n / total) * 100)}%</span></div>`)
        .join('')}</div>`;
  }

  function completedChart(days) {
    const buckets = [];
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date();
      d.setHours(0, 0, 0, 0);
      d.setDate(d.getDate() - i);
      buckets.push({ d, key: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`, n: 0 });
    }
    const idx = Object.fromEntries(buckets.map((b, i) => [b.key, i]));
    state.tasks.forEach((t) => {
      if (!t.completedAt) return;
      const c = new Date(t.completedAt);
      const k = `${c.getFullYear()}-${pad(c.getMonth() + 1)}-${pad(c.getDate())}`;
      if (k in idx) buckets[idx[k]].n++;
    });
    const total = buckets.reduce((a, b) => a + b.n, 0);
    const max = Math.max(4, ...buckets.map((b) => b.n));
    const step = max <= 4 ? 1 : Math.ceil(max / 4);
    const top = step * Math.ceil(max / step);
    const W = 640, H = 250, L = 28, R = 8, T = 10, B = 26;
    const pw = W - L - R, ph = H - T - B;
    const bw = pw / days;
    let grid = '';
    for (let v = 0; v <= top; v += step) {
      const y = T + ph - (v / top) * ph;
      grid += `<line class="${v === 0 ? 'axis' : 'grid'}" x1="${L}" x2="${W - R}" y1="${y}" y2="${y}"/><text x="${L - 6}" y="${y + 4}" text-anchor="end">${v}</text>`;
    }
    const bars = buckets
      .map((b, i) => {
        const h = (b.n / top) * ph;
        const x = L + i * bw;
        const w = Math.max(4, Math.min(28, bw - 6));
        const bx = x + (bw - w) / 2;
        const y = T + ph - h;
        const label = i % 2 === (days - 1) % 2 ? `<text x="${x + bw / 2}" y="${H - 8}" text-anchor="middle">${b.d.getDate()} ${MONTHS[b.d.getMonth()]}</text>` : '';
        const r = Math.min(4, h / 2);
        const path = h > 0
          ? `<path class="bar" d="M${bx},${y + h} V${y + r} Q${bx},${y} ${bx + r},${y} H${bx + w - r} Q${bx + w},${y} ${bx + w},${y + r} V${y + h} Z"/>`
          : '';
        const tipText = `<b>${b.d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}</b><br>${b.n} task${b.n === 1 ? '' : 's'} completed`;
        return `<g data-tip="${esc(tipText)}"><rect class="hit" x="${x}" y="${T}" width="${bw}" height="${ph}"/>${path}</g>${label}`;
      })
      .join('');
    return `
      <div class="row between" style="margin-bottom:4px"><div><span style="font-size:24px;font-weight:700">${total}</span> <span class="muted">completed in ${days} days</span></div></div>
      <svg class="colchart" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="${total} tasks completed in the last ${days} days">${grid}${bars}</svg>`;
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
        const u = userById(t.assigneeId);
        return `<div class="list-item" data-task="${t.id}">
          <div class="date-box ${isOverdue(t) ? 'overdue' : ''}"><div class="m">${MONTHS[d.getMonth()]}</div><div class="d">${d.getDate()}</div></div>
          <div class="main-col"><div class="title">${esc(t.title)}</div><div class="row" style="gap:8px">${projectChip(projectById(t.projectId))}</div></div>
          <div class="row" style="gap:8px">${dueBadge(t)}${avatar(u, 'sm')}</div>
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
        return `<div class="list-item" data-go="#/projects/${p.id}">
          <div class="main-col">
            <div class="row between"><div class="title">${esc(p.name)}</div><span class="ptext">${s.progress}%</span></div>
            <div class="row" style="margin:5px 0 4px">${pbar(s.progress, p.color)}</div>
            <div class="row small muted" style="gap:12px">${esc(p.client || '')}${p.client ? ' ·' : ''} ${s.done}/${s.tasks.length} tasks done ${s.overdue ? `· <span style="color:var(--danger);font-weight:600">${s.overdue} overdue</span>` : ''} ${p.dueDate ? `· due ${fmtDay(p.dueDate)}` : ''}</div>
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
        const t = a.taskId ? taskById(a.taskId) : null;
        const taskLink = t ? ` on <a href="#" data-task="${t.id}">${esc(t.title)}</a>` : '';
        let body;
        if (a.type === 'comment') body = `<b>${esc(u?.name || 'Someone')}</b> posted an update${taskLink}<div class="quote">${esc(a.text)}</div>`;
        else if (a.type === 'task_created') body = `<b>${esc(u?.name || 'Someone')}</b> created${t ? ` <a href="#" data-task="${t.id}">${esc(t.title)}</a>` : ' a task'}`;
        else if (a.type === 'status') body = `<b>${esc(u?.name || 'Someone')}</b> moved${t ? ` <a href="#" data-task="${t.id}">${esc(t.title)}</a>` : ' a task'} to ${statusBadge(a.to)}`;
        else body = `<b>${esc(u?.name || 'Someone')}</b> ${esc(a.text)}${taskLink}`;
        return `<div class="feed-item">${avatar(u, 'sm')}<div class="body">${body}<div class="when">${relTime(a.createdAt)}</div></div></div>`;
      })
      .join('')}</div>`;
  }

  /* =========================================================
   * My Tasks
   * ======================================================= */
  function myTasksView() {
    const me = state.me;
    const mine = state.tasks.filter((t) => t.assigneeId === me.id);
    const s = memberStats(me.id);
    const twoWeeks = Date.now() - 14 * 864e5;
    const attention = mine.filter((t) => isOpen(t) && (isOverdue(t) || t.status === 'blocked'));
    const attnIds = new Set(attention.map((t) => t.id));
    const groups = [
      { title: '⚠️ Needs attention', items: attention },
      { title: 'In progress', items: mine.filter((t) => t.status === 'in_progress' && !attnIds.has(t.id)) },
      { title: 'To do', items: mine.filter((t) => t.status === 'todo' && !attnIds.has(t.id)) },
      { title: 'In review', items: mine.filter((t) => t.status === 'review' && !attnIds.has(t.id)) },
      { title: 'Completed recently', items: mine.filter((t) => t.status === 'done' && t.completedAt && new Date(t.completedAt).getTime() >= twoWeeks) },
    ];

    const head = `
      <div class="kpis four">
        <div class="card kpi"><div class="label"><i style="background:var(--st-todo)"></i>Open tasks</div><div class="value">${s.open.length}</div><div class="hint">${s.doneWeek.length} finished this week</div></div>
        <div class="card kpi"><div class="label"><i style="background:var(--brand)"></i>My avg. progress</div><div class="value">${s.avgOpen}%</div>${pbar(s.avgOpen, '', 'aurora')}</div>
        <div class="card kpi"><div class="label"><i style="background:var(--st-blocked)"></i>Overdue</div><div class="value">${s.overdue.length}</div><div class="hint ${s.overdue.length ? 'bad' : 'good'}">${s.overdue.length ? 'Please update these' : 'You are on track'}</div></div>
        <div class="card kpi"><div class="label"><i style="background:var(--st-done)"></i>Completed</div><div class="value">${s.done.length}</div><div class="hint">All time</div></div>
      </div>
      <div class="row between" style="margin-bottom:14px">
        <div class="muted">Drag the slider to update progress. Changes save automatically.</div>
        <button class="btn primary" data-action="new-task">${icon('plus')} Add task</button>
      </div>`;

    if (!mine.length) {
      return head + `<div class="card"><div class="empty"><div class="big">🌤️</div><h4>No tasks assigned to you yet</h4>${isAdmin() ? 'Assign tasks from the board or create one here.' : 'Your manager will assign tasks here, or you can add one yourself.'}</div></div>`;
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
    return `
      <div class="card mytask" style="--pc:${esc(p?.color || 'var(--border)')}" data-row="${t.id}">
        <div style="min-width:0">
          <div class="t-title" data-task="${t.id}">${esc(t.title)}</div>
          <div class="t-meta">${projectChip(p)} ${priorityBadge(t.priority)} ${dueBadge(t)}</div>
        </div>
        <div class="prog">
          <input type="range" class="progress-range" min="0" max="100" step="5" value="${t.progress}" style="--val:${t.progress}%" data-progress="${t.id}" aria-label="Progress for ${esc(t.title)}">
          <span class="ptext" data-ptext="${t.id}">${t.progress}%</span>
        </div>
        <div class="actions">
          <select class="input" data-status="${t.id}" aria-label="Status">${STATUSES.map((s) => `<option value="${s.key}" ${s.key === t.status ? 'selected' : ''}>${s.label}</option>`).join('')}</select>
          <button class="btn sm" data-task="${t.id}">Update</button>
        </div>
      </div>`;
  }

  /* =========================================================
   * Board (Kanban)
   * ======================================================= */
  function filterSelects(f, scope, { status = false } = {}) {
    return `
      <select class="input" data-filter="${scope}.project" aria-label="Filter by project">
        <option value="">All projects</option>
        ${state.projects.map((p) => `<option value="${p.id}" ${f.project === p.id ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}
      </select>
      <select class="input" data-filter="${scope}.assignee" aria-label="Filter by team member">
        <option value="">Everyone</option>
        <option value="me" ${f.assignee === 'me' ? 'selected' : ''}>Only me</option>
        <option value="none" ${f.assignee === 'none' ? 'selected' : ''}>Unassigned</option>
        ${activeUsers().map((u) => `<option value="${u.id}" ${f.assignee === u.id ? 'selected' : ''}>${esc(u.name)}</option>`).join('')}
      </select>
      ${status ? `<select class="input" data-filter="${scope}.status" aria-label="Filter by status">
        <option value="open" ${f.status === 'open' ? 'selected' : ''}>Open tasks</option>
        <option value="" ${f.status === '' ? 'selected' : ''}>All statuses</option>
        <option value="overdue" ${f.status === 'overdue' ? 'selected' : ''}>Overdue</option>
        ${STATUSES.map((s) => `<option value="${s.key}" ${f.status === s.key ? 'selected' : ''}>${s.label}</option>`).join('')}
      </select>` : ''}
      <select class="input" data-filter="${scope}.priority" aria-label="Filter by priority">
        <option value="">Any priority</option>
        ${PRIORITIES.map((p) => `<option value="${p.key}" ${f.priority === p.key ? 'selected' : ''}>${p.label}</option>`).join('')}
      </select>`;
  }

  function applyFilters(tasks, f) {
    return tasks.filter((t) => {
      if (f.project && t.projectId !== f.project) return false;
      if (f.assignee === 'me' && t.assigneeId !== state.me.id) return false;
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
        <span class="muted small hide-sm">Showing ${tasks.length} task${tasks.length === 1 ? '' : 's'} · completed tasks older than 30 days are hidden</span>
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
              ${items.map(boardCard).join('') || '<div class="muted small" style="text-align:center;padding:18px 0">Drop tasks here</div>'}
            </div>
          </section>`;
        }).join('')}
      </div>`;
  }

  function boardCard(t) {
    const p = projectById(t.projectId);
    const u = userById(t.assigneeId);
    const draggable = canEditTask(t);
    return `
      <article class="task-card" style="--pc:${esc(p?.color || 'var(--border)')}" data-task="${t.id}" ${draggable ? 'draggable="true"' : ''} data-drag="${t.id}">
        <div class="t-meta">${projectChip(p)}</div>
        <div class="t-title">${esc(t.title)}</div>
        <div class="t-meta">${priorityBadge(t.priority)} ${dueBadge(t)}</div>
        <div class="t-foot">${pbar(t.progress, p?.color)}<span class="ptext">${t.progress}%</span>${avatar(u, 'sm')}</div>
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
        <button class="btn primary" data-action="new-task">${icon('plus')} New task</button>
      </div>
      <div class="card"><div class="table-wrap" id="tasks-table">${tasksTable()}</div></div>`;
  }

  function tasksTable() {
    const f = state.filters.tasks;
    const rows = applyFilters(state.tasks, f);
    const key = f.sort;
    const val = (t) => {
      switch (key) {
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
          return `<tr data-task="${t.id}">
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
      <div class="muted small" style="padding:10px 14px">${rows.length} task${rows.length === 1 ? '' : 's'}</div>`;
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
    return `
      <div class="toolbar">
        <div class="seg">${seg}</div>
        <div class="spacer"></div>
        ${isAdmin() ? `<button class="btn primary" data-action="new-project">${icon('plus')} New project</button>` : ''}
      </div>
      ${list.length ? `<div class="cards-grid">${list.map(projectCard).join('')}</div>`
        : `<div class="card"><div class="empty"><div class="big">📁</div><h4>No projects here</h4>${isAdmin() ? 'Create a project to start organising tasks.' : 'Your admin hasn\'t created any projects in this category yet.'}</div></div>`}`;
  }

  function projectCard(p) {
    const s = projectStats(p.id);
    const lead = userById(p.leadId);
    return `
      <article class="card project-card" style="--pc:${esc(p.color)}" data-go="#/projects/${p.id}">
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
    if (!p) return `<div class="card"><div class="empty"><h4>Project not found</h4><a href="#/projects">Back to projects</a></div></div>`;
    const s = projectStats(p.id);
    const lead = userById(p.leadId);
    const contrib = s.members.map((u) => {
      const ts = s.tasks.filter((t) => t.assigneeId === u.id);
      return { u, n: ts.length, done: ts.filter((t) => !isOpen(t)).length, prog: avg(ts.map((t) => t.progress)) };
    });
    const sorted = [...s.tasks].sort((a, b) => (isOpen(a) === isOpen(b) ? sortTasksForWork(a, b) : isOpen(a) ? -1 : 1));
    return `
      <a href="#/projects" class="btn ghost sm" style="margin-bottom:12px">${icon('back')} All projects</a>
      <section class="card" style="overflow:hidden;margin-bottom:18px">
        <div style="height:6px;background:${esc(p.color)}"></div>
        <div class="profile-head">
          <div style="min-width:0;flex:1">
            <div class="row wrap">${projectStatusBadge(p.status)}<span class="muted small">${esc(p.client || '')}</span></div>
            <h2 style="margin-top:6px">${esc(p.name)}</h2>
            <div class="muted small" style="margin-top:4px">${p.startDate ? fmtDay(p.startDate, true) : '—'} → ${p.dueDate ? fmtDay(p.dueDate, true) : '—'}${lead ? ` · Lead: <b style="color:var(--text)">${esc(lead.name)}</b>` : ''}</div>
            ${p.description ? `<p style="color:var(--text-2);margin:10px 0 0;white-space:pre-wrap">${esc(p.description)}</p>` : ''}
          </div>
          <div class="row wrap">
            <button class="btn primary" data-action="new-task" data-project="${p.id}">${icon('plus')} Add task</button>
            ${isAdmin() ? `<button class="btn" data-action="edit-project" data-id="${p.id}">${icon('edit')} Edit</button>` : ''}
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
            <div class="list-item" data-go="#/team/${u.id}">${avatar(u)}<div class="main-col"><div class="title">${esc(u.name)}</div>
            <div class="row" style="margin-top:4px">${pbar(prog, u.color)}<span class="ptext">${prog}%</span></div>
            <div class="muted small">${done}/${n} tasks done</div></div></div>`).join('')}</div>` : '<div class="empty">No one assigned yet.</div>'}</div>
        </section>
      </div>`;
  }

  function taskListItem(t) {
    const u = userById(t.assigneeId);
    return `<div class="list-item" data-task="${t.id}">
      ${avatar(u, 'sm')}
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
        <div class="muted">${members.length} team member${members.length === 1 ? '' : 's'}</div>
        <div class="spacer"></div>
        ${isAdmin() ? `<button class="btn primary" data-action="new-member">${icon('plus')} Add team member</button>` : ''}
      </div>
      <div class="cards-grid">${members.map((u) => {
        const s = memberStats(u.id);
        const w = workload(s.open.length);
        return `
          <article class="card member-card" data-go="#/team/${u.id}">
            ${avatar(u, 'lg')}
            <h3>${esc(u.name)}</h3>
            <div class="title">${esc(u.title || 'Team member')} ${u.role === 'admin' ? '<span class="badge role-admin">Admin</span>' : ''}</div>
            <div class="row" data-tip="Average progress on open tasks">${pbar(s.avgOpen, u.color)}<span class="ptext">${s.avgOpen}%</span></div>
            <div class="counts"><div><b>${s.open.length}</b>open</div><div><b>${s.doneWeek.length}</b>done this week</div><div><b ${s.overdue.length ? 'style="color:var(--danger)"' : ''}>${s.overdue.length}</b>overdue</div></div>
            <div class="workload" style="--c:${w.c}"><i></i>${w.label}</div>
          </article>`;
      }).join('')}</div>`;
  }

  function memberDetailView(id) {
    const u = userById(id);
    if (!u) return `<div class="card"><div class="empty"><h4>Team member not found</h4><a href="#/team">Back to team</a></div></div>`;
    const s = memberStats(u.id);
    const w = workload(s.open.length);
    const acts = state.activity.filter((a) => a.userId === u.id).slice(-15).reverse();
    const open = [...s.open].sort(sortTasksForWork);
    const done = [...s.done].sort((a, b) => (b.completedAt || '').localeCompare(a.completedAt || '')).slice(0, 10);
    return `
      <a href="#/team" class="btn ghost sm" style="margin-bottom:12px">${icon('back')} Team</a>
      <section class="card" style="margin-bottom:18px">
        <div class="profile-head">
          ${avatar(u, 'xl')}
          <div style="min-width:0">
            <h2>${esc(u.name)} ${!u.active ? '<span class="badge">Removed</span>' : ''}</h2>
            <div class="muted">${esc(u.title || 'Team member')} · ${esc(u.email)} ${u.role === 'admin' ? '<span class="badge role-admin">Admin</span>' : ''}</div>
            <div class="workload" style="--c:${w.c}"><i></i>${w.label} · ${s.open.length} open task${s.open.length === 1 ? '' : 's'}</div>
          </div>
          <div class="spacer"></div>
          <div class="row wrap">
            ${isAdmin() && u.active ? `<button class="btn primary" data-action="new-task" data-assignee="${u.id}">${icon('plus')} Assign task</button>
            <button class="btn" data-action="edit-member" data-id="${u.id}">${icon('edit')} Edit</button>` : ''}
          </div>
        </div>
      </section>
      <div class="kpis four">
        <div class="card kpi"><div class="label"><i style="background:${esc(u.color)}"></i>Avg. progress (open)</div><div class="value">${s.avgOpen}%</div>${pbar(s.avgOpen, u.color)}</div>
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
    const me = state.me;
    const theme = localTheme();
    return `
      <div class="dash-grid">
        <section class="card span-6">
          <div class="card-head"><h3>Profile</h3></div>
          <form class="card-body stack" id="profile-form">
            <div class="row">${avatar(me, 'lg')}<div><b>${esc(me.email)}</b><div class="muted small">${me.role === 'admin' ? 'Admin' : 'Team member'}</div></div></div>
            <div class="grid-2">
              <div class="field"><label>Full name</label><input class="input" name="name" value="${esc(me.name)}" required maxlength="80"></div>
              <div class="field"><label>Job title</label><input class="input" name="title" value="${esc(me.title || '')}" maxlength="80"></div>
            </div>
            <div class="field"><label>Avatar colour</label>${swatchPicker('color', me.color)}</div>
            <div><button class="btn primary" type="submit">Save profile</button></div>
          </form>
        </section>
        <section class="card span-6">
          <div class="card-head"><h3>Change password</h3></div>
          <form class="card-body stack" id="password-form">
            <div class="field"><label>Current password</label><input class="input" type="password" name="currentPassword" autocomplete="current-password" required></div>
            <div class="grid-2">
              <div class="field"><label>New password</label><input class="input" type="password" name="password" autocomplete="new-password" minlength="6" required></div>
              <div class="field"><label>Confirm new password</label><input class="input" type="password" name="confirm" autocomplete="new-password" minlength="6" required></div>
            </div>
            <div><button class="btn primary" type="submit">Update password</button></div>
          </form>
        </section>
        <section class="card span-6">
          <div class="card-head"><h3>Appearance</h3></div>
          <div class="card-body">
            <div class="seg">
              <button class="${theme === 'system' ? 'on' : ''}" data-theme-set="system">System</button>
              <button class="${theme === 'light' ? 'on' : ''}" data-theme-set="light">Light</button>
              <button class="${theme === 'dark' ? 'on' : ''}" data-theme-set="dark">Dark</button>
            </div>
          </div>
        </section>
      </div>`;
  }

  function swatchPicker(name, value) {
    return `<div class="row wrap" role="radiogroup">${SWATCHES.map((c) => `
      <label style="cursor:pointer" title="${c}">
        <input type="radio" name="${name}" value="${c}" ${c.toLowerCase() === String(value).toLowerCase() ? 'checked' : ''} class="sr-only">
        <span class="swatch" style="display:inline-block;width:28px;height:28px;border-radius:50%;background:${c};box-shadow:0 0 0 2px var(--surface), 0 0 0 ${c.toLowerCase() === String(value).toLowerCase() ? '4px var(--text)' : '0 transparent'}"></span>
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
   * Theme
   * ======================================================= */
  function localTheme() {
    try { return localStorage.getItem('ap-theme') || 'system'; } catch (_) { return 'system'; }
  }
  function currentTheme() {
    const t = document.documentElement.dataset.theme;
    if (t) return t;
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  function setTheme(t) {
    try {
      if (t === 'system') localStorage.removeItem('ap-theme');
      else localStorage.setItem('ap-theme', t);
    } catch (_) { /* ignore */ }
    if (t === 'system') delete document.documentElement.dataset.theme;
    else document.documentElement.dataset.theme = t;
    render();
  }

  /* =========================================================
   * Task modal
   * ======================================================= */
  function openTaskModal(taskId, defaults = {}) {
    const existing = taskId ? taskById(taskId) : null;
    if (taskId && !existing) return toast('That task no longer exists.', 'error');
    if (!state.projects.length) {
      return toast(isAdmin() ? 'Create a project first, then add tasks to it.' : 'No projects yet. Ask an admin to create one.', 'error');
    }
    const t = existing || {
      title: '', description: '', status: 'todo', priority: 'medium', progress: 0,
      projectId: defaults.projectId || state.filters.board.project || state.projects.find((p) => p.status === 'active')?.id || state.projects[0].id,
      assigneeId: defaults.assigneeId || (isAdmin() ? '' : state.me.id),
      startDate: todayStr(), dueDate: '', estimateHours: '',
    };
    const editable = !existing || canEditTask(existing);
    const admin = isAdmin();
    const dis = editable ? '' : 'disabled';
    const creator = existing ? userById(existing.createdBy) : null;

    const html = `
      <div class="modal-head">
        <h2>${existing ? 'Task details' : 'New task'}</h2>
        ${existing ? statusBadge(existing.status) : ''}
        <button class="icon-btn" data-x="close" aria-label="Close">${icon('x')}</button>
      </div>
      <form id="task-form" novalidate>
        <div class="${existing ? 'task-layout' : ''}">
          <div class="stack" ${existing ? '' : 'style="padding:20px 22px"'}>
            ${!editable ? '<div class="badge" style="align-self:flex-start">View only: you can add comments, but only the assignee or an admin can edit.</div>' : ''}
            <div class="field"><label for="t-title">Title</label><input class="input" id="t-title" name="title" value="${esc(t.title)}" placeholder="e.g. Design Instagram story set" required maxlength="200" ${dis}></div>
            <div class="field"><label for="t-desc">Description</label><textarea class="input" id="t-desc" name="description" placeholder="Details, links, requirements…" maxlength="8000" ${dis}>${esc(t.description)}</textarea></div>
            <div class="grid-2">
              <div class="field"><label>Project</label><select class="input" name="projectId" ${dis}>
                ${state.projects.map((p) => `<option value="${p.id}" ${p.id === t.projectId ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}
              </select></div>
              <div class="field"><label>Assignee</label><select class="input" name="assigneeId" ${editable && admin ? '' : 'disabled'}>
                <option value="">Unassigned</option>
                ${activeUsers().map((u) => `<option value="${u.id}" ${u.id === t.assigneeId ? 'selected' : ''}>${esc(u.name)}</option>`).join('')}
              </select></div>
              <div class="field"><label>Priority</label><select class="input" name="priority" ${dis}>
                ${PRIORITIES.map((p) => `<option value="${p.key}" ${p.key === t.priority ? 'selected' : ''}>${p.label}</option>`).join('')}
              </select></div>
              <div class="field"><label>Estimate (hours)</label><input class="input" type="number" min="0" max="1000" step="0.5" name="estimateHours" value="${t.estimateHours ?? ''}" ${dis}></div>
              <div class="field"><label>Start date</label><input class="input" type="date" name="startDate" value="${t.startDate || ''}" ${dis}></div>
              <div class="field"><label>Due date</label><input class="input" type="date" name="dueDate" value="${t.dueDate || ''}" ${dis}></div>
            </div>
            <div class="field"><label>Status</label>
              <div class="status-pills" id="status-pills">${STATUSES.map((s) => `<button type="button" class="${s.key === t.status ? 'on' : ''}" style="--c:${s.color}" data-st="${s.key}" ${dis}><i></i>${s.label}</button>`).join('')}</div>
              <input type="hidden" name="status" value="${t.status}">
            </div>
            <div class="progress-box">
              <div class="row between"><label style="font-weight:600;font-size:12px;color:var(--text-2)">Progress</label><span class="big num" id="prog-val">${t.progress}%</span></div>
              <input type="range" class="progress-range" name="progress" min="0" max="100" step="5" value="${t.progress}" style="--val:${t.progress}%" ${dis} aria-label="Progress">
              <div class="quick-pcts">${[0, 25, 50, 75, 100].map((n) => `<button type="button" data-pct="${n}" ${dis}>${n}%</button>`).join('')}</div>
            </div>
            ${existing && editable ? `<div class="field"><label for="t-note">Add a progress note (optional)</label><textarea class="input" id="t-note" name="note" style="min-height:64px" placeholder="What did you get done? Anything blocking you?" maxlength="4000"></textarea></div>` : ''}
            ${existing ? `<div class="muted small">Created ${relTime(existing.createdAt)}${creator ? ` by ${esc(creator.name)}` : ''} · updated ${relTime(existing.updatedAt)}</div>` : ''}
          </div>
          ${existing ? `
          <div class="stack">
            <h3 style="font-size:15px">Updates & comments</h3>
            <div id="task-activity"><div class="muted small">Loading…</div></div>
            <div class="field">
              <textarea class="input" id="comment-text" placeholder="Write a comment or update…" style="min-height:70px" maxlength="4000"></textarea>
              <div><button type="button" class="btn sm" id="comment-send">Post comment</button></div>
            </div>
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
          $$('#status-pills button', modal).forEach((b) => b.classList.toggle('on', b.dataset.st === s));
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
            if (!ok) return;
            try {
              await api('DELETE', `/api/tasks/${existing.id}`);
              await refresh();
              toast('Task deleted');
            } catch (err) { toast(err.message, 'error'); }
          }
        });
        form.addEventListener('submit', async (e) => {
          e.preventDefault();
          if (!editable) return;
          const d = formData(form);
          if (!d.title) { toast('Please add a title.', 'error'); form.elements.title.focus(); return; }
          const body = {
            title: d.title, description: d.description, projectId: d.projectId, priority: d.priority,
            startDate: d.startDate || null, dueDate: d.dueDate || null, estimateHours: d.estimateHours,
            status: d.status, progress: Number(d.progress),
          };
          if (admin) body.assigneeId = d.assigneeId || null;
          if (d.note) body.note = d.note;
          const btn = form.querySelector('button[type=submit]');
          btn.disabled = true;
          try {
            if (existing) await api('PUT', `/api/tasks/${existing.id}`, body);
            else await api('POST', '/api/tasks', body);
            closeModal();
            await refresh();
            toast(existing ? 'Task updated' : 'Task created');
          } catch (err) {
            toast(err.message, 'error');
            btn.disabled = false;
          }
        });
        if (existing) {
          loadTaskActivity(existing.id);
          $('#comment-send', modal).addEventListener('click', async () => {
            const ta = $('#comment-text', modal);
            const text = ta.value.trim();
            if (!text) return ta.focus();
            try {
              await api('POST', `/api/tasks/${existing.id}/comments`, { text });
              ta.value = '';
              loadTaskActivity(existing.id);
              refresh({ keepModal: true });
            } catch (err) { toast(err.message, 'error'); }
          });
        }
      },
    });
  }

  async function loadTaskActivity(taskId) {
    try {
      const { activity } = await api('GET', `/api/tasks/${taskId}/activity`);
      const el = $('#task-activity');
      if (el) el.innerHTML = feedView(activity.slice().reverse());
    } catch (err) {
      const el = $('#task-activity');
      if (el) el.innerHTML = `<div class="muted small">${esc(err.message)}</div>`;
    }
  }

  /* =========================================================
   * Project modal
   * ======================================================= */
  function openProjectModal(projectId) {
    const existing = projectId ? projectById(projectId) : null;
    const p = existing || { name: '', client: '', description: '', color: SWATCHES[state.projects.length % SWATCHES.length], status: 'active', startDate: todayStr(), dueDate: '', leadId: '' };
    openModal(`
      <div class="modal-head"><h2>${existing ? 'Edit project' : 'New project'}</h2><button class="icon-btn" data-x="close" aria-label="Close">${icon('x')}</button></div>
      <form id="project-form" novalidate>
        <div class="modal-body stack">
          <div class="field"><label>Project name</label><input class="input" name="name" value="${esc(p.name)}" placeholder="e.g. Winter Campaign 2026" required maxlength="120"></div>
          <div class="grid-2">
            <div class="field"><label>Client</label><input class="input" name="client" value="${esc(p.client)}" placeholder="Client or brand name" maxlength="120"></div>
            <div class="field"><label>Project lead</label><select class="input" name="leadId"><option value="">—</option>${activeUsers().map((u) => `<option value="${u.id}" ${u.id === p.leadId ? 'selected' : ''}>${esc(u.name)}</option>`).join('')}</select></div>
            <div class="field"><label>Status</label><select class="input" name="status">${PROJECT_STATUSES.map((s) => `<option value="${s.key}" ${s.key === p.status ? 'selected' : ''}>${s.label}</option>`).join('')}</select></div>
            <div></div>
            <div class="field"><label>Start date</label><input class="input" type="date" name="startDate" value="${p.startDate || ''}"></div>
            <div class="field"><label>Due date</label><input class="input" type="date" name="dueDate" value="${p.dueDate || ''}"></div>
          </div>
          <div class="field"><label>Description</label><textarea class="input" name="description" maxlength="4000" placeholder="Goals, deliverables, notes…">${esc(p.description)}</textarea></div>
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
            const ok = await confirmDialog('Delete project?', `“${existing.name}” and its ${n} task${n === 1 ? '' : 's'} will be permanently deleted.`);
            if (!ok) return;
            try {
              await api('DELETE', `/api/projects/${existing.id}`);
              go('#/projects');
              await refresh();
              toast('Project deleted');
            } catch (err) { toast(err.message, 'error'); }
          }
        });
        form.addEventListener('submit', async (e) => {
          e.preventDefault();
          const d = formData(form);
          if (!d.name) return toast('Please add a project name.', 'error');
          d.leadId = d.leadId || null;
          try {
            const res = existing ? await api('PUT', `/api/projects/${existing.id}`, d) : await api('POST', '/api/projects', d);
            closeModal();
            if (!existing) go(`#/projects/${res.project.id}`);
            await refresh();
            toast(existing ? 'Project updated' : 'Project created');
          } catch (err) { toast(err.message, 'error'); }
        });
      },
    });
  }

  /* =========================================================
   * Member modal (admin)
   * ======================================================= */
  function openMemberModal(userId) {
    const existing = userId ? userById(userId) : null;
    const u = existing || { name: '', email: '', title: '', role: 'member' };
    const isSelf = existing && existing.id === state.me.id;
    openModal(`
      <div class="modal-head"><h2>${existing ? 'Edit team member' : 'Add team member'}</h2><button class="icon-btn" data-x="close" aria-label="Close">${icon('x')}</button></div>
      <form id="member-form" novalidate>
        <div class="modal-body stack">
          <div class="grid-2">
            <div class="field"><label>Full name</label><input class="input" name="name" value="${esc(u.name)}" required maxlength="80"></div>
            <div class="field"><label>Job title</label><input class="input" name="title" value="${esc(u.title)}" placeholder="e.g. Graphic Designer" maxlength="80"></div>
            <div class="field"><label>Email (used to sign in)</label><input class="input" type="email" name="email" value="${esc(u.email)}" required maxlength="120"></div>
            <div class="field"><label>Role</label><select class="input" name="role">
              <option value="member" ${u.role === 'member' ? 'selected' : ''}>Team member: updates own tasks</option>
              <option value="admin" ${u.role === 'admin' ? 'selected' : ''}>Admin: manages everything</option>
            </select></div>
          </div>
          <div class="field"><label>${existing ? 'Reset password (leave blank to keep current)' : 'Temporary password'}</label>
            <input class="input" type="text" name="password" minlength="6" autocomplete="new-password" placeholder="At least 6 characters" ${existing ? '' : 'required'}>
          </div>
          ${!existing ? '<div class="muted small">Share the email and temporary password with your team member. They can change the password from their Profile page.</div>' : ''}
        </div>
        <div class="modal-foot">
          ${existing && !isSelf ? `<button type="button" class="btn danger" data-x="delete">${icon('trash')} Remove</button>` : ''}
          <div class="spacer"></div>
          <button type="button" class="btn" data-x="close">Cancel</button>
          <button type="submit" class="btn primary">${existing ? 'Save changes' : 'Add member'}</button>
        </div>
      </form>`, {
      onMount(modal) {
        const form = $('#member-form', modal);
        modal.addEventListener('click', async (e) => {
          const x = e.target.closest('[data-x]');
          if (!x) return;
          if (x.dataset.x === 'close') closeModal();
          if (x.dataset.x === 'delete') {
            const ok = await confirmDialog('Remove team member?', `${existing.name} will no longer be able to sign in. Their open tasks become unassigned; their history is kept.`, 'Remove');
            if (!ok) return;
            try {
              await api('DELETE', `/api/users/${existing.id}`);
              go('#/team');
              await refresh();
              toast('Team member removed');
            } catch (err) { toast(err.message, 'error'); }
          }
        });
        form.addEventListener('submit', async (e) => {
          e.preventDefault();
          const d = formData(form);
          if (!d.password) delete d.password;
          try {
            if (existing) await api('PUT', `/api/users/${existing.id}`, d);
            else await api('POST', '/api/users', d);
            closeModal();
            await refresh();
            toast(existing ? 'Team member updated' : `${d.name} added to the team`);
          } catch (err) { toast(err.message, 'error'); }
        });
      },
    });
  }

  /* =========================================================
   * Data refresh
   * ======================================================= */
  async function refresh({ keepModal = false } = {}) {
    try {
      await loadAll();
    } catch (err) {
      if (state.me) toast(err.message, 'error');
      return;
    }
    if (keepModal && modalOpen()) {
      // re-render underneath without disturbing the open modal
      const m = $('#modal-root').innerHTML;
      render();
      if (!$('#modal-root').innerHTML) $('#modal-root').innerHTML = m;
      return;
    }
    render();
  }

  // Quietly pick up teammates' updates.
  setInterval(() => {
    if (!state.me || document.hidden || modalOpen()) return;
    const a = document.activeElement;
    if (a && ['INPUT', 'TEXTAREA', 'SELECT'].includes(a.tagName)) return;
    refresh();
  }, 30000);

  /* =========================================================
   * Global events (delegated)
   * ======================================================= */
  function afterRender(page) {
    if (page === 'profile') {
      const pf = $('#profile-form');
      bindSwatches(pf);
      pf.addEventListener('submit', async (e) => {
        e.preventDefault();
        try {
          await api('PUT', `/api/users/${state.me.id}`, formData(pf));
          await refresh();
          toast('Profile saved');
        } catch (err) { toast(err.message, 'error'); }
      });
      const pw = $('#password-form');
      pw.addEventListener('submit', async (e) => {
        e.preventDefault();
        const d = formData(pw);
        if (d.password.length < 6) return toast('New password must be at least 6 characters.', 'error');
        if (d.password !== d.confirm) return toast('New passwords do not match.', 'error');
        try {
          await api('PUT', `/api/users/${state.me.id}`, { currentPassword: d.currentPassword, password: d.password });
          pw.reset();
          toast('Password updated');
        } catch (err) { toast(err.message, 'error'); }
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
      if (a === 'new-task') openTaskModal(null, { projectId: act.dataset.project, assigneeId: act.dataset.assignee });
      else if (a === 'new-project') openProjectModal();
      else if (a === 'edit-project') openProjectModal(act.dataset.id);
      else if (a === 'new-member') openMemberModal();
      else if (a === 'edit-member') openMemberModal(act.dataset.id);
      else if (a === 'theme') setTheme(currentTheme() === 'dark' ? 'light' : 'dark');
      else if (a === 'menu') $('.shell').classList.toggle('nav-open');
      else if (a === 'logout') {
        await api('POST', '/api/logout').catch(() => {});
        state.me = null;
        state.ready = false;
        location.hash = '';
        render();
      }
      return;
    }
    const themeSet = t.closest('[data-theme-set]');
    if (themeSet) return setTheme(themeSet.dataset.themeSet);

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
    if (g) { go(g.dataset.go); return; }

    const shell = $('.shell.nav-open');
    if (shell && !t.closest('.sidebar')) shell.classList.remove('nav-open');
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && e.target.matches('[data-go][tabindex]')) go(e.target.dataset.go);
    if (e.key === 'Enter' && e.target.id === 'global-search') {
      state.filters.tasks.q = e.target.value.trim();
      if (parseRoute().page === 'tasks') render();
      else go('#/tasks');
    }
    if (e.key === 'n' && !modalOpen() && state.me && !['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName) && !e.metaKey && !e.ctrlKey) {
      e.preventDefault();
      openTaskModal(null);
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
      const id = t.dataset.progress;
      try {
        await api('PUT', `/api/tasks/${id}`, { progress: Number(t.value) });
        await refresh();
        toast(`Progress saved: ${t.value}%`);
      } catch (err) { toast(err.message, 'error'); }
      return;
    }
    if (t.dataset.status) {
      try {
        await api('PUT', `/api/tasks/${t.dataset.status}`, { status: t.value });
        await refresh();
        toast(`Moved to ${STATUS[t.value].label}`);
      } catch (err) { toast(err.message, 'error'); }
    }
  });

  document.addEventListener('input', (e) => {
    const t = e.target;
    if (t.dataset.progress) {
      t.style.setProperty('--val', `${t.value}%`);
      const lbl = $(`[data-ptext="${t.dataset.progress}"]`);
      if (lbl) lbl.textContent = `${t.value}%`;
    }
  });

  function bindBoardDnD() {
    let dragId = null;
    $$('[data-drag][draggable="true"]').forEach((card) => {
      card.addEventListener('dragstart', (e) => {
        dragId = card.dataset.drag;
        card.classList.add('dragging');
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', dragId);
      });
      card.addEventListener('dragend', () => card.classList.remove('dragging'));
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
        const task = taskById(id);
        const status = col.dataset.drop;
        if (!task || task.status === status) return;
        try {
          await api('PUT', `/api/tasks/${id}`, { status });
          await refresh();
          toast(`Moved to ${STATUS[status].label}`);
        } catch (err) { toast(err.message, 'error'); }
      });
    });
  }

  window.addEventListener('hashchange', () => {
    const shell = $('.shell');
    if (shell) shell.classList.remove('nav-open');
    closeModal();
    render();
    window.scrollTo(0, 0);
  });

  /* =========================================================
   * Boot
   * ======================================================= */
  (async function boot() {
    try {
      await loadAll();
    } catch (_) {
      state.me = null;
    }
    render();
  })();
})();
