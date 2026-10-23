import { createHash, timingSafeEqual } from "node:crypto";
import nodemailer from "nodemailer";
import { SITE_URL } from "@/lib/site";

/**
 * Emails the owner about each new rwaft account. The API posts here once per
 * sign-up (backend-services/lib/alerts.ts), so the Gmail credentials live on
 * Vercel and the API never needs outbound SMTP.
 *
 * Server-only variables, set in the Vercel project:
 * - SIGNUP_ALERT_SECRET: shared with the API; any request without it is refused.
 * - GMAIL_USER and GMAIL_APP_PASSWORD: a Google App Password
 *   (myaccount.google.com/apppasswords), never the account's real password.
 * - SIGNUP_ALERT_TO: where alerts go; defaults to GMAIL_USER.
 *
 * GET with the same secret only checks the Gmail login; the API calls it at
 * startup so a bad setup shows up in its boot log.
 */

/** Read per request, not at import, so a build never bakes in empty values. */
function readConfig() {
  const user = process.env.GMAIL_USER?.trim() || "";
  return {
    secret: process.env.SIGNUP_ALERT_SECRET?.trim() || "",
    user,
    // Google shows App Passwords in groups of four; the spaces are not part of it.
    pass: (process.env.GMAIL_APP_PASSWORD || "").replace(/\s+/g, ""),
    to: process.env.SIGNUP_ALERT_TO?.trim() || user,
  };
}

type Config = ReturnType<typeof readConfig>;

/** Hashing first makes the comparison constant-time whatever the input's length. */
const digest = (value: string) => createHash("sha256").update(value).digest();

/** The Response to send back if this request may not go further, else null. */
function refuse(request: Request, config: Config): Response | null {
  if (!config.secret) {
    return Response.json({ message: "SIGNUP_ALERT_SECRET is not set on the website" }, { status: 503 });
  }
  const given = /^Bearer\s+(\S+)$/i.exec(request.headers.get("authorization") || "")?.[1] || "";
  if (!timingSafeEqual(digest(given), digest(config.secret))) {
    return Response.json({ message: "SIGNUP_ALERT_SECRET does not match the website's" }, { status: 401 });
  }
  if (!config.user || !config.pass) {
    return Response.json({ message: "GMAIL_USER and GMAIL_APP_PASSWORD are not set on the website" }, { status: 503 });
  }
  return null;
}

const createTransport = (config: Config) =>
  nodemailer.createTransport({
    service: "gmail",
    auth: { user: config.user, pass: config.pass },
    connectionTimeout: 10_000,
    socketTimeout: 15_000,
  });

const describeFailure = (error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  return /535|Invalid login|BadCredentials/i.test(message)
    ? `${message} (GMAIL_APP_PASSWORD must be an App Password for GMAIL_USER, not the account password)`
    : message;
};

/** The name and picture come from the user's Google profile, so they are escaped. */
const escapeHtml = (value: string) => value.replace(/[&<>"']/g, (char) => `&#${char.charCodeAt(0)};`);

const field = (value: unknown, max = 300) => (typeof value === "string" ? value.slice(0, max) : "");

export async function GET(request: Request) {
  const config = readConfig();
  const refusal = refuse(request, config);
  if (refusal) return refusal;
  try {
    await createTransport(config).verify();
    return Response.json({ message: `Gmail login as ${config.user} works, alerts go to ${config.to}` });
  } catch (error) {
    return Response.json({ message: describeFailure(error) }, { status: 502 });
  }
}

export async function POST(request: Request) {
  const config = readConfig();
  const refusal = refuse(request, config);
  if (refusal) return refusal;

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return Response.json({ message: "Body must be JSON" }, { status: 400 });
  }

  const email = field(body.email);
  const name = field(body.name);
  const picture = field(body.picture, 1000);
  const signedUpAt = new Date(field(body.signedUpAt) || Date.now());
  const rows: [string, string][] = [
    ["Name", name],
    ["Email", email],
    ["Account ID", field(body.id)],
    ["Free credits", String(Number(body.credits) || 0)],
    ["Signed up", Number.isNaN(signedUpAt.getTime()) ? new Date().toUTCString() : signedUpAt.toUTCString()],
  ];
  const adminUrl = `${SITE_URL}/admin`;

  const text = [
    "A new account was created on rwaft.",
    "",
    ...rows.map(([label, value]) => `${label}: ${value}`),
    "",
    `Admin panel: ${adminUrl}`,
  ].join("\n");
  const html = `<p>A new account was created on rwaft.</p>
<table cellpadding="4" style="border-collapse:collapse;font-family:sans-serif;font-size:14px">
${/^https:\/\//.test(picture) ? `<tr><td colspan="2"><img src="${escapeHtml(picture)}" alt="" width="48" height="48" style="border-radius:50%"></td></tr>\n` : ""}${rows.map(([label, value]) => `<tr><td style="color:#666">${label}</td><td>${escapeHtml(value)}</td></tr>`).join("\n")}
</table>
<p><a href="${escapeHtml(adminUrl)}">Open the admin panel</a></p>`;

  try {
    await createTransport(config).sendMail({
      from: `rwaft <${config.user}>`,
      to: config.to,
      // Reply goes straight to the new user.
      replyTo: email || undefined,
      subject: `New rwaft sign-up: ${name || email || "unknown"}`,
      text,
      html,
    });
    return Response.json({ message: `emailed ${config.to}` });
  } catch (error) {
    return Response.json({ message: describeFailure(error) }, { status: 502 });
  }
}
