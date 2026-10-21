import { CONTACT_LABEL, CONTACT_URL, SITE_URL } from "../../lib/site"
import { LegalPage, pageMetadata } from "../_components/LegalPage"

export const metadata = pageMetadata(
	"/privacy",
	"Privacy policy",
	"What rwaft collects when you sign in and build, why, how long it is kept, and who else processes it."
)

/**
 * Written from what the code actually does: the Google profile fields the API
 * stores, hashed 30-day sessions, ~24h log history, Cloudinary for files and
 * Dodo Payments for card payments. Change the code, change this page.
 */
export default function PrivacyPage() {
	return (
		<LegalPage title="Privacy policy" path="/privacy">
			<p>
				This policy explains what rwaft (&ldquo;we&rdquo;) collects when you use rwaft at{" "}
				<a href={SITE_URL}>{SITE_URL.replace(/^https?:\/\//, "")}</a> and the sites it hosts, why we collect it, and who
				else handles it. We collect only what we need to sign you in, run your builds and keep the service working.
			</p>

			<h2>What we collect</h2>
			<ul>
				<li>
					<strong>Your Google account details.</strong> When you continue with Google, Google tells us your name, email
					address, profile picture and a stable account ID. We never receive your Google password and we don&apos;t ask
					for access to anything else in your Google account.
				</li>
				<li>
					<strong>A sign-in session.</strong> Your browser keeps a random session token in its local storage. We store
					only a one-way hash of it. It expires after 30 days, or as soon as you sign out.
				</li>
				<li>
					<strong>What you submit and what we build from it.</strong> Your prompts, the repository URLs you paste, and
					the code, files and website produced from them.
				</li>
				<li>
					<strong>Build logs.</strong> The output of each build, so you can watch it live. Log history is kept for about
					24 hours.
				</li>
				<li>
					<strong>Credits and purchases.</strong> Your credit balance and a record of each purchase. Payments are
					handled by Dodo Payments; we never see or store your card number.
				</li>
				<li>
					<strong>Technical data.</strong> Your IP address and basic request details, used to enforce rate limits, stop
					abuse and keep the service secure.
				</li>
			</ul>

			<h2>Cookies and local storage</h2>
			<p>
				We don&apos;t use advertising or analytics cookies. Your browser&apos;s local storage holds your session token, your
				light or dark theme and a list of your recent builds; the last two never leave your device. The Google sign-in
				button is loaded from Google and is covered by Google&apos;s own privacy policy.
			</p>

			<h2>How we use it</h2>
			<p>
				To sign you in, run and host your builds, stream your build log, keep track of your credits and purchases,
				prevent abuse and fix problems. We don&apos;t sell your personal information and we don&apos;t use it for
				advertising.
			</p>

			<h2>Who else processes it</h2>
			<p>We rely on these providers, each under its own terms and privacy policy:</p>
			<ul>
				<li><strong>Google</strong> for sign-in.</li>
				<li>
					<strong>AI model providers</strong> (currently Google Gemini and OpenRouter), which receive your prompts and the
					code being generated, in order to write your app.
				</li>
				<li><strong>Cloudinary</strong>, which stores your project files and the built website.</li>
				<li>
					<strong>Hosting providers</strong> (currently Render for the API and builds, and Vercel for this website),
					including the database that holds accounts and credits.
				</li>
				<li><strong>Dodo Payments</strong>, which processes payments as the merchant of record. We share your name and email with it when you buy credits.</li>
			</ul>

			<h2>Your sites are public</h2>
			<p>
				Everything rwaft builds is published at a public URL, and anyone with the link can open it. Don&apos;t put
				personal or confidential information in a prompt or in a repository you deploy.
			</p>

			<h2>How long we keep it</h2>
			<ul>
				<li>Build logs: about 24 hours.</li>
				<li>Sign-in sessions: up to 30 days, or until you sign out.</li>
				<li>Your account and credit balance: for as long as the account exists.</li>
				<li>Built websites and project files: until you ask us to delete them, or we remove them under our terms.</li>
				<li>Payment records: as long as accounting and legal obligations require.</li>
			</ul>

			<h2>Your choices</h2>
			<p>
				You can sign out at any time. To get a copy of your data, correct it, or delete your account and the sites
				you&apos;ve built, contact us through <a href={CONTACT_URL}>{CONTACT_LABEL}</a>. Deleting your account also
				removes any unused credits.
			</p>

			<h2>Children</h2>
			<p>
				rwaft is not meant for children under 13, or under the minimum age for online services where they live, and we
				don&apos;t knowingly collect their information.
			</p>

			<h2>Changes</h2>
			<p>When this policy changes, the date at the top changes with it.</p>

			<h2>Contact</h2>
			<p>
				Questions about this policy or your data: <a href={CONTACT_URL}>{CONTACT_LABEL}</a>.
			</p>
		</LegalPage>
	)
}
