import Link from "next/link"
import { CONTACT_LABEL, CONTACT_URL } from "../../lib/site"
import { LegalPage, pageMetadata } from "../_components/LegalPage"

export const metadata = pageMetadata(
	"/terms",
	"Terms of service",
	"The rules for using rwaft: accounts, credits and refunds, acceptable use, ownership of what you build, and public hosting."
)

/**
 * Prices are deliberately not repeated here: they are configured on the API
 * and shown live on the pricing page, which this links to.
 */
export default function TermsPage() {
	return (
		<LegalPage title="Terms of service" path="/terms">
			<p>
				These terms apply when you use rwaft. By signing in or starting a build, you agree to them. If you don&apos;t
				agree, please don&apos;t use rwaft.
			</p>

			<h2>1. The service</h2>
			<p>
				rwaft turns a plain-language description, or a public code repository, into a website. It uses AI and
				automated tools to write, build and host the result at a public URL.
			</p>

			<h2>2. Your account</h2>
			<p>
				You sign in with a Google account and are responsible for what happens under it. You must be at least 13, or
				the minimum age for online services where you live.
			</p>

			<h2>3. Credits and refunds</h2>
			<ul>
				<li>
					Building costs credits. New accounts get free credits when they sign up, and each chat (one build from a
					prompt) and each repository deploy costs credits, as shown in <Link href="/pricing">Pricing</Link>.
				</li>
				<li>Credits are taken when a build starts. If the build fails, they are returned automatically.</li>
				<li>
					Purchased credits are prepaid, can&apos;t be transferred, have no cash value and are not refundable, except
					for failed builds as described above or where the law requires otherwise.
				</li>
				<li>
					Purchases are processed by Dodo Payments, which acts as the merchant of record and handles payment, sales tax
					and receipts.
				</li>
				<li>We may change prices or the free allowance in future. A change never reduces credits you already hold.</li>
			</ul>

			<h2>4. Acceptable use</h2>
			<p>You must not use rwaft to build, host or share:</p>
			<ul>
				<li>anything illegal, or anything that infringes someone else&apos;s rights, such as copyright, trademarks or privacy;</li>
				<li>phishing pages, malware or scams, or pages that pretend to be another person or organisation;</li>
				<li>content that sexually exploits children, or that promotes violence, harassment or hatred;</li>
				<li>spam, or tools meant to attack or overload other systems.</li>
			</ul>
			<p>
				You also must not try to break or overload rwaft, get around its limits (including rate limits and credits), or
				reach other people&apos;s data. We may take down any site and suspend any account that breaks these rules,
				without a refund.
			</p>

			<h2>5. Your content</h2>
			<p>
				You keep ownership of your prompts and of the code and sites rwaft generates for you, as far as the law allows.
				You give us permission to store, process, build and publicly host them so we can provide the service. You are
				responsible for what you publish, and for having the right to deploy any repository you submit.
			</p>

			<h2>6. AI-generated output</h2>
			<p>
				What rwaft builds is written by AI. It can contain mistakes or security problems, or resemble existing work.
				Check it before you rely on it.
			</p>

			<h2>7. Public hosting</h2>
			<p>
				Sites are public at their URL. We may take a site down if it breaks these terms, or for legal or security
				reasons, and we can&apos;t promise that any site stays online forever.
			</p>

			<h2>8. Availability</h2>
			<p>
				rwaft is provided &ldquo;as is&rdquo; and &ldquo;as available&rdquo;. Builds can wait in line, run slowly or fail,
				and we may change, pause or end features.
			</p>

			<h2>9. Liability</h2>
			<p>
				As far as the law allows, rwaft comes without warranties of any kind, and we are not liable for indirect,
				incidental or consequential losses, or for lost data, profits or revenue. Our total liability for any claim is
				limited to what you paid us in the 12 months before it.
			</p>

			<h2>10. Ending</h2>
			<p>
				You can stop using rwaft at any time and ask us to delete your account. We may suspend or end your access if
				you break these terms.
			</p>

			<h2>11. Changes to these terms</h2>
			<p>
				We may update these terms; the date at the top shows the current version. Using rwaft after a change means you
				accept the new terms.
			</p>

			<h2>12. Contact</h2>
			<p>
				Questions about these terms: <a href={CONTACT_URL}>{CONTACT_LABEL}</a>. How we handle your data is described in
				the <Link href="/privacy">privacy policy</Link>.
			</p>
		</LegalPage>
	)
}
