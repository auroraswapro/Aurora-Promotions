// Sends approved emails from your domain mailbox and checks it for replies.
// Choose one with the MAIL_PROVIDER secret: "gmail" (Google Workspace), "microsoft" (Microsoft 365) or "resend".
import { UserError } from "./core.ts";

const env = (k: string) => Deno.env.get(k) ?? "";
export const PROVIDER = env("MAIL_PROVIDER").toLowerCase();
export const MAIL_FROM = env("MAIL_FROM");
export const canCheckReplies = PROVIDER === "gmail" || PROVIDER === "microsoft";

export type Outgoing = {
  to: string; toName?: string; subject: string; text: string; fromName: string;
  threadId?: string; inReplyTo?: string; replyTo?: string;
};
export type Sent = { providerId: string; threadId: string; messageId: string };
export type Incoming = { providerId: string; receivedAt: string; subject: string; text: string };

export async function sendMail(m: Outgoing): Promise<Sent> {
  if (!PROVIDER || !MAIL_FROM) throw new UserError("The sales mailbox isn't connected yet. Ask your manager to finish the email setup.");
  const messageId = `<${crypto.randomUUID()}@${MAIL_FROM.split("@")[1] || "aurora.local"}>`;
  if (PROVIDER === "gmail") return await gmailSend(m, messageId);
  if (PROVIDER === "microsoft") return await graphSend(m, messageId);
  if (PROVIDER === "resend") return await resendSend(m, messageId);
  throw new UserError(`Unknown MAIL_PROVIDER "${PROVIDER}". Use gmail, microsoft or resend.`);
}

export async function findReplies(from: string, since: Date): Promise<Incoming[]> {
  if (!from) return [];
  if (PROVIDER === "gmail") return await gmailReplies(from, since);
  if (PROVIDER === "microsoft") return await graphReplies(from, since);
  return [];
}

// ---------- helpers ----------

const b64 = (s: string) => {
  const bytes = new TextEncoder().encode(s);
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
};
const b64url = (s: string) => b64(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const unb64url = (s: string) => {
  const bin = atob(s.replace(/-/g, "+").replace(/_/g, "/"));
  return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
};
const encWord = (s: string) => (/^[\x20-\x7e]*$/.test(s) ? s : `=?UTF-8?B?${b64(s)}?=`);
const addr = (name: string | undefined, email: string) => (name ? `${encWord(name.replace(/["\r\n]/g, ""))} <${email}>` : email);
const clean = (s: string) => s.replace(/[\r\n]+/g, " ");

/** Cuts quoted earlier emails off a reply so Claude only reads the new part. */
export function stripQuoted(text: string): string {
  const lines = text.replace(/\r/g, "").split("\n");
  const out: string[] = [];
  for (const line of lines) {
    if (/^On .+wrote:\s*$/.test(line) || /^-{2,}\s*Original Message/i.test(line) || /^From: .+/.test(line) && out.length > 0) break;
    if (/^>/.test(line)) continue;
    out.push(line);
  }
  return out.join("\n").trim() || text.trim();
}

async function check(res: Response, what: string) {
  if (res.ok) return;
  const detail = (await res.text()).slice(0, 300);
  console.error(what, res.status, detail);
  throw new UserError(`The mailbox refused the email (${what}, error ${res.status}). Check the email setup.`);
}

// ---------- Google Workspace (Gmail API) ----------

let gToken: { value: string; exp: number } | null = null;
async function googleToken(): Promise<string> {
  if (gToken && gToken.exp > Date.now() + 60000) return gToken.value;
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: env("GOOGLE_CLIENT_ID"), client_secret: env("GOOGLE_CLIENT_SECRET"),
      refresh_token: env("GOOGLE_REFRESH_TOKEN"), grant_type: "refresh_token",
    }),
  });
  await check(res, "Google sign-in");
  const j = await res.json();
  gToken = { value: j.access_token, exp: Date.now() + j.expires_in * 1000 };
  return gToken.value;
}

async function gmailSend(m: Outgoing, messageId: string): Promise<Sent> {
  const headers = [
    `From: ${addr(m.fromName, MAIL_FROM)}`,
    `To: ${addr(m.toName, m.to)}`,
    `Subject: ${encWord(clean(m.subject))}`,
    `Message-ID: ${messageId}`,
    ...(m.inReplyTo ? [`In-Reply-To: ${m.inReplyTo}`, `References: ${m.inReplyTo}`] : []),
    ...(m.replyTo ? [`Reply-To: ${m.replyTo}`] : []),
    "MIME-Version: 1.0",
    "Content-Type: text/plain; charset=UTF-8",
    "Content-Transfer-Encoding: base64",
  ];
  const raw = headers.join("\r\n") + "\r\n\r\n" + b64(m.text).replace(/.{76}/g, "$&\r\n");
  const res = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
    method: "POST",
    headers: { Authorization: `Bearer ${await googleToken()}`, "Content-Type": "application/json" },
    body: JSON.stringify({ raw: b64url(raw), ...(m.threadId ? { threadId: m.threadId } : {}) }),
  });
  await check(res, "Gmail send");
  const j = await res.json();
  return { providerId: j.id, threadId: j.threadId ?? "", messageId };
}

function gmailText(part: any): string {
  if (!part) return "";
  if (part.mimeType === "text/plain" && part.body?.data) return unb64url(part.body.data);
  for (const p of part.parts ?? []) {
    const t = gmailText(p);
    if (t) return t;
  }
  return "";
}

async function gmailReplies(from: string, since: Date): Promise<Incoming[]> {
  const token = await googleToken();
  const q = `from:${from} after:${Math.floor(since.getTime() / 1000)}`;
  const list = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=5&q=${encodeURIComponent(q)}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!list.ok) return [];
  const { messages = [] } = await list.json();
  const out: Incoming[] = [];
  for (const { id } of messages) {
    const r = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${id}?format=full`, { headers: { Authorization: `Bearer ${token}` } });
    if (!r.ok) continue;
    const msg = await r.json();
    const subject = (msg.payload?.headers ?? []).find((h: any) => h.name.toLowerCase() === "subject")?.value ?? "";
    out.push({
      providerId: `gmail:${id}`, receivedAt: new Date(Number(msg.internalDate)).toISOString(), subject,
      text: stripQuoted(gmailText(msg.payload) || msg.snippet || ""),
    });
  }
  return out;
}

// ---------- Microsoft 365 (Graph API) ----------

let mToken: { value: string; exp: number } | null = null;
async function graphToken(): Promise<string> {
  if (mToken && mToken.exp > Date.now() + 60000) return mToken.value;
  const res = await fetch(`https://login.microsoftonline.com/${env("MS_TENANT_ID")}/oauth2/v2.0/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: env("MS_CLIENT_ID"), client_secret: env("MS_CLIENT_SECRET"),
      scope: "https://graph.microsoft.com/.default", grant_type: "client_credentials",
    }),
  });
  await check(res, "Microsoft sign-in");
  const j = await res.json();
  mToken = { value: j.access_token, exp: Date.now() + j.expires_in * 1000 };
  return mToken.value;
}

async function graphSend(m: Outgoing, messageId: string): Promise<Sent> {
  const res = await fetch(`https://graph.microsoft.com/v1.0/users/${encodeURIComponent(MAIL_FROM)}/sendMail`, {
    method: "POST",
    headers: { Authorization: `Bearer ${await graphToken()}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      message: {
        subject: clean(m.subject),
        body: { contentType: "Text", content: m.text },
        from: { emailAddress: { address: MAIL_FROM, name: m.fromName } },
        toRecipients: [{ emailAddress: { address: m.to, name: m.toName ?? "" } }],
        ...(m.replyTo ? { replyTo: [{ emailAddress: { address: m.replyTo } }] } : {}),
      },
      saveToSentItems: true,
    }),
  });
  await check(res, "Outlook send");
  return { providerId: `ms:${messageId}`, threadId: "", messageId };
}

async function graphReplies(from: string, since: Date): Promise<Incoming[]> {
  const token = await graphToken();
  const filter = `receivedDateTime ge ${since.toISOString()} and from/emailAddress/address eq '${from.replace(/'/g, "''")}'`;
  const url = `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(MAIL_FROM)}/messages?$top=5&$select=id,subject,receivedDateTime,body&$filter=${encodeURIComponent(filter)}`;
  const r = await fetch(url, { headers: { Authorization: `Bearer ${token}`, Prefer: 'outlook.body-content-type="text"' } });
  if (!r.ok) return [];
  const { value = [] } = await r.json();
  return value.map((m: any) => ({
    providerId: `ms:${m.id}`, receivedAt: m.receivedDateTime, subject: m.subject ?? "", text: stripQuoted(m.body?.content ?? ""),
  }));
}

// ---------- Resend (sending only; log replies by hand in the app) ----------

async function resendSend(m: Outgoing, messageId: string): Promise<Sent> {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${env("RESEND_API_KEY")}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: addr(m.fromName, MAIL_FROM), to: [m.to], subject: clean(m.subject), text: m.text,
      ...(m.replyTo ? { reply_to: m.replyTo } : {}),
      headers: { "Message-ID": messageId, ...(m.inReplyTo ? { "In-Reply-To": m.inReplyTo, References: m.inReplyTo } : {}) },
    }),
  });
  await check(res, "Resend");
  const j = await res.json();
  return { providerId: `resend:${j.id}`, threadId: "", messageId };
}
