// Runs every 15 minutes (see schedule.sql). It:
//   1. checks the mailbox for client replies and hands them to Claude
//   2. has Claude draft the next follow-up for leads whose wait is nearly over
//   3. marks sequences finished when the last email got no reply
// Nothing is sent here: drafts wait for a person to approve them.
import { db, getSettings, json, sameSecret, serve } from "../_shared/core.ts";
import { canCheckReplies, findReplies } from "../_shared/mail.ts";
import { draftForLead, handleReply, notify } from "../_shared/sales.ts";

serve(async (req) => {
  if (!sameSecret(req.headers.get("x-cron-key"), Deno.env.get("CRON_SECRET"))) return json({ error: "Not allowed." }, 401);
  const started = Date.now();
  const timeLeft = () => Date.now() - started < 120000;
  const { sequence } = await getSettings();
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

  // 2. Next follow-ups, drafted ahead of time so approval doesn't delay them.
  const ahead = new Date(Date.now() + (Number(sequence.leadHours) || 12) * 3600000).toISOString();
  const { data: due } = await db.from("leads").select("id,owner_id,next_step,name,email")
    .in("status", ["new", "following"]).lte("next_due_at", ahead).lt("next_step", sequence.steps.length).neq("email", "")
    .order("next_due_at").limit(25);
  const byOwner = new Map<string, string[]>();
  for (const l of due ?? []) {
    if (!timeLeft()) break;
    const { data: waiting } = await db.from("lead_messages").select("id").eq("lead_id", l.id).eq("status", "draft").limit(1);
    if (waiting?.length) continue;
    try {
      await draftForLead(l.id, { kind: "followup" });
      report.drafted++;
      if (l.owner_id) byOwner.set(l.owner_id, [...(byOwner.get(l.owner_id) ?? []), l.name || l.email]);
    } catch (e) {
      report.errors++;
      console.error("draft", l.id, e);
    }
  }
  for (const [owner, names] of byOwner) {
    await notify([owner], `${names.length} follow-up${names.length > 1 ? "s" : ""} ready to approve`, `Claude has written follow-ups for: ${names.join(", ")}.`);
  }

  // 3. Sequences that ended with no reply
  const { data: done } = await db.from("leads").update({ status: "finished", next_due_at: null })
    .eq("status", "following").gte("next_step", sequence.steps.length).lte("next_due_at", new Date().toISOString()).select("id");
  for (const l of done ?? []) {
    report.finished++;
    await db.from("lead_events").insert({ lead_id: l.id, type: "finished", text: "All follow-ups sent with no reply. Sequence finished." });
  }

  return json(report);
});
