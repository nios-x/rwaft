import Link from "next/link"
import { chatsFor, formatPrice, type Pricing } from "../../lib/pricing"
import { ChevronRight } from "./Icons"

/**
 * The content of /how-it-works, /pricing and /faq.
 *
 * Server components, rendered into the first HTML response, so search engines
 * (and anyone without JavaScript) read what rwaft is and what it costs. Every
 * figure comes from the API's live configuration; nothing here may claim
 * users, ratings or results that don't exist.
 */

export interface Faq {
	question: string
	answer: string
}

const STEPS = [
	{
		title: "Describe it",
		body: "Say what you want in plain words: what it is, who it's for and what it should do. Or paste a public GitHub repository.",
	},
	{
		title: "Watch it build",
		body: "rwaft's AI plans the pages, writes a React app, installs it and builds it. You see every step as it happens, including the fixes it makes when a build breaks.",
	},
	{
		title: "Share the link",
		body: "Your site goes live at its own URL. Try it in the preview, then send the link to anyone.",
	},
]

/** What people actually make with it; every one is a front-end site the pipeline can build. */
const BUILDS = [
	"Landing pages for a product, an app or a launch",
	"Portfolios for photographers, designers and developers",
	"Menus and pages for cafés, restaurants and small shops",
	"Event, wedding and RSVP pages",
	"Habit trackers, to-do lists and other single-page tools",
	"Multi-page sites with their own navigation",
]

/** Facts about the output, taken from the build pipeline; nothing here is aspirational. */
const OUTPUT = [
	{
		title: "A real React app",
		body: "Every app is React and TypeScript on Vite, styled with Tailwind CSS, with React Router when it has more than one page. It's the same stack a developer would choose.",
	},
	{
		title: "A live link",
		body: "As soon as the build passes, the site is hosted at its own URL. There's nothing to set up and no server to manage.",
	},
	{
		title: "The whole build, in the open",
		body: "Each step is explained in plain words as it happens, with the raw build log one tap away. When something breaks, you see rwaft fix it.",
	},
	{
		title: "Changes by chat",
		body: "Send a follow-up like “make the header darker” or “add a contact page”, and rwaft edits the app and publishes the new version.",
	},
]

const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? "" : "s"}`

const titleCase = (id: string) => id.charAt(0).toUpperCase() + id.slice(1).replace(/-/g, " ")

/** One source for the visible answers and the FAQPage structured data, so the two can't drift. */
export function faqFor(pricing: Pricing): Faq[] {
	const freeChats = chatsFor(pricing.signupTokens, pricing)
	const costs = pricing.billing
		? `Sign up with Google and you get ${plural(pricing.signupTokens, "free credit")}${freeChats !== null ? `, which is ${plural(freeChats, "chat")}` : ""}. Each chat you send is one complete build and costs ${plural(pricing.costs.prompt, "credit")}; deploying a GitHub repository costs ${plural(pricing.costs.deploy, "credit")}. If a build fails, its credits are refunded automatically.${pricing.payments ? " When you run out you can buy more, with no subscription." : ""}`
		: "Every build is free right now, and you don't need an account to start."

	return [
		{
			question: "What is rwaft?",
			answer: "rwaft is an AI website builder. You describe an app in plain words, and rwaft's AI writes it as a React app, builds it and hosts it at its own link. You watch the real build as it happens, step by step.",
		},
		{
			question: "Do I need to know how to code?",
			answer: "No. Describe what you want, who it's for and what it should do, and rwaft does the rest. Each step is explained in plain words, with the raw build log one tap away if you want it.",
		},
		{
			question: pricing.billing ? "How do credits work?" : "Is rwaft free?",
			answer: costs,
		},
		{
			question: "What can I build?",
			answer: "Websites and front-end web apps: landing pages, portfolios, menus, event pages, trackers and other single-page tools. rwaft generates a React app built with Vite and TypeScript.",
		},
		{
			question: "Can I change my app after it's built?",
			answer: "Yes. Send a follow-up message in the same chat, like “make the header darker” or “add a contact page”, and rwaft edits the app and publishes the new version. Its code is kept for a while after each build so it can be changed; after that, describe the whole app again to rebuild it.",
		},
		{
			question: "Can I deploy my own GitHub repository?",
			answer: "Yes. Paste the URL of a public GitHub, GitLab or Bitbucket repository that uses Vite or Create React App, and rwaft builds and hosts it.",
		},
		{
			question: "How long does a build take?",
			answer: "A few minutes. Builds run one at a time, so if others are ahead of you, you see your place in line and yours starts automatically. You can close the tab; the link works once the site is live.",
		},
		{
			question: "Who can see my site?",
			answer: "Anyone with the link. Every site rwaft builds is public at its own URL, so don't put anything private in a prompt.",
		},
	]
}

/** Where each page sends the reader next, so the three read as one short tour. */
function NextStep({ href, label }: { href: string; label: string }) {
	return (
		<div className="land-next">
			<Link href="/" className="pill-btn pill-btn--ink">Start building</Link>
			<Link href={href} className="text-btn">{label}</Link>
		</div>
	)
}

export function HowItWorks() {
	return (
		<section className="land" aria-labelledby="how-title">
			<h1 id="how-title" className="land-title">How the AI app builder works</h1>
			<p className="land-lead">From one sentence to a live website, with nothing hidden in between.</p>
			<ol className="land-grid land-steps">
				{STEPS.map((step, index) => (
					<li key={step.title} className="land-card">
						<span className="land-step-num" aria-hidden="true">{index + 1}</span>
						<h2>{step.title}</h2>
						<p>{step.body}</p>
					</li>
				))}
			</ol>

			<h2 className="land-subtitle">What you can build</h2>
			<p className="land-lead">Websites and front-end web apps, described the way you&apos;d explain them to a friend.</p>
			<ul className="land-list">
				{BUILDS.map((item) => <li key={item}>{item}</li>)}
			</ul>

			<h2 className="land-subtitle">What you get</h2>
			<ul className="land-grid land-output">
				{OUTPUT.map((item) => (
					<li key={item.title} className="land-card">
						<h3>{item.title}</h3>
						<p>{item.body}</p>
					</li>
				))}
			</ul>
			<p className="land-more">
				Already have a React app? Paste a public GitHub repository instead and rwaft builds and hosts that.
				Costs are on the <Link href="/pricing">pricing page</Link>, and the <Link href="/faq">FAQ</Link> covers the rest.
			</p>
			<NextStep href="/pricing" label="See pricing" />
		</section>
	)
}

export function PricingPlans({ pricing }: { pricing: Pricing }) {
	const freeChats = chatsFor(pricing.signupTokens, pricing)
	const packs = pricing.payments ? pricing.packs : []

	return (
		<section className="land" aria-labelledby="pricing-title">
			<h1 id="pricing-title" className="land-title">Pricing</h1>
			{pricing.billing ? (
				<>
					<p className="land-lead">
						{packs.length > 0
							? "Start with free credits, then buy a credit pack when you need more. No subscription. Every chat is one complete build."
							: "Start with free credits. Every chat is one complete build."}
					</p>
					<ul className="land-grid land-plans">
						<li className="land-card land-plan">
							<h2>Free</h2>
							<p className="land-price">{formatPrice(0, pricing.currency)}</p>
							<p>
								<strong>{plural(pricing.signupTokens, "credit")}</strong> when you sign up with Google
								{freeChats !== null && <>: {plural(freeChats, "chat")}</>}
							</p>
						</li>
						{packs.map((pack) => {
							const chats = chatsFor(pack.tokens, pricing)
							return (
								<li key={pack.id} className="land-card land-plan">
									<h2>{titleCase(pack.id)}</h2>
									<p className="land-price">{formatPrice(pack.amount, pricing.currency)}</p>
									<p>
										<strong>{plural(pack.tokens, "credit")}</strong>
										{chats ? <>: about {plural(chats, "chat")}, {formatPrice(pack.amount / chats, pricing.currency)} each</> : null}
									</p>
								</li>
							)
						})}
					</ul>
					<ul className="land-notes">
						<li>A chat costs {plural(pricing.costs.prompt, "credit")}. Deploying a GitHub repository costs {plural(pricing.costs.deploy, "credit")}.</li>
						<li>If a build fails, its credits are refunded automatically.</li>
						<li>
							{packs.length > 0
								? "Buy credits any time from the credits menu once you're signed in. Payment is handled by Dodo Payments."
								: "Paid credit packs aren't on sale yet."}
						</li>
					</ul>
				</>
			) : (
				<p className="land-lead">Every build is free right now, and you don&apos;t need an account to start.</p>
			)}
			<NextStep href="/faq" label="Questions about credits?" />
		</section>
	)
}

export function FaqList({ faq }: { faq: Faq[] }) {
	return (
		<section className="land" aria-labelledby="faq-title">
			<h1 id="faq-title" className="land-title">Frequently asked questions</h1>
			<p className="land-lead">What people ask about rwaft&apos;s AI app builder before their first build.</p>
			<div className="land-faq">
				{faq.map((item) => (
					<details key={item.question} className="land-card land-q">
						<summary>
							<h2>{item.question}</h2>
							<ChevronRight className="land-q-chev" />
						</summary>
						<p>{item.answer}</p>
					</details>
				))}
			</div>
			<NextStep href="/how-it-works" label="How it works" />
		</section>
	)
}
