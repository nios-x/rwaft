import { appJsonLd } from "../lib/jsonld"
import { getPricing } from "../lib/pricing"
import { Console } from "./_components/Console"
import { Features } from "./_components/Features"
import { HomeSections } from "./_components/HomeSections"
import { JsonLd } from "./_components/PageShell"
import { SiteFooter } from "./_components/SiteFooter"

/**
 * Re-read the API's configuration hourly (lib/pricing.ts), for whether the
 * feature cards offer pushing to GitHub. Must be a literal: Next reads
 * segment config statically.
 */
export const revalidate = 3600

/**
 * The console is interactive and lives in a client component. Below it, the
 * feature cards and a short version of how it works, what it makes, how it
 * compares and the FAQ, each linking to its own page; all of it is server
 * rendered and passed through Console.
 */
export default async function Page() {
	const pricing = await getPricing()
	return (
		<>
			{/* The home page is what ranks for "rwaft" and "AI app builder", so it names the app as well as the site. */}
			<JsonLd data={appJsonLd(pricing)} />
			<Console
				features={<><Features github={Boolean(pricing.github)} /><HomeSections pricing={pricing} /></>}
				footer={<SiteFooter />}
			/>
		</>
	)
}
