import nodemailer from "nodemailer"
import type { Account } from "./accounts.ts"

/**
 * Emails the owner whenever a new account is created, through Gmail SMTP.
 *
 * GMAIL_USER is the sending address and GMAIL_APP_PASSWORD a Google App
 * Password for it (myaccount.google.com/apppasswords, needs 2-Step
 * Verification), not the account's real password. Alerts go to
 * SIGNUP_ALERT_TO, or back to GMAIL_USER when that is unset. Without both
 * credentials nothing is sent and sign-up works exactly as before.
 */
const GMAIL_USER = process.env.GMAIL_USER?.trim() || ""
// Google shows App Passwords in groups of four; the spaces are not part of it.
const GMAIL_APP_PASSWORD = (process.env.GMAIL_APP_PASSWORD || "").replace(/\s+/g, "")
const SIGNUP_ALERT_TO = process.env.SIGNUP_ALERT_TO?.trim() || GMAIL_USER

export const isMailConfigured = Boolean(GMAIL_USER && GMAIL_APP_PASSWORD)

const transport = isMailConfigured
	? nodemailer.createTransport({
		service: "gmail",
		auth: { user: GMAIL_USER, pass: GMAIL_APP_PASSWORD },
		connectionTimeout: 15_000,
		socketTimeout: 30_000
	})
	: null

const adminUrl = (() => {
	const origin = (process.env.FRONTEND_ORIGIN || "").split(",")[0]?.trim().replace(/\/+$/, "")
	return origin && origin !== "*" ? `${origin}/admin` : ""
})()

/** The name and picture come from the user's Google profile, so they are escaped. */
const escapeHtml = (value: string) => value.replace(/[&<>"']/g, (char) => `&#${char.charCodeAt(0)};`)

/**
 * Never throws and never delays the sign-in: the caller fires it and moves on,
 * and a failure only costs the alert.
 */
export async function notifySignup(account: Account): Promise<void> {
	if (!transport) return
	const rows: [string, string][] = [
		["Name", account.name],
		["Email", account.email],
		["Account ID", account.id],
		["Free credits", String(account.tokens)],
		["Signed up", new Date().toUTCString()]
	]
	const text = [
		"A new account was created on rwaft.",
		"",
		...rows.map(([label, value]) => `${label}: ${value}`),
		...(adminUrl ? ["", `Admin panel: ${adminUrl}`] : [])
	].join("\n")
	const html = `<p>A new account was created on rwaft.</p>
<table cellpadding="4" style="border-collapse:collapse;font-family:sans-serif;font-size:14px">
${account.picture ? `<tr><td colspan="2"><img src="${escapeHtml(account.picture)}" alt="" width="48" height="48" style="border-radius:50%"></td></tr>\n` : ""}${rows.map(([label, value]) => `<tr><td style="color:#666">${label}</td><td>${escapeHtml(value)}</td></tr>`).join("\n")}
</table>
${adminUrl ? `<p><a href="${escapeHtml(adminUrl)}">Open the admin panel</a></p>` : ""}`

	try {
		await transport.sendMail({
			from: `rwaft <${GMAIL_USER}>`,
			to: SIGNUP_ALERT_TO,
			// Reply goes straight to the new user.
			replyTo: account.email || undefined,
			subject: `New rwaft sign-up: ${account.name || account.email}`,
			text,
			html
		})
	} catch (error) {
		console.error(`[mail] Sign-up alert for ${account.id} failed:`, (error as Error).message)
	}
}
