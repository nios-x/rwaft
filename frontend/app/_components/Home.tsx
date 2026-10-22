"use client"

import type { ReactNode } from "react"
import { STATE_LABEL, relativeTime, type BuildView } from "../../lib/builds"
import { buildTitle } from "../../lib/recentBuilds"
import { PromptBox, type PromptBoxProps } from "./PromptBox"

/** Real starting points for someone who has never written a spec. */
const EXAMPLES = [
	"A menu page for a small café",
	"A habit tracker with streaks",
	"An RSVP page for a party",
	"A portfolio for a photographer",
]

interface HomeProps {
	prompt: PromptBoxProps
	builds: BuildView[]
	onOpen: (id: string) => void
	/** Server-rendered content after the builds: the feature cards. */
	children?: ReactNode
}

export function Home({ prompt, builds, onOpen, children }: HomeProps) {
	return (
		<main className="home">
			<section className="hero" id="start" aria-labelledby="hero-title">
				{/* The eyebrow is part of the heading so the page's h1 names what rwaft is. */}
				<h1 id="hero-title">
					
					What should we build?
				</h1>
				<p className="hero-sub">rwaft is an AI app builder. Describe an app in plain words, and it writes it, builds it and hosts it at its own link while you watch the real build.</p>
				<PromptBox {...prompt} size="hero" />
				{prompt.mode === "prompt" && !prompt.blocked && (
					<div className="examples" aria-label="Example prompts">
						{EXAMPLES.map((example) => (
							<button
								key={example}
								type="button"
								className="example"
								onClick={() => { prompt.setValue(example); prompt.inputRef.current?.focus() }}
							>
								{example}
							</button>
						))}
					</div>
				)}
			</section>

			{builds.length > 0 && (
				<section className="projects" aria-labelledby="projects-title">
					<h2 id="projects-title">Your builds</h2>
					<ul className="project-grid">
						{builds.map((build) => (
							<li key={build.id}>
								<button type="button" className="project" onClick={() => onOpen(build.id)}>
									<span className="project-title">{buildTitle(build)}</span>
									<span className="project-meta">
										<span className="status" data-state={build.state}>
											{build.state === "line" && build.position ? `#${build.position} in line` : STATE_LABEL[build.state]}
										</span>
										<span>{build.kind === "prompt" ? "Prompt" : "Repo"} · {relativeTime(build.at)}</span>
									</span>
								</button>
							</li>
						))}
					</ul>
				</section>
			)}

			{children}
		</main>
	)
}
