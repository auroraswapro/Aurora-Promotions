/* Aurora Promotions — Team Tracker data layer.
 * Live mode talks to Supabase (email one-time-code sign-in + Postgres).
 * Demo mode keeps sample data in this browser so the site works before Supabase is set up. */
(() => {
  'use strict';

  const TABLES = ['members', 'projects', 'tasks', 'activity', 'invites'];

  /* ---------- row <-> app object mapping ---------- */
  const map = {
    members: {
      table: 'profiles',
      from: (r) => ({ id: r.id, email: r.email, displayName: r.display_name, title: r.title, color: r.color, role: r.role, active: r.active, joinedAt: r.joined_at }),
      to: (o) => pick({ display_name: o.displayName, title: o.title, color: o.color, role: o.role, active: o.active }),
    },
    projects: {
      table: 'projects',
      from: (r) => ({ id: r.id, name: r.name, client: r.client, description: r.description, color: r.color, status: r.status, startDate: r.start_date, dueDate: r.due_date, leadId: r.lead_id, example: r.example, createdBy: r.created_by, createdAt: r.created_at, updatedAt: r.updated_at }),
      to: (o) => pick({ name: o.name, client: o.client, description: o.description, color: o.color, status: o.status, start_date: o.startDate, due_date: o.dueDate, lead_id: o.leadId, example: o.example, updated_at: o.updatedAt }),
    },
    tasks: {
      table: 'tasks',
      from: (r) => ({ id: r.id, projectId: r.project_id, title: r.title, description: r.description, assigneeId: r.assignee_id, status: r.status, priority: r.priority, progress: r.progress, startDate: r.start_date, dueDate: r.due_date, estimateHours: r.estimate_hours == null ? null : Number(r.estimate_hours), example: r.example, createdBy: r.created_by, createdAt: r.created_at, updatedAt: r.updated_at, completedAt: r.completed_at }),
      to: (o) => pick({ project_id: o.projectId, title: o.title, description: o.description, assignee_id: o.assigneeId, status: o.status, priority: o.priority, progress: o.progress, start_date: o.startDate, due_date: o.dueDate, estimate_hours: o.estimateHours, example: o.example, updated_at: o.updatedAt, completed_at: o.completedAt }),
    },
    activity: {
      table: 'activity',
      from: (r) => ({ id: r.id, type: r.type, userId: r.user_id, taskId: r.task_id, projectId: r.project_id, text: r.text, to: r.to_status, createdAt: r.created_at }),
      to: (o) => pick({ type: o.type, task_id: o.taskId, project_id: o.projectId, text: o.text, to_status: o.to }),
    },
    invites: {
      table: 'invites',
      from: (r) => ({ email: r.email, displayName: r.display_name, title: r.title, role: r.role, createdAt: r.created_at }),
      to: (o) => pick({ email: o.email, display_name: o.displayName, title: o.title, role: o.role }),
    },
  };
  function pick(o) {
    const out = {};
    Object.keys(o).forEach((k) => { if (o[k] !== undefined) out[k] = o[k]; });
    return out;
  }

  function fail(code, message) {
    const e = new Error(message || code);
    e.code = code;
    return e;
  }

  /* =========================================================
   * Live: Supabase
   * ======================================================= */
  function liveBackend(cfg) {
    const sb = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseKey, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
    });
    const check = ({ data, error }) => {
      if (error) throw fail(error.code || 'error', error.message);
      return data;
    };

    return {
      mode: 'live',
      async getSession() {
        const { data } = await sb.auth.getSession();
        const u = data.session?.user;
        return u ? { userId: u.id, email: u.email } : null;
      },
      async sendCode(email) {
        const { error } = await sb.auth.signInWithOtp({ email, options: { shouldCreateUser: true } });
        if (error) {
          if (error.status === 429 || /rate|seconds/i.test(error.message)) throw fail('rate_limited', 'Please wait a minute before asking for another code.');
          throw fail('send_failed', 'We could not send the code. Check the email address and try again.');
        }
      },
      async verifyCode(email, token) {
        const { data, error } = await sb.auth.verifyOtp({ email, token, type: 'email' });
        if (error) throw fail('bad_code', 'That code is wrong or has expired. Check the latest email or ask for a new code.');
        return { userId: data.user.id, email: data.user.email };
      },
      async signOut() { await sb.auth.signOut(); },
      async joinTeam() {
        const { data, error } = await sb.rpc('join_team');
        if (error) {
          if (/not_invited/.test(error.message)) throw fail('not_invited');
          throw fail('error', error.message);
        }
        return map.members.from(Array.isArray(data) ? data[0] : data);
      },
      async load(kind) {
        const m = map[kind];
        let q = sb.from(m.table).select('*');
        if (kind === 'activity') q = q.order('created_at', { ascending: false }).limit(300);
        const rows = check(await q);
        return rows.map(m.from);
      },
      onChange(cb) {
        const ch = sb.channel('tracker');
        TABLES.forEach((kind) => {
          ch.on('postgres_changes', { event: '*', schema: 'public', table: map[kind].table }, () => cb(kind));
        });
        ch.subscribe();
      },
      async save(kind, id, obj) {
        const m = map[kind];
        const row = m.to(obj);
        if (id) {
          check(await sb.from(m.table).update(row).eq(kind === 'invites' ? 'email' : 'id', id));
          return id;
        }
        const data = check(await sb.from(m.table).insert(row).select(kind === 'invites' ? 'email' : 'id').single());
        return data.id || data.email;
      },
      async remove(kind, id) {
        check(await sb.from(map[kind].table).delete().eq(kind === 'invites' ? 'email' : 'id', id));
      },
      async taskActivity(taskId) {
        const rows = check(await sb.from('activity').select('*').eq('task_id', taskId).order('created_at', { ascending: false }).limit(200));
        return rows.map(map.activity.from);
      },
      async pruneActivity(beforeIso) {
        check(await sb.from('activity').delete().lt('created_at', beforeIso));
      },
    };
  }

  /* =========================================================
   * Demo: sample data kept in this browser
   * ======================================================= */
  function demoBackend() {
    const KEY = 'ap-demo-v2';
    const uid = () => Math.random().toString(16).slice(2) + Date.now().toString(16);
    const listeners = [];
    let db;

    const day = (off) => { const d = new Date(); d.setDate(d.getDate() + off); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
    const at = (off, h = 11) => { const d = new Date(); d.setDate(d.getDate() + off); d.setHours(h, 7 * (h % 8), 0, 0); return d.toISOString(); };

    function seed(email) {
      const people = [
        ['You', 'Project Manager', 'admin', '#6d4aff', email],
        ['Sara Khan', 'Creative Lead', 'member', '#e0569b', 'sara@example.com'],
        ['Omar Farooq', 'Social Media Manager', 'member', '#0ea5a4', 'omar@example.com'],
        ['Hina Malik', 'Graphic Designer', 'member', '#f08c2e', 'hina@example.com'],
        ['Bilal Ahmed', 'Video Editor', 'member', '#2f7de1', 'bilal@example.com'],
        ['Zara Ali', 'Content Writer', 'member', '#16a34a', 'zara@example.com'],
      ];
      const members = people.map(([displayName, title, role, color, em], i) => ({ id: i === 0 ? 'me' : uid(), email: em, displayName, title, role, color, active: true, joinedAt: at(-40 + i) }));
      const U = Object.fromEntries(members.map((m) => [m.displayName.split(' ')[0], m.id]));
      const pdefs = [
        ['Summer Sale Campaign', 'Lumina Fashion', '#e0569b', 'active', -20, 12, U.Sara],
        ['Brand Launch – Nova Café', 'Nova Café', '#0ea5a4', 'active', -10, 25, U.You],
        ['Q4 Social Media Calendar', 'Aurora Promotions', '#6d4aff', 'active', -5, 40, U.Omar],
        ['Product Video Series', 'TechWave', '#2f7de1', 'planning', 3, 55, U.Bilal],
      ];
      const projects = pdefs.map(([name, client, color, status, s, d, leadId]) => ({
        id: uid(), name, client, color, status, startDate: day(s), dueDate: day(d), leadId, example: true,
        description: 'Sample project for the demo.', createdBy: 'me', createdAt: at(s - 1), updatedAt: at(-1),
      }));
      const tdefs = [
        [0, 'Design sale banners for Instagram & Facebook', 'Hina', 'in_progress', 'high', 70, -6, 1],
        [0, 'Write email newsletter copy', 'Zara', 'review', 'medium', 95, -5, 0],
        [0, 'Schedule social posts for launch week', 'Omar', 'in_progress', 'high', 40, -3, 2],
        [0, 'In-store poster print files', 'Hina', 'todo', 'medium', 0, 0, 6],
        [0, 'Campaign moodboard & concept', 'Sara', 'done', 'high', 100, -18, -12],
        [0, 'Promo teaser video (15s)', 'Bilal', 'blocked', 'urgent', 30, -4, -1],
        [1, 'Logo & visual identity refinements', 'Sara', 'in_progress', 'urgent', 60, -8, 3],
        [1, 'Launch event run-of-show', 'You', 'in_progress', 'high', 50, -5, 8],
        [1, 'Press release draft', 'Zara', 'in_progress', 'medium', 35, -2, 5],
        [1, 'Venue booking & vendor contracts', 'You', 'done', 'high', 100, -10, -4],
        [2, 'October content themes', 'Omar', 'done', 'medium', 100, -5, -2],
        [2, 'Carousel templates', 'Hina', 'review', 'low', 90, -4, 3],
        [2, 'Caption bank – 30 posts', 'Zara', 'done', 'medium', 100, -6, -1],
        [3, 'Equipment & studio booking', 'Bilal', 'in_progress', 'medium', 20, -1, 9],
        [3, 'Storyboards', 'Sara', 'todo', 'medium', 0, 5, 18],
      ];
      const tasks = tdefs.map(([pi, title, who, status, priority, progress, s, d], i) => ({
        id: uid(), projectId: projects[pi].id, title, description: '', assigneeId: U[who], status, priority, progress,
        startDate: day(s), dueDate: day(d), estimateHours: null, example: true, createdBy: 'me',
        createdAt: at(s - 1, 9), updatedAt: at(-(i % 4), 15), completedAt: status === 'done' ? at(-1 - (i % 6), 16) : null,
      }));
      const activity = [
        ['comment', 'Bilal', 'Promo teaser video (15s)', 'Waiting on final product shots from the client. Can’t finish the edit until they arrive.', 0, 10],
        ['comment', 'Hina', 'Design sale banners for Instagram & Facebook', 'First 4 sizes done, sharing drafts with Sara today.', 0, 9],
        ['progress', 'Zara', 'Write email newsletter copy', 'updated progress to 95%', -1, 16],
        ['comment', 'Sara', 'Logo & visual identity refinements', 'Client approved the colour palette, working on logo lockups.', -1, 12],
      ].map(([type, who, title, text, off, h]) => {
        const t = tasks.find((x) => x.title === title);
        return { id: uid(), type, userId: U[who], taskId: t.id, projectId: t.projectId, text, to: '', createdAt: at(off, h) };
      });
      return { members, projects, tasks, activity, invites: [] };
    }

    function persist() { try { localStorage.setItem(KEY, JSON.stringify(db)); } catch (_) { /* private mode */ } }
    function emit(kind) { persist(); listeners.forEach((cb) => setTimeout(() => cb(kind), 0)); }
    function loadDb(email) {
      try { db = JSON.parse(localStorage.getItem(KEY)); } catch (_) { db = null; }
      if (!db || !db.members) db = seed(email || 'you@example.com');
    }
    const session = () => { try { return JSON.parse(localStorage.getItem(KEY + '-session')); } catch (_) { return null; } };

    return {
      mode: 'demo',
      async getSession() { const s = session(); if (s) loadDb(s.email); return s; },
      async sendCode() { await new Promise((r) => setTimeout(r, 400)); },
      async verifyCode(email, token) {
        if (!/^\d{6,8}$/.test(token)) throw fail('bad_code', 'In the demo, any 6-digit code works, e.g. 123456.');
        const s = { userId: 'me', email };
        try { localStorage.setItem(KEY + '-session', JSON.stringify(s)); } catch (_) { /* ignore */ }
        loadDb(email);
        return s;
      },
      async signOut() { try { localStorage.removeItem(KEY + '-session'); } catch (_) { /* ignore */ } },
      async joinTeam() { return db.members.find((m) => m.id === 'me'); },
      async load(kind) {
        const rows = JSON.parse(JSON.stringify(db[kind]));
        return kind === 'activity' ? rows.sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 300) : rows;
      },
      onChange(cb) { listeners.push(cb); },
      async save(kind, id, obj) {
        const key = kind === 'invites' ? 'email' : 'id';
        if (id) {
          const row = db[kind].find((r) => r[key] === id);
          if (row) Object.assign(row, pick(obj));
        } else {
          id = kind === 'invites' ? obj.email : uid();
          const extra = kind === 'activity' ? { userId: 'me', createdAt: new Date().toISOString() }
            : kind === 'invites' ? { createdAt: new Date().toISOString() }
            : { createdBy: 'me', createdAt: new Date().toISOString() };
          db[kind].push({ ...extra, ...pick(obj), [key]: id });
        }
        emit(kind);
        return id;
      },
      async remove(kind, id) {
        const key = kind === 'invites' ? 'email' : 'id';
        db[kind] = db[kind].filter((r) => r[key] !== id);
        if (kind === 'projects') { db.tasks = db.tasks.filter((t) => t.projectId !== id); emit('tasks'); }
        if (kind === 'tasks') db.activity = db.activity.filter((a) => a.taskId !== id);
        emit(kind);
      },
      async taskActivity(taskId) {
        return db.activity.filter((a) => a.taskId === taskId).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      },
      async pruneActivity(beforeIso) { db.activity = db.activity.filter((a) => a.createdAt >= beforeIso); emit('activity'); },
      reset() { try { localStorage.removeItem(KEY); } catch (_) { /* ignore */ } },
    };
  }

  window.APBackend = {
    TABLES,
    create() {
      const cfg = window.AURORA_CONFIG || {};
      const live = cfg.supabaseUrl && cfg.supabaseKey && window.supabase && typeof window.supabase.createClient === 'function';
      return live ? liveBackend(cfg) : demoBackend();
    },
  };
})();
