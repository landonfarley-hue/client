# Your Home Timeline — yourhometimeline.com

Client portal for Landon Farley Real Estate (Keller Williams Sioux Falls). Clients sign in with their email and follow the sale or purchase of their home:

- **Their home**: photo, address, price, status, target closing date
- **The timeline**: a 14-step checklist (seller or buyer version) that Landon checks off as things happen
- **Showing feedback** (sellers): interest rating, take on price, and comments from each showing
- **Open houses** (sellers): visitors, serious buyers and a recap of how it went
- **Alerts**: an email (and optional text) to the client every time a step is checked off, feedback or an open house is added, or Landon posts an update

Landon manages everything from **agent.html** (the Agent Dashboard).

Same look as discoversiouxfallshomes.com (`assets/theme.css` is copied from that site).

---

## Right now: preview mode

Until the backend is connected, the site runs in **preview mode** with two made-up sample clients saved only in the visitor's browser. Use the "Preview the portal" buttons (As a Seller, As a Buyer). The agent dashboard is locked in preview mode and only opens for emails on the agent list once Supabase is connected.

## Going live (about 30 minutes, one time)

The portal needs a small backend for sign-in, client data and sending alerts. It uses **Supabase** (free tier is plenty) and **Resend** for email (free up to 3,000 emails/month).

### 1. Point the domain at GitHub Pages
At the registrar where you bought yourhometimeline.com, add these DNS records:

| Type  | Name | Value |
|-------|------|-------|
| A     | @    | 185.199.108.153 |
| A     | @    | 185.199.109.153 |
| A     | @    | 185.199.110.153 |
| A     | @    | 185.199.111.153 |
| CNAME | www  | landonfarley-hue.github.io |

Then in this repo: **Settings → Pages**, confirm the custom domain is `yourhometimeline.com`, and tick **Enforce HTTPS** once it's available (can take up to a day).

### 2. Create the Supabase project
1. Sign up at supabase.com → **New project** (name it `yourhometimeline`).
2. **SQL Editor → New query**, paste all of `supabase/schema.sql`, click **Run**. This creates the tables, the security rules (each client sees only their own home), the alert triggers and the photo storage. It adds `landonfarley@kw.com` as the agent; add teammates the same way:
   `insert into agents (email) values ('teammate@kw.com');`
3. **Authentication → URL Configuration**: Site URL `https://yourhometimeline.com`, and add `https://yourhometimeline.com/portal.html` under Redirect URLs.
4. **Project Settings → API Keys**: copy the **Project URL** and the **publishable** key (`sb_publishable_...`) into `assets/config.js`:
   ```js
   SUPABASE_URL: "https://xxxx.supabase.co",
   SUPABASE_PUBLISHABLE_KEY: "sb_publishable_...",
   ```
   (The publishable key is meant to be public. The security rules in the database are what protect client data. Never put a *secret* key in this repo.)

### 3. Email alerts (Resend)
1. Sign up at resend.com → **Domains → Add domain** `yourhometimeline.com` and add the DNS records it shows you.
2. **API Keys → Create** and copy the key.
3. In Supabase: **Edge Functions → Deploy a new function → via editor**, name it `notify`, paste `supabase/functions/notify/index.ts`, and turn **off** "Verify JWT". Deploy.
4. **Edge Functions → Secrets**, add:
   - `RESEND_API_KEY` = your Resend key
   - `FROM_EMAIL` = `Landon Farley <updates@yourhometimeline.com>`
   - `SITE_URL` = `https://yourhometimeline.com`
   - `WEBHOOK_SECRET` = any long random password
   - `AGENT_EMAIL` = `landonfarley@kw.com` (you get a confirmation email each time a portal is opened or a client is invited)
   - `AGENT_COPY_ALL` = `true` (optional: also get a copy of every alert sent to clients)
5. **Database → Webhooks → Create**: table `events`, event **Insert**, type **Supabase Edge Function** → `notify`, and add an HTTP header `x-webhook-secret` with the same value as `WEBHOOK_SECRET`.

Sign-in links are sent by Supabase's built-in mailer, which is rate-limited. For real use, go to **Authentication → SMTP Settings** and enter Resend's SMTP details (host `smtp.resend.com`, port 465, user `resend`, password = your Resend API key, sender `updates@yourhometimeline.com`).

### 4. Text-message alerts (optional)
Add Twilio secrets `TWILIO_SID`, `TWILIO_TOKEN`, `TWILIO_FROM` to the Edge Function. Clients with a mobile number saved under "Home & Client" will also get a text. US numbers need A2P 10DLC registration with Twilio first.

## Security checklist
- Clients sign in with a one-time link emailed to them, so they need access to that inbox. The database only returns homes whose client email list includes the signed-in email.
- Only emails in the `agents` table can open the dashboard or change anything.
- Protect `landonfarley@kw.com` with a strong password and two-step verification: whoever controls that inbox can sign in as the agent.
- Supabase → **Authentication → Providers → Email**: lower "Email OTP Expiration" to 900 seconds (15 minutes) so sign-in links expire quickly.
- Never put a Supabase **secret** key (`sb_secret_...`) or legacy **service_role** key in this repo.

## Daily use
1. Go to yourhometimeline.com → sign in with landonfarley@kw.com → you land on the Agent Dashboard.
2. **+ New Client**: choose seller or buyer, enter their name, email and the home. They get an invite email explaining how to sign in, and you get a confirmation email.
   Adding an email to an existing client later sends an invite to just that new address.
3. Click a circle to check off a step → the client gets an alert.
4. Sellers: add **Showing Feedback** and **Open House** recaps → alert sent.
5. **Post Update** for anything else (inspection scheduled, price change).
6. Untick **Send alerts** on a client to make quiet changes.

## Files
- `index.html` sign-in and landing page
- `portal.html` + `assets/portal.js` client view
- `agent.html` + `assets/agent.js` agent dashboard
- `assets/app.js` data layer (Supabase, or preview mode) and step templates
- `assets/config.js` Supabase keys and agent contact info
- `supabase/schema.sql` database, security rules, alert triggers
- `supabase/functions/notify/index.ts` sends the email/text alerts
