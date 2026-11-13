// Sends one approved email. Only a signed-in team member can call this,
// and only for a draft that is waiting for approval.
import { json, requireMember, serve, UserError } from "../_shared/core.ts";
import { sendDraft } from "../_shared/sales.ts";

serve(async (req, body) => {
  const user = await requireMember(req);
  if (typeof body.messageId !== "string") throw new UserError("Missing draft.");
  const edits = {
    subject: typeof body.subject === "string" ? body.subject : undefined,
    body: typeof body.body === "string" ? body.body : undefined,
    followUpDays: typeof body.followUpDays === "number" ? body.followUpDays : undefined,
  };
  return json(await sendDraft(body.messageId, edits, user));
});
