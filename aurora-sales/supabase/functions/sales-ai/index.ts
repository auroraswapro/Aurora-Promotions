// AI actions the team uses in the app. Every call needs a signed-in team member.
//   read     – Claude reads a pasted email/form and fills in the lead
//   create   – save a new lead and have Claude write the first email
//   draft    – write (or rewrite with a note) the next email for a lead; Claude picks what to say
//   reply    – log a client's reply; Claude reads it, updates the lead and drafts an answer
//   insight  – refresh Claude's summary, score and next step for a lead
//   ask      – ask Claude a question about the whole pipeline
import { db, getSettings, json, loadLead, logEvent, repName, requireMember, serve, UserError } from "../_shared/core.ts";
import { askPipeline, leadInsight, parseLead } from "../_shared/ai.ts";
import { createLead, draftForLead, handleReply } from "../_shared/sales.ts";

const str = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");

serve(async (req, body) => {
  const user = await requireMember(req);
  const { playbook } = await getSettings();

  switch (body.action) {
    case "read": {
      const text = str(body.text, 20000);
      if (text.length < 10) throw new UserError("Paste the enquiry first.");
      return json({ lead: await parseLead(text, playbook) });
    }
    case "create": {
      const fields = body.fields ?? {};
      if (!str(fields.name, 160) && !str(fields.email, 254)) throw new UserError("Add at least a name or an email.");
      const ownerId = body.ownerId === undefined ? undefined : (str(body.ownerId, 64) || null);
      const result = await createLead({ fields, enquiry: str(body.enquiry, 20000), userId: user.id, ownerId, draftNow: body.draftNow !== false });
      return json(result);
    }
    case "draft": {
      const draft = await draftForLead(str(body.leadId, 64), { note: str(body.note, 1000) || undefined, userId: user.id, kind: body.kind });
      return json({ draft });
    }
    case "reply": {
      const text = str(body.text, 20000);
      if (text.length < 2) throw new UserError("Paste the client's reply first.");
      const r = await handleReply(str(body.leadId, 64), text, { userId: user.id, subject: str(body.subject, 400) });
      return json(r ?? { duplicate: true });
    }
    case "insight": {
      const { lead, messages } = await loadLead(str(body.leadId, 64));
      const i = await leadInsight(playbook, lead, messages);
      await db.from("leads").update({
        summary: i.summary.slice(0, 4000), score: Math.max(0, Math.min(100, i.score)), temperature: i.temperature, next_action: i.next_action.slice(0, 1000),
      }).eq("id", lead.id);
      await logEvent(lead.id, "insight", "Claude refreshed the summary and next step.", user.id);
      return json({ insight: i });
    }
    case "ask": {
      const q = str(body.question, 2000);
      if (!q) throw new UserError("Type a question first.");
      const { data: leads } = await db.from("leads")
        .select("id,name,company,email,source,status,owner_id,score,temperature,summary,next_action,details,next_step,next_due_at,last_contact_at,last_reply_at,value,created_at")
        .order("updated_at", { ascending: false }).limit(400);
      const { data: team } = await db.from("sales_team").select("id,display_name,email");
      const names = new Map((team ?? []).map((t) => [t.id, t.display_name || t.email]));
      const rows = (leads ?? []).map((l) => {
        const { enquiry: _e, ...details } = (l.details ?? {}) as Record<string, unknown>;
        const { next_step, next_due_at, ...rest } = l;
        return { ...rest, details, emails_without_reply: next_step, next_check_in: next_due_at, owner: l.owner_id ? names.get(l.owner_id) ?? "" : "unassigned", owner_id: undefined };
      });
      return json(await askPipeline(playbook, q, repName(user), rows));
    }
    default:
      throw new UserError("Unknown action.");
  }
});
