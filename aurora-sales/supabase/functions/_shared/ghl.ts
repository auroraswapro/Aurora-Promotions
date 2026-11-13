// GoHighLevel (GHL) connection. Optional: only runs when a manager has connected GHL in Settings.
// Adds a note to the matching GHL contact when we send an email or a client replies,
// so the GHL record shows the same conversation.
import { db, getIntegrations, Integrations, Lead } from "./core.ts";

const API = "https://services.leadconnectorhq.com";
const headers = (token: string) => ({
  Authorization: `Bearer ${token}`, Version: "2021-07-28", Accept: "application/json", "Content-Type": "application/json",
});

/** Checks the saved key and Location ID. Returns the GHL business name. */
export async function ghlTest(cfg?: Integrations): Promise<{ ok: boolean; name?: string; error?: string }> {
  const c = cfg ?? await getIntegrations();
  if (!c.ghlToken || !c.ghlLocationId) return { ok: false, error: "Add the Private Integration key and the Location ID first." };
  const res = await fetch(`${API}/locations/${encodeURIComponent(c.ghlLocationId)}`, { headers: headers(c.ghlToken) });
  if (!res.ok) {
    const why = res.status === 401 ? "GHL didn't accept the key. Check it was copied fully." :
      res.status === 403 ? "The key works but can't see this location. Check the Location ID and the key's permissions (scopes)." :
      res.status === 404 ? "GHL couldn't find that Location ID." : `GHL answered with error ${res.status}.`;
    return { ok: false, error: why };
  }
  const j = await res.json();
  return { ok: true, name: j?.location?.name ?? j?.name ?? "your GHL account" };
}

/** Finds the GHL contact for a lead (or creates it), remembering the contact id on the lead. */
async function contactId(c: Integrations, lead: Lead): Promise<string | null> {
  const known = lead.details?.ghl_contact_id;
  if (known) return String(known);
  if (!lead.email && !lead.phone) return null;
  const [firstName, ...rest] = String(lead.name || "").trim().split(/\s+/);
  const res = await fetch(`${API}/contacts/upsert`, {
    method: "POST", headers: headers(c.ghlToken!),
    body: JSON.stringify({
      locationId: c.ghlLocationId, email: lead.email || undefined, phone: lead.phone || undefined,
      firstName: firstName || undefined, lastName: rest.join(" ") || undefined, companyName: lead.company || undefined,
      source: "Aurora Sales",
    }),
  });
  if (!res.ok) { console.error("ghl upsert", res.status, (await res.text()).slice(0, 200)); return null; }
  const j = await res.json();
  const id = j?.contact?.id ?? j?.id ?? null;
  if (id) await db.from("leads").update({ details: { ...(lead.details ?? {}), ghl_contact_id: id } }).eq("id", lead.id);
  return id;
}

/** Adds a note to the lead's GHL contact. Never throws: GHL problems must not block sending. */
export async function ghlNote(lead: Lead, text: string): Promise<void> {
  try {
    const c = await getIntegrations();
    if (!c.ghlToken || !c.ghlLocationId || c.ghlSync === false) return;
    const id = await contactId(c, lead);
    if (!id) return;
    const res = await fetch(`${API}/contacts/${id}/notes`, {
      method: "POST", headers: headers(c.ghlToken), body: JSON.stringify({ body: text.slice(0, 5000) }),
    });
    if (!res.ok) console.error("ghl note", res.status, (await res.text()).slice(0, 200));
  } catch (e) {
    console.error("ghl note failed", e);
  }
}

/** Reads a GHL workflow webhook (contact or form data) into our lead fields. */
export function fromGhl(body: Record<string, any>): { fields: Record<string, string>; contactId: string } | null {
  const looksGhl = body.contact_id || body.location?.id || body.first_name !== undefined || body.full_name !== undefined;
  if (!looksGhl) return null;
  const s = (v: unknown) => (typeof v === "string" || typeof v === "number" ? String(v).trim() : "");
  const name = s(body.full_name) || [s(body.first_name), s(body.last_name)].filter(Boolean).join(" ") || s(body.name);
  return {
    contactId: s(body.contact_id),
    fields: {
      name, email: s(body.email), phone: s(body.phone), company: s(body.company_name) || s(body.company),
      source: s(body.contact_source) || s(body.source) || "GoHighLevel",
    },
  };
}
