// Runs every 15 minutes (see schedule.sql). It:
//   1. checks the mailbox for client replies and hands them to Claude
//   2. has Claude write the next email for leads whose check-in date (chosen by Claude) is near
//   3. closes leads as "No reply" after the last follow-up got no answer
// Nothing is sent here: drafts wait for a person to approve them.
import { db, getSettings, json, sameSecret, serve } from "../_shared/core.ts";
import { canCheckReplies, findReplies } from "../_shared/mail.ts";
import { draftForLead, handleReply, notify, OPEN } from "../_shared/sales.ts";

serve(async (req) => {
  if (!sameSecret(req.headers.get("x-cron-key"), Deno.env.get("CRON_SECRET"))) return json({ error: "Not allowed." }, 401);
  const started = Date.now();
  const timeLeft = () => Date.now() - started < 120000;
  const { followup } = await getSettings();
  const report = { replies: 0, drafted: 0, finished: 0, errors: 0 };

  // 1. Replies
  if (canCheckReplies) {
    const { data: leads } = await db.from("leads").select("id,email,last_contact_at,last_reply_at")
      .in("status", ["new", "following", "replied", "meeting", "quoted", "paused"]).not("last_contact_at", "is", null)
      .neq("email", "").order("last_contact_at", { ascending: false }).limit(60);
    for (const l of leads ?? []) {
      if (!timeLeft()) break;
      try {
        const since = new Date(Math.max(new Date(l.last_contact_at).getTime(), l.last_reply_at ? new Date(l.last_reply_at).getTime() + 1000 : 0) - 60000);
        const replies = await findReplies(l.email, since);
        for (const r of replies.sort((a, b) => a.receivedAt.localeCompare(b.receivedAt))) {
          const { data: seen } = await db.from("lead_messages").select("id").eq("provider_id", r.providerId).maybeSingle();
          if (seen || !r.text) continue;
          const out = await handleReply(l.id, r.text, { providerId: r.providerId, receivedAt: r.receivedAt, subject: r.subject });
          if (out) report.replies++;
        }
      } catch (e) {
        report.errors++;
        console.error("reply check", l.id, e);
      }
    }
  }

  // 2. Next emails, drafted a few hours early so approval doesn't delay them.
  const ahead = new Date(Date.now() + followup.leadHours * 3600000).toISOString();
  const { data: due } = await db.from("leads").select("id,owner_id,next_step,name,email")
    .in("status", OPEN).lte("next_due_at", ahead).lt("next_step", followup.maxFollowups).neq("email", "")
    .order("next_due_at").limit(25);
  const byOwner = new Map<string, string[]>();
  for (const l of due ?? []) {
    if (!timeLeft()) break;
    const { data: waiting } = await db.from("lead_messages").select("id").eq("lead_id", l.id).eq("status", "draft").limit(1);
    if (waiting?.length) continue;
    try {
      await draftForLead(l.id);
      report.drafted++;
      if (l.owner_id) byOwner.set(l.owner_id, [...(byOwner.get(l.owner_id) ?? []), l.name || l.email]);
    } catch (e) {
      report.errors++;
      console.error("draft", l.id, e);
    }
  }
  for (const [owner, names] of byOwner) {
    await notify([owner], `${names.length} email${names.length > 1 ? "s" : ""} ready to approve`, `Claude has written emails for: ${names.join(", ")}.`);
  }

  // 3. Leads where our last follow-up got no answer
  const { data: done } = await db.from("leads").update({ status: "finished", next_due_at: null })
    .in("status", OPEN).gte("next_step", followup.maxFollowups).lte("next_due_at", new Date().toISOString()).select("id");
  for (const l of done ?? []) {
    report.finished++;
    await db.from("lead_events").insert({ lead_id: l.id, type: "finished", text: "No reply after our last follow-up. Marked as No reply." });
  }

  return json(report);
});
