import Link from "next/link"
import {
	COMPARED_ON,
	GROUPS,
	MATCHUPS,
	RIVALS,
	ROUNDUP_PATH,
	TOPICS,
	matchupRivals,
	pickRwaft,
	rwaftBestFor,
	rwaftCells,
	type Matchup,
	type Rival,
} from "../../lib/compare"
import { chatsFor, weeklyPhrase, type Pricing } from "../../lib/pricing"
import { FaqItems, NextStep, type Faq } from "./InfoSections"
import { Crumbs } from "./UseCases"

/**
 * The content of /compare, /compare/<slug> and the roundup. See
 * lib/compare.ts for the rules the rivals' columns follow.
 */

const checked = new Date(`${COMPARED_ON}T00:00:00Z`).toLocaleDateString("en-US", {
	year: "numeric",
	month: "long",
	day: "numeric",
	timeZone: "UTC",
})

const listNames = (names: string[]) => (names.length < 2 ? names.join("") : `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`)

const inGroup = (group: Rival["group"]) => RIVALS.filter((item) => item.group === group)

const appNames = listNames(inGroup("app").map((item) => item.name))
const siteNames = listNames(inGroup("site").map((item) => item.name))

const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? "" : "s"}`

/** The head-to-heads a rival is in, for the links under its own page. */
const matchupsOf = (item: Rival) => MATCHUPS.filter((other) => other.pair.includes(item.slug))

const matchupName = (item: Matchup) => matchupRivals(item).map((side) => side.name).join(" vs ")

/**
 * A table that scrolls sideways inside its own box on a phone, never the
 * page. rwaft leads on its own pages; on a head-to-head it's the third
 * column, after the two the reader came for.
 */
function Table({ pricing, rivals, us = "first" }: { pricing: Pricing; rivals: Rival[]; us?: "first" | "last" }) {
	const ours = rwaftCells(pricing)
	const ourHead = <th scope="col" className="compare-us">rwaft</th>
	return (
		<div className="compare-wrap" role="region" aria-label="Comparison table" tabIndex={0}>
			<table className="compare" data-cols={rivals.length + 1}>
				<thead>
					<tr>
						<td />
						{us === "first" && ourHead}
						{rivals.map((item) => <th key={item.slug} scope="col">{item.name}</th>)}
						{us === "last" && ourHead}
					</tr>
				</thead>
				<tbody>
					{TOPICS.map((topic) => {
						const ourCell = <td className="compare-us">{ours[topic.id]}</td>
						return (
							<tr key={topic.id}>
								<th scope="row">{topic.label}</th>
								{us === "first" && ourCell}
								{rivals.map((item) => <td key={item.slug}>{item.cells[topic.id]}</td>)}
								{us === "last" && ourCell}
							</tr>
						)
					})}
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
	const makers = new Set(rivals.map((item) => item.maker))
	return (
		<p className="land-fine">
			{rivals.map((item) => `${item.name} is a trademark of ${item.maker}`).join("; ")}. rwaft isn&apos;t affiliated
			with {makers.size === 1 ? rivals[0].maker : "any of them"}.
		</p>
	)
}

/** Links as a run of " · "-separated names, for the "also compared" lines. */
function LinkRun({ links }: { links: { href: string; label: string }[] }) {
	return links.map((link, index) => (
		<span key={link.href}>
			{index > 0 && " · "}
			<Link href={link.href}>{link.label}</Link>
		</span>
	))
}

export function CompareHub({ pricing }: { pricing: Pricing }) {
	return (
		<section className="land" aria-labelledby="compare-title">
			<h1 id="compare-title" className="land-title">AI app and website builders, compared</h1>
			<p className="land-lead">
				{appNames} turn a chat into an app; {siteNames} added AI to a website editor. They differ in what they build,
				what you see while they work and how you pay, and each is the right pick for someone. Here is all of it side
				by side, with rwaft in every table.
			</p>
			<Checked rivals={RIVALS} />

			{GROUPS.map((group) => (
				<div key={group.id}>
					<h2 className="land-subtitle">{group.label}</h2>
					<p className="land-lead">{group.lead}</p>
					<Table pricing={pricing} rivals={inGroup(group.id)} />
				</div>
			))}

			<h2 className="land-subtitle">One on one</h2>
			<ul className="land-grid land-output">
				{RIVALS.map((item) => (
					<li key={item.slug} className="land-card land-card--link">
						<h3><Link href={`/compare/${item.slug}`}>rwaft vs {item.name}</Link></h3>
						<p>{item.lead}</p>
					</li>
				))}
			</ul>

			<h2 className="land-subtitle">Head to head</h2>
			<p className="land-lead">Choosing between two of them? Each page sets the pair side by side, with rwaft as a third option.</p>
			<ul className="land-grid land-output">
				{MATCHUPS.map((item) => (
					<li key={item.slug} className="land-card land-card--link">
						<h3><Link href={`/compare/${item.slug}`}>{matchupName(item)}</Link></h3>
						<p>{item.lead}</p>
					</li>
				))}
			</ul>
			<p className="land-more">
				Want the short version? <Link href={ROUNDUP_PATH}>The best AI app and website builders</Link>, by what each is
				best for.
			</p>

			<h2 className="land-subtitle">When rwaft is the better pick</h2>
			<ul className="land-list">
				{pickRwaft(pricing).map((line) => <li key={line}>{line}</li>)}
			</ul>
			<p className="land-more">
				And when it isn&apos;t: if your app needs accounts, a database or payments, {appNames} all go further than
				rwaft does today. If you want to design every detail yourself or need a custom domain, {siteNames} do.
			</p>
			<NextStep href="/make" label="What you can build" />
			<Disclaimer rivals={RIVALS} />
		</section>
	)
}

export function CompareDetail({ item, pricing }: { item: Rival; pricing: Pricing }) {
	const others = RIVALS.filter((other) => other.slug !== item.slug)
	const pairs = matchupsOf(item)
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

			{pairs.length > 0 && (
				<p className="land-more">
					{item.name} head to head:{" "}
					<LinkRun links={pairs.map((pair) => ({ href: `/compare/${pair.slug}`, label: matchupName(pair) }))} />.
				</p>
			)}
			<p className="land-more">
				Also compared:{" "}
				<LinkRun
					links={[
						...others.map((other) => ({ href: `/compare/${other.slug}`, label: `rwaft vs ${other.name}` })),
						{ href: "/compare", label: "all side by side" },
						{ href: ROUNDUP_PATH, label: "the best AI app builders" },
					]}
				/>
				.
			</p>
			<NextStep href="/make" label="What you can build" />
			<Disclaimer rivals={[item]} />
		</section>
	)
}

export function CompareMatchup({ item, pricing }: { item: Matchup; pricing: Pricing }) {
	const sides = matchupRivals(item)
	const name = matchupName(item)
	const others = MATCHUPS.filter((other) => other.slug !== item.slug)
	return (
		<section className="land" aria-labelledby="matchup-title">
			<Crumbs hub={{ name: "Compare", href: "/compare" }} current={name} />
			<h1 id="matchup-title" className="land-title">{name}</h1>
			<p className="land-lead">{item.lead}</p>
			<Checked rivals={sides} />
			<Table pricing={pricing} rivals={sides} us="last" />

			<div className="land-grid land-picks">
				{sides.map((side, index) => (
					<div key={side.slug} className="land-card">
						<h2>Choose {side.name} if</h2>
						<ul className="land-list">
							{item.picks[index].map((line) => <li key={line}>{line}</li>)}
						</ul>
					</div>
				))}
			</div>

			<h2 className="land-subtitle">Or neither</h2>
			<p className="land-lead">
				If what you want is a website or a front-end app rather than a full product, there&apos;s a simpler route.
				Choose rwaft if:
			</p>
			<ul className="land-list">
				{pickRwaft(pricing).map((line) => <li key={line}>{line}</li>)}
			</ul>

			<h2 className="land-subtitle">Questions</h2>
			<FaqItems faq={item.faq} level="h3" />

			<p className="land-more">
				Each against rwaft:{" "}
				<LinkRun links={sides.map((side) => ({ href: `/compare/${side.slug}`, label: `rwaft vs ${side.name}` }))} />.
				More head to heads:{" "}
				<LinkRun links={others.map((other) => ({ href: `/compare/${other.slug}`, label: matchupName(other) }))} />.
			</p>
			<NextStep href={ROUNDUP_PATH} label="The best AI app builders" />
			<Disclaimer rivals={sides} />
		</section>
	)
}

/** The roundup's questions; the answers quote rwaft's live pricing, so they're built per request like the page. */
export function roundupFaq(pricing: Pricing): Faq[] {
	const freeChats = chatsFor(pricing.signupTokens, pricing)
	const ourFree = pricing.billing
		? `rwaft gives ${plural(pricing.signupTokens, "free credit")} when you sign up${freeChats ? `, which is ${plural(freeChats, "chat")}` : ""}${weeklyPhrase(pricing) ? `, ${weeklyPhrase(pricing)}` : ""}, and refunds a build that fails`
		: "rwaft is free right now, with no account needed"
	return [
		{
			question: "What is the best AI app builder?",
			answer: "It depends on what you're building. For full-stack web apps from a chat, start with Lovable or Base44; developers who want an editor and a terminal lean towards Bolt or Replit; Next.js teams use v0. For a website or front-end app with a live link and no subscription, rwaft is the simplest.",
		},
		{
			question: "What is the best free AI website builder?",
			answer: `Most have a free tier. Lovable gives daily credits, Bolt a monthly token allowance, v0 a daily message limit, Replit a daily Agent allowance and Base44 monthly message credits, while Framer, Wix and Webflow have free plans on their own subdomains. ${ourFree}.`,
		},
		{
			question: "Which AI app builder is best for beginners?",
			answer: "The ones that stay a conversation: Lovable, Base44 and rwaft. Bolt and Replit open a development environment, which suits people who want to see the code, and Framer, Webflow and Wix are visual editors you finish the site in yourself.",
		},
		{
			question: "Do I need to know how to code to use an AI app builder?",
			answer: "Not to get started with any of them. Coding helps most when an app needs a back end, since someone has to understand where its data lives. For a website or front-end app, plain words are enough.",
		},
	]
}

export function Roundup({ pricing }: { pricing: Pricing }) {
	const ours = rwaftCells(pricing)
	const rows = [
		{ name: "rwaft", href: "/", bestFor: rwaftBestFor(pricing), backend: ours.backend, pay: ours.pay, us: true },
		...RIVALS.map((item) => ({
			name: item.name,
			href: `/compare/${item.slug}`,
			bestFor: item.bestFor,
			backend: item.cells.backend,
			pay: item.cells.pay,
			us: false,
		})),
	]
	return (
		<section className="land" aria-labelledby="roundup-title">
			<Crumbs hub={{ name: "Compare", href: "/compare" }} current="Best AI app builders" />
			<h1 id="roundup-title" className="land-title">The best AI app and website builders in 2026</h1>
			<p className="land-lead">
				There&apos;s no single best one: they&apos;re built for different people. Here&apos;s who each is for, with
				rwaft among them. We make rwaft, so weigh that, and check each product&apos;s own pricing before you choose.
			</p>
			<Checked rivals={RIVALS} />

			<div className="compare-wrap" role="region" aria-label="Summary table" tabIndex={0}>
				<table className="compare" data-cols="4">
					<thead>
						<tr>
							<td />
							<th scope="col">Best for</th>
							<th scope="col">Databases and sign-in</th>
							<th scope="col">How you pay</th>
						</tr>
					</thead>
					<tbody>
						{rows.map((row) => (
							<tr key={row.name}>
								<th scope="row" className={row.us ? "compare-us" : undefined}><Link href={row.href}>{row.name}</Link></th>
								<td className={row.us ? "compare-us" : undefined}>{row.bestFor}</td>
								<td className={row.us ? "compare-us" : undefined}>{row.backend}</td>
								<td className={row.us ? "compare-us" : undefined}>{row.pay}</td>
							</tr>
						))}
					</tbody>
				</table>
			</div>

			{GROUPS.map((group) => (
				<div key={group.id}>
					<h2 className="land-subtitle">{group.label}</h2>
					<p className="land-lead">{group.lead}</p>
					<ul className="land-grid land-output">
						{group.id === "app" && (
							<li className="land-card">
								<h3>rwaft</h3>
								<p><strong>Best for:</strong> {rwaftBestFor(pricing)}.</p>
								<p>Describe a site in plain words, watch the real build step by step, and get a live link.</p>
							</li>
						)}
						{inGroup(group.id).map((item) => (
							<li key={item.slug} className="land-card land-card--link">
								<h3><Link href={`/compare/${item.slug}`}>{item.name}</Link></h3>
								<p><strong>Best for:</strong> {item.bestFor}.</p>
								<p>Choose it if {item.pickRival[0].charAt(0).toLowerCase() + item.pickRival[0].slice(1)}.</p>
							</li>
						))}
					</ul>
				</div>
			))}

			<h2 className="land-subtitle">How to choose</h2>
			<ul className="land-list">
				<li>Need accounts, a database or payments? Start with Lovable, Base44, Bolt or Replit.</li>
				<li>Already building on Next.js and Vercel? v0.</li>
				<li>Want to design every detail on a canvas? Framer or Webflow.</li>
				<li>Need an online store or bookings? Wix.</li>
				<li>Want a website or front-end app with a live link, and no tools to learn? rwaft.</li>
			</ul>

			<h2 className="land-subtitle">Questions</h2>
			<FaqItems faq={roundupFaq(pricing)} level="h3" />

			<p className="land-more">
				Head to head:{" "}
				<LinkRun links={MATCHUPS.map((item) => ({ href: `/compare/${item.slug}`, label: matchupName(item) }))} />.
			</p>
			<NextStep href="/compare" label="Every detail, side by side" />
			<Disclaimer rivals={RIVALS} />
		</section>
	)
}
