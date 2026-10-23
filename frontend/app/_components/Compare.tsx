import Link from "next/link"
import { COMPARED_ON, RIVALS, TOPICS, pickRwaft, rwaftCells, type Rival } from "../../lib/compare"
import type { Pricing } from "../../lib/pricing"
import { FaqItems, NextStep } from "./InfoSections"
import { Crumbs } from "./UseCases"

/**
 * The content of /compare and /compare/<slug>. See lib/compare.ts for the
 * rules the rivals' columns follow.
 */

const checked = new Date(`${COMPARED_ON}T00:00:00Z`).toLocaleDateString("en-US", {
	year: "numeric",
	month: "long",
	day: "numeric",
	timeZone: "UTC",
})

const rivalNames = RIVALS.map((item) => item.name)
const allNames = `${rivalNames.slice(0, -1).join(", ")} and ${rivalNames.at(-1)}`

/** A table that scrolls sideways inside its own box on a phone, never the page. */
function Table({ pricing, rivals }: { pricing: Pricing; rivals: Rival[] }) {
	const ours = rwaftCells(pricing)
	return (
		<div className="compare-wrap" role="region" aria-label="Comparison table" tabIndex={0}>
			<table className="compare" data-cols={rivals.length + 1}>
				<thead>
					<tr>
						<td />
						<th scope="col" className="compare-us">rwaft</th>
						{rivals.map((item) => <th key={item.slug} scope="col">{item.name}</th>)}
					</tr>
				</thead>
				<tbody>
					{TOPICS.map((topic) => (
						<tr key={topic.id}>
							<th scope="row">{topic.label}</th>
							<td className="compare-us">{ours[topic.id]}</td>
							{rivals.map((item) => <td key={item.slug}>{item.cells[topic.id]}</td>)}
						</tr>
					))}
				</tbody>
			</table>
		</div>
	)
}

function Checked({ rivals }: { rivals: Rival[] }) {
	return (
		<p className="land-checked">
			Checked against each product&apos;s own site on <time dateTime={COMPARED_ON}>{checked}</time>. Plans change
			often, so check{" "}
			{rivals.map((item, index) => (
				<span key={item.slug}>
					{index > 0 && (index === rivals.length - 1 ? " and " : ", ")}
					<a href={item.pricingUrl} target="_blank" rel="nofollow noopener noreferrer">{item.name}&apos;s pricing</a>
				</span>
			))}{" "}
			before you choose.
		</p>
	)
}

function Disclaimer({ rivals }: { rivals: Rival[] }) {
	return (
		<p className="land-fine">
			{rivals.map((item) => `${item.name} is a trademark of ${item.maker}`).join("; ")}. rwaft isn&apos;t affiliated
			with {rivals.length === 1 ? rivals[0].maker : "any of them"}.
		</p>
	)
}

export function CompareHub({ pricing }: { pricing: Pricing }) {
	return (
		<section className="land" aria-labelledby="compare-title">
			<h1 id="compare-title" className="land-title">rwaft vs {allNames}</h1>
			<p className="land-lead">
				Four ways to turn a description into an app. They differ in what they build, what you see while they work and
				how you pay, and each is the right pick for someone. Here is all of it in one table.
			</p>
			<Checked rivals={RIVALS} />
			<Table pricing={pricing} rivals={RIVALS} />

			<h2 className="land-subtitle">One on one</h2>
			<ul className="land-grid land-output">
				{RIVALS.map((item) => (
					<li key={item.slug} className="land-card land-card--link">
						<h3><Link href={`/compare/${item.slug}`}>rwaft vs {item.name}</Link></h3>
						<p>{item.lead}</p>
					</li>
				))}
			</ul>

			<h2 className="land-subtitle">When rwaft is the better pick</h2>
			<ul className="land-list">
				{pickRwaft(pricing).map((line) => <li key={line}>{line}</li>)}
			</ul>
			<p className="land-more">
				And when it isn&apos;t: if your app needs accounts, a database, payments or a custom domain, {allNames} all
				go further than rwaft does today.
			</p>
			<NextStep href="/make" label="What you can build" />
			<Disclaimer rivals={RIVALS} />
		</section>
	)
}

export function CompareDetail({ item, pricing }: { item: Rival; pricing: Pricing }) {
	const others = RIVALS.filter((other) => other.slug !== item.slug)
	return (
		<section className="land" aria-labelledby="vs-title">
			<Crumbs hub={{ name: "Compare", href: "/compare" }} current={`rwaft vs ${item.name}`} />
			<h1 id="vs-title" className="land-title">rwaft vs {item.name}</h1>
			<p className="land-lead">{item.lead}</p>
			<Checked rivals={[item]} />
			<Table pricing={pricing} rivals={[item]} />

			<div className="land-grid land-picks">
				<div className="land-card">
					<h2>Choose rwaft if</h2>
					<ul className="land-list">
						{pickRwaft(pricing).map((line) => <li key={line}>{line}</li>)}
					</ul>
				</div>
				<div className="land-card">
					<h2>Choose {item.name} if</h2>
					<ul className="land-list">
						{item.pickRival.map((line) => <li key={line}>{line}</li>)}
					</ul>
				</div>
			</div>

			<h2 className="land-subtitle">Questions</h2>
			<FaqItems faq={item.faq} level="h3" />

			<p className="land-more">
				Also compared: {others.map((other, index) => (
					<span key={other.slug}>
						{index > 0 && " · "}
						<Link href={`/compare/${other.slug}`}>rwaft vs {other.name}</Link>
					</span>
				))}
				{" · "}<Link href="/compare">all four side by side</Link>.
			</p>
			<NextStep href="/make" label="What you can build" />
			<Disclaimer rivals={[item]} />
		</section>
	)
}
