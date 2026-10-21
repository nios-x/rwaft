import { Console } from "./_components/Console"
import { SiteFooter } from "./_components/SiteFooter"

/**
 * The console is interactive and lives in a client component. How it works,
 * pricing and questions each have their own page (/how-it-works, /pricing,
 * /faq), linked from the header and the footer.
 */
export default function Page() {
	return <Console footer={<SiteFooter />} />
}
