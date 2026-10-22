import { getPricing } from "../../lib/pricing"
import { SITE_DESCRIPTION, SITE_NAME, SITE_URL } from "../../lib/site"
import { faqFor } from "../_components/InfoSections"

/** Quotes live pricing through the FAQ; re-read hourly like the pages it summarizes. */
export const revalidate = 3600

/**
 * /llms.txt (llmstxt.org): a plain summary for AI assistants and answer
 * engines, which otherwise have to guess what rwaft is from a client-rendered
 * console. Built from the same faqFor() as the FAQ page, so the two can't
 * disagree.
 */
export async function GET() {
	const faq = faqFor(await getPricing())
	const body = [
		`# ${SITE_NAME}`,
		"",
		`> ${SITE_DESCRIPTION}`,
		"",
		"rwaft is an AI app builder and AI website builder. You describe a website or front-end web app in plain words; rwaft's AI plans the pages, writes a React + TypeScript app on Vite with Tailwind CSS, builds it and hosts it at its own public URL. Every build step is shown live. Follow-up messages edit the app and publish a new version. A public GitHub repository using Vite or Create React App can be deployed instead of a prompt.",
		"",
		"## Pages",
		"",
		`- [Start building](${SITE_URL}/): the prompt box; describe an app to build it`,
		`- [How it works](${SITE_URL}/how-it-works): the three steps, what you can build and what you get`,
		`- [Pricing](${SITE_URL}/pricing): free credits, what a build costs, refunds for failed builds`,
		`- [FAQ](${SITE_URL}/faq): common questions`,
		`- [About](${SITE_URL}/about): why rwaft shows the real build, its principles and what it runs on`,
		`- [Trailer](${SITE_URL}/trailer): a 29-second video of an app going from prompt to live link`,
		"",
		"## FAQ",
		"",
		...faq.flatMap((item) => [`### ${item.question}`, "", item.answer, ""]),
		"## Optional",
		"",
		`- [Privacy policy](${SITE_URL}/privacy)`,
		`- [Terms of service](${SITE_URL}/terms)`,
		"",
	].join("\n")

	return new Response(body, { headers: { "Content-Type": "text/plain; charset=utf-8" } })
}
