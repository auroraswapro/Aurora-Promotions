'use strict';
/*
 * Fills data/db.json with a sample team, projects and tasks so you can explore
 * the tracker. WARNING: this replaces any existing data.
 *   npm run demo
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');

const id = () => crypto.randomBytes(8).toString('hex');
function hashPassword(pw) {
  const salt = crypto.randomBytes(16).toString('hex');
  return { salt, hash: crypto.scryptSync(pw, salt, 64).toString('hex') };
}
const day = (offset) => {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return d.toISOString().slice(0, 10);
};
const at = (offset, hour = 10) => {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  d.setHours(hour, Math.floor(Math.random() * 60), 0, 0);
  return d.toISOString();
};

const people = [
  ['Aurora Admin', 'admin@aurorapromotions.com', 'Project Manager', 'admin', '#6d4aff'],
  ['Sara Khan', 'sara@aurorapromotions.com', 'Creative Lead', 'member', '#e0569b'],
  ['Omar Farooq', 'omar@aurorapromotions.com', 'Social Media Manager', 'member', '#0ea5a4'],
  ['Hina Malik', 'hina@aurorapromotions.com', 'Graphic Designer', 'member', '#f08c2e'],
  ['Bilal Ahmed', 'bilal@aurorapromotions.com', 'Video Editor', 'member', '#2f7de1'],
  ['Zara Ali', 'zara@aurorapromotions.com', 'Content Writer', 'member', '#16a34a'],
];
const users = people.map(([name, email, title, role, color], i) => ({
  id: id(), name, email, title, role, color, ...hashPassword(role === 'admin' ? 'aurora123' : 'team123'),
  active: true, createdAt: at(-60 + i),
}));
const U = Object.fromEntries(users.map((u) => [u.name.split(' ')[0], u.id]));

const projectDefs = [
  ['Summer Sale Campaign', 'Lumina Fashion', '#e0569b', 'active', -20, 12, U.Sara, 'Multi-channel summer sale push: social, email and in-store promotions.'],
  ['Brand Launch – Nova Café', 'Nova Café', '#0ea5a4', 'active', -10, 25, U.Aurora, 'Full brand launch: identity, launch event, influencer outreach.'],
  ['Q4 Social Media Calendar', 'Aurora Promotions', '#6d4aff', 'active', -5, 40, U.Omar, 'Plan and produce the Q4 content calendar for all platforms.'],
  ['Product Video Series', 'TechWave', '#2f7de1', 'planning', 3, 55, U.Bilal, 'Six short product explainer videos for launch.'],
  ['Annual Report Design', 'GreenLeaf NGO', '#16a34a', 'completed', -45, -3, U.Hina, 'Layout and print-ready design of the annual impact report.'],
];
const projects = projectDefs.map(([name, client, color, status, s, d, leadId, description]) => ({
  id: id(), name, client, description, color, status, startDate: day(s), dueDate: day(d), leadId,
  createdBy: U.Aurora, createdAt: at(s - 2), updatedAt: at(-1),
}));
const P = Object.fromEntries(projects.map((p, i) => [i, p.id]));

// [project, title, assignee, status, priority, progress, startOffset, dueOffset]
const taskDefs = [
  [0, 'Design sale banners for Instagram & Facebook', 'Hina', 'in_progress', 'high', 70, -6, 1],
  [0, 'Write email newsletter copy', 'Zara', 'review', 'medium', 95, -5, 0],
  [0, 'Schedule social posts for launch week', 'Omar', 'in_progress', 'high', 40, -3, 2],
  [0, 'In-store poster print files', 'Hina', 'todo', 'medium', 0, 0, 6],
  [0, 'Campaign moodboard & concept', 'Sara', 'done', 'high', 100, -18, -12],
  [0, 'Influencer shortlist', 'Omar', 'done', 'medium', 100, -15, -9],
  [0, 'Promo teaser video (15s)', 'Bilal', 'blocked', 'urgent', 30, -4, -1],
  [1, 'Logo & visual identity refinements', 'Sara', 'in_progress', 'urgent', 60, -8, 3],
  [1, 'Launch event run-of-show', 'Aurora', 'in_progress', 'high', 50, -5, 8],
  [1, 'Menu board design', 'Hina', 'todo', 'medium', 0, 2, 10],
  [1, 'Press release draft', 'Zara', 'in_progress', 'medium', 35, -2, 5],
  [1, 'Venue booking & vendor contracts', 'Aurora', 'done', 'high', 100, -10, -4],
  [1, 'Opening day reel', 'Bilal', 'todo', 'high', 0, 5, 20],
  [2, 'October content themes', 'Omar', 'done', 'medium', 100, -5, -2],
  [2, 'Caption bank – 30 posts', 'Zara', 'in_progress', 'medium', 55, -3, 7],
  [2, 'Carousel templates', 'Hina', 'review', 'low', 90, -4, 3],
  [2, 'Analytics baseline report', 'Omar', 'todo', 'low', 0, 1, 12],
  [3, 'Scripts for videos 1–3', 'Zara', 'todo', 'medium', 0, 3, 14],
  [3, 'Storyboards', 'Sara', 'todo', 'medium', 0, 5, 18],
  [3, 'Equipment & studio booking', 'Bilal', 'in_progress', 'medium', 20, -1, 9],
  [4, 'Report layout', 'Hina', 'done', 'high', 100, -40, -20],
  [4, 'Infographics', 'Hina', 'done', 'medium', 100, -30, -10],
  [4, 'Proofreading', 'Zara', 'done', 'medium', 100, -12, -6],
];

const tasks = [];
const activity = [];
taskDefs.forEach(([pi, title, who, status, priority, progress, s, d], i) => {
  const t = {
    id: id(), projectId: P[pi], title, description: '', assigneeId: U[who], status, priority, progress,
    startDate: day(s), dueDate: day(d), estimateHours: [4, 6, 8, 12, 16][i % 5],
    createdBy: U.Aurora, createdAt: at(s - 1, 9), updatedAt: at(Math.min(0, s + 2), 15),
    completedAt: status === 'done' ? at(Math.min(d, -1 - (i % 9)), 16) : null,
  };
  tasks.push(t);
  activity.push({ id: id(), type: 'task_created', userId: U.Aurora, taskId: t.id, projectId: t.projectId, text: 'created the task', createdAt: t.createdAt });
  if (progress > 0 && status !== 'done') {
    activity.push({ id: id(), type: 'progress', userId: t.assigneeId, taskId: t.id, projectId: t.projectId, from: 0, to: progress, text: `updated progress to ${progress}%`, createdAt: at(-(i % 3), 11 + (i % 6)) });
  }
  if (status === 'done') {
    activity.push({ id: id(), type: 'status', userId: t.assigneeId, taskId: t.id, projectId: t.projectId, from: 'in_progress', to: 'done', text: 'moved the task to Done', createdAt: t.completedAt });
  }
});

const commentFor = (title, text, who, off) => {
  const t = tasks.find((x) => x.title === title);
  activity.push({ id: id(), type: 'comment', userId: U[who], taskId: t.id, projectId: t.projectId, text, createdAt: at(off, 14) });
};
commentFor('Promo teaser video (15s)', 'Waiting on final product shots from the client — can’t finish the edit until they arrive.', 'Bilal', 0);
commentFor('Design sale banners for Instagram & Facebook', 'First 4 sizes done, sharing drafts with Sara today.', 'Hina', 0);
commentFor('Write email newsletter copy', 'Ready for review 🙌', 'Zara', 0);
commentFor('Logo & visual identity refinements', 'Client approved colour palette, working on logo lockups.', 'Sara', -1);

activity.sort((a, b) => a.createdAt.localeCompare(b.createdAt));

fs.mkdirSync(DATA_DIR, { recursive: true });
fs.writeFileSync(DB_FILE, JSON.stringify({ users, projects, tasks, activity, sessions: {} }, null, 2));
console.log(`Demo data written to ${DB_FILE}`);
console.log('  Admin:   admin@aurorapromotions.com / aurora123');
console.log('  Members: sara@, omar@, hina@, bilal@, zara@aurorapromotions.com / team123');
