'use strict';
/*
 * Aurora Promotions — Project & Team Progress Tracker
 * Zero-dependency Node.js server: REST API + static front-end + JSON file storage.
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = Number(process.env.PORT) || 3000;
const HOST = process.env.HOST || '0.0.0.0';
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');
const PUBLIC_DIR = path.join(__dirname, 'public');
const SESSION_DAYS = 14;
const MAX_BODY = 1024 * 1024;

const STATUSES = ['todo', 'in_progress', 'review', 'blocked', 'done'];
const PRIORITIES = ['low', 'medium', 'high', 'urgent'];
const PROJECT_STATUSES = ['planning', 'active', 'on_hold', 'completed'];
const ROLES = ['admin', 'member'];
const USER_COLORS = ['#6d4aff', '#0ea5a4', '#e0569b', '#f08c2e', '#2f7de1', '#16a34a', '#9b5de5', '#d9480f'];

/* ---------------- storage ---------------- */

let db;

function emptyDb() {
  return { users: [], projects: [], tasks: [], activity: [], sessions: {} };
}

function loadDb() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (fs.existsSync(DB_FILE)) {
    db = Object.assign(emptyDb(), JSON.parse(fs.readFileSync(DB_FILE, 'utf8')));
  } else {
    db = emptyDb();
    const pw = process.env.ADMIN_PASSWORD || 'aurora123';
    const admin = makeUser({
      name: 'Aurora Admin',
      email: process.env.ADMIN_EMAIL || 'admin@aurorapromotions.com',
      title: 'Project Manager',
      role: 'admin',
      password: pw,
    });
    db.users.push(admin);
    saveDb();
    console.log('\n  First run: created admin account');
    console.log(`    email:    ${admin.email}`);
    console.log(`    password: ${pw}   (please change it in Profile)\n`);
  }
}

let saveTimer = null;
function saveDb() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(flushDb, 50);
}
function flushDb() {
  const tmp = DB_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(db, null, 2));
  fs.renameSync(tmp, DB_FILE);
}

/* ---------------- helpers ---------------- */

const id = () => crypto.randomBytes(8).toString('hex');
const now = () => new Date().toISOString();

function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  const hash = crypto.scryptSync(String(password), salt, 64).toString('hex');
  return { salt, hash };
}
function verifyPassword(password, user) {
  const { hash } = hashPassword(password, user.salt);
  return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(user.hash, 'hex'));
}

function makeUser({ name, email, title, role, password, color }) {
  const { salt, hash } = hashPassword(password);
  return {
    id: id(),
    name: String(name).trim(),
    email: String(email).trim().toLowerCase(),
    title: String(title || '').trim(),
    role: ROLES.includes(role) ? role : 'member',
    color: color || USER_COLORS[db.users.length % USER_COLORS.length],
    salt,
    hash,
    active: true,
    createdAt: now(),
  };
}

function publicUser(u) {
  const { salt, hash, ...rest } = u;
  return rest;
}

function logActivity(entry) {
  const a = { id: id(), createdAt: now(), ...entry };
  db.activity.push(a);
  if (db.activity.length > 5000) db.activity.splice(0, db.activity.length - 5000);
  return a;
}

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}
const bad = (msg) => new HttpError(400, msg);
const forbidden = (msg = 'You do not have permission to do that.') => new HttpError(403, msg);
const notFound = (what = 'Item') => new HttpError(404, `${what} not found.`);

function str(v, max = 500) {
  return v == null ? '' : String(v).trim().slice(0, max);
}
function dateOrNull(v) {
  if (!v) return null;
  const s = String(v).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s) || isNaN(Date.parse(s))) throw bad('Invalid date.');
  return s;
}
function clampProgress(v) {
  const n = Math.round(Number(v));
  if (!Number.isFinite(n)) throw bad('Progress must be a number.');
  return Math.max(0, Math.min(100, n));
}

/* ---------------- sessions ---------------- */

function parseCookies(req) {
  const out = {};
  (req.headers.cookie || '').split(';').forEach((p) => {
    const i = p.indexOf('=');
    if (i > 0) out[p.slice(0, i).trim()] = decodeURIComponent(p.slice(i + 1).trim());
  });
  return out;
}

function currentUser(req) {
  const token = parseCookies(req).ap_session;
  if (!token) return null;
  const s = db.sessions[token];
  if (!s || s.expires < Date.now()) return null;
  const u = db.users.find((x) => x.id === s.userId && x.active);
  return u || null;
}

function sessionCookie(token, maxAgeSec) {
  const secure = process.env.COOKIE_SECURE === '1' ? '; Secure' : '';
  return `ap_session=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${maxAgeSec}${secure}`;
}

function pruneSessions() {
  const t = Date.now();
  for (const [k, s] of Object.entries(db.sessions)) if (s.expires < t) delete db.sessions[k];
}

/* ---------------- request plumbing ---------------- */

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > MAX_BODY) {
        reject(new HttpError(413, 'Request too large.'));
        req.destroy();
      } else chunks.push(c);
    });
    req.on('end', () => {
      if (!chunks.length) return resolve({});
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
      } catch {
        reject(bad('Invalid JSON.'));
      }
    });
    req.on('error', reject);
  });
}

function send(res, status, data, headers = {}) {
  const body = JSON.stringify(data);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    ...headers,
  });
  res.end(body);
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
};

function serveStatic(req, res, pathname) {
  let rel = decodeURIComponent(pathname);
  if (rel === '/' || !path.extname(rel)) rel = '/index.html';
  const file = path.normalize(path.join(PUBLIC_DIR, rel));
  if (!file.startsWith(PUBLIC_DIR + path.sep)) {
    res.writeHead(403);
    return res.end();
  }
  fs.readFile(file, (err, buf) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      return res.end('Not found');
    }
    res.writeHead(200, {
      'Content-Type': MIME[path.extname(file)] || 'application/octet-stream',
      'Cache-Control': 'no-cache',
      'X-Content-Type-Options': 'nosniff',
    });
    res.end(buf);
  });
}

/* ---------------- routing ---------------- */

const routes = [];
function route(method, pattern, handler, opts = {}) {
  const keys = [];
  const re = new RegExp(
    '^' + pattern.replace(/:(\w+)/g, (_, k) => (keys.push(k), '([^/]+)')) + '$'
  );
  routes.push({ method, re, keys, handler, auth: opts.auth !== false, admin: !!opts.admin });
}

/* --- auth --- */

route('POST', '/api/login', async (req, res, { body }) => {
  const email = str(body.email).toLowerCase();
  const user = db.users.find((u) => u.email === email && u.active);
  if (!user || !verifyPassword(body.password || '', user)) {
    throw new HttpError(401, 'Incorrect email or password.');
  }
  pruneSessions();
  const token = crypto.randomBytes(32).toString('hex');
  db.sessions[token] = { userId: user.id, expires: Date.now() + SESSION_DAYS * 864e5 };
  saveDb();
  send(res, 200, { user: publicUser(user) }, { 'Set-Cookie': sessionCookie(token, SESSION_DAYS * 86400) });
}, { auth: false });

route('POST', '/api/logout', async (req, res) => {
  const token = parseCookies(req).ap_session;
  if (token) delete db.sessions[token];
  saveDb();
  send(res, 200, { ok: true }, { 'Set-Cookie': sessionCookie('', 0) });
}, { auth: false });

route('GET', '/api/me', async (req, res, { user }) => {
  send(res, 200, { user: publicUser(user) });
});

/* --- everything the UI needs in one call --- */

route('GET', '/api/bootstrap', async (req, res, { user }) => {
  send(res, 200, {
    me: publicUser(user),
    users: db.users.map(publicUser),
    projects: db.projects,
    tasks: db.tasks,
    activity: db.activity.slice(-400),
    serverTime: now(),
  });
});

/* --- users --- */

route('POST', '/api/users', async (req, res, { body, user }) => {
  const name = str(body.name, 80);
  const email = str(body.email, 120).toLowerCase();
  const password = String(body.password || '');
  if (!name) throw bad('Name is required.');
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw bad('A valid email is required.');
  if (password.length < 6) throw bad('Password must be at least 6 characters.');
  if (db.users.some((u) => u.email === email)) throw bad('A team member with that email already exists.');
  const u = makeUser({ name, email, title: str(body.title, 80), role: body.role, password });
  db.users.push(u);
  logActivity({ type: 'member_added', userId: user.id, targetUserId: u.id, text: `added ${u.name} to the team` });
  saveDb();
  send(res, 201, { user: publicUser(u) });
}, { admin: true });

route('PUT', '/api/users/:id', async (req, res, { body, user, params }) => {
  const u = db.users.find((x) => x.id === params.id);
  if (!u) throw notFound('Team member');
  const isSelf = u.id === user.id;
  const isAdmin = user.role === 'admin';
  if (!isSelf && !isAdmin) throw forbidden();

  if (body.name !== undefined) {
    const name = str(body.name, 80);
    if (!name) throw bad('Name is required.');
    u.name = name;
  }
  if (body.title !== undefined) u.title = str(body.title, 80);
  if (body.color !== undefined && /^#[0-9a-f]{6}$/i.test(body.color)) u.color = body.color;

  if (isAdmin) {
    if (body.email !== undefined) {
      const email = str(body.email, 120).toLowerCase();
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw bad('A valid email is required.');
      if (db.users.some((x) => x.email === email && x.id !== u.id)) throw bad('Email already in use.');
      u.email = email;
    }
    if (body.role !== undefined && ROLES.includes(body.role)) {
      if (u.role === 'admin' && body.role !== 'admin' && db.users.filter((x) => x.role === 'admin' && x.active).length <= 1) {
        throw bad('There must be at least one admin.');
      }
      u.role = body.role;
    }
  }

  if (body.password) {
    if (String(body.password).length < 6) throw bad('Password must be at least 6 characters.');
    if (isSelf && !isAdmin) {
      if (!body.currentPassword || !verifyPassword(body.currentPassword, u)) throw bad('Current password is incorrect.');
    }
    Object.assign(u, hashPassword(body.password));
    // sign out other sessions for that user
    for (const [k, s] of Object.entries(db.sessions)) {
      if (s.userId === u.id && k !== parseCookies(req).ap_session) delete db.sessions[k];
    }
  }
  saveDb();
  send(res, 200, { user: publicUser(u) });
});

route('DELETE', '/api/users/:id', async (req, res, { user, params }) => {
  const u = db.users.find((x) => x.id === params.id);
  if (!u) throw notFound('Team member');
  if (u.id === user.id) throw bad('You cannot remove yourself.');
  if (u.role === 'admin' && db.users.filter((x) => x.role === 'admin' && x.active).length <= 1) {
    throw bad('There must be at least one admin.');
  }
  // Soft-delete keeps history intact; open tasks become unassigned.
  u.active = false;
  db.tasks.forEach((t) => {
    if (t.assigneeId === u.id && t.status !== 'done') t.assigneeId = null;
  });
  for (const [k, s] of Object.entries(db.sessions)) if (s.userId === u.id) delete db.sessions[k];
  logActivity({ type: 'member_removed', userId: user.id, targetUserId: u.id, text: `removed ${u.name} from the team` });
  saveDb();
  send(res, 200, { ok: true });
}, { admin: true });

/* --- projects --- */

function applyProject(p, body) {
  if (body.name !== undefined) {
    const name = str(body.name, 120);
    if (!name) throw bad('Project name is required.');
    p.name = name;
  }
  if (body.client !== undefined) p.client = str(body.client, 120);
  if (body.description !== undefined) p.description = str(body.description, 4000);
  if (body.color !== undefined && /^#[0-9a-f]{6}$/i.test(body.color)) p.color = body.color;
  if (body.status !== undefined) {
    if (!PROJECT_STATUSES.includes(body.status)) throw bad('Invalid project status.');
    p.status = body.status;
  }
  if (body.startDate !== undefined) p.startDate = dateOrNull(body.startDate);
  if (body.dueDate !== undefined) p.dueDate = dateOrNull(body.dueDate);
  if (body.leadId !== undefined) p.leadId = body.leadId && db.users.some((u) => u.id === body.leadId) ? body.leadId : null;
}

route('POST', '/api/projects', async (req, res, { body, user }) => {
  const p = {
    id: id(), name: '', client: '', description: '', color: '#6d4aff', status: 'active',
    startDate: null, dueDate: null, leadId: null, createdBy: user.id, createdAt: now(), updatedAt: now(),
  };
  applyProject(p, body);
  if (!p.name) throw bad('Project name is required.');
  db.projects.push(p);
  logActivity({ type: 'project_created', userId: user.id, projectId: p.id, text: `created project “${p.name}”` });
  saveDb();
  send(res, 201, { project: p });
}, { admin: true });

route('PUT', '/api/projects/:id', async (req, res, { body, user, params }) => {
  const p = db.projects.find((x) => x.id === params.id);
  if (!p) throw notFound('Project');
  const before = p.status;
  applyProject(p, body);
  p.updatedAt = now();
  if (before !== p.status) {
    logActivity({ type: 'project_status', userId: user.id, projectId: p.id, text: `marked project “${p.name}” as ${p.status.replace('_', ' ')}` });
  }
  saveDb();
  send(res, 200, { project: p });
}, { admin: true });

route('DELETE', '/api/projects/:id', async (req, res, { user, params }) => {
  const idx = db.projects.findIndex((x) => x.id === params.id);
  if (idx < 0) throw notFound('Project');
  const [p] = db.projects.splice(idx, 1);
  const removed = new Set(db.tasks.filter((t) => t.projectId === p.id).map((t) => t.id));
  db.tasks = db.tasks.filter((t) => !removed.has(t.id));
  db.activity = db.activity.filter((a) => !removed.has(a.taskId));
  logActivity({ type: 'project_deleted', userId: user.id, text: `deleted project “${p.name}”` });
  saveDb();
  send(res, 200, { ok: true });
}, { admin: true });

/* --- tasks --- */

function canEditTask(user, t) {
  return user.role === 'admin' || t.assigneeId === user.id || t.createdBy === user.id;
}

function applyTask(t, body, user, isNew) {
  const isAdmin = user.role === 'admin';
  const changes = [];

  if (body.title !== undefined) {
    const title = str(body.title, 200);
    if (!title) throw bad('Task title is required.');
    t.title = title;
  }
  if (body.description !== undefined) t.description = str(body.description, 8000);
  if (body.projectId !== undefined) {
    if (!db.projects.some((p) => p.id === body.projectId)) throw bad('Please choose a project.');
    t.projectId = body.projectId;
  }
  if (body.assigneeId !== undefined) {
    const aid = body.assigneeId || null;
    if (aid && !db.users.some((u) => u.id === aid && u.active)) throw bad('Unknown team member.');
    if (!isAdmin && aid !== user.id && aid !== t.assigneeId) {
      throw forbidden('Only admins can assign tasks to other team members.');
    }
    if (aid !== t.assigneeId && !isNew) {
      const who = aid ? db.users.find((u) => u.id === aid).name : 'nobody';
      changes.push({ type: 'assigned', text: `assigned the task to ${who}` });
    }
    t.assigneeId = aid;
  }
  if (body.priority !== undefined) {
    if (!PRIORITIES.includes(body.priority)) throw bad('Invalid priority.');
    t.priority = body.priority;
  }
  if (body.startDate !== undefined) t.startDate = dateOrNull(body.startDate);
  if (body.dueDate !== undefined) t.dueDate = dateOrNull(body.dueDate);
  if (body.estimateHours !== undefined) {
    const h = Number(body.estimateHours);
    t.estimateHours = body.estimateHours === '' || body.estimateHours == null || !Number.isFinite(h) ? null : Math.max(0, Math.min(1000, h));
  }

  const prevStatus = t.status;
  const prevProgress = t.progress;

  if (body.progress !== undefined) t.progress = clampProgress(body.progress);
  if (body.status !== undefined) {
    if (!STATUSES.includes(body.status)) throw bad('Invalid status.');
    t.status = body.status;
  }

  // Keep status and progress consistent so reports stay trustworthy.
  if (t.status === 'done') t.progress = 100;
  else if (body.status !== undefined && prevStatus === 'done' && body.progress === undefined && t.progress === 100) t.progress = 90;
  if (body.status === undefined && t.status === 'todo' && t.progress > 0) t.status = 'in_progress';

  if (t.status === 'done' && prevStatus !== 'done') t.completedAt = now();
  if (t.status !== 'done') t.completedAt = null;

  if (!isNew) {
    if (prevStatus !== t.status) changes.push({ type: 'status', from: prevStatus, to: t.status, text: `moved the task to ${labelStatus(t.status)}` });
    if (prevProgress !== t.progress) changes.push({ type: 'progress', from: prevProgress, to: t.progress, text: `updated progress to ${t.progress}%` });
  }
  return changes;
}

function labelStatus(s) {
  return { todo: 'To Do', in_progress: 'In Progress', review: 'In Review', blocked: 'Blocked', done: 'Done' }[s] || s;
}

route('POST', '/api/tasks', async (req, res, { body, user }) => {
  const t = {
    id: id(), projectId: null, title: '', description: '', assigneeId: user.role === 'admin' ? null : user.id,
    status: 'todo', priority: 'medium', progress: 0, startDate: null, dueDate: null, estimateHours: null,
    createdBy: user.id, createdAt: now(), updatedAt: now(), completedAt: null,
  };
  if (user.role !== 'admin' && body.assigneeId && body.assigneeId !== user.id) {
    throw forbidden('Only admins can assign tasks to other team members.');
  }
  applyTask(t, body, user, true);
  if (!t.title) throw bad('Task title is required.');
  if (!t.projectId) throw bad('Please choose a project.');
  db.tasks.push(t);
  logActivity({ type: 'task_created', userId: user.id, taskId: t.id, projectId: t.projectId, text: 'created the task' });
  saveDb();
  send(res, 201, { task: t });
});

route('PUT', '/api/tasks/:id', async (req, res, { body, user, params }) => {
  const t = db.tasks.find((x) => x.id === params.id);
  if (!t) throw notFound('Task');
  if (!canEditTask(user, t)) throw forbidden('You can only update tasks assigned to you.');
  const changes = applyTask(t, body, user, false);
  t.updatedAt = now();
  const note = str(body.note, 4000);
  changes.forEach((c) => logActivity({ ...c, userId: user.id, taskId: t.id, projectId: t.projectId }));
  if (note) logActivity({ type: 'comment', userId: user.id, taskId: t.id, projectId: t.projectId, text: note });
  saveDb();
  send(res, 200, { task: t });
});

route('DELETE', '/api/tasks/:id', async (req, res, { user, params }) => {
  const idx = db.tasks.findIndex((x) => x.id === params.id);
  if (idx < 0) throw notFound('Task');
  const t = db.tasks[idx];
  if (user.role !== 'admin' && t.createdBy !== user.id) throw forbidden('Only admins or the task creator can delete a task.');
  db.tasks.splice(idx, 1);
  db.activity = db.activity.filter((a) => a.taskId !== t.id);
  logActivity({ type: 'task_deleted', userId: user.id, projectId: t.projectId, text: `deleted task “${t.title}”` });
  saveDb();
  send(res, 200, { ok: true });
});

route('GET', '/api/tasks/:id/activity', async (req, res, { params }) => {
  const t = db.tasks.find((x) => x.id === params.id);
  if (!t) throw notFound('Task');
  send(res, 200, { activity: db.activity.filter((a) => a.taskId === t.id) });
});

route('POST', '/api/tasks/:id/comments', async (req, res, { body, user, params }) => {
  const t = db.tasks.find((x) => x.id === params.id);
  if (!t) throw notFound('Task');
  const text = str(body.text, 4000);
  if (!text) throw bad('Write something first.');
  const a = logActivity({ type: 'comment', userId: user.id, taskId: t.id, projectId: t.projectId, text });
  saveDb();
  send(res, 201, { activity: a });
});

/* ---------------- server ---------------- */

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const pathname = url.pathname;

  if (!pathname.startsWith('/api/')) {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.writeHead(405);
      return res.end();
    }
    return serveStatic(req, res, pathname);
  }

  try {
    const r = routes.find((x) => x.method === req.method && x.re.test(pathname));
    if (!r) throw notFound('Endpoint');
    const m = pathname.match(r.re);
    const params = {};
    r.keys.forEach((k, i) => (params[k] = decodeURIComponent(m[i + 1])));

    // CSRF guard: state-changing requests must be same-origin JSON.
    if (req.method !== 'GET' && !String(req.headers['content-type'] || '').includes('application/json')) {
      throw bad('Expected JSON.');
    }

    const user = currentUser(req);
    if (r.auth && !user) throw new HttpError(401, 'Please sign in.');
    if (r.admin && user.role !== 'admin') throw forbidden('Only admins can do that.');

    const body = req.method === 'GET' ? {} : await readBody(req);
    await r.handler(req, res, { body, user, params });
  } catch (err) {
    if (!(err instanceof HttpError)) console.error(err);
    send(res, err.status || 500, { error: err instanceof HttpError ? err.message : 'Something went wrong.' });
  }
});

loadDb();

process.on('SIGINT', () => { flushDb(); process.exit(0); });
process.on('SIGTERM', () => { flushDb(); process.exit(0); });

server.listen(PORT, HOST, () => {
  console.log(`  Aurora Promotions tracker running at http://localhost:${PORT}`);
});

module.exports = { server };
