// Shared helpers for the Aurora Sales server functions: database access,
// sign-in checks, settings and the activity log.
import { createClient } from "npm:@supabase/supabase-js@2";

export const db = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false, autoRefreshToken: false } },
);

export const APP_URL = Deno.env.get("APP_URL") ?? "https://auroraswapro.github.io/Aurora-Promotions/sales/";

export const cors: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-intake-key, x-cron-key",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

export function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), { status, headers: { ...cors, "Content-Type": "application/json" } });
}

export class UserError extends Error {}

export type Profile = { id: string; email: string; display_name: string; role: string; active: boolean };

/** Checks the caller is a signed-in, active team member. */
export async function requireMember(req: Request): Promise<Profile> {
  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!token) throw new UserError("Please sign in again.");
  const { data, error } = await db.auth.getUser(token);
  if (error || !data.user) throw new UserError("Please sign in again.");
  const { data: p } = await db.from("sales_team").select("id,email,display_name,role,active").eq("id", data.user.id).maybeSingle();
  if (!p || !p.active) throw new UserError("Your email isn't on the team.");
  return p as Profile;
}

/** Constant-time compare for the shared secrets used by the webhook and the schedule. */
export function sameSecret(given: string | null, expected: string | undefined): boolean {
  if (!given || !expected) return false;
  const a = new TextEncoder().encode(given), b = new TextEncoder().encode(expected);
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

export type Playbook = {
  company: string; about: string; offer: string; tone: string; rules: string; cta: string;
  quoteLink: string; signature: string; optOut: string; assign: string;
};
/** No fixed schedule: Claude picks the timing of each follow-up. These are only the limits. */
export type FollowUp = { maxFollowups: number; defaultDays: number; leadHours: number };

const DEFAULT_PLAYBOOK: Playbook = {
  company: "Aurora Promotions", about: "", offer: "", tone: "Friendly and professional.", rules: "", cta: "",
  quoteLink: "", signature: "{rep_name}\nAurora Promotions", optOut: 'If you would rather not hear from us, just reply "stop".',
  assign: "round_robin",
};
const DEFAULT_FOLLOWUP: FollowUp = { maxFollowups: 5, defaultDays: 3, leadHours: 12 };

export async function getSettings(): Promise<{ playbook: Playbook; followup: FollowUp }> {
  const { data } = await db.from("sales_settings").select("id,data").in("id", ["playbook", "followup"]);
  const by = Object.fromEntries((data ?? []).map((r) => [r.id, r.data]));
  const f = { ...DEFAULT_FOLLOWUP, ...(by.followup ?? {}) };
  const followup: FollowUp = {
    maxFollowups: clampInt(f.maxFollowups, 1, 20, 5),
    defaultDays: clampInt(f.defaultDays, 1, 60, 3),
    leadHours: clampInt(f.leadHours, 0, 72, 12),
  };
  return { playbook: { ...DEFAULT_PLAYBOOK, ...(by.playbook ?? {}) }, followup };
}

export function clampInt(v: unknown, min: number, max: number, fallback: number): number {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : fallback;
}

export type Lead = Record<string, any> & { id: string; name: string; email: string; status: string; next_step: number };
export type Message = Record<string, any> & { id: string; direction: string; status: string; subject: string; body: string };

export async function loadLead(id: string): Promise<{ lead: Lead; messages: Message[]; owner: Profile | null }> {
  const { data: lead } = await db.from("leads").select("*").eq("id", id).maybeSingle();
  if (!lead) throw new UserError("That lead no longer exists.");
  const { data: messages } = await db.from("lead_messages").select("*").eq("lead_id", id).order("created_at");
  let owner: Profile | null = null;
  if (lead.owner_id) {
    const { data } = await db.from("sales_team").select("id,email,display_name,role,active").eq("id", lead.owner_id).maybeSingle();
    owner = (data as Profile) ?? null;
  }
  return { lead: lead as Lead, messages: (messages ?? []) as Message[], owner };
}

export async function logEvent(lead_id: string, type: string, text: string, user_id?: string | null) {
  await db.from("lead_events").insert({ lead_id, type, text: text.slice(0, 2000), user_id: user_id ?? null });
}

export function addDays(d: Date, days: number): Date {
  return new Date(d.getTime() + days * 86400000);
}

export function repName(p: Profile | null): string {
  if (!p) return "The Aurora Promotions team";
  return p.display_name || p.email.split("@")[0];
}

/** Wraps a handler with CORS, JSON parsing and friendly errors. */
export function serve(handler: (req: Request, body: any) => Promise<Response>) {
  Deno.serve(async (req) => {
    if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
    if (req.method !== "POST") return json({ error: "Use POST." }, 405);
    let body: any = {};
    try {
      const text = await req.text();
      body = text ? JSON.parse(text) : {};
    } catch {
      return json({ error: "The request wasn't valid JSON." }, 400);
    }
    try {
      return await handler(req, body);
    } catch (e) {
      if (e instanceof UserError) return json({ error: e.message }, 400);
      console.error(e);
      return json({ error: "Something went wrong on the server. Try again in a moment." }, 500);
    }
  });
}
