import { COMPARED_ON, MATCHUPS, RIVALS, ROUNDUP_PATH, TOPICS, matchupRivals, rwaftCells } from "../../lib/compare"
import { docsFor } from "../../lib/docs"
import { GUIDES } from "../../lib/guides"
import { getPricing } from "../../lib/pricing"
import { SITE_DESCRIPTION, SITE_NAME, SITE_URL } from "../../lib/site"
import { USE_CASES } from "../../lib/useCases"
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
	const pricing = await getPricing()
	const faq = faqFor(pricing)
	const ours = rwaftCells(pricing)
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
		`- [What you can build](${SITE_URL}/make): every kind of site rwaft makes, with example prompts`,
		`- [Compare](${SITE_URL}/compare): rwaft beside ${RIVALS.map((item) => item.name).join(", ")}`,
		`- [Best AI app and website builders](${SITE_URL}${ROUNDUP_PATH}): who each one is best for`,
		`- [Docs](${SITE_URL}/docs): how to use rwaft, from a first build to its limits`,
		`- [Guides](${SITE_URL}/guides): building websites and apps with AI, for any tool`,
		"",
		"## What you can build",
		"",
		...USE_CASES.map((item) => `- [${item.name}](${SITE_URL}/make/${item.slug}): ${item.blurb}`),
		"",
		`## How rwaft compares (checked ${COMPARED_ON})`,
		"",
		...TOPICS.map((topic) => `- ${topic.label}: ${ours[topic.id]}`),
		"",
		...RIVALS.map((item) => `- [rwaft vs ${item.name}](${SITE_URL}/compare/${item.slug}): ${item.name} is best for ${item.bestFor.charAt(0).toLowerCase() + item.bestFor.slice(1)}. Choose it if ${item.pickRival.map((line) => line.charAt(0).toLowerCase() + line.slice(1)).join("; or ")}.`),
		"",
		...MATCHUPS.map((item) => `- [${matchupRivals(item).map((side) => side.name).join(" vs ")}](${SITE_URL}/compare/${item.slug}): ${item.lead}`),
		"",
		"## Docs",
		"",
		...docsFor(pricing).map((item) => `- [${item.name}](${SITE_URL}/docs/${item.slug}): ${item.description}`),
		"",
		"## Guides",
		"",
		...GUIDES.map((item) => `- [${item.name}](${SITE_URL}/guides/${item.slug}): ${item.description}`),
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
