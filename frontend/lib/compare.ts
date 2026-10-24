import { chatsFor, type Pricing } from "./pricing"

/**
 * The /compare pages: rwaft beside the AI app builders (Lovable, Bolt, v0,
 * Replit, Base44) and the AI website builders (Framer, Wix, Webflow), for
 * people searching "lovable alternative", "lovable vs bolt" or "best AI app
 * builder".
 *
 * Fair or not at all. Each rival's column is what its own site said on
 * COMPARED_ON (each one's pricingUrl, plus Replit's billing docs and Webflow's
 * help centre on code export), stated as structure rather than prices, which
 * change too often to quote. Every rival gets the things it does better than
 * rwaft, and rwaft's own column is computed from the live pricing so it can't
 * disagree with /pricing. Re-check every rival and move the date when this
 * changes; a date that only some of them were checked on is a false one.
 */
export const COMPARED_ON = "2026-10-24"

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

/** Prompt-to-app builders, and the visual website builders that added AI. Each gets its own table on /compare. */
export const GROUPS = [
	{ id: "app", label: "AI app builders", lead: "Describe an app in a chat and the AI writes it. They differ most in how far past the front end they go." },
	{ id: "site", label: "AI website builders", lead: "Website platforms where AI drafts the site and you finish it in a visual editor." },
] as const

export type GroupId = (typeof GROUPS)[number]["id"]

export interface Faq {
	question: string
	answer: string
}

export interface Rival {
	slug: string
	name: string
	/** Who makes it, for the disclaimer. */
	maker: string
	site: string
	pricingUrl: string
	group: GroupId
	/** One line for the /compare/best-ai-app-builders roundup: who should pick it. */
	bestFor: string
	title: string
	description: string
	lead: string
	cells: Record<TopicId, string>
	/** Where the rival is the better pick. Always filled: a comparison that never concedes isn't one. */
	pickRival: string[]
	faq: Faq[]
}

/**
 * Two rivals head to head, with rwaft as the third column: the "lovable vs
 * bolt" searches. Both sides get real reasons; rwaft only claims the reader
 * who needs neither.
 */
export interface Matchup {
	slug: string
	/** Rival slugs, in the order the title names them. */
	pair: [string, string]
	title: string
	description: string
	lead: string
	/** Why to choose each side, in pair order. */
	picks: [string[], string[]]
	faq: Faq[]
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

/** rwaft's line in the roundup, in the same voice as each rival's `bestFor`. */
export function rwaftBestFor(pricing: Pricing) {
	return pricing.billing
		? "A website or front-end app with a live link, paid per build rather than per month"
		: "A website or front-end app with a live link, free to build right now"
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
		group: "app",
		bestFor: "Full-stack web apps with accounts and data, built from a chat",
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
		group: "app",
		bestFor: "Developers who want a code editor and terminal beside the AI",
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
		group: "app",
		bestFor: "Next.js apps for teams that already deploy to Vercel",
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
	{
		slug: "replit-alternative",
		name: "Replit",
		maker: "Replit",
		site: "https://replit.com",
		pricingUrl: "https://replit.com/pricing",
		group: "app",
		bestFor: "Apps in almost any language, back end included, in a full development environment",
		title: "Replit alternative: rwaft vs Replit Agent, compared",
		description:
			"rwaft vs Replit, side by side: what each builds, how you pay, and what you see while it works. An honest look at when each one is the better pick.",
		lead: "Replit is a full development environment with an AI agent inside, for apps in almost any language, back end included. rwaft is far narrower: plain words in, a live website out, a flat price per chat, and every build step explained as it happens.",
		cells: {
			makes: "Web apps, mobile apps, back-end services and scripts",
			stack: "Many languages and frameworks; the Agent picks what fits the app",
			backend: "Yes, with built-in databases",
			watch: "A full development environment: the Agent's chat beside the code, a console and a preview",
			pay: "A free Starter plan with a daily Agent allowance and one published app for 30 days, then monthly plans with credits. Agent requests are charged by effort, so a bigger change costs more",
			hosting: "Included through Replit's deployments, with custom domains on paid plans",
			code: "A full code editor, with GitHub import and sync",
		},
		pickRival: [
			"Your app needs server code, a database or a language other than JavaScript",
			"You want to code alongside the AI in a full development environment",
			"You're building a mobile app, or want collaborators in the same project",
		],
		faq: [
			{
				question: "Is rwaft a good Replit alternative?",
				answer: "If what you want is a website or front-end app with a live link, and no code or console to look at, yes. If you need server code, a database or a language other than JavaScript, Replit does far more.",
			},
			{
				question: "How is paying for rwaft different from Replit?",
				answer: "Replit charges each Agent request by effort, so a big change costs more than a small one, and its paid plans are monthly. rwaft charges the same for every chat however big the change, sells credit packs with no subscription, and refunds a build that fails.",
			},
			{
				question: "Can I host a Replit project on rwaft?",
				answer: "Only if it's a Vite or Create React App front end in a public GitHub, GitLab or Bitbucket repository. Anything that runs server code needs to stay where a server can run it.",
			},
		],
	},
	{
		slug: "base44-alternative",
		name: "Base44",
		maker: "Wix",
		site: "https://base44.com",
		pricingUrl: "https://base44.com/pricing",
		group: "app",
		bestFor: "Internal tools and portals that need users and data from day one",
		title: "Base44 alternative: rwaft vs Base44, compared",
		description:
			"rwaft vs Base44, side by side: what each builds, how you pay, and what you see while it works. An honest look at when each one is the better pick.",
		lead: "Base44, part of Wix since 2025, builds web apps with a database and sign-in already wired in. rwaft keeps to websites and front-end apps, charges a flat price per chat with no subscription, and shows you the real build rather than only the result.",
		cells: {
			makes: "Web apps with accounts and data, like internal tools, portals and dashboards",
			stack: "Apps that run on Base44's own back end, with in-app code edits on paid plans",
			backend: "Yes: a built-in database, sign-in and user management on every plan",
			watch: "A chat beside a live preview of the app",
			pay: "A free plan with a monthly allowance of message credits, then monthly plans. What an action uses varies with the action and the AI model",
			hosting: "Included, with custom domains on paid plans",
			code: "In-app code edits on paid plans, and two-way GitHub sync on the higher ones",
		},
		pickRival: [
			"Your app needs accounts, a database or user roles out of the box",
			"You're building an internal tool, a portal or a dashboard over real data",
			"You want private apps or a custom domain",
		],
		faq: [
			{
				question: "Is rwaft a good Base44 alternative?",
				answer: "For websites and front-end apps, yes: you describe it, watch it build and get a live link, paying a flat price per chat. If your app needs users, a database or permissions, Base44 has them built in and rwaft doesn't.",
			},
			{
				question: "Is rwaft cheaper than Base44?",
				answer: "It depends on how much you build. rwaft charges the same for every chat and sells one-off credit packs; Base44 sells monthly plans with message credits, and what each action uses depends on the action and the model. Compare both pricing pages for what you plan to make.",
			},
			{
				question: "Can I move a Base44 app to rwaft?",
				answer: "Not as it is. Base44 apps run on its built-in database and sign-in, which rwaft doesn't have. rwaft deploys public Vite and Create React App repositories, so only a front end that doesn't need that back end could move.",
			},
		],
	},
	{
		slug: "framer-alternative",
		name: "Framer",
		maker: "Framer",
		site: "https://www.framer.com",
		pricingUrl: "https://www.framer.com/pricing",
		group: "site",
		bestFor: "Designers making marketing sites they'll keep shaping by hand",
		title: "Framer alternative: rwaft vs Framer AI, compared",
		description:
			"rwaft vs Framer, side by side: what each makes, how you pay, and how much designing you do. An honest look at when each one is the better pick.",
		lead: "Framer is a design tool that publishes websites: you lay pages out on a canvas, with AI to draft them. rwaft is for people who'd rather not design anything: describe the site, watch it build, get a link, at a flat price per chat.",
		cells: {
			makes: "Marketing websites, portfolios and landing pages",
			stack: "None to read: sites are designed on a visual canvas, with optional React code components",
			backend: "No app back end, but a CMS for content like blog posts",
			watch: "A design canvas where AI drafts pages and sections, which you then edit visually",
			pay: "A free plan for non-commercial sites with a Framer domain and AI credits to try, then monthly plans per site, with AI credits shared across the workspace",
			hosting: "Included, with a custom domain on paid plans",
			code: "Sites stay on Framer's hosting; there's no official code export",
		},
		pickRival: [
			"You want control over every detail of the design, on a visual canvas",
			"You need a CMS, a blog, localization or a custom domain",
			"It's a marketing site a design team will keep editing",
		],
		faq: [
			{
				question: "Is rwaft a good Framer alternative?",
				answer: "If you want a site without designing it yourself, yes: describe it in plain words and rwaft writes, builds and hosts it. If you want to shape every detail, or need a CMS or a custom domain, Framer is the better tool.",
			},
			{
				question: "Do I get code with either?",
				answer: "rwaft writes every site as a React and TypeScript app on Vite, the stack a developer would use. Framer sites are made on its canvas and hosted by Framer.",
			},
		],
	},
	{
		slug: "wix-alternative",
		name: "Wix",
		maker: "Wix",
		site: "https://www.wix.com",
		pricingUrl: "https://www.wix.com/plans",
		group: "site",
		bestFor: "Small businesses that need an online store, bookings or a member area",
		title: "Wix alternative: rwaft vs Wix AI website builder",
		description:
			"rwaft vs Wix, side by side: what each makes, how you pay, and how you make changes. An honest look at when each one is the better pick.",
		lead: "Wix is a full website platform, with stores, bookings and an AI that drafts your site from a prompt. rwaft does one thing: turns a description into a live React site while you watch, at a flat price per chat with no subscription.",
		cells: {
			makes: "Websites of every kind, including online stores, bookings and blogs",
			stack: "None to read: sites are made in Wix's editor, from a prompt or a template",
			backend: "Yes: payments and online stores on the higher plans, plus bookings and member areas",
			watch: "An AI that generates a first draft from a prompt, then a drag-and-drop editor",
			pay: "A free plan with Wix branding on a wixsite.com address, then Premium plans billed yearly or for other periods; taking payments starts on the higher tiers",
			hosting: "Included, with your own domain on Premium plans",
			code: "No code export; sites stay on Wix",
		},
		pickRival: [
			"You need an online store, bookings or a member area",
			"You want to drag and drop every element yourself",
			"You want your own domain, or a large library of templates and apps",
		],
		faq: [
			{
				question: "Is rwaft a good Wix alternative?",
				answer: "For a quick site with a live link and no editor to learn, yes. For an online store, bookings or your own domain, Wix does far more.",
			},
			{
				question: "How is Wix's AI different from rwaft?",
				answer: "Wix's AI drafts a site that you then finish in its drag-and-drop editor. rwaft writes the whole site as a React app, and you change it by sending a message rather than by moving elements around.",
			},
		],
	},
	{
		slug: "webflow-alternative",
		name: "Webflow",
		maker: "Webflow",
		site: "https://webflow.com",
		pricingUrl: "https://webflow.com/pricing",
		group: "site",
		bestFor: "Agencies and designers building CMS-heavy sites with fine control",
		title: "Webflow alternative: rwaft vs Webflow, compared",
		description:
			"rwaft vs Webflow, side by side: what each makes, how you pay, and how much you design yourself. An honest look at when each one is the better pick.",
		lead: "Webflow is a professional visual builder for designers and agencies, with a CMS, hosting and AI that can turn a prompt into a first draft. rwaft skips the designer entirely: describe the site, watch it build, get a link, at a flat price per chat.",
		cells: {
			makes: "Professional marketing websites with a CMS, plus online stores",
			stack: "A visual designer that follows how HTML and CSS work",
			backend: "A CMS and forms, with online stores and web app hosting through Webflow Cloud",
			watch: "A visual designer, with AI that drafts a site from a prompt and helps edit it",
			pay: "A free Starter plan on a webflow.io address with a Webflow badge, then site plans charged per site, with workspace plans for teams billed separately",
			hosting: "Included, with a custom domain on paid site plans",
			code: "Exports HTML, CSS and JavaScript on paid workspace plans, without the CMS or store",
		},
		pickRival: [
			"You're a designer or an agency and want fine control and a CMS",
			"You need a blog, an online store or many pages of structured content",
			"You want a custom domain, or HTML and CSS you can export",
		],
		faq: [
			{
				question: "Is rwaft a good Webflow alternative?",
				answer: "If you don't want to learn a design tool, yes: describe the site and rwaft builds and hosts it. Designers who want control, a CMS or an online store get more from Webflow.",
			},
			{
				question: "Can I export my site's code?",
				answer: "From Webflow, on its paid workspace plans, as HTML, CSS and JavaScript without the CMS or store. Every rwaft site is a React and TypeScript app on Vite.",
			},
		],
	},
]

export const rival = (slug: string) => RIVALS.find((item) => item.slug === slug)

export const MATCHUPS: Matchup[] = [
	{
		slug: "lovable-vs-bolt",
		pair: ["lovable-alternative", "bolt-alternative"],
		title: "Lovable vs Bolt: which AI app builder to pick",
		description:
			"Lovable vs Bolt.new side by side: what each builds, how you pay and what you see while it works, plus a third option if you only need a website.",
		lead: "Both build full-stack apps from a chat. Lovable keeps you in a chat beside a live preview, with Lovable Cloud for data; Bolt opens a full development environment in your browser, with a code editor and a terminal, across many frameworks.",
		picks: [
			[
				"You'd rather stay in a chat and a preview than an editor and a terminal",
				"You want a back end set up for you through Lovable Cloud",
				"You want every app on one consistent React stack, with shadcn/ui",
			],
			[
				"You want a code editor and a terminal next to the chat",
				"You want a framework other than React, or a mobile app",
				"You're a developer who wants to see and steer the code as it's written",
			],
		],
		faq: [
			{
				question: "Is Lovable or Bolt better for beginners?",
				answer: "Lovable is the gentler start: you talk to it beside a live preview. Bolt shows more of the machinery, code editor and terminal included, which developers tend to like. If you don't need a database at all, rwaft is simpler than either.",
			},
			{
				question: "How do Lovable and Bolt charge?",
				answer: "Both have a free tier and monthly plans. Lovable spends credits per message, and in its default mode the cost depends on how complex the task is; Bolt meters tokens, so a bigger project uses more per message. rwaft charges the same for every chat, with no subscription.",
			},
		],
	},
	{
		slug: "lovable-vs-v0",
		pair: ["lovable-alternative", "v0-alternative"],
		title: "Lovable vs v0: which AI app builder to pick",
		description:
			"Lovable vs v0 by Vercel side by side: the code each writes, where it's hosted and how you pay, plus a third option if you only need a website.",
		lead: "Both build React apps from a chat beside a live preview. v0 is Vercel's and builds Next.js apps made to deploy on Vercel; Lovable builds Vite React apps and hosts them itself, with Lovable Cloud for data.",
		picks: [
			[
				"You want the builder to host the app, with no other platform account",
				"You'd like a back end set up for you through Lovable Cloud",
				"You aren't a developer and don't plan to become one",
			],
			[
				"You're building on Next.js or already deploy to Vercel",
				"You want to edit components visually, in a design mode",
				"You want server code through Vercel and its integrations",
			],
		],
		faq: [
			{
				question: "Is Lovable or v0 better for non-developers?",
				answer: "Lovable assumes less: it hosts the app and can set up a back end itself. v0 fits best when you or your team already work with Next.js and Vercel. For a website with no back end, rwaft is simpler than either.",
			},
			{
				question: "Do Lovable and v0 write the same code?",
				answer: "Both write React with Tailwind CSS and shadcn/ui. v0 uses Next.js; Lovable uses Vite. rwaft writes React and TypeScript on Vite with Tailwind CSS.",
			},
		],
	},
	{
		slug: "bolt-vs-v0",
		pair: ["bolt-alternative", "v0-alternative"],
		title: "Bolt vs v0: which AI app builder to pick",
		description:
			"Bolt.new vs v0 by Vercel side by side: frameworks, back ends, hosting and how each one meters usage, plus a simpler option for websites.",
		lead: "Both come from developer-platform companies. Bolt, by StackBlitz, puts a full development environment in your browser and builds across many frameworks; v0, by Vercel, focuses on Next.js apps that deploy to Vercel.",
		picks: [
			[
				"You want a terminal and a code editor in the browser",
				"You want a framework other than Next.js, or a mobile app",
				"You want built-in databases without bringing another platform",
			],
			[
				"Your stack is Next.js and your deploys go to Vercel",
				"You want a visual design mode for components",
				"You want shadcn/ui components from the first message",
			],
		],
		faq: [
			{
				question: "Which is better for Next.js, Bolt or v0?",
				answer: "v0. It's made by Vercel, the company behind Next.js, and its apps deploy straight to Vercel. Bolt supports many frameworks, which matters more if you're not set on Next.js.",
			},
			{
				question: "How do Bolt and v0 charge?",
				answer: "Bolt has a free tier with a monthly token allowance, then monthly plans metered in tokens. v0 has a free tier with a daily message limit, then monthly plans with included credits and usage metered in tokens. rwaft charges a flat price per chat instead.",
			},
		],
	},
	{
		slug: "lovable-vs-replit",
		pair: ["lovable-alternative", "replit-alternative"],
		title: "Lovable vs Replit: which AI app builder to pick",
		description:
			"Lovable vs Replit Agent side by side: what each builds, how much of the code you see and how you pay, plus a simpler option for websites.",
		lead: "Lovable is a chat-first builder for React web apps, with Lovable Cloud for data. Replit is a full development environment with an AI agent inside, for apps in almost any language, mobile and back end included.",
		picks: [
			[
				"You want a React web app without working in a development environment",
				"You want a chat beside a live preview, and a back end set up through Lovable Cloud",
				"You'd rather not see a console, files or a terminal",
			],
			[
				"You need a language other than JavaScript, or server code you control",
				"You want a full development environment, with collaborators",
				"You're building a mobile app",
			],
		],
		faq: [
			{
				question: "Is Lovable or Replit better for beginners?",
				answer: "Lovable, for most people: it stays a conversation beside a preview. Replit opens a whole development environment, which pays off once you want to see and change the code. If you only need a website, rwaft asks even less of you.",
			},
			{
				question: "How do Lovable and Replit charge?",
				answer: "Lovable has a free tier with daily credits, then monthly plans, and a message's cost depends on how complex the task is. Replit has a free Starter plan, then monthly plans with credits, and charges each Agent request by effort. rwaft charges the same for every chat, with no subscription.",
			},
		],
	},
	{
		slug: "lovable-vs-base44",
		pair: ["lovable-alternative", "base44-alternative"],
		title: "Lovable vs Base44: which AI app builder to pick",
		description:
			"Lovable vs Base44 side by side: back ends, code access and how you pay, plus a simpler option if you only need a website with a live link.",
		lead: "Both build full-stack web apps from a chat, with a database and sign-in on hand. Base44, part of Wix since 2025, has them built into every plan; Lovable adds them through Lovable Cloud and syncs the code with GitHub.",
		picks: [
			[
				"You want a standard React and Vite codebase you could run without the builder",
				"You want to view and edit the code beside the chat",
				"You're building a product you expect to hand to developers later",
			],
			[
				"You want a database, sign-in and user management on every plan, free included",
				"You're building an internal tool or a portal for a team",
				"You'd rather not think about the back end at all",
			],
		],
		faq: [
			{
				question: "Which is better for internal tools, Lovable or Base44?",
				answer: "Base44 is built around them: every plan comes with a database, sign-in and user management. Lovable can build the same with Lovable Cloud and gives you more control of the code.",
			},
			{
				question: "Can I get the code out of Lovable and Base44?",
				answer: "Lovable syncs the code with GitHub both ways. Base44 offers in-app code edits on paid plans and two-way GitHub sync on its higher plans.",
			},
		],
	},
	{
		slug: "framer-vs-webflow",
		pair: ["framer-alternative", "webflow-alternative"],
		title: "Framer vs Webflow: which website builder to pick",
		description:
			"Framer vs Webflow side by side: design control, CMS, AI, code export and how you pay, plus an option that needs no designing at all.",
		lead: "Both are visual website builders for designers, with hosting, a CMS and AI built in. Framer works like a design tool and is quick to start; Webflow follows how HTML and CSS work, with online stores and code export on paid workspace plans.",
		picks: [
			[
				"You want it to feel like a design tool, not a web development one",
				"You're making a marketing site or a portfolio and want to move fast",
				"You want AI to draft the layout you then refine on a canvas",
			],
			[
				"You need an online store or deeply structured CMS content",
				"You want to export HTML, CSS and JavaScript",
				"Your agency builds and hands over many client sites",
			],
		],
		faq: [
			{
				question: "Is Framer or Webflow easier to learn?",
				answer: "Framer, for most people: it works like a design tool. Webflow's designer follows how HTML and CSS work, which is more to learn but gives more control. If you'd rather not design at all, rwaft builds the site from a description.",
			},
			{
				question: "Can I export code from Framer or Webflow?",
				answer: "Webflow exports HTML, CSS and JavaScript on paid workspace plans, without the CMS or store content. Framer sites stay on Framer's hosting.",
			},
		],
	},
]

export const matchup = (slug: string) => MATCHUPS.find((item) => item.slug === slug)

/** Both sides of a matchup, in title order. Every pair names rivals that exist. */
export const matchupRivals = (item: Matchup) => item.pair.map((slug) => rival(slug)!) as [Rival, Rival]

/** Every /compare/<slug>: one page per rival, then the head-to-heads. */
export const COMPARE_SLUGS = [...RIVALS.map((item) => item.slug), ...MATCHUPS.map((item) => item.slug)]

/** The roundup at /compare/best-ai-app-builders; a static route beside /compare/[slug]. */
export const ROUNDUP_PATH = "/compare/best-ai-app-builders"
