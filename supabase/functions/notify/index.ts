// Your Home Timeline — "notify" function.
// Called by a Supabase Database Webhook every time a row is added to public.events.
// Emails the clients on that transaction (Resend) and, if Twilio is configured, texts them.
//
// Secrets (Supabase → Edge Functions → Secrets):
//   RESEND_API_KEY   required for email
//   FROM_EMAIL       e.g.  Landon Farley <updates@yourhometimeline.com>
//   SITE_URL         https://yourhometimeline.com
//   WEBHOOK_SECRET   any long random string; also set as the x-webhook-secret header on the webhook
//   AGENT_EMAIL      gets a confirmation email each time a portal is opened or a client is invited
//   AGENT_COPY_ALL   optional: "true" to also BCC the agent on every client alert
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
  ${ev.kind === "welcome" ? `<p style="font-size:15px;line-height:1.6;margin:14px 0 0">Your private portal shows each step of the process as it's checked off${tx.side === "seller" ? ", plus showing feedback and open house results" : ""}. You'll get an email like this every time something is done.</p>
  <p style="font-size:15px;line-height:1.6;margin:14px 0 0"><b>To sign in:</b> click the button below and enter this email address. We'll email you a secure one-time sign-in link. No password needed.</p>` : ""}
</td></tr>
${ev.kind === "welcome" || !total ? "" : `<tr><td style="padding:22px 32px 6px">
  <div style="font-size:12px;color:#4A5B78;margin-bottom:6px">${done} of ${total} steps complete</div>
  <div style="background:#E2E8F1;height:8px;border-radius:4px"><div style="background:#C2A15E;height:8px;width:${pct}%;border-radius:4px"></div></div>
</td></tr>`}
<tr><td style="padding:24px 32px 30px;text-align:center">
  <a href="${ev.kind === "welcome" ? SITE + "/#signin" : SITE + "/portal.html?t=" + tx.id}" style="display:inline-block;background:#0A1F44;color:#ffffff;text-decoration:none;font-size:12px;letter-spacing:3px;text-transform:uppercase;padding:14px 26px">${ev.kind === "welcome" ? "Open my portal" : "View your timeline"}</a>
  <p style="font-size:12px;color:#4A5B78;margin:18px 0 0">Questions? Call or text Landon at <a href="tel:+16052513116" style="color:#8E6F2E">(605) 251-3116</a>.</p>
</td></tr>
</table>
<p style="font-size:10px;color:#4A5B78;letter-spacing:1px;text-transform:uppercase;margin-top:16px">Keller Williams Sioux Falls · Each office is independently owned and operated</p>
</td></tr></table></body></html>`;
}

function agentHtml(tx: any, to: string[], isNew: boolean) {
  const who = to.length ? to.map(esc).join(", ") : "";
  return `<!doctype html><html><body style="margin:0;background:#F4F7FB;font-family:Inter,Arial,sans-serif;color:#0A1F44">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:32px 12px"><tr><td align="center">
<table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;background:#fff;border:1px solid #E2E8F1;border-top:4px solid #C2A15E">
<tr><td style="padding:28px 32px">
  <div style="font-size:11px;letter-spacing:3px;text-transform:uppercase;color:#8E6F2E">${isNew ? "New portal opened" : "Client invited"}</div>
  <h1 style="font-family:Georgia,serif;font-weight:500;font-size:22px;margin:8px 0 12px">${esc(tx.client_name)}</h1>
  <table role="presentation" cellpadding="0" cellspacing="0" style="font-size:14px;line-height:1.7">
    <tr><td style="color:#4A5B78;padding-right:14px">Side</td><td>${tx.side === "seller" ? "Selling" : "Buying"}</td></tr>
    <tr><td style="color:#4A5B78;padding-right:14px">Home</td><td>${esc(tx.address || "Not set yet")}${tx.city ? ", " + esc(tx.city) : ""}</td></tr>
    <tr><td style="color:#4A5B78;padding-right:14px">Invite sent to</td><td>${who || "<b>Nobody yet</b>: add a client email on the dashboard to send the invite"}</td></tr>
  </table>
  <p style="margin:22px 0 0"><a href="${SITE}/agent.html?t=${tx.id}" style="display:inline-block;background:#0A1F44;color:#fff;text-decoration:none;font-size:12px;letter-spacing:3px;text-transform:uppercase;padding:12px 22px">Open in dashboard</a></p>
</td></tr></table></td></tr></table></body></html>`;
}

async function sendEmail(body: Record<string, unknown>) {
  const r = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${env("RESEND_API_KEY")}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: env("FROM_EMAIL") || "Your Home Timeline <updates@yourhometimeline.com>", ...body }),
  });
  return r.status;
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
  if (!tx) return new Response("skipped");
  const to: string[] = ev.recipients?.length ? ev.recipients : (tx.client_emails ?? []);
  const results: Record<string, unknown> = {};

  // ---- agent confirmation when a portal is opened / a client is invited ----
  if (ev.kind === "welcome" && env("RESEND_API_KEY") && env("AGENT_EMAIL")) {
    results.agent = await sendEmail({
      to: [env("AGENT_EMAIL")],
      subject: `${ev.recipients?.length ? "Client invited" : "New portal opened"}: ${tx.client_name}`,
      html: agentHtml(tx, tx.alerts_enabled ? to : [], !ev.recipients?.length),
    });
  }
  if (!tx.alerts_enabled) {
    await db.from("events").update({ notified_at: new Date().toISOString() }).eq("id", ev.id);
    return new Response(JSON.stringify(results), { headers: { "Content-Type": "application/json" } });
  }

  const { data: steps } = await db.from("steps").select("done").eq("transaction_id", tx.id);
  const total = steps?.length ?? 0;
  const done = steps?.filter((s: any) => s.done).length ?? 0;

  // ---- email to the client(s) ----
  if (env("RESEND_API_KEY") && to.length) {
    results.email = await sendEmail({
      to,
      bcc: env("AGENT_EMAIL") && env("AGENT_COPY_ALL") === "true" ? [env("AGENT_EMAIL")] : undefined,
      reply_to: "LandonFarley@kw.com",
      subject: ev.kind === "welcome" ? "Your home timeline is ready · Landon Farley" : `${ev.title} · ${tx.address || "Your home"}`,
      html: emailHtml(ev, tx, done, total),
    });
  }

  // ---- text message (optional) ----
  if (env("TWILIO_SID") && env("TWILIO_TOKEN") && env("TWILIO_FROM") && tx.client_phones?.length && !ev.recipients?.length) {
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
