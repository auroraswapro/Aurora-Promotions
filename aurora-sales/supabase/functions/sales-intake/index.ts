// Where new leads arrive automatically: your website form, a forwarded email, or any tool that can POST.
// Send header "x-intake-key: <INTAKE_SECRET>" (or ?key=<INTAKE_SECRET>) with JSON like:
//   { "name": "...", "email": "...", "phone": "...", "company": "...", "message": "...", "source": "website" }
// or just { "text": "<the whole email or form>", "source": "email" }.
// Claude reads it, the lead is saved and assigned, and the first email is drafted for approval.
import { getSettings, json, sameSecret, serve, UserError } from "../_shared/core.ts";
import { parseLead } from "../_shared/ai.ts";
import { createLead } from "../_shared/sales.ts";

const str = (v: unknown, max = 5000) => (typeof v === "string" ? v.trim().slice(0, max) : typeof v === "number" ? String(v) : "");

serve(async (req, body) => {
  const key = req.headers.get("x-intake-key") ?? new URL(req.url).searchParams.get("key");
  if (!sameSecret(key, Deno.env.get("INTAKE_SECRET"))) return json({ error: "Not allowed." }, 401);

  // Turn whatever arrived into one block of text for Claude, keeping any form fields.
  const known = ["name", "email", "phone", "company", "source"];
  const extra = Object.entries(body).filter(([k]) => ![...known, "text"].includes(k)).map(([k, v]) => `${k}: ${str(typeof v === "object" ? JSON.stringify(v) : v)}`);
  const text = [str(body.text, 20000), ...known.filter((k) => body[k]).map((k) => `${k}: ${str(body[k])}`), ...extra].filter(Boolean).join("\n");
  if (text.length < 5) throw new UserError("Nothing to read.");

  const { playbook } = await getSettings();
  const parsed = await parseLead(text, playbook);
  if (!parsed.is_lead && !body.email) return json({ ok: true, skipped: "Claude says this isn't a sales enquiry." });

  // Form fields win over what Claude read, because the person typed them.
  for (const k of known) if (str(body[k])) (parsed as Record<string, unknown>)[k] = str(body[k], 254);
  const result = await createLead({ fields: parsed, enquiry: text });
  return json({ ok: true, leadId: result.lead.id, duplicate: result.duplicate, drafted: !!result.draft });
});
