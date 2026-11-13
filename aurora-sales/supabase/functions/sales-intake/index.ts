// Where new leads arrive automatically: your website form, a forwarded email, or any tool that can POST.
// Send header "x-intake-key: <INTAKE_SECRET>" (or ?key=<INTAKE_SECRET>) with JSON like:
//   { "name": "...", "email": "...", "phone": "...", "company": "...", "message": "...", "source": "website" }
// or just { "text": "<the whole email or form>", "source": "email" }.
// Claude reads it, the lead is saved and assigned, and the first email is drafted for approval.
import { getIntegrations, getSettings, json, sameSecret, serve, UserError } from "../_shared/core.ts";
import { fromGhl } from "../_shared/ghl.ts";
import { parseLead } from "../_shared/ai.ts";
import { createLead } from "../_shared/sales.ts";

const str = (v: unknown, max = 5000) => (typeof v === "string" ? v.trim().slice(0, max) : typeof v === "number" ? String(v) : "");

serve(async (req, body) => {
  const key = req.headers.get("x-intake-key") ?? new URL(req.url).searchParams.get("key");
  const { intakeKey } = await getIntegrations();
  if (!sameSecret(key, Deno.env.get("INTAKE_SECRET")) && !sameSecret(key, intakeKey)) return json({ error: "Not allowed." }, 401);

  // A GoHighLevel workflow webhook sends contact fields like first_name / full_name / company_name.
  const ghl = fromGhl(body);
  if (ghl) for (const [k, v] of Object.entries(ghl.fields)) if (v && !body[k]) body[k] = v;

  // Turn whatever arrived into one block of text for Claude, keeping any form fields.
  const known = ["name", "email", "phone", "company", "source"];
  const skip = ["text", "first_name", "last_name", "full_name", "company_name", "contact_id", "location", "user", "workflow", "triggerData", "contact", "attributionSource", "lastAttributionSource"];
  const extra = Object.entries(body).filter(([k, v]) => ![...known, ...skip].includes(k) && v !== null && v !== "").map(([k, v]) => `${k}: ${str(typeof v === "object" ? JSON.stringify(v) : v)}`);
  const text = [str(body.text, 20000), ...known.filter((k) => body[k]).map((k) => `${k}: ${str(body[k])}`), ...extra].filter(Boolean).join("\n");
  if (text.length < 5) throw new UserError("Nothing to read.");

  const { playbook } = await getSettings();
  const parsed = await parseLead(text, playbook);
  if (!parsed.is_lead && !body.email) return json({ ok: true, skipped: "Claude says this isn't a sales enquiry." });

  // Form fields win over what Claude read, because the person typed them.
  for (const k of known) if (str(body[k])) (parsed as Record<string, unknown>)[k] = str(body[k], 254);
  const result = await createLead({ fields: parsed, enquiry: text, extraDetails: ghl?.contactId ? { ghl_contact_id: ghl.contactId } : undefined });
  return json({ ok: true, leadId: result.lead.id, duplicate: result.duplicate, drafted: !!result.draft });
});
