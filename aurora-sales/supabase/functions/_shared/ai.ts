// Every AI feature in Aurora Sales goes through Claude here.
// Claude never sends anything itself: it writes drafts and suggestions that a person approves.
import Anthropic from "npm:@anthropic-ai/sdk@^1.7.0";
import { Lead, Message, Playbook, UserError } from "./core.ts";

const client = new Anthropic(); // reads the ANTHROPIC_API_KEY secret
const MODEL = Deno.env.get("CLAUDE_MODEL") || "claude-opus-5-5";
// Server-side fallback re-runs a declined request on another Claude model.
const FALLBACK_OK = /^claude-(opus-5|fable-5|sonnet-5-5)/.test(MODEL);

type Effort = "low" | "medium" | "high";

async function askJSON<T>(system: string, prompt: string, schema: Record<string, unknown>, effort: Effort): Promise<T> {
  const params: Anthropic.Beta.Messages.MessageCreateParamsNonStreaming = {
    model: MODEL,
    max_tokens: 16000,
    system,
    messages: [{ role: "user", content: prompt }],
    output_config: { effort, format: { type: "json_schema", schema } },
    ...(FALLBACK_OK ? { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const } : {}),
  };
  let res: Anthropic.Beta.Messages.BetaMessage;
  try {
    res = await client.beta.messages.create(params);
  } catch (e) {
    if (e instanceof Anthropic.AuthenticationError) throw new UserError("Claude isn't connected yet. Ask your manager to add the Claude API key.");
    if (e instanceof Anthropic.RateLimitError) throw new UserError("Claude is busy right now. Try again in a minute.");
    if (e instanceof Anthropic.APIError) throw new UserError(`Claude couldn't answer (error ${e.status}). Try again in a moment.`);
    throw e;
  }
  if (res.stop_reason === "refusal") throw new UserError("Claude declined to write this one. Try rewording the note.");
  if (res.stop_reason === "max_tokens") throw new UserError("Claude's answer was cut off. Try again.");
  const text = res.content.map((b) => (b.type === "text" ? b.text : "")).join("");
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new UserError("Claude's answer couldn't be read. Try again.");
  }
}

// ---------- shared context ----------

function playbookText(p: Playbook): string {
  return [
    `Company: ${p.company}`,
    `About us: ${p.about}`,
    `What we offer:\n${p.offer}`,
    `Tone of voice: ${p.tone}`,
    `Rules you must follow:\n${p.rules}`,
    `Call to action we like: ${p.cta}`,
    p.quoteLink ? `Online quote link (you may include it): ${p.quoteLink}` : "There is no online quote link, so offer to send a quote by email.",
  ].join("\n\n");
}

function leadText(l: Lead): string {
  const d = l.details ?? {};
  const rows: [string, unknown][] = [
    ["Name", l.name], ["Company", l.company], ["Email", l.email], ["Phone", l.phone], ["Source", l.source],
    ["Status", l.status], ["Products wanted", d.products], ["Quantity", d.quantity], ["Deadline / event date", d.deadline],
    ["Budget", d.budget], ["Location", d.location], ["Notes", d.notes], ["Summary so far", l.summary],
  ];
  const out = rows.filter(([, v]) => v !== undefined && v !== null && String(v).trim() !== "").map(([k, v]) => `${k}: ${v}`);
  if (d.enquiry) out.push(`Original enquiry:\n"""\n${String(d.enquiry).slice(0, 6000)}\n"""`);
  return out.join("\n");
}

function historyText(messages: Message[]): string {
  const rows = messages
    .filter((m) => ["sent", "received", "note"].includes(m.status))
    .map((m) => {
      const when = new Date(m.sent_at ?? m.created_at).toDateString();
      if (m.status === "note") return `[${when}] TEAM NOTE (internal, never quote it to the client): ${m.body}`;
      const who = m.direction === "in" ? "CLIENT REPLIED" : "WE SENT";
      return `[${when}] ${who}\nSubject: ${m.subject}\n${m.body}`;
    });
  return rows.length ? rows.join("\n\n---\n\n") : "No emails yet.";
}

const today = () => new Date().toDateString();

// ---------- 1. read a lead out of an email or form ----------

export type ParsedLead = {
  name: string; email: string; phone: string; company: string; source: string;
  products: string; quantity: string; deadline: string; budget: string; location: string; notes: string;
  summary: string; score: number; temperature: "hot" | "warm" | "cold"; next_action: string; is_lead: boolean;
};

const S = { type: "string" } as const;
const PARSE_SCHEMA = {
  type: "object", additionalProperties: false,
  properties: {
    is_lead: { type: "boolean" }, name: S, email: S, phone: S, company: S, source: S, products: S, quantity: S,
    deadline: S, budget: S, location: S, notes: S, summary: S, score: { type: "integer" },
    temperature: { type: "string", enum: ["hot", "warm", "cold"] }, next_action: S,
  },
  required: ["is_lead", "name", "email", "phone", "company", "source", "products", "quantity", "deadline", "budget",
    "location", "notes", "summary", "score", "temperature", "next_action"],
};

export function parseLead(text: string, p: Playbook): Promise<ParsedLead> {
  return askJSON<ParsedLead>(
    `You read incoming enquiries for ${p.company} and turn them into clean lead records for the sales team.\n\n${playbookText(p)}`,
    `Today is ${today()}. Read the text below. It may be a website form, a forwarded email, a CRM notification or rough notes.
Pull out the person who wants to buy (not our own staff, not a notification system). Use "" for anything not stated; never guess an email or phone.
- source: where it came from if you can tell (website, email, phone, referral, trade show, Instagram, Facebook, etc.)
- products / quantity / deadline / budget / location: as written, short
- summary: 1-2 plain sentences a salesperson can read in 5 seconds
- score: 0-100, how likely and valuable this sale looks (clear need + quantity + near deadline = high)
- temperature: hot (ready to buy soon), warm (interested), cold (vague or far off)
- next_action: the single best next step for the salesperson
- is_lead: false if this is spam, a supplier pitch, a job application or not a sales enquiry

TEXT:
"""
${text.slice(0, 20000)}
"""`,
    PARSE_SCHEMA, "low",
  );
}

// ---------- 2. write the next email ----------
// There is no fixed sequence. Claude reads the whole conversation, decides what this email
// should do, and suggests when to check in again if the client doesn't reply.

export type Draft = { subject: string; body: string; reason: string; follow_up_days: number };
const DRAFT_SCHEMA = {
  type: "object", additionalProperties: false,
  properties: { subject: S, body: S, reason: S, follow_up_days: { type: "integer" } },
  required: ["subject", "body", "reason", "follow_up_days"],
};

export type DraftKind = "first" | "followup" | "reply" | "manual";

export function draftEmail(args: {
  playbook: Playbook; lead: Lead; messages: Message[]; kind: DraftKind;
  unanswered: number; maxFollowups: number; rep: string; note?: string; replyTo?: string; previous?: string;
}): Promise<Draft> {
  const { playbook: p, lead, messages, kind, unanswered, maxFollowups, rep, note, replyTo, previous } = args;
  let task: string;
  if (kind === "reply") {
    task = `The client just replied (the last CLIENT REPLIED email). Write our answer to it. Answer their questions using only facts in the playbook; if they ask for a price or date we don't have, say the salesperson will confirm it today.`;
  } else if (kind === "manual") {
    task = `Write the email the salesperson asked for (see their instructions).`;
  } else if (kind === "first") {
    task = `This is our first email to this lead, answering their enquiry. Thank them, respond to exactly what they asked, and ask for what we still need to help them (for example quantity, colours, sizes or deadline - only what is missing).`;
  } else {
    const last = unanswered + 1 >= maxFollowups;
    task = `They have not replied to our last ${unanswered} email${unanswered === 1 ? "" : "s"}. Write the next follow-up.
Decide for yourself the most useful thing to say now, based on who they are, what they asked for and what we already said. Ideas: a helpful idea for their project, a reminder about timing for their deadline, a relevant product suggestion, an easy question. Never repeat an earlier email. Never guilt-trip them for not replying. Keep it shorter than the earlier emails.
${last ? "This is the LAST follow-up we will send. Make it a polite close: say we won't keep following up and they can reply any time." : ""}`;
  }
  return askJSON<Draft>(
    `You write sales emails for ${p.company}. Every email must feel personally written for this one client by a real person on the team, never like a template or an automated sequence. A salesperson will review your draft before it is sent.\n\n${playbookText(p)}`,
    `Today is ${today()}. You are writing as ${rep}.

TASK: ${task}
${note ? `\nINSTRUCTIONS FROM THE SALESPERSON (follow these closely): ${note}` : ""}
${previous ? `\nYOUR PREVIOUS DRAFT (the salesperson wants it rewritten):\n"""\n${previous}\n"""` : ""}

THE LEAD:
${leadText(lead)}

EMAIL HISTORY (oldest first):
${historyText(messages)}

Write:
- subject: short and specific to them (no ALL CAPS, no emojis, no "Quick question")
- body: plain text email. Start with a greeting using their first name if known. Use details from their enquiry and the conversation so it is clearly personal. Follow the tone and rules. End with this signature exactly:
${p.signature.replace("{rep_name}", rep)}
  Do NOT add an unsubscribe line; the system adds it.
- reason: one short sentence for the salesperson explaining what this email does and why (e.g. "Mentions their May 12 tournament and asks for sizes so we can quote.")
- follow_up_days: if they don't reply to this email, how many days we should wait before checking in again (1-30). Think about their deadline: sooner if it is close, longer if it is far away or they said "later". Use 0 if we should not follow up after this email (for example a final email, or they asked for no more emails).`,
    DRAFT_SCHEMA, "medium",
  );
}

// ---------- 3. understand a reply ----------

export type ReplyAnalysis = {
  intent: "interested" | "question" | "wants_quote" | "wants_call" | "not_now" | "not_interested" | "unsubscribe" | "out_of_office" | "other";
  summary: string; mood: "positive" | "neutral" | "negative";
  new_status: "replied" | "meeting" | "quoted" | "won" | "lost" | "paused" | "unsubscribed";
  pause_days: number; needs_answer: boolean; next_action: string; score: number;
  temperature: "hot" | "warm" | "cold";
};
const REPLY_SCHEMA = {
  type: "object", additionalProperties: false,
  properties: {
    intent: { type: "string", enum: ["interested", "question", "wants_quote", "wants_call", "not_now", "not_interested", "unsubscribe", "out_of_office", "other"] },
    summary: S, mood: { type: "string", enum: ["positive", "neutral", "negative"] },
    new_status: { type: "string", enum: ["replied", "meeting", "quoted", "won", "lost", "paused", "unsubscribed"] },
    pause_days: { type: "integer" }, needs_answer: { type: "boolean" }, next_action: S, score: { type: "integer" },
    temperature: { type: "string", enum: ["hot", "warm", "cold"] },
  },
  required: ["intent", "summary", "mood", "new_status", "pause_days", "needs_answer", "next_action", "score", "temperature"],
};

export function analyzeReply(p: Playbook, lead: Lead, messages: Message[], reply: string): Promise<ReplyAnalysis> {
  return askJSON<ReplyAnalysis>(
    `You help the ${p.company} sales team understand what clients say in their replies.`,
    `Today is ${today()}.

THE LEAD:
${leadText(lead)}

EMAIL HISTORY:
${historyText(messages)}

NEW REPLY FROM THE CLIENT:
"""
${reply.slice(0, 12000)}
"""

Decide:
- intent and mood of the reply
- summary: one plain sentence of what they said
- new_status: replied (conversation going), meeting (call/visit agreed), quoted (they want or got a quote), won (they confirmed an order), lost (clear no), paused (not now / out of office), unsubscribed (asked us to stop emailing)
- pause_days: if out of office or "not now", days until we should follow up again (else 0)
- needs_answer: true if we should write back
- next_action: the best next step for the salesperson
- score (0-100) and temperature after this reply`,
    REPLY_SCHEMA, "low",
  );
}

// ---------- 4. lead insight ----------

export type Insight = { summary: string; score: number; temperature: "hot" | "warm" | "cold"; next_action: string };
const INSIGHT_SCHEMA = {
  type: "object", additionalProperties: false,
  properties: { summary: S, score: { type: "integer" }, temperature: { type: "string", enum: ["hot", "warm", "cold"] }, next_action: S },
  required: ["summary", "score", "temperature", "next_action"],
};

export function leadInsight(p: Playbook, lead: Lead, messages: Message[]): Promise<Insight> {
  return askJSON<Insight>(
    `You are the sales coach for ${p.company}. Be practical and brief.`,
    `Today is ${today()}.

THE LEAD:
${leadText(lead)}

EMAIL HISTORY:
${historyText(messages)}

Give: summary (2-3 plain sentences: who they are, what they want, where things stand), score 0-100, temperature, and next_action (one concrete step the salesperson should take now).`,
    INSIGHT_SCHEMA, "low",
  );
}

// ---------- 5. ask about the pipeline ----------

export type Answer = { answer: string; lead_ids: string[] };
const ANSWER_SCHEMA = {
  type: "object", additionalProperties: false,
  properties: { answer: S, lead_ids: { type: "array", items: S } },
  required: ["answer", "lead_ids"],
};

export function askPipeline(p: Playbook, question: string, rep: string, leads: unknown[]): Promise<Answer> {
  return askJSON<Answer>(
    `You are the sales assistant for ${p.company}. You answer questions about the sales pipeline using only the data given. Be brief, practical and use plain words. Use short lines or "- " bullets, no markdown headings or tables.`,
    `Today is ${today()}. The person asking is ${rep}.

PIPELINE DATA (JSON, one object per lead):
${JSON.stringify(leads).slice(0, 150000)}

QUESTION: ${question.slice(0, 2000)}

Answer the question. In lead_ids list the ids of the leads you mention (most important first, at most 10).`,
    ANSWER_SCHEMA, "medium",
  );
}
