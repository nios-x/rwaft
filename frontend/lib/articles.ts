/**
 * The shape shared by /docs (how to use rwaft) and /guides (the wider
 * questions people search before they pick a builder). Both render through
 * app/_components/Articles.tsx, so a page is data, not markup.
 *
 * The same rules as lib/useCases.ts hold: every claim about rwaft must be
 * true of the real pipeline, and nothing may quote users or results that
 * don't exist.
 */

export type Block =
	/** A paragraph. */
	| string
	| { list: string[] }
	/** A numbered list, for steps done in order. */
	| { steps: string[] }
	/** Example prompts; each opens the console with it in the box. */
	| { prompts: string[] }
	/** A closing line with one link: "{text} {label}". */
	| { link: { text: string; href: string; label: string } }

export interface Section {
	heading: string
	body: Block[]
}

export interface Article {
	slug: string
	/** Short name for links, cards and breadcrumbs. */
	name: string
	/** The page title; the layout's template appends " · rwaft". Keep it under 52 characters. */
	title: string
	/** Under 160 characters. */
	description: string
	heading: string
	lead: string
	sections: Section[]
	/** Share card headline, one entry per line. */
	share: [string, string]
}
