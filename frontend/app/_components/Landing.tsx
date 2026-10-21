import { chatsFor, formatPrice, type Pricing } from "../../lib/pricing"
import { ChevronRight } from "./Icons"

/**
 * The home page below the fold: how it works, pricing and questions.
 *
 * A server component, rendered into the first HTML response, so search
 * engines (and anyone without JavaScript) read what rwaft is and what it
 * costs. Every figure comes from the API's live configuration; nothing here
 * may claim users, ratings or results that don't exist.
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

export function Landing({ pricing, faq }: { pricing: Pricing; faq: Faq[] }) {
	const freeChats = chatsFor(pricing.signupTokens, pricing)
	const packs = pricing.payments ? pricing.packs : []

	return (
		<>
			<section className="land" id="how-it-works" aria-labelledby="how-title">
				<h2 id="how-title" className="land-title">How the AI app builder works</h2>
				<p className="land-lead">From one sentence to a live website, with nothing hidden in between.</p>
				<ol className="land-grid land-steps">
					{STEPS.map((step, index) => (
						<li key={step.title} className="land-card">
							<span className="land-step-num" aria-hidden="true">{index + 1}</span>
							<h3>{step.title}</h3>
							<p>{step.body}</p>
						</li>
					))}
				</ol>
			</section>

			<section className="land" id="pricing" aria-labelledby="pricing-title">
				<h2 id="pricing-title" className="land-title">Pricing</h2>
				{pricing.billing ? (
					<>
						<p className="land-lead">Pay per chat, with no subscription. Every chat is one complete build, and a build that fails costs nothing.</p>
						<ul className="land-grid land-plans">
							<li className="land-card land-plan">
								<h3>Free</h3>
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
										<h3>{titleCase(pack.id)}</h3>
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
							<li>Failed builds are refunded automatically.</li>
							<li>
								{packs.length > 0
									? "Buy credits any time from the credits menu once you're signed in. Payment is handled by Stripe."
									: "Credit packs go on sale once payments are switched on."}
							</li>
						</ul>
					</>
				) : (
					<p className="land-lead">Every build is free right now, and you don&apos;t need an account to start.</p>
				)}
				<a className="text-btn land-cta" href="#start">
					{pricing.billing && freeChats ? `Start with ${plural(freeChats, "free chat")}` : "Start building"}
				</a>
			</section>

			<section className="land" id="faq" aria-labelledby="faq-title">
				<h2 id="faq-title" className="land-title">Questions</h2>
				<div className="land-faq">
					{faq.map((item) => (
						<details key={item.question} className="land-card land-q">
							<summary>
								<h3>{item.question}</h3>
								<ChevronRight className="land-q-chev" />
							</summary>
							<p>{item.answer}</p>
						</details>
					))}
				</div>
			</section>
		</>
	)
}
