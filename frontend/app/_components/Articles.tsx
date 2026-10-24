import Link from "next/link"
import type { ReactNode } from "react"
import type { Article, Block } from "../../lib/articles"
import type { Guide } from "../../lib/guides"
import { consoleHref } from "../../lib/useCases"
import { NextStep } from "./InfoSections"
import { SparkIcon } from "./Icons"
import { Crumbs } from "./UseCases"

/**
 * The content of /docs, /guides and the pages under them. Server components
 * like UseCases: each page is in the first HTML response, and its example
 * prompts hand straight over to the console.
 */

interface Hub {
	name: string
	href: string
}

const date = (iso: string) =>
	new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric", timeZone: "UTC" })

function BlockView({ block }: { block: Block }) {
	if (typeof block === "string") return <p>{block}</p>
	if ("list" in block) {
		return (
			<ul className="land-list">
				{block.list.map((line) => <li key={line}>{line}</li>)}
			</ul>
		)
	}
	if ("steps" in block) {
		return (
			<ol className="land-list land-list--steps">
				{block.steps.map((line) => <li key={line}>{line}</li>)}
			</ol>
		)
	}
	if ("prompts" in block) {
		return (
			<ul className="land-prompts">
				{block.prompts.map((prompt) => (
					<li key={prompt}>
						<Link href={consoleHref(prompt)} className="land-prompt">
							<SparkIcon className="land-prompt-icon" />
							<span>{prompt}</span>
						</Link>
					</li>
				))}
			</ul>
		)
	}
	return (
		<p className="land-more">
			{block.link.text} <Link href={block.link.href}>{block.link.label}</Link>.
		</p>
	)
}

/** A docs or guide page: crumbs, heading, the sections, then the rest of its set. */
export function ArticleDetail({ item, hub, siblings, byline }: { item: Article; hub: Hub; siblings: Article[]; byline?: Guide }) {
	return (
		<section className="land" aria-labelledby="article-title">
			<Crumbs hub={hub} current={item.name} />
			<h1 id="article-title" className="land-title">{item.heading}</h1>
			<p className="land-lead">{item.lead}</p>
			{byline && (
				<p className="land-checked">
					By rwaft · <time dateTime={byline.updated}>{date(byline.updated)}</time>
				</p>
			)}

			<div className="land-prose">
				{item.sections.map((section) => (
					<div key={section.heading}>
						<h2 className="land-subtitle">{section.heading}</h2>
						{section.body.map((block, index) => <BlockView key={index} block={block} />)}
					</div>
				))}
			</div>

			<h2 className="land-subtitle">More in {hub.name.toLowerCase()}</h2>
			<ul className="land-chips">
				{siblings
					.filter((other) => other.slug !== item.slug)
					.map((other) => (
						<li key={other.slug}><Link href={`${hub.href}/${other.slug}`} className="example">{other.name}</Link></li>
					))}
				<li><Link href={hub.href} className="example">See all</Link></li>
			</ul>
			<NextStep href="/make" label="What you can build" />
		</section>
	)
}

/** /docs and /guides: a card for every page in the set. */
export function ArticleHub({ id, title, lead, hub, items, more }: { id: string; title: string; lead: string; hub: Hub; items: Article[]; more?: ReactNode }) {
	return (
		<section className="land" aria-labelledby={id}>
			<h1 id={id} className="land-title">{title}</h1>
			<p className="land-lead">{lead}</p>
			<ul className="land-grid land-output">
				{items.map((item) => (
					<li key={item.slug} className="land-card land-card--link">
						<h2><Link href={`${hub.href}/${item.slug}`}>{item.name}</Link></h2>
						<p>{item.description}</p>
					</li>
				))}
			</ul>
			{more && <p className="land-more">{more}</p>}
			<NextStep href="/how-it-works" label="How it works" />
		</section>
	)
}
