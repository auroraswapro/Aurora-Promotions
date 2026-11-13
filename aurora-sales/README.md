# Aurora Sales · AI lead follow-up, powered by Claude

A separate system from the Team Tracker, with its own database, sign-in and team.
Claude reads every lead, writes every follow-up email, reads replies and answers questions
about the pipeline. **A person approves every email before it is sent.**

- **Website (once published):** https://auroraswapro.github.io/Aurora-Promotions/sales/
- **Try it now (demo, nothing is sent):** open the site with `?demo` at the end, or `?demo&manager`
  to see the manager screens.

## How it works

There is **no fixed email sequence**. Every email is written by Claude for that one lead, based on
everything said so far, and a person approves it.

```
Lead arrives ──▶ Claude reads it ──▶ Claude writes an email ──▶ You approve ──▶ Sent from your domain
                                      and suggests when to       (edit, rewrite,
                                      check in again             change the timing)
                                              ▲                                     │
                                              │   no reply by the day Claude picked │
                                              └──── Claude writes a new email ◀─────┘

Client replies ──▶ Claude reads it, updates the lead and writes an answer for you to approve
```

Claude stops after a set number of emails in a row with no reply (5 by default, changeable in Settings).

| Screen | What it's for |
|---|---|
| **Today** | Emails waiting for your approval, latest replies, and "Plan my day" |
| **Leads** | Every lead, its status, and Claude's suggested next step |
| **Lead page** | Claude's view, when the next email is due, details, and the whole conversation |
| **Add lead** | Paste any email, form or call notes; Claude fills in the lead and writes the first email |
| **Ask Claude** | Questions about your leads ("Which hot leads haven't heard from us?") |
| **Settings** | How Claude writes (about Aurora, tone, rules, signature), follow-up limit, and the team |

### What's in this folder

| Path | What it is |
|---|---|
| `web/` | The app the team uses (plain HTML/JS, no build step) |
| `supabase/schema.sql` | Database tables and security rules (one copy-paste) |
| `supabase/schedule.sql` | Turns on the background check that runs every 15 minutes |
| `supabase/functions/sales-ai` | Claude actions: read a lead, draft, rewrite, read a reply, summary, ask |
| `supabase/functions/sales-send` | Sends one approved email from your mailbox |
| `supabase/functions/sales-intake` | Where website forms and forwarded emails send new leads |
| `supabase/functions/sales-cron` | Every 15 min: checks for replies, has Claude write emails that are due, closes leads with no reply |

---

## Setup (about 45 minutes, once)

You need: a **new** Supabase project (free), a **Claude API key**, and access to your
**domain email** (Google Workspace or Microsoft 365).

### 1. Create the database
1. Go to <https://supabase.com> → **New project**. Name it `aurora-sales`.
   (Use a new project, not the Team Tracker's.)
2. **SQL Editor → New query**, paste all of [`supabase/schema.sql`](supabase/schema.sql), click **Run**.
3. **Authentication → Emails**: set up the 6-digit code email and Gmail SMTP exactly like
   steps 2.3 and 2.4 in the Team Tracker's [SETUP.md](../SETUP.md).

### 2. Connect the website
In [`web/config.js`](web/config.js) put this project's **Project URL** and **anon public** key
(Project Settings → API). These two are safe to share. Never share the `service_role` key.

### 3. Get a Claude API key
<https://console.anthropic.com> → **API Keys** → **Create key**. Add a little credit under Billing.

### 4. Connect your sales mailbox
Pick the one that matches your email. Emails go out from this address (for example
`sales@yourdomain.com`), so they land in clients' inboxes as normal emails and replies come back to it.

**Google Workspace (Gmail)**
1. <https://console.cloud.google.com> → new project → **APIs & Services → Enable APIs** → enable **Gmail API**.
2. **OAuth consent screen**: Internal. **Credentials → Create OAuth client ID** → Web application,
   add `https://developers.google.com/oauthplayground` as a redirect URI.
3. Open <https://developers.google.com/oauthplayground>, click the gear, tick **Use your own OAuth
   credentials**, paste the client ID and secret. Authorize scope
   `https://www.googleapis.com/auth/gmail.modify` **while signed in as the sales mailbox**, then
   **Exchange authorization code for tokens** and copy the **refresh token**.
4. Secrets (step 5): `MAIL_PROVIDER=gmail`, `MAIL_FROM`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REFRESH_TOKEN`.

**Microsoft 365 (Outlook)**
1. <https://entra.microsoft.com> → **App registrations → New registration**.
2. **API permissions → Microsoft Graph → Application permissions**: `Mail.Send` and `Mail.Read`
   → **Grant admin consent**. (Optional: limit the app to the sales mailbox with an
   application access policy.)
3. **Certificates & secrets → New client secret**.
4. Secrets: `MAIL_PROVIDER=microsoft`, `MAIL_FROM`, `MS_TENANT_ID`, `MS_CLIENT_ID`, `MS_CLIENT_SECRET`.

**Resend (sending only)**: `MAIL_PROVIDER=resend`, `MAIL_FROM`, `RESEND_API_KEY` after verifying
your domain in Resend. Replies aren't detected automatically with Resend, so the team logs them
with **Log a reply**.

### 5. Deploy the server functions
Install the [Supabase CLI](https://supabase.com/docs/guides/cli), then from this `aurora-sales` folder:

```bash
supabase login
```

```bash
supabase link --project-ref YOUR-PROJECT-REF
```

```bash
supabase secrets set ANTHROPIC_API_KEY=sk-ant-... MAIL_PROVIDER=gmail MAIL_FROM=sales@yourdomain.com GOOGLE_CLIENT_ID=... GOOGLE_CLIENT_SECRET=... GOOGLE_REFRESH_TOKEN=... INTAKE_SECRET=pick-a-long-random-text CRON_SECRET=pick-another-long-random-text
```

```bash
supabase functions deploy sales-ai
```

```bash
supabase functions deploy sales-send
```

```bash
supabase functions deploy sales-intake --no-verify-jwt
```

```bash
supabase functions deploy sales-cron --no-verify-jwt
```

`sales-intake` and `sales-cron` are protected by `INTAKE_SECRET` and `CRON_SECRET` instead of a sign-in.

Optional secrets:

| Secret | Default | What it does |
|---|---|---|
| `CLAUDE_MODEL` | `claude-opus-5-5` | Which Claude model writes and reads |
| `NOTIFY_TEAM` | `on` | Email the lead owner when drafts are ready or a client replies (`off` to stop) |
| `APP_URL` | the GitHub Pages `/sales/` link | Link used in those alert emails |
| `MAIL_REPLY_TO` | – | Send replies to a different address |

### 6. Turn on the background check
Open [`supabase/schedule.sql`](supabase/schedule.sql), replace `YOUR-PROJECT-REF` and
`YOUR-CRON-SECRET`, paste it into the SQL Editor and **Run**.

### 7. Sign in
Open the website, sign in with your email. **The first person to sign in becomes the sales
manager.** Then add the team under **Settings → Team**, and check **Settings → How Claude writes**.

---

## Connecting GoHighLevel (GHL)

Managers do this in the app under **Settings → Integrations**. The page has the steps.

1. **New GHL leads → Aurora Sales.** Click **Create my lead link**, copy it, and add it as a
   **Webhook** action (POST) in a GHL workflow triggered by **Contact Created** or **Form Submitted**.
   Claude reads each contact, the lead is assigned, and the first email waits for approval.
2. **Aurora Sales → GHL (optional).** Create a **Private Integration** in GHL (scopes: View Contacts,
   Edit Contacts, View Locations), paste its key and your **Location ID**, then **Test connection**.
   Every sent email and client reply is then added as a note on the GHL contact.

The GHL key is stored in a private table that only the server can read.

## Sending leads in automatically

Anything that can send a web request can create a lead:

```
POST https://YOUR-PROJECT-REF.supabase.co/functions/v1/sales-intake
x-intake-key: YOUR-INTAKE-SECRET
Content-Type: application/json

{ "name": "Tina", "email": "tina@club.org", "company": "Riverside FC",
  "message": "80 hoodies for our May tournament", "source": "Website form" }
```

or `{ "text": "<the whole email>", "source": "Email" }`. Claude reads it, skips spam, merges
repeat enquiries into the existing lead, assigns an owner and drafts the first email.

- **Website form:** point your form's webhook / "send to URL" setting at the link above
  (most form builders support this, or use Zapier/Make).
- **Enquiries that arrive by email (Gmail):** in <https://script.google.com>, signed in as the
  inbox that receives enquiries, create a script with the code below, set the two values, and
  add a time trigger (every 5 minutes). Label enquiry emails `New lead` (a Gmail filter can do it).

```javascript
const URL = 'https://YOUR-PROJECT-REF.supabase.co/functions/v1/sales-intake';
const KEY = 'YOUR-INTAKE-SECRET';
function sendNewLeads() {
  const label = GmailApp.getUserLabelByName('New lead');
  const done = GmailApp.getUserLabelByName('Sent to Aurora Sales') || GmailApp.createLabel('Sent to Aurora Sales');
  if (!label) return;
  for (const thread of label.getThreads(0, 20)) {
    const m = thread.getMessages()[0];
    const res = UrlFetchApp.fetch(URL, {
      method: 'post', contentType: 'application/json', headers: { 'x-intake-key': KEY }, muteHttpExceptions: true,
      payload: JSON.stringify({ text: 'From: ' + m.getFrom() + '\nSubject: ' + m.getSubject() + '\n\n' + m.getPlainBody(), source: 'Email' }),
    });
    if (res.getResponseCode() === 200) { thread.removeLabel(label); thread.addLabel(done); }
  }
}
```

## Safety built in
- Nothing is emailed without a person clicking **Approve & send**. The database itself blocks
  the app from marking an email as sent; only the server can, after approval.
- Reps approve emails for their own and unassigned leads; managers can approve any.
- A reply stops the follow-ups. "Stop" / "unsubscribe" blocks all future emails to that lead.
- Every email ends with the opt-out line set in Settings.
- Claude is told never to invent prices or delivery dates.
- Claude stops after the set number of emails with no reply.
- The Claude key and mailbox passwords live only in Supabase secrets, never in the website.
