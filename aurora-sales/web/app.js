/* Aurora Sales: AI lead follow-up for Aurora Promotions, powered by Claude.
 * There is no fixed email sequence. For every lead, Claude reads the conversation, writes the
 * next email and suggests when to check in again. A person approves every email before it is sent. */
(function () {
"use strict";

/* ================= constants ================= */
const STATUS = {
  new: "New", following: "Waiting for reply", replied: "Replied", meeting: "Meeting", quoted: "Quoted",
  won: "Won", lost: "Lost", paused: "Paused", finished: "No reply", unsubscribed: "Stopped emails",
};
const STATUS_TONE = { new: "brand", following: "ai", replied: "cold", meeting: "ok", quoted: "ok", won: "ok", lost: "bad", paused: "", finished: "", unsubscribed: "bad" };
const OPEN = ["new", "following", "replied", "meeting", "quoted"];
const TABS = [
  ["open", "Open", (l) => OPEN.includes(l.status) || l.status === "paused"],
  ["replied", "Replied", (l) => ["replied", "meeting", "quoted"].includes(l.status)],
  ["won", "Won", (l) => l.status === "won"],
  ["closed", "Closed", (l) => ["lost", "finished", "unsubscribed"].includes(l.status)],
  ["all", "All", () => true],
];
const KIND = { first: "First email", followup: "Follow-up", reply: "Answer to their reply", manual: "Custom email" };
const INTENT = {
  interested: "Interested", question: "Has a question", wants_quote: "Wants a quote", wants_call: "Wants a call",
  not_now: "Not right now", not_interested: "Not interested", unsubscribe: "Asked to stop", out_of_office: "Out of office", other: "Other",
};
const DAY_CHOICES = [1, 2, 3, 4, 5, 7, 10, 14, 21, 30];
const REWRITE_CHIPS = ["Shorter", "Friendlier", "More formal", "Mention our free design proof", "Ask about their deadline"];
const ASK_PRESETS = [
  "What should I focus on today?",
  "Which hot leads haven't heard from us in 3+ days?",
  "Which leads are at risk of going cold?",
  "Summarize this week for the team meeting.",
];
const DEFAULT_PLAYBOOK = { company: "Aurora Promotions", about: "", offer: "", tone: "", rules: "", cta: "", quoteLink: "", signature: "{rep_name}\nAurora Promotions", optOut: "", assign: "round_robin" };
const DEFAULT_FOLLOWUP = { maxFollowups: 5, defaultDays: 3, leadHours: 12 };

/* ================= helpers ================= */
const $ = (s, r = document) => r.querySelector(s);
const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const uid = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2));
const now = () => new Date().toISOString();
const days = (n) => n * 86400000;
const first = (name) => String(name || "").trim().split(/\s+/)[0] || "";
const initials = (l) => (String(l.name || l.email || "?").trim().split(/\s+/).map((w) => w[0]).slice(0, 2).join("") || "?").toUpperCase();
function ago(iso) {
  if (!iso) return "";
  const d = (Date.now() - new Date(iso).getTime()) / 1000;
  if (d < 0) return inFuture(iso);
  if (d < 60) return "just now";
  if (d < 3600) return Math.floor(d / 60) + " min ago";
  if (d < 86400) return Math.floor(d / 3600) + " h ago";
  if (d < 86400 * 30) return Math.floor(d / 86400) + " d ago";
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}
function inFuture(iso) {
  const d = (new Date(iso).getTime() - Date.now()) / 1000;
  if (d < 86400) return "today";
  const n = Math.round(d / 86400);
  return n === 1 ? "tomorrow" : "in " + n + " days";
}
const fmtDay = (iso) => (iso ? new Date(iso).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" }) : "");
const fmtDate = (iso) => (iso ? new Date(iso).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : "");
const daysText = (n) => (n === 1 ? "1 day" : n + " days");
function toast(msg) { const t = $("#toast"); t.textContent = msg; t.classList.add("show"); clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove("show"), 3200); }
const pill = (text, tone) => `<span class="pill ${tone || ""}">${esc(text)}</span>`;
const statusPill = (s) => pill(STATUS[s] || s, STATUS_TONE[s]);
const tempPill = (t) => pill(t === "hot" ? "Hot" : t === "cold" ? "Cold" : "Warm", t);

/* ================= state ================= */
const S = {
  mode: "loading", sb: null, me: null, team: [], invites: [], leads: [], drafts: [], inbox: [],
  playbook: { ...DEFAULT_PLAYBOOK }, followup: { ...DEFAULT_FOLLOWUP }, loaded: false, needsSetup: false, loadErr: "",
  route: "today", leadId: null, lead: null, edits: {}, rw: null, confirmSend: null, busy: {}, errs: {},
  tab: "open", search: "", mineOnly: false, allDrafts: false, panel: null, settingsTab: "playbook",
  add: { text: "", parsed: null, ownerId: "", draftNow: true }, chat: [], editDetails: false, pbDraft: null,
};
const isManager = () => S.me && S.me.role === "manager";
const teamName = (id) => { const p = S.team.find((t) => t.id === id); return p ? p.display_name || p.email.split("@")[0] : "Unassigned"; };
const leadById = (id) => S.leads.find((l) => l.id === id);
const canApprove = (lead) => lead && (!lead.owner_id || (S.me && lead.owner_id === S.me.id) || isManager());
const findDraft = (id) => S.drafts.find((x) => x.id === id) || (S.lead && S.lead.messages.find((x) => x.id === id));

/* ================= data: Supabase ================= */
const Cloud = {
  async loadAll() {
    const sb = S.sb;
    const since = new Date(Date.now() - days(30)).toISOString();
    const [leads, drafts, inbox, team, settings] = await Promise.all([
      sb.from("leads").select("*").order("updated_at", { ascending: false }).limit(2000),
      sb.from("lead_messages").select("*").eq("status", "draft").order("created_at"),
      sb.from("lead_messages").select("id,lead_id,subject,body,ai,created_at").eq("direction", "in").gte("created_at", since).order("created_at", { ascending: false }).limit(200),
      sb.from("sales_team").select("*").order("joined_at"),
      sb.from("sales_settings").select("id,data"),
    ]);
    const err = [leads, drafts, team].find((r) => r.error);
    if (err) throw err.error;
    let invites = [];
    if (isManager()) { const r = await sb.from("sales_invites").select("*").order("created_at"); invites = r.data || []; }
    const by = Object.fromEntries((settings.data || []).map((r) => [r.id, r.data]));
    return { leads: leads.data, drafts: drafts.data, inbox: inbox.data || [], team: team.data, invites, playbook: by.playbook, followup: by.followup };
  },
  async loadLead(id) {
    const [m, e] = await Promise.all([
      S.sb.from("lead_messages").select("*").eq("lead_id", id).order("created_at"),
      S.sb.from("lead_events").select("*").eq("lead_id", id).order("created_at", { ascending: false }).limit(100),
    ]);
    if (m.error) throw m.error;
    return { messages: m.data, events: e.data || [] };
  },
  async updateLead(id, patch) { const { error } = await S.sb.from("leads").update(patch).eq("id", id); if (error) throw error; },
  async deleteLead(id) { const { error } = await S.sb.from("leads").delete().eq("id", id); if (error) throw error; },
  async saveDraft(id, patch) { const { error } = await S.sb.from("lead_messages").update(patch).eq("id", id); if (error) throw error; },
  async addNote(leadId, text) { const { error } = await S.sb.from("lead_messages").insert({ lead_id: leadId, direction: "note", status: "note", kind: "note", body: text }); if (error) throw error; },
  async logEvent(leadId, type, text) { await S.sb.from("lead_events").insert({ lead_id: leadId, type, text }); },
  async saveSettings(id, data) { const { error } = await S.sb.from("sales_settings").upsert({ id, data }); if (error) throw error; },
  async invite(row) { const { error } = await S.sb.from("sales_invites").upsert(row); if (error) throw error; },
  async removeInvite(email) { const { error } = await S.sb.from("sales_invites").delete().eq("email", email); if (error) throw error; },
  async updateMember(id, patch) { const { error } = await S.sb.from("sales_team").update(patch).eq("id", id); if (error) throw error; },
  async call(fn, body) {
    const { data, error } = await S.sb.functions.invoke(fn, { body });
    if (error) {
      let msg = "Couldn't reach the server. If this keeps happening, the server functions may not be set up yet.";
      try { const j = await error.context.json(); if (j && j.error) msg = j.error; } catch (_) { /* keep default */ }
      throw new Error(msg);
    }
    if (data && data.error) throw new Error(data.error);
    return data;
  },
  ai(action, payload) { return Cloud.call("sales-ai", { action, ...payload }); },
  send(messageId, subject, body, followUpDays) { return Cloud.call("sales-send", { messageId, subject, body, followUpDays }); },
};

/* ================= data: demo (simulated Claude, nothing is sent) ================= */
const Demo = (() => {
  const T = (h) => new Date(Date.now() + h * 3600000).toISOString();
  const team = [
    { id: "u1", email: "maria@aurorapromotions.com", display_name: "Maria", title: "Sales Manager", role: "manager", active: true, joined_at: T(-2000) },
    { id: "u2", email: "james@aurorapromotions.com", display_name: "James", title: "Sales Rep", role: "rep", active: true, joined_at: T(-1500) },
    { id: "u3", email: "aisha@aurorapromotions.com", display_name: "Aisha", title: "Sales Rep", role: "rep", active: true, joined_at: T(-900) },
  ];
  const L = (o) => ({ phone: "", company: "", source: "Website", score: 50, temperature: "warm", summary: "", next_action: "", details: {}, next_step: 0, next_due_at: null, last_contact_at: null, last_reply_at: null, thread_id: "", value: null, created_at: T(-48), updated_at: T(-1), ...o });
  const leads = [
    L({ id: "l1", name: "Tina Brooks", email: "tina@riverside-fc.org", company: "Riverside FC", status: "new", owner_id: "u2", score: 82, temperature: "hot", source: "Website form", created_at: T(-2), next_due_at: T(-1),
      summary: "Youth football club needs 80 hoodies and 80 tees with the club crest before their May 12 tournament.", next_action: "Approve the first email and ask for sizes and colours.",
      details: { products: "Hoodies, t-shirts", quantity: "80 + 80", deadline: "May 12 tournament", location: "Austin, TX", enquiry: "Hi, we're Riverside FC (youth club). Looking for about 80 hoodies and 80 t-shirts with our crest for our tournament on May 12. Can you help? – Tina" } }),
    L({ id: "l2", name: "David Chen", email: "david@brightpath.io", company: "BrightPath Software", status: "following", owner_id: "u3", score: 64, temperature: "warm", source: "Email", next_step: 1, created_at: T(-80), last_contact_at: T(-50), next_due_at: T(-2),
      summary: "Tech company planning branded hoodies and caps for 40 staff for a June retreat.", next_action: "Approve the follow-up with a product idea.",
      details: { products: "Hoodies, caps", quantity: "40 staff", deadline: "Retreat in June", budget: "~$2,000", enquiry: "We want some branded swag for our team retreat. Probably hoodies and caps for 40 people." } }),
    L({ id: "l3", name: "Sarah Okafor", email: "sarah@lakeside.edu", company: "Lakeside High School", status: "replied", owner_id: "u2", score: 88, temperature: "hot", source: "Referral", created_at: T(-120), last_contact_at: T(-70), last_reply_at: T(-3),
      summary: "School wants 300 spirit-week tees in navy and gold; asked about price per shirt and the Oct 20 date.", next_action: "Approve the answer and send a quote today.",
      details: { products: "T-shirts", quantity: "300", deadline: "Spirit week, Oct 20", notes: "Two colours: navy and gold", enquiry: "Hi! We need spirit week shirts for the whole school." } }),
    L({ id: "l4", name: "Marcus Reed", email: "marcus@reedfitness.com", company: "Reed Fitness", status: "following", owner_id: "u3", score: 45, temperature: "warm", source: "Instagram", next_step: 2, created_at: T(-200), last_contact_at: T(-30), next_due_at: T(100),
      summary: "Gym owner interested in staff shirts and merch to sell at the front desk.", next_action: "Nothing to do. Claude checks in again when it's time.",
      details: { products: "Staff tees, tank tops", quantity: "50-100", location: "Denver" } }),
    L({ id: "l5", name: "Priya Shah", email: "priya@hopefoundation.org", company: "Hope Foundation", status: "won", owner_id: "u1", score: 95, temperature: "hot", source: "Website form", created_at: T(-400), last_contact_at: T(-100), last_reply_at: T(-96), value: 3150,
      summary: "Charity 5K run: ordered 250 event tees. Order confirmed.", next_action: "Hand over to production.", details: { products: "Event tees", quantity: "250", deadline: "Charity run, Sep 7" } }),
    L({ id: "l6", name: "Tom Walsh", email: "tom@walshevents.co", company: "Walsh Events", status: "finished", owner_id: "u2", score: 20, temperature: "cold", source: "Trade show", next_step: 5, created_at: T(-900), last_contact_at: T(-200),
      summary: "Met at a trade show; no reply after 5 emails.", next_action: "Try again next season.", details: { products: "Event staff shirts" } }),
  ];
  const M = (o) => ({ id: uid(), direction: "out", status: "sent", kind: "followup", step: 0, follow_up_days: 3, subject: "", body: "", ai_subject: "", ai_body: "", ai_reason: "", ai: {}, provider_id: "", message_id: "", error: "", created_by: null, approved_by: null, sent_at: null, created_at: T(-1), ...o });
  const messages = [
    M({ lead_id: "l1", status: "draft", kind: "first", follow_up_days: 2, subject: "Hoodies and tees for Riverside FC's May tournament",
      body: "Hi Tina,\n\nThanks for reaching out! Kitting out Riverside FC for the May 12 tournament sounds like a great project, and 80 hoodies plus 80 tees is well within what we do every week.\n\nTo put a quote together, could you tell me:\n- the colours you'd like for the hoodies and tees\n- a rough size breakdown (youth and adult)\n\nIf you can send the club crest as well, we'll make a free digital proof so you can see it before anything is printed.\n\nJames\nAurora Promotions",
      ai_reason: "Mentions their May 12 tournament and the exact quantities, and asks for colours and sizes so we can quote. Suggests checking in after 2 days because the tournament is close.", created_at: T(-1) }),
    M({ lead_id: "l2", kind: "first", subject: "Team retreat hoodies and caps for BrightPath", body: "Hi David,\n\nThanks for getting in touch about swag for your team retreat. Hoodies and caps for 40 people is a great combination...\n\nAisha\nAurora Promotions", sent_at: T(-50), created_at: T(-51) }),
    M({ lead_id: "l2", status: "draft", kind: "followup", step: 1, follow_up_days: 5, subject: "Re: Team retreat hoodies and caps for BrightPath",
      body: "Hi David,\n\nOne idea a lot of tech teams love for retreats: a soft heather hoodie with a small chest logo and the retreat name on the sleeve. It becomes a keepsake people actually wear.\n\nDo you have a colour in mind?\n\nAisha\nAurora Promotions",
      ai_reason: "Adds a retreat-specific product idea instead of just 'checking in', then asks one easy question. June is a while away, so 5 days before the next check-in.", created_at: T(-2) }),
    M({ lead_id: "l3", kind: "first", subject: "Spirit week shirts for Lakeside High", body: "Hi Sarah,\n\nThanks for thinking of us for spirit week!...\n\nJames\nAurora Promotions", sent_at: T(-70), created_at: T(-71) }),
    M({ lead_id: "l3", direction: "in", status: "received", kind: "inbound", step: null, follow_up_days: null, subject: "Re: Spirit week shirts for Lakeside High",
      body: "Hi James, thanks! We'd want 300 shirts, navy and gold, 1-colour print on the front. What would the price per shirt be, and can you have them by Oct 20?",
      ai: { intent: "wants_quote", summary: "Wants a price per shirt for 300 navy/gold tees and delivery by Oct 20.", mood: "positive" }, created_at: T(-3) }),
    M({ lead_id: "l3", status: "draft", kind: "reply", step: 0, follow_up_days: 2, subject: "Re: Spirit week shirts for Lakeside High",
      body: "Hi Sarah,\n\nGreat news, 300 shirts in navy and gold with a one-colour front print is a perfect fit for us.\n\nI'll send you an exact price per shirt today, and I'll confirm the Oct 20 date with our production team at the same time. If you have the design file, send it over and we'll prepare a free proof.\n\nJames\nAurora Promotions",
      ai_reason: "Answers both questions without guessing a price or date, and promises the quote today.", created_at: T(-2.5) }),
    M({ lead_id: "l4", kind: "first", subject: "Staff shirts and merch for Reed Fitness", body: "Hi Marcus,...", sent_at: T(-130), created_at: T(-131) }),
    M({ lead_id: "l4", step: 1, subject: "Re: Staff shirts and merch for Reed Fitness", body: "Hi Marcus,...", sent_at: T(-30), created_at: T(-31) }),
    M({ lead_id: "l5", direction: "in", status: "received", kind: "inbound", step: null, subject: "Re: Charity run tees", body: "Let's go ahead with the 250 shirts!", ai: { intent: "interested", summary: "Confirmed the order for 250 tees.", mood: "positive" }, created_at: T(-96) }),
  ];
  const events = [];
  const settings = {
    playbook: { company: "Aurora Promotions", about: "Aurora Promotions makes custom printed apparel and promotional products for businesses, schools, events, teams and non-profits.", offer: "Screen printing, embroidery and DTF printing\nFree design help and a digital proof before anything is printed\nBulk pricing that gets better with quantity", tone: "Friendly, warm and professional. Short, clear sentences.", rules: "Never promise a price or date that isn't in this playbook.\nKeep emails under 120 words.\nEnd with one simple question.", cta: "Reply with your quantity, colours and deadline and we'll send a free quote the same day.", quoteLink: "", signature: "{rep_name}\nAurora Promotions", optOut: 'If you would rather not hear from us, just reply "stop".', assign: "round_robin" },
    followup: { maxFollowups: 5, defaultDays: 3, leadHours: 12 },
  };
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const ev = (lead_id, type, text) => events.unshift({ id: uid(), lead_id, type, text, user_id: S.me && S.me.id, created_at: now() });
  const touch = (l) => { l.updated_at = now(); };

  function fakeRead(text) {
    const email = (text.match(/[\w.+-]+@[\w-]+\.[\w.-]+/) || [""])[0];
    const phone = (text.match(/\+?\d[\d\s().-]{7,}\d/) || [""])[0];
    const nameLine = text.match(/(?:name|from)\s*[:\-]\s*([^\n<]+)/i);
    const sign = text.match(/(?:thanks|regards|cheers|best)[,!]?\s*\n?\s*[–-]?\s*([A-Z][a-z]+(?: [A-Z][a-z]+)?)/);
    const name = (nameLine && nameLine[1].trim()) || (sign && sign[1]) || (email ? email.split("@")[0].replace(/[._]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()) : "");
    const prods = ["hoodie", "t-shirt", "tee", "shirt", "cap", "hat", "jacket", "polo", "apron", "bag", "sweatshirt", "uniform", "mug"].filter((p) => new RegExp(p, "i").test(text));
    const qty = (text.match(/(\d{2,5})\s*(?:pcs|pieces|units|shirts|hoodies|tees|aprons|people|staff)?/) || ["", ""])[1];
    const company = (text.match(/(?:company|organization|org|school|club)\s*[:\-]\s*([^\n]+)/i) || ["", ""])[1].trim();
    const hot = /asap|urgent|this week|next week|deadline|by (?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)/i.test(text);
    return {
      is_lead: true, name, email, phone, company, source: /instagram/i.test(text) ? "Instagram" : /form/i.test(text) ? "Website form" : "Email",
      products: prods.join(", "), quantity: qty, deadline: (text.match(/(?:by|before|deadline|event on|on)\s+([A-Z][a-z]+ \d{1,2}(?:st|nd|rd|th)?)/) || ["", ""])[1],
      budget: (text.match(/\$\s?[\d,]+/) || [""])[0], location: "", notes: "",
      summary: `${name || "This lead"} is asking about ${prods.join(", ") || "custom apparel"}${qty ? ` (about ${qty})` : ""}.`,
      score: hot ? 78 : qty ? 62 : 45, temperature: hot ? "hot" : "warm", next_action: "Approve the first email Claude wrote.",
    };
  }
  function fakeDraft(lead, kind, note) {
    const d = lead.details || {}, rep = lead.owner_id ? teamName(lead.owner_id) : "The Aurora team";
    const hi = `Hi ${first(lead.name) || "there"},`;
    const what = d.products || "custom apparel", qty = d.quantity ? ` (${d.quantity})` : "", when = d.deadline ? ` for ${d.deadline}` : "";
    let text, reason, fu = 3;
    if (kind === "reply") {
      text = `Thanks for getting back to me! I'll check the details with our team and send you a clear answer and quote today.\n\nIs there anything else you'd like included, like a second print location?`;
      reason = "Thanks them for replying and promises a quote today without guessing prices."; fu = 2;
    } else if (kind === "manual") {
      text = `${note.replace(/\.$/, "")}.\n\nLet me know what you think!`; reason = "Written from your instructions.";
    } else if (kind === "first") {
      text = `Thanks for reaching out about ${what}${qty}${when}! We'd love to help.\n\nTo put a quote together, could you share the colours and a rough size breakdown? If you send your logo, we'll make a free digital proof first.`;
      reason = "Answers their enquiry and asks only for what we still need to quote."; fu = d.deadline ? 2 : 3;
    } else {
      const ideas = [
        `A quick idea for your ${what}: a small chest logo with a bigger design on the back always looks sharp and keeps the price friendly.\n\nWould that style work for you?`,
        `We recently made ${what} for a group like yours, and the soft-blend fabric was a big hit. Happy to send photos if that helps.`,
        `To have everything ready${when || " in time"}, it's best to confirm the design 2-3 weeks before. Shall I put together a no-obligation quote?`,
        `I don't want to fill your inbox, so this is my last note for now. Whenever you're ready, just reply and we'll pick it up straight away.`,
      ];
      const n = Math.max(0, Math.min(lead.next_step - 1, ideas.length - 1));
      text = ideas[n];
      const last = n === ideas.length - 1;
      reason = last ? "A polite last email, so Claude won't follow up after this." : "Brings a new, useful idea instead of just 'checking in'.";
      fu = last ? 0 : 4;
    }
    let body = `${hi}\n\n${text}\n\n${rep}\nAurora Promotions`;
    if (note && kind !== "manual") {
      if (/short/i.test(note)) body = `${hi}\n\n${text.split("\n\n")[0]}\n\n${rep}\nAurora Promotions`;
      reason = `Rewritten as asked: "${note}".`;
    }
    const firstSent = messages.find((m) => m.lead_id === lead.id && m.direction === "out" && m.status === "sent");
    const subject = firstSent ? "Re: " + firstSent.subject.replace(/^(re:\s*)+/i, "") : `${what.replace(/^\w/, (c) => c.toUpperCase())} for ${lead.company || first(lead.name) || "you"}`;
    return { subject, body, reason, fu };
  }
  function makeDraft(leadId, kind, note) {
    const lead = leads.find((l) => l.id === leadId);
    if (!lead.email) throw new Error("This lead has no email address yet. Add one first.");
    if (lead.status === "unsubscribed") throw new Error("This lead asked us to stop emailing.");
    const all = messages.filter((m) => m.lead_id === leadId);
    const pending = all.filter((m) => m.status === "draft");
    const sentAny = all.some((m) => m.direction === "out" && m.status === "sent");
    const last = all.filter((m) => m.status === "sent" || m.status === "received").pop();
    kind = kind || (pending[0] && pending[0].kind) || (!sentAny ? "first" : last && last.direction === "in" ? "reply" : "followup");
    if (kind === "followup" && lead.next_step >= S.followup.maxFollowups) throw new Error(`We've already emailed ${lead.next_step} times without a reply. Write a custom email instead.`);
    pending.forEach((m) => { m.status = "skipped"; m.error = "Replaced by a new draft"; });
    const d = fakeDraft(lead, kind, note);
    const m = M({ lead_id: leadId, status: "draft", kind, step: lead.next_step, follow_up_days: d.fu, subject: d.subject, body: d.body, ai_subject: d.subject, ai_body: d.body, ai_reason: d.reason, created_at: now() });
    messages.push(m);
    ev(leadId, "drafted", note ? `Claude rewrote the draft: "${note}"` : `Claude wrote ${KIND[kind].toLowerCase()}.`);
    return m;
  }
  return {
    async loadAll() {
      const since = Date.now() - days(30);
      return {
        leads: leads.slice().sort((a, b) => b.updated_at.localeCompare(a.updated_at)), team, invites: [],
        drafts: messages.filter((m) => m.status === "draft"),
        inbox: messages.filter((m) => m.direction === "in" && new Date(m.created_at) > since).sort((a, b) => b.created_at.localeCompare(a.created_at)),
        playbook: settings.playbook, followup: settings.followup,
      };
    },
    async loadLead(id) { return { messages: messages.filter((m) => m.lead_id === id).sort((a, b) => a.created_at.localeCompare(b.created_at)), events: events.filter((e) => e.lead_id === id) }; },
    async updateLead(id, patch) { const l = leads.find((x) => x.id === id); Object.assign(l, patch); touch(l); },
    async deleteLead(id) { const i = leads.findIndex((x) => x.id === id); if (i >= 0) leads.splice(i, 1); },
    async saveDraft(id, patch) { Object.assign(messages.find((m) => m.id === id), patch); },
    async addNote(leadId, text) { messages.push(M({ lead_id: leadId, direction: "note", status: "note", kind: "note", step: null, body: text, created_at: now() })); },
    async logEvent(leadId, type, text) { ev(leadId, type, text); },
    async saveSettings(id, data) { settings[id] = data; },
    async invite(row) { team.push({ id: uid(), email: row.email, display_name: row.display_name, title: row.title, role: row.role, active: true, joined_at: now() }); },
    async removeInvite() {},
    async updateMember(id, patch) { Object.assign(team.find((t) => t.id === id), patch); },
    async ai(action, p) {
      await wait(900 + Math.random() * 700);
      if (action === "read") return { lead: fakeRead(p.text) };
      if (action === "create") {
        const f = p.fields, id = uid();
        const owner = p.ownerId !== undefined ? p.ownerId : team.map((t) => [t.id, leads.filter((l) => l.owner_id === t.id && OPEN.includes(l.status)).length]).sort((a, b) => a[1] - b[1])[0][0];
        const lead = L({ id, name: f.name || "", email: (f.email || "").toLowerCase(), phone: f.phone || "", company: f.company || "", source: f.source || "", status: "new", owner_id: owner || null,
          score: f.score || 50, temperature: f.temperature || "warm", summary: f.summary || "", next_action: f.next_action || "", created_at: now(), next_due_at: now(),
          details: { products: f.products || "", quantity: f.quantity || "", deadline: f.deadline || "", budget: f.budget || "", location: f.location || "", notes: f.notes || "", enquiry: p.enquiry || "" } });
        leads.unshift(lead);
        ev(id, "created", `New lead from ${lead.source || "an enquiry"}.`);
        const draft = p.draftNow !== false && lead.email ? makeDraft(id) : null;
        return { lead, duplicate: false, draft };
      }
      if (action === "draft") return { draft: makeDraft(p.leadId, p.kind, p.note) };
      if (action === "reply") {
        const lead = leads.find((l) => l.id === p.leadId), t = p.text.toLowerCase();
        const intent = /stop|unsubscribe|remove me/.test(t) ? "unsubscribe" : /out of (the )?office|away until/.test(t) ? "out_of_office" : /not interested|no thanks|went with/.test(t) ? "not_interested" : /price|quote|cost|how much/.test(t) ? "wants_quote" : /call|meet|phone/.test(t) ? "wants_call" : /\?/.test(t) ? "question" : "interested";
        const statusFor = { unsubscribe: "unsubscribed", not_interested: "lost", wants_quote: "quoted", wants_call: "meeting" }[intent] || "replied";
        const a = { intent, summary: p.text.split(/[.!?\n]/)[0].slice(0, 140), mood: intent === "not_interested" || intent === "unsubscribe" ? "negative" : "positive", needs_answer: !["unsubscribe", "not_interested", "out_of_office"].includes(intent), next_action: intent === "wants_quote" ? "Send the quote today." : "Approve Claude's answer.", score: intent === "wants_quote" ? 85 : 60, temperature: intent === "wants_quote" ? "hot" : "warm" };
        const msg = M({ lead_id: lead.id, direction: "in", status: "received", kind: "inbound", step: null, follow_up_days: null, subject: "Reply", body: p.text, ai: a, created_at: now() });
        messages.push(msg);
        messages.filter((m) => m.lead_id === lead.id && m.status === "draft" && (m.kind === "followup" || m.kind === "first")).forEach((m) => { m.status = "skipped"; m.error = "The client replied"; });
        Object.assign(lead, { status: intent === "out_of_office" ? lead.status : statusFor, last_reply_at: now(), score: a.score, temperature: a.temperature, next_action: a.next_action, next_step: intent === "out_of_office" ? lead.next_step : 0, next_due_at: intent === "out_of_office" ? new Date(Date.now() + days(7)).toISOString() : null });
        touch(lead);
        ev(lead.id, "reply", "Replied: " + a.summary);
        const draft = a.needs_answer ? makeDraft(lead.id, "reply") : null;
        return { message: msg, analysis: a, draft };
      }
      if (action === "insight") {
        const lead = leads.find((l) => l.id === p.leadId);
        const i = { summary: lead.summary || "A new enquiry.", score: lead.score, temperature: lead.temperature, next_action: lead.status === "replied" ? "Answer their reply today." : "Nothing urgent. Claude will write when it's time." };
        Object.assign(lead, i); touch(lead); ev(lead.id, "insight", "Claude refreshed the summary and next step.");
        return { insight: i };
      }
      if (action === "ask") {
        const open = leads.filter((l) => OPEN.includes(l.status)).sort((a, b) => b.score - a.score);
        const top = open.slice(0, 4);
        return { answer: `(Demo answer. In the live system Claude reads all your leads to answer this.)\n\nYour top open leads right now:\n${top.map((l) => `- ${l.name} (${l.company}): ${STATUS[l.status]}. ${l.next_action}`).join("\n")}`, lead_ids: top.map((l) => l.id) };
      }
      throw new Error("Unknown action");
    },
    async send(id, subject, body, followUpDays) {
      await wait(700);
      const m = messages.find((x) => x.id === id), lead = leads.find((l) => l.id === m.lead_id);
      const fu = followUpDays ?? m.follow_up_days ?? 3;
      Object.assign(m, { status: "sent", subject, body, sent_at: now(), approved_by: S.me.id, follow_up_days: fu });
      lead.last_contact_at = now();
      const count = lead.next_step + 1, max = S.followup.maxFollowups;
      lead.next_step = fu === 0 ? Math.max(count, max) : count;
      if (lead.status === "new" || lead.status === "finished") lead.status = "following";
      if (OPEN.includes(lead.status)) lead.next_due_at = new Date(Date.now() + days(fu === 0 || count >= max ? 7 : fu)).toISOString();
      touch(lead);
      ev(lead.id, "sent", `${S.me.display_name} approved and sent "${subject}" (demo: not really sent).`);
      return { ok: true };
    },
  };
})();

let API = Cloud;

/* ================= loading ================= */
async function reload() {
  try {
    const d = await API.loadAll();
    Object.assign(S, {
      leads: d.leads, drafts: d.drafts, inbox: d.inbox, team: d.team, invites: d.invites,
      playbook: { ...DEFAULT_PLAYBOOK, ...(d.playbook || {}) }, followup: { ...DEFAULT_FOLLOWUP, ...(d.followup || {}) },
      loaded: true, loadErr: "", needsSetup: false,
    });
    const me = S.team.find((t) => S.me && t.id === S.me.id);
    if (me) S.me = me;
    if (S.route === "lead" && S.leadId) await reloadLead();
  } catch (e) {
    console.error(e);
    if (/does not exist|schema cache|PGRST205|42P01/i.test((e && (e.message || e.code)) || "")) S.needsSetup = true;
    else S.loadErr = "Couldn't load the sales data. Check your connection and reload.";
    S.loaded = true;
  }
  render();
}
async function reloadLead() {
  if (!S.leadId) return;
  const d = await API.loadLead(S.leadId);
  S.lead = { id: S.leadId, ...d };
}
let reloadTimer = null, pendingRender = false;
function scheduleReload() { clearTimeout(reloadTimer); reloadTimer = setTimeout(reload, 400); }

/* ================= rendering ================= */
function rerender() { render.force = true; render(); }
function render() {
  // Don't wipe what someone is typing; redraw when they leave the field.
  const a = document.activeElement;
  if (a && /^(TEXTAREA|INPUT|SELECT)$/.test(a.tagName) && a.closest("#root") && S.mode !== "login" && S.loaded && !render.force) { pendingRender = true; return; }
  render.force = false; pendingRender = false;
  const root = $("#root");
  if (S.mode === "login") { renderLogin(); return; }
  if (!S.loaded) { root.innerHTML = `<p style="padding:24px">Loading Aurora Sales…</p>`; return; }
  const myDrafts = S.drafts.filter((m) => canApprove(leadById(m.lead_id))).length;
  const nav = [["today", "☀", "Today", myDrafts], ["leads", "◎", "Leads"], ["add", "+", "Add lead"], ["ask", "✦", "Ask Claude"], ["settings", "⚙", "Settings"]];
  const active = S.route === "lead" ? "leads" : S.route;
  root.innerHTML = `<div class="app">
    <aside class="side">
      <div class="brand"><img src="logo.png" alt=""><div><b>Aurora Sales</b><small>Powered by Claude</small></div></div>
      ${nav.map(([r, ic, t, ct]) => `<button class="nav-btn ${active === r ? "on" : ""}" data-go="${r}"><span class="ic" aria-hidden="true">${ic}</span>${t}${ct ? `<span class="ct">${ct}</span>` : ""}</button>`).join("")}
      <div class="side-foot">
        <button class="btn sm ghost ${active === "help" ? "on" : ""}" data-go="help" style="justify-content:flex-start;padding-left:0">? How it works</button>
        <span class="who">${esc(S.me ? (S.me.display_name || S.me.email) : "")}${isManager() ? " · Manager" : ""}</span>
        ${S.mode === "demo" ? `<span>Demo mode</span>` : `<button class="btn sm ghost" data-act="signout" style="justify-content:flex-start;padding-left:0">Sign out</button>`}</div>
    </aside>
    <main class="main"><div class="page">${banner()}${page()}</div></main></div>`;
  afterRender();
}
function banner() {
  if (S.mode === "demo") return `<div class="banner">Demo: sample leads and a simulated Claude. Nothing is saved or sent. <button class="btn sm ghost" data-go="help">How it works</button></div>`;
  if (S.loadErr) return `<div class="banner bad">${esc(S.loadErr)} <button class="btn sm" data-act="reload">Try again</button></div>`;
  return "";
}
function page() {
  if (S.needsSetup) return setupPage();
  switch (S.route) {
    case "leads": return leadsPage();
    case "lead": return leadPage();
    case "add": return addPage();
    case "ask": return askPage();
    case "settings": return settingsPage();
    case "help": return helpPage();
    default: return todayPage();
  }
}
function afterRender() {
  document.querySelectorAll("textarea[data-autogrow]").forEach((t) => { t.style.height = "auto"; t.style.height = Math.min(600, t.scrollHeight + 4) + "px"; });
  if (S.focus) { const el = $(S.focus); if (el) el.focus(); S.focus = null; }
}

/* ---------- Today ---------- */
function todayPage() {
  const name = S.me ? first(S.me.display_name) : "";
  const hour = new Date().getHours();
  const greet = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  const all = S.drafts.filter((m) => leadById(m.lead_id));
  const mine = all.filter((m) => canApprove(leadById(m.lead_id)));
  const shown = (S.allDrafts ? all : mine).slice().sort((a, b) => (b.kind === "reply") - (a.kind === "reply") || a.created_at.localeCompare(b.created_at));
  const week = Date.now() - days(7);
  const replies = S.inbox.filter((m) => new Date(m.created_at) > week);
  const hot = S.leads.filter((l) => OPEN.includes(l.status) && l.temperature === "hot");
  return `<div class="head"><div><h1>${greet}${name ? ", " + esc(name) : ""}</h1><p>Claude wrote these emails for you. Read each one, change anything you like, and approve.</p></div></div>
    <div class="tiles">
      <button class="tile ${mine.length ? "alert" : ""}" data-act="scroll" data-to="#drafts"><div class="n">${mine.length}</div><div class="t">To approve</div></button>
      <button class="tile" data-act="scroll" data-to="#replies"><div class="n">${replies.length}</div><div class="t">Replies this week</div></button>
      <button class="tile" data-go="leads"><div class="n">${hot.length}</div><div class="t">Hot leads</div></button>
    </div>
    <div class="ai-box" style="margin-top:14px">
      ${!S.brief ? `<div class="row"><span class="grow">✦ Not sure where to start? Claude can plan your day.</span><button class="btn sm ai" data-act="brief" style="background:var(--surface)">Plan my day</button></div>`
        : S.brief === "…" ? `<p class="thinking">Claude is reading your leads</p>` : `<div class="ai-t">✦ Your plan for today</div><p>${esc(S.brief.answer)}</p>${leadChips(S.brief.lead_ids)}`}
    </div>
    <div class="sec" id="drafts"><h2>To approve</h2>
      ${all.length !== mine.length ? `<button class="btn sm ghost" data-act="drafts-toggle">${S.allDrafts ? "Show only mine" : `Show everyone's (${all.length})`}</button>` : ""}</div>
    ${shown.length ? shown.map((m) => draftCard(m, leadById(m.lead_id), true)).join("") : `<div class="card empty"><b>All caught up ✓</b>When it's time to write to a lead again, Claude drafts the email and it shows up here.</div>`}
    <div class="sec" id="replies"><h2>Latest replies</h2></div>
    ${replies.length ? `<div class="tbl">${replies.slice(0, 10).map(replyRow).join("")}</div>` : `<div class="card empty"><b>No replies this week yet</b>When a client answers, Claude reads it and writes an answer for you to approve.</div>`}`;
}
function replyRow(m) {
  const l = leadById(m.lead_id); if (!l) return "";
  const a = m.ai || {};
  return `<div class="lrow rrow" data-lead="${l.id}">
    <div class="lname">${esc(l.name || l.email)}<small>${esc(l.company)}</small></div>
    <div class="lnext">${a.intent ? pill(INTENT[a.intent] || a.intent, a.mood === "negative" ? "bad" : "cold") + " " : ""}${esc(a.summary || m.body.slice(0, 160))}</div><div class="ldate">${ago(m.created_at)}</div></div>`;
}
function leadChips(ids) {
  const ls = (ids || []).map(leadById).filter(Boolean);
  return ls.length ? `<div class="chips" style="margin-top:10px">${ls.map((l) => `<button class="chip" data-lead="${l.id}">${esc(l.name || l.email)}${l.company ? " · " + esc(l.company) : ""}</button>`).join("")}</div>` : "";
}

/* ---------- a draft waiting for approval ---------- */
function draftCard(m, lead, showLead) {
  if (!lead) return "";
  const e = S.edits[m.id] || {};
  const subject = e.subject ?? m.subject, body = e.body ?? m.body;
  const fu = e.followUpDays ?? m.follow_up_days ?? S.followup.defaultDays;
  const busy = S.busy[m.id], err = S.errs[m.id] || m.error;
  const allowed = canApprove(lead);
  const sending = S.confirmSend === m.id;
  const choices = [...new Set([...DAY_CHOICES, fu].filter((n) => n > 0))].sort((a, b) => a - b);
  return `<div class="card draft" data-draft="${m.id}">
    <div class="draft-top">
      <div class="who">${showLead ? `<b data-lead="${lead.id}">${esc(lead.name || lead.email)}</b>` : `<b style="cursor:default">Next email</b>`}
        <small>${esc(showLead ? [lead.company, KIND[m.kind] || "Email"].filter(Boolean).join(" · ") : `${KIND[m.kind] || "Email"} to ${lead.email}`)}</small></div>
      ${showLead ? tempPill(lead.temperature) : ""}
    </div>
    ${m.ai_reason ? `<div class="why">✦ ${esc(m.ai_reason)}</div>` : ""}
    <input class="inp subj" aria-label="Subject" data-edit="subject" data-id="${m.id}" value="${esc(subject)}">
    <textarea class="inp" aria-label="Message" style="margin-top:8px" data-edit="body" data-id="${m.id}" data-autogrow>${esc(body)}</textarea>
    <div class="fu"><span>If they don't reply, Claude writes again</span>
      <select class="inp" aria-label="When to follow up" data-edit="followUpDays" data-id="${m.id}">
        ${choices.map((n) => `<option value="${n}" ${n === fu ? "selected" : ""}>in ${daysText(n)}</option>`).join("")}
        <option value="0" ${fu === 0 ? "selected" : ""}>never (last email)</option></select></div>
    ${err ? `<div class="err">${esc(err)}</div>` : ""}
    <div class="acts">
      ${!allowed ? `<span class="hint">Only ${esc(teamName(lead.owner_id))} or a manager can approve this.</span>`
        : sending
        ? `<button class="btn ok" data-act="send-yes" data-id="${m.id}" ${busy ? "disabled" : ""}>${busy === "send" ? "Sending…" : `Send to ${esc(lead.email)}`}</button><button class="btn ghost" data-act="send-no">Cancel</button>`
        : `<button class="btn ok" data-act="approve" data-id="${m.id}" ${busy ? "disabled" : ""}>✓ Approve &amp; send</button>
           <button class="btn ai" data-act="rw-open" data-id="${m.id}" ${busy ? "disabled" : ""}>${busy === "rw" ? "Rewriting…" : "✦ Rewrite"}</button>
           <span class="sp"></span><button class="btn ghost sm" data-act="skip" data-id="${m.id}" ${busy ? "disabled" : ""}>Don't send</button>`}
    </div>
    ${S.rw === m.id ? `<div class="rewrite"><div class="row"><input class="inp grow" id="rwn-${m.id}" placeholder="What should Claude change? e.g. Mention we can embroider the caps" maxlength="500"><button class="btn primary" data-act="rw-go" data-id="${m.id}">Rewrite</button></div>
      <div class="chips">${REWRITE_CHIPS.map((c) => `<button class="chip" data-act="rw-chip" data-id="${m.id}" data-note="${esc(c)}">${esc(c)}</button>`).join("")}</div></div>` : ""}
  </div>`;
}

/* ---------- Leads ---------- */
function leadsPage() {
  const q = S.search.trim().toLowerCase();
  const base = S.leads.filter((l) => (!S.mineOnly || (S.me && l.owner_id === S.me.id)) && (!q || [l.name, l.email, l.company, l.summary, l.source].join(" ").toLowerCase().includes(q)));
  const tab = TABS.find((t) => t[0] === S.tab) || TABS[0];
  const list = base.filter(tab[2]).sort((a, b) => (b.temperature === "hot") - (a.temperature === "hot") || b.score - a.score);
  return `<div class="head"><div><h1>Leads</h1><p>Everyone who has asked about an order, and what to do next.</p></div><button class="btn primary" data-go="add">+ Add lead</button></div>
    <div class="row" style="margin-bottom:12px">
      <input class="inp grow" id="search" placeholder="Search…" value="${esc(S.search)}" style="max-width:320px">
      <button class="chip ${S.mineOnly ? "on" : ""}" data-act="mine">My leads only</button>
    </div>
    <div class="tabs">${TABS.map(([k, label, f]) => `<button class="tab ${S.tab === k ? "on" : ""}" data-act="tab" data-tab="${k}">${label}<span>${base.filter(f).length}</span></button>`).join("")}</div>
    <div class="tbl">
      ${list.length ? list.map(leadRow).join("") : `<div class="empty"><b>No leads here</b>${S.leads.length ? "Try another tab or clear the search." : "Add your first lead, or connect your website form so leads arrive on their own."}</div>`}
    </div>`;
}
function nextText(l) {
  const draft = S.drafts.find((m) => m.lead_id === l.id);
  if (draft) return pill("To approve", "ai");
  if (l.status === "paused") return `<span class="ldate">Paused</span>`;
  if (OPEN.includes(l.status) && l.next_due_at) return `<span class="ldate">Next email ${inFuture(l.next_due_at)}</span>`;
  return `<span class="ldate">${l.last_contact_at ? "Last email " + ago(l.last_contact_at) : ""}</span>`;
}
function leadRow(l) {
  return `<div class="lrow" data-lead="${l.id}">
    <div class="lname">${esc(l.name || l.email || "(no name)")} ${l.temperature === "hot" ? pill("Hot", "hot") : ""}<small>${esc([l.company, teamName(l.owner_id)].filter(Boolean).join(" · "))}</small></div>
    <div>${statusPill(l.status)}</div>
    <div class="lnext">${esc(l.next_action || l.summary)}</div><div>${nextText(l)}</div></div>`;
}

/* ---------- One lead ---------- */
function leadPage() {
  const l = leadById(S.leadId);
  if (!l) return `<div class="card empty"><b>Lead not found</b>It may have been deleted. <button class="btn sm" data-go="leads">Back to leads</button></div>`;
  const d = l.details || {};
  const data = S.lead && S.lead.id === l.id ? S.lead : null;
  const draft = data ? data.messages.find((m) => m.status === "draft") : S.drafts.find((m) => m.lead_id === l.id);
  const b = S.busy.lead;
  return `<button class="btn ghost sm" data-go="leads" style="margin-bottom:10px">← Leads</button>
  <div class="card" style="margin-bottom:14px"><div class="lead-h">
    <div class="avatar">${esc(initials(l))}</div>
    <div class="grow"><h1>${esc(l.name || l.email || "(no name)")}</h1><div class="sub">${esc([l.company, l.email, l.phone].filter(Boolean).join(" · "))}</div>
      <div class="row" style="margin-top:8px">${statusPill(l.status)} ${tempPill(l.temperature)}</div></div>
    <div class="row">
      <select class="inp" id="l-status" aria-label="Status">${Object.entries(STATUS).map(([k, v]) => `<option value="${k}" ${l.status === k ? "selected" : ""}>${v}</option>`).join("")}</select>
      <select class="inp" id="l-owner" aria-label="Owner"><option value="">Unassigned</option>${S.team.filter((t) => t.active || t.id === l.owner_id).map((t) => `<option value="${t.id}" ${l.owner_id === t.id ? "selected" : ""}>${esc(t.display_name || t.email)}</option>`).join("")}</select>
    </div></div></div>
  <div class="split">
    <div>
      <div class="card"><div class="card-h"><h2>✦ Claude's view</h2><button class="btn sm ghost" data-act="insight" ${b ? "disabled" : ""}>${b === "insight" ? "Thinking…" : "Refresh"}</button></div>
        <p style="margin:0">${esc(l.summary || "No summary yet. Click Refresh.")}</p>
        ${l.next_action ? `<p style="margin:10px 0 0"><b>Next step:</b> ${esc(l.next_action)}</p>` : ""}</div>
      <div class="card"><div class="card-h"><h2>Next email</h2></div>${nextEmailCard(l, draft)}</div>
      <div class="card"><div class="card-h"><h2>Details</h2><button class="btn sm ghost" data-act="edit-details">${S.editDetails ? "Cancel" : "Edit"}</button></div>
        ${S.editDetails ? detailsForm(l) : `<dl class="kv">
          ${[["Wants", d.products], ["Quantity", d.quantity], ["Deadline", d.deadline], ["Budget", d.budget], ["Location", d.location], ["Deal value", l.value != null ? "$" + Number(l.value).toLocaleString() : ""], ["Notes", d.notes], ["Came from", l.source], ["Added", fmtDate(l.created_at)]]
            .filter(([, v]) => v).map(([k, v]) => `<dt>${k}</dt><dd>${esc(v)}</dd>`).join("") || `<dt>–</dt><dd>No details yet.</dd>`}</dl>
          ${d.enquiry ? `<details style="margin-top:10px"><summary class="hint">Their original message</summary><div class="msg" style="margin-top:6px"><div class="mb">${esc(d.enquiry)}</div></div></details>` : ""}`}
      </div>
    </div>
    <div>
      <div class="card" style="margin-bottom:12px"><div class="row">
        <button class="btn ai" data-act="panel" data-p="custom" ${b ? "disabled" : ""}>✦ Write an email</button>
        <button class="btn" data-act="panel" data-p="reply">Log a reply</button>
        <button class="btn" data-act="panel" data-p="note">Add note</button></div>
        ${panel(b)}
      </div>
      ${draft ? draftCard(draft, l, false) : ""}
      <div class="sec"><h2>Conversation</h2></div>
      ${data ? timeline(data, l) : `<p class="thinking">Loading</p>`}
    </div>
  </div>`;
}
function nextEmailCard(l, draft) {
  const b = S.busy.lead, max = S.followup.maxFollowups;
  if (draft) return `<p class="hint" style="margin:0">Claude has written it. It's waiting for approval.</p>`;
  if (l.status === "paused") return `<p class="hint" style="margin:0 0 10px">Paused. Claude won't write to them until you resume.</p><button class="btn sm" data-act="resume">Resume</button>`;
  if (["won", "lost", "unsubscribed"].includes(l.status)) return `<p class="hint" style="margin:0">No more emails: this lead is marked “${STATUS[l.status]}”.</p>`;
  if (l.status === "finished") return `<p class="hint" style="margin:0 0 10px">No reply after ${l.next_step} emails, so Claude stopped.</p><button class="btn sm ai" data-act="panel" data-p="custom">✦ Try once more</button>`;
  const due = l.next_due_at && OPEN.includes(l.status);
  const limit = l.next_step >= max;
  const line = due
    ? (limit ? `That was the last email. If there's no reply by <b>${fmtDay(l.next_due_at)}</b>, the lead closes as “No reply”.` : `If they don't reply, Claude writes again <b>${inFuture(l.next_due_at)}</b> (${fmtDay(l.next_due_at)}).`)
    : ["replied", "meeting", "quoted"].includes(l.status) ? "They replied. Claude writes when you ask." : "Nothing planned.";
  return `<p style="margin:0 0 10px">${line}</p>
    <div class="row">${!limit && l.email ? `<button class="btn sm ai" data-act="draft-now" ${b ? "disabled" : ""}>${b === "draft" ? "Claude is writing…" : "✦ Write it now"}</button>` : ""}
    ${OPEN.includes(l.status) ? `<button class="btn sm ghost" data-act="pause">Pause</button>` : ""}</div>`;
}
function panel(b) {
  if (!S.panel) return "";
  const cfg = {
    custom: ["What should it say? Leave empty and Claude decides.", "e.g. Offer a call on Thursday to go over designs", b === "draft" ? "Writing…" : "Write it", 1000],
    reply: ["Paste what they said (an email, a text, or notes from a call). Claude reads it and writes an answer.", "Their reply…", b === "reply" ? "Reading…" : "Save", 20000],
    note: ["A note for the team. Claude reads it for context but never quotes it.", "e.g. Called her, she prefers navy. Budget about $15 a shirt.", "Save note", 4000],
  }[S.panel];
  return `<div class="rewrite"><div class="lbl">${cfg[0]}</div><textarea class="inp" id="p-text" placeholder="${esc(cfg[1])}" maxlength="${cfg[3]}"></textarea>
    <div class="row"><button class="btn primary" data-act="panel-go" ${b ? "disabled" : ""}>${cfg[2]}</button><button class="btn ghost" data-act="panel" data-p="">Cancel</button></div></div>`;
}
function detailsForm(l) {
  const d = l.details || {};
  const f = (id, label, v, type) => `<div class="field"><label for="f-${id}">${label}</label><input class="inp" id="f-${id}" ${type ? `type="${type}"` : ""} value="${esc(v ?? "")}"></div>`;
  return `<div class="fields">${f("name", "Name", l.name)}${f("email", "Email", l.email, "email")}${f("phone", "Phone", l.phone)}${f("company", "Company", l.company)}
    ${f("products", "What they want", d.products)}${f("quantity", "Quantity", d.quantity)}${f("deadline", "Deadline", d.deadline)}${f("value", "Deal value ($)", l.value, "number")}</div>
    <div class="field" style="margin-top:12px"><label for="f-notes">Notes</label><textarea class="inp" id="f-notes">${esc(d.notes || "")}</textarea></div>
    <div class="row" style="margin-top:12px"><button class="btn primary" data-act="save-details">Save</button><span class="grow"></span>
      ${isManager() ? (S.confirmDelete ? `<span class="hint">Delete for good?</span><button class="btn sm danger" data-act="delete-yes">Yes, delete</button><button class="btn sm ghost" data-act="delete-no">No</button>` : `<button class="btn sm ghost danger" data-act="delete-lead">Delete lead</button>`) : ""}</div>`;
}
function timeline(data, l) {
  const items = data.messages.filter((m) => m.status !== "draft" && m.status !== "skipped").map((m) => ({ t: m.sent_at || m.created_at, m })).sort((a, b) => b.t.localeCompare(a.t));
  if (!items.length) return `<div class="card empty"><b>No emails yet</b>Emails, replies and notes will appear here.</div>`;
  return `<div class="tl">${items.map(({ m }) => {
    if (m.direction === "note") return `<div class="msg note"><div class="mh"><b>Note</b> · ${esc(teamName(m.created_by))} · ${ago(m.created_at)}</div><div class="mb">${esc(m.body)}</div></div>`;
    if (m.direction === "in") {
      const a = m.ai || {};
      return `<div class="msg in"><div class="mh"><b>${esc(first(l.name) || "Client")} replied</b> · ${fmtDate(m.created_at)}</div>
        ${a.summary ? `<div class="hint" style="color:var(--ai);margin-bottom:6px">✦ ${esc(a.summary)}</div>` : ""}<div class="mb">${esc(m.body)}</div></div>`;
    }
    return `<div class="msg ${m.status}"><div class="mh"><b>${esc(m.subject || "(no subject)")}</b>${m.status === "failed" ? pill("Failed", "bad") : ""}</div>
      <div class="hint" style="margin-bottom:6px">Sent ${fmtDate(m.sent_at)}${m.approved_by ? " · approved by " + esc(teamName(m.approved_by)) : ""}</div>
      <details><summary>Show email</summary><div class="mb" style="margin-top:6px">${esc(m.body)}</div></details></div>`;
  }).join("")}</div>`;
}

/* ---------- Add lead ---------- */
function addPage() {
  const a = S.add, p = a.parsed, b = S.busy.add;
  const f = (k, label, type) => `<div class="field"><label for="a-${k}">${label}</label><input class="inp" id="a-${k}" data-add="${k}" ${type ? `type="${type}"` : ""} value="${esc(p ? p[k] : "")}"></div>`;
  return `<div class="head"><div><h1>Add a lead</h1><p>Paste their email, a form, a text message or your call notes. Claude fills in the rest.</p></div></div>
  <div class="card">
    <textarea class="inp" id="a-text" aria-label="Enquiry" style="min-height:150px" placeholder="Paste here…">${esc(a.text)}</textarea>
    <div class="row" style="margin-top:10px"><button class="btn ai" data-act="add-read" ${b ? "disabled" : ""}>${b === "read" ? "Claude is reading…" : "✦ Read with Claude"}</button>
    ${p ? "" : `<button class="btn ghost" data-act="add-manual">Type it in myself</button>`}</div></div>
  ${p ? `<div class="card">
    ${p.summary ? `<div class="ai-box" style="margin-bottom:14px"><p>✦ ${esc(p.summary)}</p>${p.is_lead === false ? `<p style="margin-top:6px;color:var(--danger)">Claude thinks this may not be a real sales enquiry.</p>` : ""}</div>` : ""}
    <div class="fields">${f("name", "Name")}${f("email", "Email", "email")}${f("phone", "Phone")}${f("company", "Company")}${f("products", "What they want")}${f("quantity", "Quantity")}${f("deadline", "Deadline")}</div>
    <div class="field" style="margin-top:12px"><label for="a-notes">Notes</label><textarea class="inp" id="a-notes" data-add="notes">${esc(p.notes || "")}</textarea></div>
    <div class="row" style="margin-top:14px">
      <label class="lbl" for="a-owner">Give to</label><select class="inp" id="a-owner"><option value="auto">Automatic</option><option value="">Nobody yet</option>${S.team.filter((t) => t.active).map((t) => `<option value="${t.id}" ${a.ownerId === t.id ? "selected" : ""}>${esc(t.display_name || t.email)}</option>`).join("")}</select>
      <label class="row" style="gap:6px;font-weight:550"><input type="checkbox" id="a-draft" ${a.draftNow ? "checked" : ""}> Claude writes the first email now</label>
    </div>
    <div class="row" style="margin-top:14px"><button class="btn primary" data-act="add-save" ${b ? "disabled" : ""}>${b === "save" ? "Saving…" : "Save lead"}</button></div>
  </div>` : ""}`;
}

/* ---------- Ask Claude ---------- */
function askPage() {
  return `<div class="head"><div><h1>Ask Claude</h1><p>Ask anything about your leads. Claude looks at all of them to answer.</p></div></div>
  <div class="card"><div class="row"><input class="inp grow" id="ask-q" placeholder="Type a question…" maxlength="2000"><button class="btn primary" data-act="ask-go" ${S.busy.ask ? "disabled" : ""}>Ask</button></div>
    <div class="chips" style="margin-top:12px">${ASK_PRESETS.map((q) => `<button class="chip" data-act="ask-preset" data-q="${esc(q)}">${esc(q)}</button>`).join("")}</div></div>
  <div class="qa" style="margin-top:16px">${S.chat.slice().reverse().map((c) => `<div class="q">${esc(c.q)}</div>${c.a ? `<div class="a">${esc(c.a.answer)}${leadChips(c.a.lead_ids)}</div>` : c.err ? `<div class="a" style="color:var(--danger)">${esc(c.err)}</div>` : `<div class="a thinking">Claude is reading your leads</div>`}`).join("")}</div>`;
}

/* ---------- Settings (how Claude writes + team) ---------- */
function settingsPage() {
  return `<div class="head"><div><h1>Settings</h1><p>${isManager() ? "What Claude knows about Aurora, and who's on the team." : "Only managers can change these."}</p></div></div>
    <div class="tabs"><button class="tab ${S.settingsTab === "playbook" ? "on" : ""}" data-act="stab" data-t="playbook">How Claude writes</button><button class="tab ${S.settingsTab === "team" ? "on" : ""}" data-act="stab" data-t="team">Team</button></div>
    ${S.settingsTab === "team" ? teamSection() : playbookSection()}`;
}
function playbookSection() {
  const mgr = isManager();
  const pb = S.pbDraft || { playbook: { ...S.playbook }, followup: { ...S.followup } };
  S.pbDraft = pb;
  const p = pb.playbook, ro = mgr ? "" : "disabled";
  const ta = (k, label, hint, rows) => `<div class="field"><label for="pb-${k}">${label}</label><textarea class="inp" id="pb-${k}" data-pb="${k}" rows="${rows || 3}" ${ro}>${esc(p[k] || "")}</textarea>${hint ? `<span class="hint">${hint}</span>` : ""}</div>`;
  const inp = (k, label, hint) => `<div class="field"><label for="pb-${k}">${label}</label><input class="inp" id="pb-${k}" data-pb="${k}" value="${esc(p[k] || "")}" ${ro}>${hint ? `<span class="hint">${hint}</span>` : ""}</div>`;
  const cfg = window.AURORA_SALES_CONFIG || {};
  return `<div class="grid2">
    <div class="card stack"><h2>About Aurora</h2>
      ${inp("company", "Company name")}
      ${ta("about", "Who we are", "A sentence or two Claude can use.")}
      ${ta("offer", "What we offer", "One per line.", 4)}
      ${inp("quoteLink", "Quote form link (optional)")}
    </div>
    <div class="card stack"><h2>Style</h2>
      ${ta("tone", "Tone of voice", "", 2)}
      ${ta("rules", "Rules Claude must follow", "One per line.", 4)}
      ${ta("signature", "Signature", "{rep_name} becomes the salesperson's name.", 2)}
      ${inp("optOut", "Last line of every email", "Lets people opt out. Added automatically.")}
    </div>
  </div>
  <div class="card stack" style="margin-top:14px"><h2>Follow-ups</h2>
    <p class="hint" style="margin:0">There's no fixed schedule. Claude decides what to write and when to check in, one email at a time, based on each conversation. You approve every email and can change the timing.</p>
    <div class="row"><label class="lbl" for="pb-max">Stop after</label><input class="inp" id="pb-max" type="number" min="1" max="20" style="width:70px" value="${esc(pb.followup.maxFollowups)}" ${ro}><span class="hint">emails in a row with no reply</span></div>
    <div class="row"><label class="lbl" for="pb-assign">New leads go to</label><select class="inp" id="pb-assign" data-pb="assign" ${ro}>
      <option value="round_robin" ${p.assign === "round_robin" ? "selected" : ""}>Whoever has the fewest open leads</option>
      <option value="none" ${p.assign === "none" ? "selected" : ""}>Nobody (anyone can pick them up)</option>
      ${S.team.filter((t) => t.active).map((t) => `<option value="${t.id}" ${p.assign === t.id ? "selected" : ""}>${esc(t.display_name || t.email)}</option>`).join("")}</select></div>
  </div>
  ${mgr ? `<div class="row" style="margin-top:14px"><button class="btn primary" data-act="pb-save">Save</button><button class="btn ghost" data-act="pb-reset">Undo changes</button></div>
    <details style="margin-top:18px"><summary class="hint">Connecting your website form</summary><p class="hint">Send new enquiries to <code>${esc((cfg.supabaseUrl || "https://YOUR-PROJECT.supabase.co") + "/functions/v1/sales-intake")}</code> with the header <code>x-intake-key</code>. Steps are in <code>aurora-sales/README.md</code>.</p></details>` : ""}`;
}
function teamSection() {
  const mgr = isManager();
  return `<div class="tbl">${S.team.map((t) => {
    const open = S.leads.filter((l) => l.owner_id === t.id && OPEN.includes(l.status)).length;
    const won = S.leads.filter((l) => l.owner_id === t.id && l.status === "won").length;
    return `<div class="lrow trow">
      <div class="lname">${esc(t.display_name || t.email)}${S.me && t.id === S.me.id ? " (you)" : ""}<small>${esc(t.email)}</small></div>
      <div>${t.active ? pill(t.role === "manager" ? "Manager" : "Sales rep", t.role === "manager" ? "brand" : "") : pill("No access", "bad")}</div>
      <div class="ldate">${open} open · ${won} won</div>
      <div class="row" style="justify-content:flex-end">${mgr && S.me && t.id !== S.me.id ? `
        <button class="btn sm ghost" data-act="role" data-id="${t.id}" data-role="${t.role === "manager" ? "rep" : "manager"}">${t.role === "manager" ? "Make rep" : "Make manager"}</button>
        <button class="btn sm ghost ${t.active ? "danger" : ""}" data-act="access" data-id="${t.id}" data-on="${t.active ? "0" : "1"}">${t.active ? "Remove" : "Restore"}</button>` : ""}</div></div>`;
  }).join("")}</div>
  ${mgr ? `<div class="card" style="margin-top:16px"><h2 style="margin-bottom:10px">Add someone</h2>
    <div class="fields"><div class="field"><label for="i-email">Email</label><input class="inp" id="i-email" type="email"></div>
      <div class="field"><label for="i-name">Name</label><input class="inp" id="i-name"></div>
      <div class="field"><label for="i-role">Role</label><select class="inp" id="i-role" style="width:100%"><option value="rep">Sales rep</option><option value="manager">Manager</option></select></div></div>
    <div class="row" style="margin-top:12px"><button class="btn primary" data-act="invite">Add</button><span class="hint">They sign in with a code sent to their email.</span></div>
    ${S.invites.length ? `<div class="sec"><h2>Not signed in yet</h2></div>${S.invites.map((i) => `<div class="row" style="padding:6px 0"><span class="grow">${esc(i.display_name || i.email)} <span class="hint">${esc(i.email)}</span></span><button class="btn sm ghost danger" data-act="uninvite" data-email="${esc(i.email)}">Remove</button></div>`).join("")}` : ""}
  </div>` : ""}
  <p class="hint" style="margin-top:16px">Sales reps approve emails for their own leads. Managers can approve any email and change settings.</p>`;
}

/* ---------- How it works ---------- */
function helpPage() {
  return `<div class="head"><div><h1>How it works</h1><p>Claude does the reading and writing. You approve every email.</p></div></div>
  <div class="flow">
    <div class="card"><b>A lead comes in</b><p>From your website, your inbox, or pasted on “Add lead”. Claude fills in who they are and what they want.</p></div>
    <div class="card"><b>Claude writes to them</b><p>A personal email based on exactly what they asked, in Aurora's style.</p></div>
    <div class="card"><b>You approve</b><p>On “Today”: read it, change anything, or ask Claude to rewrite it. Nothing is sent until you click Approve.</p></div>
    <div class="card"><b>Claude decides what's next</b><p>No fixed schedule. If they don't reply, Claude picks when to check in and writes a new, personal email. Back to you to approve.</p></div>
    <div class="card"><b>They reply</b><p>Claude reads it, updates the lead, and writes an answer for you to approve.</p></div>
  </div>
  <div class="grid2" style="margin-top:16px">
    <div class="card"><h2 style="margin-bottom:8px">Your daily routine</h2><ol style="margin:0;padding-left:18px;line-height:1.9">
      <li>Open <b>Today</b>.</li><li>Approve the emails waiting for you.</li><li>Look at <b>Latest replies</b> and call anyone hot.</li><li>After a phone call, <b>Add note</b> on the lead so Claude knows.</li></ol></div>
    <div class="card"><h2 style="margin-bottom:8px">Good to know</h2><ul style="margin:0;padding-left:18px;line-height:1.9">
      <li>Every email is checked by a person first.</li><li>Claude never invents prices or dates. Check those yourself.</li><li>If someone says “stop”, we never email them again.</li><li>Claude stops after ${S.followup.maxFollowups} emails with no reply.</li></ul></div>
  </div>`;
}

/* ---------- setup needed ---------- */
function setupPage() {
  return `<div class="card setup"><h2>Almost there: the database isn't set up yet</h2>
    <p>A manager needs to do this once:</p>
    <ol><li>Open your Aurora Sales project on <b>supabase.com</b> → <b>SQL Editor</b> → <b>New query</b>.</li>
      <li>Paste all of <code>aurora-sales/supabase/schema.sql</code> and click <b>Run</b>.</li>
      <li>Come back here and reload.</li></ol>
    <p class="hint">Full steps are in <code>aurora-sales/README.md</code>.</p>
    <button class="btn primary" data-act="reload">Reload</button></div>`;
}

/* ================= actions ================= */
function go(route, id) { location.hash = id ? `${route}/${id}` : route; }
function onRoute() {
  const [r, id] = location.hash.replace(/^#/, "").split("/");
  S.route = r || "today";
  S.panel = null; S.confirmDelete = false; S.editDetails = false; S.confirmSend = null;
  if (S.route !== "settings") S.pbDraft = null;
  if (S.route === "lead" && id) {
    if (S.leadId !== id) { S.leadId = id; S.lead = null; }
    reloadLead().then(rerender).catch((e) => { console.error(e); toast("Couldn't load this lead."); });
  }
  rerender(); window.scrollTo(0, 0);
}
async function busy(key, fn) {
  if (S.busy[key]) return;
  S.busy[key] = fn.name || true; delete S.errs[key];
  rerender();
  try { return await fn(); }
  catch (e) { S.errs[key] = e.message || String(e); toast(e.message || "Something went wrong."); }
  finally { delete S.busy[key]; rerender(); }
}
async function refresh() { await reload(); rerender(); }

const actions = {
  reload: () => { S.loaded = false; render(); reload(); },
  signout: async () => { await S.sb.auth.signOut(); },
  scroll: (b) => { const el = $(b.dataset.to); if (el) el.scrollIntoView({ behavior: "smooth" }); },
  "drafts-toggle": () => { S.allDrafts = !S.allDrafts; rerender(); },
  mine: () => { S.mineOnly = !S.mineOnly; rerender(); },
  tab: (b) => { S.tab = b.dataset.tab; rerender(); },
  stab: (b) => { collectPb(); S.settingsTab = b.dataset.t; rerender(); },
  async brief() {
    S.brief = "…"; rerender();
    try { S.brief = await API.ai("ask", { question: `What should I (${S.me ? S.me.display_name || S.me.email : "the rep"}) focus on today? Give a short, prioritized list of my leads: who to approve, call or chase first and why.` }); }
    catch (e) { S.brief = null; toast(e.message); }
    rerender();
  },
  approve: (b) => { S.confirmSend = b.dataset.id; rerender(); },
  "send-no": () => { S.confirmSend = null; rerender(); },
  "send-yes": (b) => {
    const id = b.dataset.id, e = S.edits[id] || {}, m = findDraft(id);
    return busy(id, async function send() {
      const fu = e.followUpDays ?? m.follow_up_days ?? S.followup.defaultDays;
      await API.send(id, e.subject ?? m.subject, e.body ?? m.body, fu);
      delete S.edits[id]; S.confirmSend = null;
      toast(fu ? `Sent ✓ If there's no reply, Claude writes again in ${daysText(fu)}.` : "Sent ✓");
      await refresh();
    });
  },
  "rw-open": (b) => { S.rw = S.rw === b.dataset.id ? null : b.dataset.id; S.focus = `#rwn-${b.dataset.id}`; rerender(); },
  "rw-chip": (b) => rewrite(b.dataset.id, b.dataset.note),
  "rw-go": (b) => { const v = ($(`#rwn-${b.dataset.id}`) || {}).value || ""; if (!v.trim()) { toast("Type what Claude should change."); return; } rewrite(b.dataset.id, v.trim()); },
  skip: (b) => busy(b.dataset.id, async function skip() {
    const m = findDraft(b.dataset.id);
    await API.saveDraft(b.dataset.id, { status: "skipped", error: "Not sent: " + (S.me.display_name || S.me.email) + " decided" });
    // Claude will try again later with a fresh email.
    const l = m && leadById(m.lead_id);
    const retry = l && OPEN.includes(l.status) && (m.kind === "followup" || m.kind === "first");
    if (retry) await API.updateLead(l.id, { next_due_at: new Date(Date.now() + days(S.followup.defaultDays)).toISOString() });
    toast(retry ? `Not sent. Claude will try again in ${S.followup.defaultDays} days, or pause the lead.` : "Not sent.");
    await refresh();
  }),
  "edit-details": () => { S.editDetails = !S.editDetails; S.confirmDelete = false; rerender(); },
  async "save-details"() {
    const l = leadById(S.leadId), v = (id) => (($("#f-" + id) || {}).value || "").trim();
    const val = v("value");
    try {
      await API.updateLead(l.id, { name: v("name"), email: v("email").toLowerCase(), phone: v("phone"), company: v("company"), value: val ? Math.max(0, Number(val)) : null,
        details: { ...l.details, products: v("products"), quantity: v("quantity"), deadline: v("deadline"), notes: v("notes") } });
      S.editDetails = false; toast("Saved"); await refresh();
    } catch (e) { toast("Couldn't save. " + (e.message || "")); }
  },
  insight: () => busy("lead", async function insight() { await API.ai("insight", { leadId: S.leadId }); await refresh(); }),
  "draft-now": () => busy("lead", async function draft() { await API.ai("draft", { leadId: S.leadId }); await refresh(); toast("Claude wrote it. Check it and approve."); }),
  panel: (b) => { S.panel = b.dataset.p || null; S.focus = "#p-text"; rerender(); },
  "panel-go": () => {
    const text = (($("#p-text") || {}).value || "").trim();
    if (S.panel === "custom") return busy("lead", async function draft() { await API.ai("draft", text ? { leadId: S.leadId, kind: "manual", note: text } : { leadId: S.leadId }); S.panel = null; await refresh(); toast("Claude wrote it. Check it and approve."); });
    if (!text) { toast("Type something first."); return; }
    if (S.panel === "note") return busy("lead", async function note() { await API.addNote(S.leadId, text); S.panel = null; await refresh(); toast("Note saved"); });
    if (S.panel === "reply") return busy("lead", async function reply() {
      const r = await API.ai("reply", { leadId: S.leadId, text });
      S.panel = null; await refresh();
      toast(r && r.analysis ? `${INTENT[r.analysis.intent] || "Reply saved"}. ${r.draft ? "Claude wrote an answer for you." : ""}` : "Reply saved");
    });
  },
  pause: () => setLead({ status: "paused" }, "Paused. Claude won't write until you resume."),
  resume: () => { const l = leadById(S.leadId); return setLead({ status: l.last_contact_at ? "following" : "new", next_due_at: now() }, "Resumed. Claude will write the next email shortly."); },
  "delete-lead": () => { S.confirmDelete = true; rerender(); },
  "delete-no": () => { S.confirmDelete = false; rerender(); },
  async "delete-yes"() { try { await API.deleteLead(S.leadId); toast("Lead deleted"); go("leads"); await refresh(); } catch (e) { toast("Couldn't delete. " + (e.message || "")); } },
  "add-read": () => {
    const text = $("#a-text").value.trim(); S.add.text = text;
    if (text.length < 10) { toast("Paste their message first."); return; }
    return busy("add", async function read() { const r = await API.ai("read", { text }); S.add.parsed = r.lead; });
  },
  "add-manual": () => { S.add.text = $("#a-text").value; S.add.parsed = { name: "", email: "", phone: "", company: "", source: "", products: "", quantity: "", deadline: "", notes: "", summary: "", score: 50, temperature: "warm" }; rerender(); },
  "add-save": () => {
    const p = { ...S.add.parsed };
    document.querySelectorAll("[data-add]").forEach((el) => { p[el.dataset.add] = el.value.trim(); });
    if (!p.name && !p.email) { toast("Add at least a name or an email."); return; }
    const owner = $("#a-owner").value, draftNow = $("#a-draft").checked;
    return busy("add", async function save() {
      const r = await API.ai("create", { fields: p, enquiry: S.add.text || "", draftNow, ...(owner === "auto" ? {} : { ownerId: owner || null }) });
      S.add = { text: "", parsed: null, ownerId: "", draftNow: true };
      toast(r.duplicate ? "Already a lead. Added this message to their history." : r.draft ? "Saved. Claude wrote the first email for you to approve." : "Saved.");
      await refresh(); go("lead", r.lead.id);
    });
  },
  "ask-preset": (b) => ask(b.dataset.q),
  "ask-go": () => { const q = $("#ask-q").value.trim(); if (q) ask(q); },
  role: (b) => member(b.dataset.id, { role: b.dataset.role }),
  access: (b) => member(b.dataset.id, { active: b.dataset.on === "1" }),
  async invite() {
    const email = $("#i-email").value.trim().toLowerCase();
    if (!/^\S+@\S+\.\S+$/.test(email)) { toast("Enter a valid email."); return; }
    try { await API.invite({ email, display_name: $("#i-name").value.trim(), title: "", role: $("#i-role").value }); toast("Added. Send them the link to sign in."); await refresh(); }
    catch (e) { toast("Couldn't add them. " + (e.message || "")); }
  },
  async uninvite(b) { try { await API.removeInvite(b.dataset.email); await refresh(); } catch (e) { toast(e.message); } },
  "pb-reset": () => { S.pbDraft = null; rerender(); },
  async "pb-save"() {
    collectPb();
    const { playbook, followup } = S.pbDraft;
    const f = { ...S.followup, ...followup, maxFollowups: Math.max(1, Math.min(20, Math.round(Number(followup.maxFollowups) || 5))) };
    try { await API.saveSettings("playbook", playbook); await API.saveSettings("followup", f); S.pbDraft = null; toast("Saved. Claude uses this from the next email."); await refresh(); }
    catch (e) { toast("Couldn't save. " + (e.message || "")); }
  },
};
function collectPb() {
  if (!S.pbDraft) return;
  document.querySelectorAll("[data-pb]").forEach((el) => { S.pbDraft.playbook[el.dataset.pb] = el.value; });
  const mx = $("#pb-max"); if (mx) S.pbDraft.followup.maxFollowups = Number(mx.value);
}
function rewrite(id, note) {
  const m = findDraft(id);
  if (!m) return;
  return busy(id, async function rw() {
    // Save the rep's own edits first so Claude rewrites what they see.
    const e = S.edits[id];
    if (e) await API.saveDraft(id, { subject: e.subject ?? m.subject, body: e.body ?? m.body }).catch(() => {});
    await API.ai("draft", { leadId: m.lead_id, note, kind: m.kind });
    delete S.edits[id]; S.rw = null;
    toast("Claude rewrote it.");
    await refresh();
  });
}
async function setLead(patch, msg) {
  try { await API.updateLead(S.leadId, patch); await API.logEvent(S.leadId, "status", msg); toast(msg); await refresh(); }
  catch (e) { toast("Couldn't update. " + (e.message || "")); }
}
async function member(id, patch) { try { await API.updateMember(id, patch); await refresh(); } catch (e) { toast(e.message || "Couldn't update."); } }
async function ask(q) {
  if (S.busy.ask) return;
  const item = { q }; S.chat.push(item); S.busy.ask = true; rerender();
  try { item.a = await API.ai("ask", { question: q }); } catch (e) { item.err = e.message; }
  S.busy.ask = false; rerender();
}

/* ================= events ================= */
document.addEventListener("click", (ev) => {
  const t = ev.target.closest("[data-act],[data-go],[data-lead]");
  if (!t || !t.closest("#root")) return;
  if (t.dataset.act) { ev.preventDefault(); const f = actions[t.dataset.act]; if (f) f(t); return; }
  if (t.dataset.go) { go(t.dataset.go); return; }
  if (t.dataset.lead && !ev.target.closest("input,textarea,select,button:not([data-lead])")) go("lead", t.dataset.lead);
});
document.addEventListener("input", (ev) => {
  const el = ev.target;
  if (el.dataset.edit && el.tagName !== "SELECT") { (S.edits[el.dataset.id] ||= {})[el.dataset.edit] = el.value; if (el.tagName === "TEXTAREA") { el.style.height = "auto"; el.style.height = Math.min(600, el.scrollHeight + 4) + "px"; } }
  if (el.id === "search") { S.search = el.value; clearTimeout(S.st); S.st = setTimeout(() => { const pos = el.selectionStart; rerender(); const s = $("#search"); if (s) { s.focus(); s.setSelectionRange(pos, pos); } }, 200); }
  if (el.id === "a-text") S.add.text = el.value;
});
document.addEventListener("change", async (ev) => {
  const el = ev.target;
  if (el.dataset.edit === "followUpDays") {
    const n = Number(el.value);
    (S.edits[el.dataset.id] ||= {}).followUpDays = n;
    if (S.mode !== "demo") API.saveDraft(el.dataset.id, { follow_up_days: n }).catch(() => {});
  }
  if (el.id === "l-status") {
    const s = el.value;
    await setLead({ status: s, ...(OPEN.includes(s) ? {} : { next_due_at: null }) }, `Status changed to ${STATUS[s]}.`);
  }
  if (el.id === "l-owner") {
    try { await API.updateLead(S.leadId, { owner_id: el.value || null }); await API.logEvent(S.leadId, "owner", `Lead given to ${teamName(el.value || null)}.`); toast("Owner updated"); await refresh(); }
    catch (e) { toast(e.message); }
  }
});
// Save a rep's edits to a waiting draft when they leave the field, so teammates see them too.
document.addEventListener("focusout", (ev) => {
  const el = ev.target;
  if (el.dataset && el.dataset.edit && el.tagName !== "SELECT" && S.mode !== "demo") {
    const id = el.dataset.id, e = S.edits[id];
    if (e) API.saveDraft(id, { ...(e.subject !== undefined ? { subject: e.subject } : {}), ...(e.body !== undefined ? { body: e.body } : {}) }).catch(() => {});
  }
  setTimeout(() => { if (pendingRender && !(document.activeElement && /^(TEXTAREA|INPUT|SELECT)$/.test(document.activeElement.tagName))) render(); }, 50);
});
document.addEventListener("keydown", (ev) => {
  if (ev.key !== "Enter" || ev.shiftKey) return;
  if (ev.target.id === "ask-q") { ev.preventDefault(); actions["ask-go"](); }
  if (ev.target.id && ev.target.id.startsWith("rwn-")) { ev.preventDefault(); actions["rw-go"]({ dataset: { id: ev.target.id.slice(4) } }); }
});
window.addEventListener("hashchange", onRoute);

/* ================= sign in ================= */
function renderLogin(msg, codeStep) {
  $("#root").innerHTML = codeStep
    ? `<form class="auth" id="codeForm" novalidate><img src="logo.png" alt=""><h1>Check your email</h1><p>We sent a 6-digit code to <b>${esc(S.loginEmail)}</b>.</p>
        <div class="field"><label for="l-code">Code</label><input class="inp code-inp" id="l-code" inputmode="numeric" autocomplete="one-time-code" maxlength="10" required></div>
        <div class="err" role="alert">${esc(msg || "")}</div><button class="btn primary" type="submit">Sign in</button>
        <button class="btn ghost" type="button" id="backBtn">Use a different email</button></form>`
    : `<form class="auth" id="loginForm" novalidate><img src="logo.png" alt=""><h1>Aurora Sales</h1><p>Sign in with your work email. We'll email you a 6-digit code.</p>
        <div class="field"><label for="l-email">Email</label><input class="inp" id="l-email" type="email" autocomplete="email" required value="${esc(S.loginEmail || "")}"></div>
        <div class="err" role="alert">${esc(msg || "")}</div><button class="btn primary" type="submit">Email me a code</button></form>`;
  const f = $("form");
  f.addEventListener("submit", async (e) => {
    e.preventDefault();
    const btn = f.querySelector("button[type=submit]"), err = f.querySelector(".err");
    btn.disabled = true;
    if (!codeStep) {
      const email = $("#l-email").value.trim().toLowerCase();
      if (!/^\S+@\S+\.\S+$/.test(email)) { err.textContent = "Enter a valid email address."; btn.disabled = false; return; }
      S.loginEmail = email;
      const { error } = await S.sb.auth.signInWithOtp({ email, options: { shouldCreateUser: true } });
      if (error) { err.textContent = /rate|seconds/i.test(error.message) ? "Please wait a minute before asking for another code." : "Couldn't send the code. Try again in a moment."; btn.disabled = false; return; }
      renderLogin("", true); setTimeout(() => $("#l-code") && $("#l-code").focus(), 30);
    } else {
      const token = $("#l-code").value.replace(/\D/g, "");
      if (token.length < 6) { err.textContent = "Enter the 6-digit code from the email."; btn.disabled = false; return; }
      const { error } = await S.sb.auth.verifyOtp({ email: S.loginEmail, token, type: "email" });
      if (error) { err.textContent = "That code didn't work. Check it, or go back and ask for a new one."; btn.disabled = false; }
    }
  });
  const back = $("#backBtn"); if (back) back.addEventListener("click", () => renderLogin());
}

/* ================= start ================= */
let started = false;
async function startCloud(user) {
  const { data, error } = await S.sb.rpc("join_sales_team");
  if (error) {
    if (/not_invited/.test(error.message)) { await S.sb.auth.signOut(); S.mode = "login"; renderLogin("This email isn't on the sales team yet. Ask your sales manager to add you."); return; }
    if (/does not exist|schema cache|PGRST202|42883/i.test(error.message + (error.code || ""))) { S.me = { id: user.id, email: user.email, display_name: "", role: "manager" }; S.mode = "cloud"; S.needsSetup = true; S.loaded = true; render(); return; }
    S.mode = "login"; renderLogin("Couldn't check your team access. Try again."); return;
  }
  S.me = Array.isArray(data) ? data[0] : data;
  S.mode = "cloud";
  if (!started) {
    started = true;
    S.sb.channel("aurora-sales")
      .on("postgres_changes", { event: "*", schema: "public", table: "leads" }, scheduleReload)
      .on("postgres_changes", { event: "*", schema: "public", table: "lead_messages" }, scheduleReload)
      .on("postgres_changes", { event: "*", schema: "public", table: "sales_team" }, scheduleReload)
      .on("postgres_changes", { event: "*", schema: "public", table: "sales_settings" }, scheduleReload)
      .subscribe();
    document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") scheduleReload(); });
  }
  onRoute();
  await reload();
}
async function boot() {
  const cfg = window.AURORA_SALES_CONFIG || {};
  const demo = /[?&]demo\b/.test(location.search) || !cfg.supabaseUrl || !cfg.supabaseKey || !window.supabase;
  if (demo) {
    API = Demo; S.mode = "demo"; S.me = { id: "u2", email: "james@aurorapromotions.com", display_name: "James", role: "rep", active: true };
    if (/[?&]manager\b/.test(location.search)) S.me = { id: "u1", email: "maria@aurorapromotions.com", display_name: "Maria", role: "manager", active: true };
    onRoute(); await reload(); return;
  }
  S.sb = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseKey, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false } });
  S.sb.auth.onAuthStateChange((event, session) => {
    if (event === "SIGNED_OUT") { S.me = null; S.loaded = false; S.mode = "login"; renderLogin(); return; }
    if (event === "SIGNED_IN" && session && (!S.me || S.mode === "login")) setTimeout(() => startCloud(session.user), 0);
  });
  const { data } = await S.sb.auth.getSession();
  if (data && data.session) startCloud(data.session.user);
  else { S.mode = "login"; renderLogin(); }
}
boot();
})();
