"use client"

import type { FormEvent, KeyboardEvent as ReactKeyboardEvent, ReactNode, RefObject } from "react"
import type { BuildKind } from "../../lib/stages"
import { BranchIcon, GitHubIcon, PullRequestIcon, RepoIcon, SendIcon, SparkIcon } from "./Icons"

/** The pull request tab's fields, beyond the description in the main box. */
export interface PullRequestFields {
	/** Offer the tab at all: the API has a GitHub app. */
	available: boolean
	/** "github.com/owner/repo", "owner/repo", or an issue link in it. */
	repo: string
	setRepo: (value: string) => void
	privateRepo: boolean
	setPrivateRepo: (value: boolean) => void
	/** The branch to open against; empty for the repository's default. */
	base: string
	setBase: (value: string) => void
	draft: boolean
	setDraft: (value: boolean) => void
	/** Follow the pull request's checks and push fixes for failing ones. */
	watchChecks: boolean
	setWatchChecks: (value: boolean) => void
	/** The open pull request a follow-up adds to; null opens a new one. */
	target: { repo: string; number: number | null } | null
	/** Repositories used before, suggested in the repository field. */
	recentRepos: string[]
}

export interface PromptBoxProps {
	mode: BuildKind
	setMode: (mode: BuildKind) => void
	value: string
	setValue: (value: string) => void
	onSubmit: (event?: FormEvent<HTMLFormElement>) => void
	submitting: boolean
	canSubmit: boolean
	/** e.g. "1 credit · 4 left" or "Free"; empty while the server config loads. */
	costLabel: string
	/** Replaces the box when building is not possible yet (signed out, misconfigured). */
	blocked: ReactNode | null
	error: string
	inputRef: RefObject<HTMLTextAreaElement | null>
	pr: PullRequestFields
	/** Progress shown under the box, e.g. while GitHub's consent window is open. */
	notice: ReactNode | null
}

const PLACEHOLDERS: Record<BuildKind, string> = {
	prompt: "Describe the app you want, who it's for, and what it should do…",
	deploy: "Paste a public GitHub repository URL…",
	pr: "Describe the change to make in this repository, or paste an issue link…",
}

const LABELS: Record<BuildKind, string> = {
	prompt: "Describe your app",
	deploy: "Public repository URL",
	pr: "Describe the change",
}

/** An issue link in the repository field already says what to do. */
export const hasIssueLink = (value: string) => /github\.com\/[^/\s]+\/[^/\s]+\/issues\/\d+/i.test(value)

export function PromptBox(props: PromptBoxProps & { size: "hero" | "compact"; placeholder?: string }) {
	const { mode, setMode, value, setValue, onSubmit, submitting, canSubmit, costLabel, blocked, error, inputRef, size, pr } = props

	const onKey = (event: ReactKeyboardEvent<HTMLTextAreaElement>) => {
		// Enter sends, Shift+Enter breaks the line, as in every chat box.
		if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
			event.preventDefault()
			if (canSubmit) onSubmit()
		}
	}

	// Enter in a one-line field sends once the request is complete, and otherwise moves on to the description.
	const onFieldKey = (event: ReactKeyboardEvent<HTMLInputElement>) => {
		if (event.key === "Enter" && !event.nativeEvent.isComposing) {
			event.preventDefault()
			if (canSubmit) onSubmit()
			else inputRef.current?.focus()
		}
	}

	const placeholder = props.placeholder
		?? (mode === "pr" && !pr.target && hasIssueLink(pr.repo) ? "Anything to add? Optional: the issue says what to change…" : PLACEHOLDERS[mode])
	const choice = (kind: BuildKind, icon: ReactNode, long: string, short: string) => (
		<button type="button" role="radio" aria-checked={mode === kind} onClick={() => setMode(kind)} disabled={submitting}>
			{icon}
			{size === "hero" ? <><span className="mode-long">{long}</span><span className="mode-short">{short}</span></> : short}
		</button>
	)
	const checkbox = (label: string, checked: boolean, set: (value: boolean) => void, title?: string) => (
		<label className="prompt-check" title={title}>
			<input type="checkbox" checked={checked} onChange={(event) => set(event.target.checked)} disabled={submitting} />
			<span>{label}</span>
		</label>
	)
	const checksBox = checkbox("Fix failing checks", pr.watchChecks, pr.setWatchChecks,
		"After the pull request opens, rwaft watches its CI and pushes fixes for failing checks. GitHub access stays on until the checks finish.")

	const pullRequestFields = pr.target ? (
		<div className="prompt-repo">
			<PullRequestIcon />
			<span className="prompt-target">Adding to <strong>{pr.target.repo}{pr.target.number ? ` #${pr.target.number}` : ""}</strong></span>
			{checksBox}
		</div>
	) : (
		<>
			<div className="prompt-repo">
				<GitHubIcon />
				<label className="sr-only" htmlFor={`repo-${size}`}>GitHub repository or issue link</label>
				<input
					id={`repo-${size}`}
					type="text"
					inputMode="url"
					placeholder="github.com/owner/repo"
					value={pr.repo}
					onChange={(event) => pr.setRepo(event.target.value)}
					onKeyDown={onFieldKey}
					disabled={submitting}
					spellCheck={false}
					autoComplete="off"
					autoCapitalize="off"
					maxLength={500}
					list={pr.recentRepos.length > 0 ? `recent-repos-${size}` : undefined}
				/>
				{pr.recentRepos.length > 0 && (
					<datalist id={`recent-repos-${size}`}>
						{pr.recentRepos.map((repo) => <option key={repo} value={repo} />)}
					</datalist>
				)}
				{checkbox("Private", pr.privateRepo, pr.setPrivateRepo, "Asks GitHub for access to your private repositories too")}
			</div>
			<div className="prompt-options">
				<label className="prompt-base" title="The branch to open the pull request against">
					<BranchIcon />
					<span className="prompt-option-label">Base</span>
					<input
						type="text"
						placeholder="default branch"
						value={pr.base}
						onChange={(event) => pr.setBase(event.target.value)}
						onKeyDown={onFieldKey}
						disabled={submitting}
						spellCheck={false}
						autoComplete="off"
						autoCapitalize="off"
						maxLength={200}
					/>
				</label>
				{checkbox("Draft", pr.draft, pr.setDraft, "Opens the pull request as a draft")}
				{checksBox}
			</div>
		</>
	)

	return (
		<div className="prompt-wrap" data-size={size}>
			{blocked ? (
				<div className="prompt prompt--blocked">{blocked}</div>
			) : (
				<form className="prompt" onSubmit={onSubmit}>
					{mode === "pr" && pullRequestFields}
					<label className="sr-only" htmlFor={`prompt-${size}`}>{LABELS[mode]}</label>
					<textarea
						id={`prompt-${size}`}
						ref={inputRef}
						rows={size === "hero" ? 3 : 1}
						placeholder={placeholder}
						value={value}
						onChange={(event) => setValue(event.target.value)}
						onKeyDown={onKey}
						disabled={submitting}
					/>
					<div className="prompt-bar">
						<div className="mode" role="radiogroup" aria-label="What are you sending?" data-choices={pr.available ? 3 : 2}>
							{choice("prompt", <SparkIcon />, "Describe an app", "Prompt")}
							{choice("deploy", <RepoIcon />, "GitHub repo", "Repo")}
							{pr.available && choice("pr", <PullRequestIcon />, "Pull request", "PR")}
						</div>
						{costLabel && <span className="prompt-cost">{costLabel}</span>}
						<button type="submit" className="send" disabled={!canSubmit} aria-label={submitting ? "Sending" : mode === "pr" ? (pr.target ? "Add to pull request" : "Open pull request") : "Start build"} aria-busy={submitting}>
							<SendIcon />
						</button>
					</div>
				</form>
			)}
			{props.notice && <div className="prompt-notice" role="status">{props.notice}</div>}
			{error && <p className="prompt-error" role="alert">{error}</p>}
		</div>
	)
}
