import { getPricing } from "../lib/pricing"
import { Console } from "./_components/Console"
import { Features } from "./_components/Features"
import { SiteFooter } from "./_components/SiteFooter"

/**
 * Re-read the API's configuration hourly (lib/pricing.ts), for whether the
 * feature cards offer pushing to GitHub. Must be a literal: Next reads
 * segment config statically.
 */
export const revalidate = 3600

/**
 * The console is interactive and lives in a client component. How it works,
 * pricing and questions each have their own page (/how-it-works, /pricing,
 * /faq), linked from the header and the footer.
 */
export default async function Page() {
	const { github } = await getPricing()
	return <Console features={<Features github={Boolean(github)} />} footer={<SiteFooter />} />
}
