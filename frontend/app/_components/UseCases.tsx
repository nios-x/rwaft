import Link from "next/link"
import type { Pricing } from "../../lib/pricing"
import { USE_CASES, consoleHref, type UseCase } from "../../lib/useCases"
import { FaqItems, NextStep, costFaq, costLine } from "./InfoSections"
import { ChevronRight, SparkIcon } from "./Icons"

/**
 * The content of /make and /make/<slug>. Server components like
 * InfoSections: each page answers its search in the first HTML response, and
 * its prompts hand straight over to the console.
 */

/** The visible trail above a page below a hub; PageShell writes the matching BreadcrumbList. */
export function Crumbs({ hub, current }: { hub: { name: string; href: string }; current: string }) {
	return (
		<nav className="crumbs" aria-label="Breadcrumb">
			<Link href={hub.href}>{hub.name}</Link>
			<ChevronRight className="crumbs-sep" />
			<span aria-current="page">{current}</span>
		</nav>
	)
}

/** Every page's questions: its own, then what it costs. */
export const faqForUseCase = (item: UseCase, pricing: Pricing) => [...item.faq, costFaq(pricing)]

export function UseCaseHub() {
	return (
		<section className="land" aria-labelledby="build-title">
			<h1 id="build-title" className="land-title">What you can build with AI</h1>
			<p className="land-lead">
				Websites, web apps and games that rwaft writes, builds and hosts from a plain-language description. Pick
				one to see example prompts, what to put in yours and what you get back.
			</p>
			<ul className="land-grid land-output">
				{USE_CASES.map((item) => (
					<li key={item.slug} className="land-card land-card--link">
						<h2><Link href={`/make/${item.slug}`}>{item.name}</Link></h2>
						<p>{item.blurb}</p>
					</li>
				))}
			</ul>
			<p className="land-more">
				Don&apos;t see yours? Most front-end sites work: describe it on the <Link href="/">home page</Link> the way
				you&apos;d explain it to a friend. Weighing up tools? See how rwaft <Link href="/compare">compares</Link>.
			</p>
			<NextStep href="/how-it-works" label="How it works" />
		</section>
	)
}

export function UseCaseDetail({ item, pricing }: { item: UseCase; pricing: Pricing }) {
	const deploy = item.mode === "deploy"
	const start = consoleHref(item.examples[0], item.mode)
	const related = USE_CASES.filter((other) => other.slug !== item.slug).slice(0, 6)

	return (
		<section className="land" aria-labelledby="usecase-title">
			<Crumbs hub={{ name: "What you can build", href: "/make" }} current={item.name} />
			<h1 id="usecase-title" className="land-title">{item.heading}</h1>
			<p className="land-lead">{item.lead}</p>
			<div className="land-cta">
				<Link href={start} className="pill-btn pill-btn--ink">{deploy ? "Paste a repository" : "Start with an example"}</Link>
				<span className="land-cost">{costLine(pricing)}</span>
			</div>

			{item.examples.length > 0 && (
				<>
					<h2 className="land-subtitle">Prompts to start from</h2>
					<p className="land-lead">Pick one and it opens in the prompt box. Change any detail before you send it.</p>
					<ul className="land-prompts">
						{item.examples.map((example) => (
							<li key={example}>
								<Link href={consoleHref(example)} className="land-prompt">
									<SparkIcon className="land-prompt-icon" />
									<span>{example}</span>
								</Link>
							</li>
						))}
					</ul>
				</>
			)}

			<h2 className="land-subtitle">{deploy ? "What rwaft needs" : "What to put in your prompt"}</h2>
			<ul className="land-list">
				{item.include.map((line) => <li key={line}>{line}</li>)}
			</ul>

			<h2 className="land-subtitle">What you get</h2>
			<ul className="land-grid land-output">
				{item.get.map((card) => (
					<li key={card.title} className="land-card">
						<h3>{card.title}</h3>
						<p>{card.body}</p>
					</li>
				))}
			</ul>

			<h2 className="land-subtitle">Good to know</h2>
			<p className="land-lead">{item.note}</p>

			<h2 className="land-subtitle">Questions</h2>
			<FaqItems faq={faqForUseCase(item, pricing)} level="h3" />

			<h2 className="land-subtitle">More you can build</h2>
			<ul className="land-chips">
				{related.map((other) => (
					<li key={other.slug}><Link href={`/make/${other.slug}`} className="example">{other.name}</Link></li>
				))}
				<li><Link href="/make" className="example">See all</Link></li>
			</ul>

			<NextStep href="/compare" label="How rwaft compares" start={start} />
		</section>
	)
}
