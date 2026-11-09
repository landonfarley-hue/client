// Your Home Timeline — "notify" function.
// Called by a Supabase Database Webhook every time a row is added to public.events.
// Emails the clients on that transaction (Resend) and, if Twilio is configured, texts them.
//
// Secrets (Supabase → Edge Functions → Secrets):
//   RESEND_API_KEY   required for email
//   FROM_EMAIL       e.g.  Landon Farley <updates@yourhometimeline.com>
//   SITE_URL         https://yourhometimeline.com
//   WEBHOOK_SECRET   any long random string; also set as the x-webhook-secret header on the webhook
//   AGENT_EMAIL      optional: gets a copy (BCC) of every alert
//   TWILIO_SID / TWILIO_TOKEN / TWILIO_FROM   optional: text-message alerts
import { createClient } from "jsr:@supabase/supabase-js@2";

const env = (k: string) => Deno.env.get(k) ?? "";
const SITE = env("SITE_URL") || "https://yourhometimeline.com";

const esc = (s: string) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));

const LABEL: Record<string, string> = {
  welcome: "Welcome",
  step: "Milestone complete",
  feedback: "Showing feedback",
  open_house: "Open house recap",
  note: "Update from Landon",
};

function emailHtml(ev: any, tx: any, done: number, total: number) {
  const pct = total ? Math.round((done / total) * 100) : 0;
  return `<!doctype html><html><body style="margin:0;background:#F4F7FB;font-family:Inter,Arial,sans-serif;color:#0A1F44">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F4F7FB;padding:32px 12px"><tr><td align="center">
<table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border:1px solid #E2E8F1;border-top:4px solid #C2A15E">
<tr><td style="padding:28px 32px 8px;text-align:center">
  <div style="font-family:Georgia,serif;font-size:20px;letter-spacing:4px;text-transform:uppercase">Your Home Timeline</div>
  <div style="font-size:10px;letter-spacing:4px;text-transform:uppercase;color:#8E6F2E;margin-top:4px">Landon Farley · Keller Williams Sioux Falls</div>
</td></tr>
<tr><td style="padding:18px 32px 4px">
  <div style="font-size:11px;letter-spacing:3px;text-transform:uppercase;color:#8E6F2E">${esc(LABEL[ev.kind] ?? "Update")}</div>
  <h1 style="font-family:Georgia,serif;font-weight:500;font-size:24px;line-height:1.25;margin:8px 0 6px">${esc(ev.title)}</h1>
  <div style="font-size:14px;color:#4A5B78">${esc(tx.address)}${tx.city ? ", " + esc(tx.city) : ""}</div>
  ${ev.body ? `<p style="font-size:15px;line-height:1.6;margin:16px 0 0;white-space:pre-line">${esc(ev.body)}</p>` : ""}
</td></tr>
<tr><td style="padding:22px 32px 6px">
  <div style="font-size:12px;color:#4A5B78;margin-bottom:6px">${done} of ${total} steps complete</div>
  <div style="background:#E2E8F1;height:8px;border-radius:4px"><div style="background:#C2A15E;height:8px;width:${pct}%;border-radius:4px"></div></div>
</td></tr>
<tr><td style="padding:24px 32px 30px;text-align:center">
  <a href="${SITE}/portal.html?t=${tx.id}" style="display:inline-block;background:#0A1F44;color:#ffffff;text-decoration:none;font-size:12px;letter-spacing:3px;text-transform:uppercase;padding:14px 26px">View your timeline</a>
  <p style="font-size:12px;color:#4A5B78;margin:18px 0 0">Questions? Call or text Landon at <a href="tel:+16052513116" style="color:#8E6F2E">(605) 251-3116</a>.</p>
</td></tr>
</table>
<p style="font-size:10px;color:#4A5B78;letter-spacing:1px;text-transform:uppercase;margin-top:16px">Keller Williams Sioux Falls · Each office is independently owned and operated</p>
</td></tr></table></body></html>`;
}

Deno.serve(async (req) => {
  if (env("WEBHOOK_SECRET") && req.headers.get("x-webhook-secret") !== env("WEBHOOK_SECRET")) {
    return new Response("unauthorized", { status: 401 });
  }
  const payload = await req.json().catch(() => null);
  const ev = payload?.record;
  if (!ev?.transaction_id) return new Response("no record", { status: 400 });

  const db = createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"));
  const { data: tx } = await db.from("transactions").select("*").eq("id", ev.transaction_id).single();
  if (!tx || !tx.alerts_enabled) return new Response("skipped");

  const { data: steps } = await db.from("steps").select("done").eq("transaction_id", tx.id);
  const total = steps?.length ?? 0;
  const done = steps?.filter((s: any) => s.done).length ?? 0;
  const results: Record<string, unknown> = {};

  // ---- email ----
  if (env("RESEND_API_KEY") && tx.client_emails?.length) {
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${env("RESEND_API_KEY")}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: env("FROM_EMAIL") || "Your Home Timeline <updates@yourhometimeline.com>",
        to: tx.client_emails,
        bcc: env("AGENT_EMAIL") ? [env("AGENT_EMAIL")] : undefined,
        reply_to: "LandonFarley@kw.com",
        subject: `${ev.title} · ${tx.address || "Your home"}`,
        html: emailHtml(ev, tx, done, total),
      }),
    });
    results.email = r.status;
  }

  // ---- text message (optional) ----
  if (env("TWILIO_SID") && env("TWILIO_TOKEN") && env("TWILIO_FROM") && tx.client_phones?.length) {
    const auth = btoa(`${env("TWILIO_SID")}:${env("TWILIO_TOKEN")}`);
    const text = `Your Home Timeline: ${ev.title} (${tx.address}). See details: ${SITE}/portal.html?t=${tx.id}`;
    results.sms = await Promise.all(
      tx.client_phones.map((to: string) =>
        fetch(`https://api.twilio.com/2010-04-01/Accounts/${env("TWILIO_SID")}/Messages.json`, {
          method: "POST",
          headers: { Authorization: `Basic ${auth}`, "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({ To: to, From: env("TWILIO_FROM"), Body: text }),
        }).then((r) => r.status)
      ),
    );
  }

  await db.from("events").update({ notified_at: new Date().toISOString() }).eq("id", ev.id);
  return new Response(JSON.stringify(results), { headers: { "Content-Type": "application/json" } });
});
