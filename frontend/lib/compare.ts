import { chatsFor, type Pricing } from "./pricing"

/**
 * The /compare pages: rwaft beside Lovable, Bolt and v0, for people searching
 * "lovable alternative" or "bolt vs v0".
 *
 * Fair or not at all. Each rival's column is what its own site said on
 * COMPARED_ON (lovable.dev/pricing, bolt.new/pricing, v0.app/pricing), stated
 * as structure rather than prices, which change too often to quote. Every
 * rival gets the things it does better than rwaft, and rwaft's own column is
 * computed from the live pricing so it can't disagree with /pricing. Re-check
 * the rivals and move the date when this changes.
 */
export const COMPARED_ON = "2026-10-23"

export const TOPICS = [
	{ id: "makes", label: "What it makes" },
	{ id: "stack", label: "Code it writes" },
	{ id: "backend", label: "Databases and sign-in" },
	{ id: "watch", label: "While it builds" },
	{ id: "pay", label: "How you pay" },
	{ id: "hosting", label: "Hosting and domains" },
	{ id: "code", label: "Getting the code" },
] as const

export type TopicId = (typeof TOPICS)[number]["id"]

export interface Rival {
	slug: string
	name: string
	/** Who makes it, for the disclaimer. */
	maker: string
	site: string
	pricingUrl: string
	title: string
	description: string
	lead: string
	cells: Record<TopicId, string>
	/** Where the rival is the better pick. Always filled: a comparison that never concedes isn't one. */
	pickRival: string[]
	faq: { question: string; answer: string }[]
}

const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? "" : "s"}`

/** rwaft's column, from the API's live configuration. */
export function rwaftCells(pricing: Pricing): Record<TopicId, string> {
	const pay = pricing.billing
		? `${plural(pricing.signupTokens, "free credit")} on sign-up, then one-off credit packs with no subscription. Every chat costs ${plural(pricing.costs.prompt, "credit")}, however big the change, and a failed build is refunded.`
		: "Free right now, with no account needed."
	return {
		makes: "Websites, front-end web apps, tools and browser games",
		stack: "React and TypeScript on Vite, Tailwind CSS, and React Router for more than one page",
		backend: "None: apps run in the browser and can only save data there",
		watch: "Each step in plain words as it happens, with the raw install and build log one tap away",
		pay,
		hosting: "Included, at the site's own rwaft.live link. No custom domains yet, and every site is public",
		code: pricing.github
			? "Push it to a new GitHub repository. Also deploys public Vite and Create React App repos"
			: "No editor or download yet. Deploys public Vite and Create React App repos",
	}
}

/** Reasons to pick rwaft, the same against every rival. */
export function pickRwaft(pricing: Pricing): string[] {
	const freeChats = chatsFor(pricing.signupTokens, pricing)
	return [
		"You want a website or a front-end app with a live link, and no tools to learn",
		pricing.billing
			? "You'd rather pay per build than per month: credit packs, no subscription, and you know what a chat costs before you send it"
			: "You want to try it without paying or creating an account",
		"You want to watch the real build, and see the fixes it makes when something breaks",
		...(pricing.billing ? [`You want failed builds refunded automatically${freeChats ? `, and ${plural(freeChats, "free chat")} to try it` : ""}`] : []),
		"You have a Vite or Create React App repository you just want hosted",
	]
}

export const RIVALS: Rival[] = [
	{
		slug: "lovable-alternative",
		name: "Lovable",
		maker: "Lovable",
		site: "https://lovable.dev",
		pricingUrl: "https://lovable.dev/pricing",
		title: "Lovable alternative: rwaft vs Lovable, compared",
		description:
			"rwaft vs Lovable, side by side: what each builds, how you pay, and what you see while it works. An honest look at when each one is the better pick.",
		lead: "Both turn a description into a working React app. Lovable goes further into full-stack apps; rwaft keeps to websites and front-end apps, charges a flat price per chat with no subscription, and shows you the real build.",
		cells: {
			makes: "Web apps, including full-stack apps with accounts and data",
			stack: "React on Vite with Tailwind CSS and shadcn/ui",
			backend: "Yes, through Lovable Cloud",
			watch: "A chat beside a live preview, with the code to view and edit",
			pay: "A free tier with daily credits, then monthly plans. In its default mode a message's credit cost depends on how complex the task is",
			hosting: "Included, with custom domains on paid plans",
			code: "Two-way GitHub sync and a code editor",
		},
		pickRival: [
			"Your app needs accounts, a database or payments",
			"You want private projects, a custom domain or a team workspace",
			"You want to edit the code by hand inside the builder",
		],
		faq: [
			{
				question: "Is rwaft a good Lovable alternative?",
				answer: "For websites and front-end apps, yes: you describe it, watch it build and get a live link, paying a flat price per chat with no subscription. If your app needs a database, sign-in or payments, Lovable does more.",
			},
			{
				question: "Is rwaft cheaper than Lovable?",
				answer: "It depends on how you build. rwaft charges the same for every chat and sells one-off credit packs; Lovable sells monthly plans whose credit cost per message varies with the work. Compare rwaft's pricing page with Lovable's for what you plan to make.",
			},
			{
				question: "Can I move a Lovable project to rwaft?",
				answer: "If it's synced to a public GitHub repository, rwaft can deploy it, since Lovable projects are Vite React apps. Anything that depends on Lovable Cloud or secret keys needs that back end to keep working.",
			},
		],
	},
	{
		slug: "bolt-alternative",
		name: "Bolt",
		maker: "StackBlitz",
		site: "https://bolt.new",
		pricingUrl: "https://bolt.new/pricing",
		title: "Bolt alternative: rwaft vs Bolt.new, compared",
		description:
			"rwaft vs Bolt.new, side by side: what each builds, how you pay, and what you see while it works. An honest look at when each one is the better pick.",
		lead: "Bolt puts a full development environment in your browser and builds across many frameworks. rwaft is narrower on purpose: plain words in, a live website out, a flat price per chat, and every build step explained as it happens.",
		cells: {
			makes: "Web apps and mobile apps, front end and back end",
			stack: "Many JavaScript frameworks, React among them",
			backend: "Yes, with built-in databases",
			watch: "A full development environment in the browser: code editor, terminal and preview",
			pay: "A free tier with a monthly token allowance, then monthly plans metered in tokens, so bigger projects use more per message",
			hosting: "Included, with custom domains on paid plans",
			code: "A code editor in the browser, plus export",
		},
		pickRival: [
			"You want a code editor and a terminal next to the chat",
			"Your app needs a database, or you're building for mobile",
			"You want a framework other than React, or a custom domain",
		],
		faq: [
			{
				question: "Is rwaft a good Bolt alternative?",
				answer: "If you want a website or front-end app without touching code, yes: rwaft explains each step in plain words instead of showing you an editor and terminal, and charges a flat price per chat. Developers who want to edit code in the browser, or need a database, get more from Bolt.",
			},
			{
				question: "How is paying for rwaft different from Bolt?",
				answer: "Bolt meters tokens, so what a message uses grows with the size of the project. rwaft charges the same for every chat however big the change, sells credit packs with no subscription, and refunds a build that fails.",
			},
			{
				question: "Can I host a Bolt project on rwaft?",
				answer: "If it's a Vite React app in a public GitHub, GitLab or Bitbucket repository, yes. Parts that rely on Bolt's databases or secret keys won't work without them.",
			},
		],
	},
	{
		slug: "v0-alternative",
		name: "v0",
		maker: "Vercel",
		site: "https://v0.app",
		pricingUrl: "https://v0.app/pricing",
		title: "v0 alternative: rwaft vs v0 by Vercel, compared",
		description:
			"rwaft vs v0 by Vercel, side by side: what each builds, how you pay, and what you see while it works. An honest look at when each one is the better pick.",
		lead: "v0 is Vercel's builder for Next.js apps, made to ship into the Vercel platform. rwaft is for people who don't want a platform at all: describe a site, watch the real build, get a link, at a flat price per chat.",
		cells: {
			makes: "Web apps and interfaces on Next.js, front end and back end",
			stack: "Next.js and React, with Tailwind CSS and shadcn/ui",
			backend: "Yes, through Vercel and its integrations",
			watch: "A chat beside a live preview, with the code and a visual design mode",
			pay: "A free tier with a daily message limit, then monthly plans with included credits and usage metered in tokens",
			hosting: "Deploys to Vercel, with custom domains there",
			code: "GitHub sync and a code editor",
		},
		pickRival: [
			"You're building on Next.js or already deploy to Vercel",
			"You need server code, a database or a custom domain",
			"You want to edit components visually or by hand",
		],
		faq: [
			{
				question: "Is rwaft a good v0 alternative?",
				answer: "For a website or front-end app with a live link, yes, especially if you don't write code: rwaft explains every step in plain words and hosts the result itself. For Next.js apps on Vercel, v0 is the natural fit.",
			},
			{
				question: "Do I need a Vercel account to use rwaft?",
				answer: "No. rwaft builds and hosts the site itself, and every site gets its own rwaft.live link.",
			},
			{
				question: "Can rwaft deploy a v0 project?",
				answer: "Not yet. v0 projects are Next.js apps, and rwaft deploys Vite and Create React App projects.",
			},
		],
	},
]

export const rival = (slug: string) => RIVALS.find((item) => item.slug === slug)
