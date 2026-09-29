# Putting the Aurora Team Tracker online

Setup takes about **20 minutes**, once. Everything used is **free**.

- The **website** is hosted by **GitHub Pages**. You already have GitHub.
- Your team's **data and sign-in codes** are handled by **Supabase**, a free online database.

Until Supabase is connected, the website runs in **demo mode** with sample data, so you can
try it straight away.

---

## Part 1: Turn on the website (2 minutes)

1. Open <https://github.com/auroraswapro/Aurora-Promotions/settings/pages>
2. Under **Build and deployment → Source**, choose **GitHub Actions**.
3. Tell Claude "Pages is on". Claude will publish the site.

Your website address will be:
**https://auroraswapro.github.io/Aurora-Promotions/**

---

## Part 2: Create the online database (10 minutes)

### 2.1 Create a Supabase project
1. Go to <https://supabase.com> → **Start your project** → sign in with **GitHub**.
2. Click **New project**.
   - **Name:** `aurora-tracker`
   - **Database password:** click **Generate a password**, then save it somewhere safe.
     You won't need it day-to-day.
   - **Region:** pick the one closest to your team.
3. Click **Create new project** and wait about 1 minute.

### 2.2 Set up the tables (one copy-paste)
1. In the left menu click **SQL Editor** → **New query**.
2. Open this file, click the **copy** button (top-right of the file), and paste it in:
   <https://github.com/auroraswapro/Aurora-Promotions/blob/claude/aurora-promotions-project-tool-ku6nvt/supabase/setup.sql>
3. Click **Run**. You should see **"Success. No rows returned"**.

### 2.3 Make the sign-in email show a 6-digit code
1. Left menu → **Authentication** → **Emails** (or **Email Templates**).
2. Open the **Magic Link** template. Set **Subject** to `Your Aurora sign-in code` and
   replace the whole **Body** with:

   ```html
   <h2>Your Aurora Team Tracker sign-in code</h2>
   <p>Enter this code to sign in:</p>
   <p style="font-size:28px;font-weight:bold;letter-spacing:6px">{{ .Token }}</p>
   <p>The code expires in 1 hour. If you didn't ask for it, you can ignore this email.</p>
   ```
3. Click **Save**.
4. Do the same for the **Confirm signup** template (same subject, same body).
   New team members receive this one the first time they sign in.

### 2.4 Let Supabase send emails from your Gmail
Supabase's built-in email only sends to its own account holders, so connect your Gmail:

1. **Create a Gmail app password:**
   - Go to <https://myaccount.google.com/security> and make sure **2-Step Verification** is **On**.
   - Go to <https://myaccount.google.com/apppasswords>, type `Aurora tracker`, click **Create**.
   - Copy the 16-letter password it shows.
2. **In Supabase:** left menu → **Authentication** → **Emails** → **SMTP Settings** →
   turn on **Enable custom SMTP** and fill in:

   | Field | Value |
   |---|---|
   | Sender email | your Gmail address |
   | Sender name | `Aurora Promotions` |
   | Host | `smtp.gmail.com` |
   | Port | `587` |
   | Username | your Gmail address |
   | Password | the 16-letter app password |

3. Click **Save**.

### 2.5 Send Claude the two connection values
Left menu → **Project Settings** (gear icon) → **API** (or **Data API**). Copy these two:
- **Project URL**: looks like `https://abcdefgh.supabase.co`
- **anon public** key: a long text starting with `eyJ…` (or `sb_publishable_…`)

Paste both to Claude. These two are **meant to be public**, so it is safe to share them.
**Never** share the `service_role` / secret key or your database password.

Claude will connect the website and publish it.

---

## Part 3: Start using it

1. Open **https://auroraswapro.github.io/Aurora-Promotions/**
2. Type **your** email, then enter the 6-digit code from your inbox.
   **The first person to sign in becomes the manager**, so sign in right away.
3. Go to **Team → Add team member** and add each person's name and email.
4. Send them the website link. They type their email, enter their code, and they're in.

Only emails you've added on the Team page can see anything.

---

### Good to know
- **Free limits:** plenty for a team of this size. A free Supabase project pauses after
  **7 days with no use at all**. If that happens, open supabase.com and click **Restore**.
  Daily use keeps it awake.
- **Backups:** Supabase → **Database → Backups**, or ask Claude to add an export button.
- **Want changes?** Tell Claude what you'd like and it will update the website.
