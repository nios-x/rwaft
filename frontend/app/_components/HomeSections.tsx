import Link from "next/link"
import { ROUNDUP_PATH, rival } from "../../lib/compare"
import type { Pricing } from "../../lib/pricing"
import { USE_CASES, findUseCase } from "../../lib/useCases"
import { FaqItems, STEPS, faqFor } from "./InfoSections"

/**
 * The home page's explanatory sections, below the feature cards. A server
 * component handed down through Console like Features, so search engines
 * read what rwaft is, what it makes and how it compares in the first HTML
 * response, and each section links to the page that goes deeper. Everything
 * here is taken from the pages it links to, so the two can't disagree.
 */

/** Twelve, so the grid fills every row at four, three, two or one columns. */
const HOME_USE_CASES = [
	"landing-page",
	"portfolio-website",
	"small-business-website",
	"restaurant-website",
	"wedding-website",
	"resume-website",
	"personal-website",
	"real-estate-website",
	"web-app",
	"browser-game",
	"quiz-maker",
	"birthday-website",
].map((slug) => findUseCase(slug)!)

const HOME_RIVALS = ["lovable-alternative", "bolt-alternative", "v0-alternative", "replit-alternative"].map((slug) => rival(slug)!)

/** The FAQ's opening questions; the rest are a click away. */
const HOME_FAQ_COUNT = 5

export function HomeSections({ pricing }: { pricing: Pricing }) {
	return (
		<div className="home-more">
			<section aria-labelledby="home-steps-title">
				<h2 id="home-steps-title" className="land-subtitle">From a prompt to a live link in three steps</h2>
				<p className="land-lead">rwaft is an AI app and website builder for people who don&apos;t write code. You describe it; it does the rest in the open.</p>
				<ol className="land-grid land-steps">
					{STEPS.map((step, index) => (
						<li key={step.title} className="land-card">
							<span className="land-step-num" aria-hidden="true">{index + 1}</span>
							<h3>{step.title}</h3>
							<p>{step.body}</p>
						</li>
					))}
				</ol>
				<p className="land-more"><Link href="/how-it-works">How the AI app builder works</Link></p>
			</section>

			<section aria-labelledby="home-make-title">
				<h2 id="home-make-title" className="land-subtitle">What you can build with AI</h2>
				<p className="land-lead">Websites, web apps and games, described the way you&apos;d explain them to a friend.</p>
				<ul className="land-grid land-output">
					{HOME_USE_CASES.map((item) => (
						<li key={item.slug} className="land-card land-card--link">
							<h3><Link href={`/make/${item.slug}`}>{item.name}</Link></h3>
							<p>{item.blurb}</p>
						</li>
					))}
				</ul>
				<p className="land-more"><Link href="/make">All {USE_CASES.length} kinds of site, with example prompts</Link></p>
			</section>

			<section aria-labelledby="home-compare-title">
				<h2 id="home-compare-title" className="land-subtitle">rwaft vs Lovable, Bolt, v0 and Replit</h2>
				<p className="land-lead">
					Other AI app builders go further into back ends and code editors. rwaft keeps to websites and front-end apps,
					{pricing.billing ? " charges per build rather than per month," : " is free right now,"} and shows you the real build.
				</p>
				<ul className="land-grid land-output">
					{HOME_RIVALS.map((item) => (
						<li key={item.slug} className="land-card land-card--link">
							<h3><Link href={`/compare/${item.slug}`}>rwaft vs {item.name}</Link></h3>
							<p>{item.lead}</p>
						</li>
					))}
				</ul>
				<p className="land-more">
					<Link href={ROUNDUP_PATH}>The best AI app builders, by what each is best for</Link> ·{" "}
					<Link href="/compare">every builder side by side</Link>
				</p>
			</section>

			<section aria-labelledby="home-faq-title">
				<h2 id="home-faq-title" className="land-subtitle">Questions</h2>
				<FaqItems faq={faqFor(pricing).slice(0, HOME_FAQ_COUNT)} level="h3" />
				<p className="land-more"><Link href="/faq">More questions</Link> · <Link href="/docs">Read the docs</Link></p>
			</section>
		</div>
	)
}
