"use client"

import type { FormEvent, KeyboardEvent as ReactKeyboardEvent, ReactNode, RefObject } from "react"
import type { BuildKind } from "../../lib/stages"
import { GitHubIcon, PullRequestIcon, RepoIcon, SendIcon, SparkIcon } from "./Icons"

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
	/** Offer the pull request tab: the API has a GitHub app. */
	pullRequests: boolean
	/** The pull request tab's repository, "github.com/owner/repo" or "owner/repo". */
	repo: string
	setRepo: (value: string) => void
	privateRepo: boolean
	setPrivateRepo: (value: boolean) => void
	/** Progress shown under the box, e.g. while GitHub's consent window is open. */
	notice: ReactNode | null
}

const PLACEHOLDERS: Record<BuildKind, string> = {
	prompt: "Describe the app you want, who it's for, and what it should do…",
	deploy: "Paste a public GitHub repository URL…",
	pr: "Describe the change to make in this repository…",
}

const LABELS: Record<BuildKind, string> = {
	prompt: "Describe your app",
	deploy: "Public repository URL",
	pr: "Describe the change",
}

export function PromptBox(props: PromptBoxProps & { size: "hero" | "compact"; placeholder?: string }) {
	const { mode, setMode, value, setValue, onSubmit, submitting, canSubmit, costLabel, blocked, error, inputRef, size } = props

	const onKey = (event: ReactKeyboardEvent<HTMLTextAreaElement>) => {
		// Enter sends, Shift+Enter breaks the line, as in every chat box.
		if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
			event.preventDefault()
			if (canSubmit) onSubmit()
		}
	}

	// Enter in the repository field sends once the description is there too, and otherwise moves on to it.
	const onRepoKey = (event: ReactKeyboardEvent<HTMLInputElement>) => {
		if (event.key === "Enter" && !event.nativeEvent.isComposing) {
			event.preventDefault()
			if (canSubmit) onSubmit()
			else inputRef.current?.focus()
		}
	}

	const placeholder = props.placeholder ?? PLACEHOLDERS[mode]
	const choice = (kind: BuildKind, icon: ReactNode, long: string, short: string) => (
		<button type="button" role="radio" aria-checked={mode === kind} onClick={() => setMode(kind)} disabled={submitting}>
			{icon}
			{size === "hero" ? <><span className="mode-long">{long}</span><span className="mode-short">{short}</span></> : short}
		</button>
	)

	return (
		<div className="prompt-wrap" data-size={size}>
			{blocked ? (
				<div className="prompt prompt--blocked">{blocked}</div>
			) : (
				<form className="prompt" onSubmit={onSubmit}>
					{mode === "pr" && (
						<div className="prompt-repo">
							<GitHubIcon />
							<label className="sr-only" htmlFor={`repo-${size}`}>GitHub repository</label>
							<input
								id={`repo-${size}`}
								type="text"
								inputMode="url"
								placeholder="github.com/owner/repo"
								value={props.repo}
								onChange={(event) => props.setRepo(event.target.value)}
								onKeyDown={onRepoKey}
								disabled={submitting}
								spellCheck={false}
								autoComplete="off"
								autoCapitalize="off"
								maxLength={500}
							/>
							<label className="prompt-private" title="Asks GitHub for access to your private repositories too">
								<input
									type="checkbox"
									checked={props.privateRepo}
									onChange={(event) => props.setPrivateRepo(event.target.checked)}
									disabled={submitting}
								/>
								<span>Private</span>
							</label>
						</div>
					)}
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
						<div className="mode" role="radiogroup" aria-label="What are you sending?" data-choices={props.pullRequests ? 3 : 2}>
							{choice("prompt", <SparkIcon />, "Describe an app", "Prompt")}
							{choice("deploy", <RepoIcon />, "GitHub repo", "Repo")}
							{props.pullRequests && choice("pr", <PullRequestIcon />, "Pull request", "PR")}
						</div>
						{costLabel && <span className="prompt-cost">{costLabel}</span>}
						<button type="submit" className="send" disabled={!canSubmit} aria-label={submitting ? "Sending" : mode === "pr" ? "Open pull request" : "Start build"} aria-busy={submitting}>
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
