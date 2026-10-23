import Link from "next/link"
import { chatsFor, formatPrice, type Pricing } from "../../lib/pricing"
import { CONTACT_LABEL, CONTACT_URL } from "../../lib/site"
import { ChevronRight } from "./Icons"
import { TrailerPlayer } from "./TrailerPlayer"

/**
 * The content of /trailer, /how-it-works, /pricing, /faq and /about.
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

/** What people actually make with it; every one is a front-end site the pipeline can build, with its own /make page. */
const BUILDS = [
	{ label: "Landing pages for a product, an app or a launch", href: "/make/landing-page" },
	{ label: "Portfolios for photographers, designers and developers", href: "/make/portfolio-website" },
	{ label: "Menus and pages for cafés, restaurants and small shops", href: "/make/restaurant-website" },
	{ label: "Event, wedding and RSVP pages", href: "/make/wedding-website" },
	{ label: "Habit trackers, to-do lists and other single-page tools", href: "/make/web-app" },
	{ label: "Browser games with a full screen to themselves", href: "/make/browser-game" },
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

/** The product principles from PRODUCT.md, in the visitor's words. */
const PRINCIPLES = [
	{
		title: "Show the real work",
		body: "You see every step of your build as it happens: the plan, the installs, the build output and the fixes rwaft makes when something breaks. Never a spinner standing in for the work.",
	},
	{
		title: "Plain words first",
		body: "You shouldn't need to know what a bundler is to make a website. Each step is explained in everyday language, with the raw build log one tap away if you want it.",
	},
	{
		title: "Honest about cost and waiting",
		body: "What a build costs, what you have left and your place in line are on screen before and during every build. If a build fails, its credits come back automatically.",
	},
]

/** The services rwaft runs on. Keep in step with the privacy policy's list of providers. */
const STACK = [
	"Apps are React and TypeScript on Vite, styled with Tailwind CSS",
	"The AI comes from Google Gemini and OpenRouter",
	"Builds and hosting run on Render; this website runs on Vercel",
	"Sign-in is with Google, and payments are handled by Dodo Payments",
]

/** The product overview film, rendered from motion/ (motion/out/rwaft-overview.mp4, with its score). */
export const TRAILER = {
	src: "/video/rwaft-overview.mp4",
	poster: "/video/rwaft-overview-poster.jpg",
	duration: "PT29S",
	uploaded: "2026-10-22",
	title: "rwaft in 29 seconds",
	description:
		"Describe an app in plain words, watch the real build fix its own error, share the live link, then change it by asking. Or deploy a React repo instead.",
}

const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? "" : "s"}`

const titleCase = (id: string) => id.charAt(0).toUpperCase() + id.slice(1).replace(/-/g, " ")

/** What building costs, in one answer; the FAQ and every /make page ask it. */
export function costFaq(pricing: Pricing): Faq {
	const freeChats = chatsFor(pricing.signupTokens, pricing)
	const answer = pricing.billing
		? `Sign up with Google and you get ${plural(pricing.signupTokens, "free credit")}${freeChats !== null ? `, which is ${plural(freeChats, "chat")}` : ""}. Each chat you send is one complete build and costs ${plural(pricing.costs.prompt, "credit")}; deploying a GitHub repository costs ${plural(pricing.costs.deploy, "credit")}. If a build fails, its credits are refunded automatically.${pricing.payments ? " When you run out you can buy more, with no subscription." : ""}`
		: "Every build is free right now, and you don't need an account to start."
	return { question: pricing.billing ? "How do credits work?" : "Is rwaft free?", answer }
}

/** The short version, beside a page's main button. */
export function costLine(pricing: Pricing) {
	return pricing.billing
		? `${plural(pricing.signupTokens, "free credit")} when you sign up · ${plural(pricing.costs.prompt, "credit")} a chat`
		: "Free right now, no account needed"
}

/** One source for the visible answers and the FAQPage structured data, so the two can't drift. */
export function faqFor(pricing: Pricing): Faq[] {
	return [
		{
			question: "What is rwaft?",
			answer: "rwaft is an AI website builder. You describe an app in plain words, and rwaft's AI writes it as a React app, builds it and hosts it at its own link. You watch the real build as it happens, step by step.",
		},
		{
			question: "Do I need to know how to code?",
			answer: "No. Describe what you want, who it's for and what it should do, and rwaft does the rest. Each step is explained in plain words, with the raw build log one tap away if you want it.",
		},
		costFaq(pricing),
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
		{
			question: "Does my site say it was made with rwaft?",
			answer: "Yes. Every site rwaft hosts shows a small “Made with rwaft” link in its bottom-right corner, which opens rwaft in a new tab.",
		},
	]
}

/** Where each page sends the reader next, so the three read as one short tour. */
export function NextStep({ href, label, start = "/" }: { href: string; label: string; start?: string }) {
	return (
		<div className="land-next">
			<Link href={start} className="pill-btn pill-btn--ink">Start building</Link>
			<Link href={href} className="text-btn">{label}</Link>
		</div>
	)
}

export function Trailer() {
	return (
		<section className="land" aria-labelledby="trailer-title">
			<h1 id="trailer-title" className="land-title">{TRAILER.title}</h1>
			<p className="land-lead">{TRAILER.description}</p>
			<TrailerPlayer src={TRAILER.src} poster={TRAILER.poster} label={`${TRAILER.title}: the rwaft trailer`} />
			<NextStep href="/how-it-works" label="How it works" />
		</section>
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
			<ul className="land-list land-links">
				{BUILDS.map((item) => <li key={item.href}><Link href={item.href}>{item.label}</Link></li>)}
			</ul>
			<p className="land-more"><Link href="/make">Everything you can build, with example prompts</Link></p>

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
	// Packs show before payments are connected, marked as not on sale yet.
	const packs = pricing.packs
	const onSale = Boolean(pricing.payments)

	return (
		<section className="land" aria-labelledby="pricing-title">
			<h1 id="pricing-title" className="land-title">Pricing</h1>
			{pricing.billing ? (
				<>
					<p className="land-lead">
						{packs.length > 0
							? `Start with free credits, then ${onSale ? "buy" : "top up with"} a credit pack when you need more. No subscription. Every chat is one complete build.`
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
									<h2>
										{titleCase(pack.id)}
										{!onSale && <span className="land-plan-soon">Coming soon</span>}
									</h2>
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
							{packs.length > 0 && onSale
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

/** Questions that open in place. `level` is h3 where they sit under a page's own "Questions" heading. */
export function FaqItems({ faq, level = "h2" }: { faq: Faq[]; level?: "h2" | "h3" }) {
	const Heading = level
	return (
		<div className="land-faq">
			{faq.map((item) => (
				<details key={item.question} className="land-card land-q">
					<summary>
						<Heading>{item.question}</Heading>
						<ChevronRight className="land-q-chev" />
					</summary>
					<p>{item.answer}</p>
				</details>
			))}
		</div>
	)
}

export function FaqList({ faq }: { faq: Faq[] }) {
	return (
		<section className="land" aria-labelledby="faq-title">
			<h1 id="faq-title" className="land-title">Frequently asked questions</h1>
			<p className="land-lead">What people ask about rwaft&apos;s AI app builder before their first build.</p>
			<FaqItems faq={faq} />
			<NextStep href="/how-it-works" label="How it works" />
		</section>
	)
}

export function About() {
	return (
		<section className="land" aria-labelledby="about-title">
			<h1 id="about-title" className="land-title">About rwaft</h1>
			<p className="land-lead">
				rwaft is an AI website builder. Describe an app in plain words and get a live link, and watch the real build
				happen on the way there.
			</p>

			<h2 className="land-subtitle">Why build in the open</h2>
			<p className="land-lead">
				Most prompt-to-app tools show a spinner and hand you a result you have to take on trust. rwaft streams the
				actual work instead, from the AI planning your pages to the moment the site goes live. Watching it is how you
				know what you got, and why.
			</p>

			<h2 className="land-subtitle">What rwaft promises</h2>
			<ul className="land-grid land-output">
				{PRINCIPLES.map((item) => (
					<li key={item.title} className="land-card">
						<h3>{item.title}</h3>
						<p>{item.body}</p>
					</li>
				))}
			</ul>

			<h2 className="land-subtitle">What it runs on</h2>
			<ul className="land-list">
				{STACK.map((item) => <li key={item}>{item}</li>)}
			</ul>
			<p className="land-more">
				rwaft is made by{" "}
				<a href={CONTACT_URL} target="_blank" rel="noreferrer">{CONTACT_LABEL}</a>
				. Questions, bug reports and ideas are welcome there, and the <Link href="/faq">FAQ</Link> covers the common ones.
			</p>
			<NextStep href="/how-it-works" label="How it works" />
		</section>
	)
}
