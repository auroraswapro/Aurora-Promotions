// The sales workflow: new lead → Claude drafts → a person approves → send → wait → next draft.
// A reply stops the sequence and Claude suggests an answer.
import { addDays, APP_URL, db, getSettings, Lead, loadLead, logEvent, Message, Profile, repName, UserError } from "./core.ts";
import { analyzeReply, draftEmail, ParsedLead } from "./ai.ts";
import { MAIL_FROM, sendMail } from "./mail.ts";

const ACTIVE = ["new", "following"];

// ---------- new leads ----------

async function pickOwner(assign: string): Promise<string | null> {
  if (!assign || assign === "none") return null;
  if (assign !== "round_robin") {
    const { data } = await db.from("sales_team").select("id").eq("id", assign).eq("active", true).maybeSingle();
    return data?.id ?? null;
  }
  // Round robin: whoever has the fewest open leads gets the next one.
  const { data: team } = await db.from("sales_team").select("id").eq("active", true);
  if (!team?.length) return null;
  const { data: open } = await db.from("leads").select("owner_id").in("status", ["new", "following", "replied", "meeting", "quoted"]);
  const count = new Map<string, number>(team.map((t) => [t.id, 0]));
  for (const l of open ?? []) if (l.owner_id && count.has(l.owner_id)) count.set(l.owner_id, count.get(l.owner_id)! + 1);
  return [...count.entries()].sort((a, b) => a[1] - b[1])[0][0];
}

export async function createLead(input: {
  fields: Partial<ParsedLead>; enquiry: string; userId?: string | null; ownerId?: string | null; draftNow?: boolean;
}): Promise<{ lead: Lead; duplicate: boolean; draft: Message | null }> {
  const f = input.fields;
  const email = (f.email ?? "").trim().toLowerCase();
  if (email) {
    const { data: existing } = await db.from("leads").select("*").eq("email", email).not("status", "in", "(lost,won)").limit(1).maybeSingle();
    if (existing) {
      await db.from("lead_messages").insert({
        lead_id: existing.id, direction: "in", status: "received", kind: "inbound",
        subject: "New enquiry", body: input.enquiry.slice(0, 20000),
      });
      await logEvent(existing.id, "enquiry", "Sent a new enquiry. It was added to their existing lead.", input.userId);
      return { lead: existing as Lead, duplicate: true, draft: null };
    }
  }
  const { playbook } = await getSettings();
  const owner = input.ownerId !== undefined ? input.ownerId : await pickOwner(playbook.assign);
  const row = {
    name: (f.name ?? "").slice(0, 160), email: email.slice(0, 254), phone: (f.phone ?? "").slice(0, 60),
    company: (f.company ?? "").slice(0, 160), source: (f.source ?? "").slice(0, 80),
    owner_id: owner, score: clamp(f.score ?? 50), temperature: f.temperature ?? "warm",
    summary: (f.summary ?? "").slice(0, 4000), next_action: (f.next_action ?? "").slice(0, 1000),
    details: {
      products: f.products ?? "", quantity: f.quantity ?? "", deadline: f.deadline ?? "", budget: f.budget ?? "",
      location: f.location ?? "", notes: f.notes ?? "", enquiry: input.enquiry.slice(0, 20000),
    },
    status: "new", next_step: 0, next_due_at: new Date().toISOString(), created_by: input.userId ?? null,
  };
  const { data: lead, error } = await db.from("leads").insert(row).select("*").single();
  if (error) throw error;
  await logEvent(lead.id, "created", `New lead from ${row.source || "an enquiry"}.`, input.userId);
  let draft: Message | null = null;
  if (input.draftNow !== false && row.email) {
    draft = await draftForLead(lead.id, { userId: input.userId });
    if (owner) await notify([owner], `New lead: ${row.name || row.email}`, `Claude has written the first email to ${row.name || row.email}${row.company ? ` (${row.company})` : ""}. It is waiting for your approval.`);
  }
  return { lead: lead as Lead, duplicate: false, draft };
}

const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(Number(n) || 0)));

// ---------- drafts ----------

export async function draftForLead(leadId: string, opts: { note?: string; userId?: string | null; kind?: "followup" | "reply" | "manual" } = {}): Promise<Message> {
  const { playbook, sequence } = await getSettings();
  const { lead, messages, owner } = await loadLead(leadId);
  if (!lead.email) throw new UserError("This lead has no email address yet. Add one first.");
  if (lead.status === "unsubscribed") throw new UserError("This lead asked us to stop emailing.");

  const pending = messages.filter((m) => m.status === "draft");
  const kind = opts.kind ?? (pending[0]?.kind as "followup" | "reply" | "manual" | undefined) ?? (lead.status === "replied" ? "reply" : "followup");
  if (kind === "followup" && lead.next_step >= sequence.steps.length) throw new UserError("All follow-ups in the sequence have been sent.");
  const step = kind === "followup" ? lead.next_step : null;
  const previous = pending[0] ? `Subject: ${pending[0].subject}\n${pending[0].body}` : undefined;
  const lastReply = [...messages].reverse().find((m) => m.direction === "in");

  const d = await draftEmail({
    playbook, sequence, lead, messages, step, rep: repName(owner), note: opts.note,
    replyTo: kind === "reply" ? lastReply?.body ?? "" : undefined, previous: opts.note ? previous : undefined,
  });

  // Keep one email thread: later emails reuse the first subject.
  const firstSent = messages.find((m) => m.direction === "out" && m.status === "sent");
  let subject = d.subject.trim();
  if (firstSent && kind !== "manual") subject = "Re: " + firstSent.subject.replace(/^(re:\s*)+/i, "");
  if (kind === "reply" && lastReply?.subject && !firstSent) subject = "Re: " + lastReply.subject.replace(/^(re:\s*)+/i, "");

  if (pending.length) await db.from("lead_messages").update({ status: "skipped", error: "Replaced by a new draft" }).in("id", pending.map((m) => m.id));
  const { data, error } = await db.from("lead_messages").insert({
    lead_id: lead.id, direction: "out", status: "draft", kind, step,
    subject, body: d.body, ai_subject: subject, ai_body: d.body, ai_reason: d.reason.slice(0, 2000),
    ai: opts.note ? { note: opts.note } : {}, created_by: opts.userId ?? null,
  }).select("*").single();
  if (error) throw error;
  await logEvent(lead.id, "drafted", opts.note ? `Claude rewrote the draft: "${opts.note.slice(0, 200)}"` : `Claude wrote ${step === null ? "a reply" : `follow-up ${step + 1}`}.`, opts.userId);
  return data as Message;
}

// ---------- replies ----------

export async function handleReply(leadId: string, text: string, opts: { userId?: string | null; providerId?: string; receivedAt?: string; subject?: string }) {
  const { playbook } = await getSettings();
  const { lead, messages } = await loadLead(leadId);
  const a = await analyzeReply(playbook, lead, messages, text);
  const { data: msg, error } = await db.from("lead_messages").insert({
    lead_id: lead.id, direction: "in", status: "received", kind: "inbound", subject: (opts.subject ?? "").slice(0, 400),
    body: text.slice(0, 20000), ai: a, provider_id: opts.providerId ?? "", created_by: opts.userId ?? null,
  }).select("*").single();
  if (error) {
    if (String(error.code) === "23505") return null; // already stored
    throw error;
  }
  const at = opts.receivedAt ?? new Date().toISOString();
  const update: Record<string, unknown> = {
    last_reply_at: at, score: clamp(a.score), temperature: a.temperature, next_action: a.next_action.slice(0, 1000),
  };
  if (a.intent === "out_of_office" || (a.new_status === "paused" && a.pause_days > 0)) {
    // Keep the sequence going later instead of stopping it.
    update.status = lead.status === "new" ? "new" : "following";
    update.next_due_at = addDays(new Date(), Math.max(1, Math.min(90, a.pause_days || 7))).toISOString();
  } else {
    update.status = a.new_status;
    update.next_due_at = null;
  }
  await db.from("leads").update(update).eq("id", lead.id);
  await db.from("lead_messages").update({ status: "skipped", error: "The client replied" }).eq("lead_id", lead.id).eq("status", "draft").eq("kind", "followup");
  await logEvent(lead.id, "reply", `Replied: ${a.summary}`, opts.userId);

  let draft: Message | null = null;
  if (a.needs_answer && update.status !== "unsubscribed" && update.status !== "lost") {
    try {
      draft = await draftForLead(lead.id, { userId: opts.userId, kind: "reply" });
    } catch (e) {
      console.error("reply draft failed", e);
    }
  }
  if (lead.owner_id) await notify([lead.owner_id], `${lead.name || lead.email} replied`, `${a.summary}\n\n${draft ? "Claude has written an answer for you to approve." : a.next_action}`);
  return { message: msg, analysis: a, draft };
}

// ---------- sending ----------

export async function sendDraft(messageId: string, edits: { subject?: string; body?: string }, user: Profile) {
  const { data: m } = await db.from("lead_messages").select("*").eq("id", messageId).maybeSingle();
  if (!m) throw new UserError("That draft no longer exists.");
  if (m.status !== "draft") throw new UserError(m.status === "sent" ? "This email was already sent." : "This draft is no longer waiting to be sent.");
  const { playbook, sequence } = await getSettings();
  const { lead, messages, owner } = await loadLead(m.lead_id);
  if (lead.status === "unsubscribed") throw new UserError("This lead asked us to stop emailing.");
  if (!lead.email) throw new UserError("This lead has no email address.");
  if (lead.owner_id && lead.owner_id !== user.id && user.role !== "manager") throw new UserError("Only the lead's owner or a manager can approve this email.");

  const subject = (edits.subject ?? m.subject).trim().slice(0, 400);
  const body = (edits.body ?? m.body).trim().slice(0, 19000);
  if (!subject || !body) throw new UserError("The email needs a subject and a message.");
  const text = body + (playbook.optOut ? `\n\n${playbook.optOut}` : "");
  const prev = [...messages].reverse().find((x) => x.direction === "out" && x.status === "sent" && x.message_id);

  // Mark as sending first so two clicks can't send it twice.
  const { data: locked } = await db.from("lead_messages").update({ status: "sent", approved_by: user.id, sent_at: new Date().toISOString() })
    .eq("id", m.id).eq("status", "draft").select("id");
  if (!locked?.length) throw new UserError("This email was already sent.");

  try {
    const sent = await sendMail({
      to: lead.email, toName: lead.name, subject, text, fromName: `${repName(owner ?? user)} · ${playbook.company}`,
      threadId: lead.thread_id || undefined, inReplyTo: prev?.message_id || undefined,
      replyTo: Deno.env.get("MAIL_REPLY_TO") || undefined,
    });
    await db.from("lead_messages").update({ subject, body, provider_id: sent.providerId, message_id: sent.messageId, error: "" }).eq("id", m.id);
    const now = new Date();
    const upd: Record<string, unknown> = { last_contact_at: now.toISOString(), thread_id: lead.thread_id || sent.threadId };
    if (m.kind === "followup" && m.step !== null) {
      const next = m.step + 1;
      upd.next_step = next;
      upd.status = ACTIVE.includes(lead.status) ? "following" : lead.status;
      // After the last email, wait 7 days for a reply before marking the sequence finished.
      const wait = next < sequence.steps.length ? Number(sequence.steps[next].wait) || 1 : 7;
      upd.next_due_at = addDays(now, wait).toISOString();
    }
    if (!lead.owner_id) upd.owner_id = user.id;
    await db.from("leads").update(upd).eq("id", lead.id);
    const edited = subject !== m.ai_subject || body !== m.ai_body.trim();
    await logEvent(lead.id, "sent", `${repName(user)} approved and sent "${subject}"${edited ? " (edited)" : ""}.`, user.id);
    return { ok: true };
  } catch (e) {
    await db.from("lead_messages").update({ status: "draft", approved_by: null, sent_at: null, error: e instanceof Error ? e.message.slice(0, 500) : "Send failed" }).eq("id", m.id);
    throw e;
  }
}

// ---------- team alerts ----------

export async function notify(userIds: string[], subject: string, text: string) {
  if ((Deno.env.get("NOTIFY_TEAM") ?? "on") === "off" || !MAIL_FROM) return;
  const { data: people } = await db.from("sales_team").select("email,display_name").in("id", userIds).eq("active", true);
  for (const p of people ?? []) {
    try {
      await sendMail({ to: p.email, toName: p.display_name, subject: `[Aurora Sales] ${subject}`, text: `${text}\n\nOpen Aurora Sales: ${APP_URL}`, fromName: "Aurora Sales" });
    } catch (e) {
      console.error("notify failed", e);
    }
  }
}
