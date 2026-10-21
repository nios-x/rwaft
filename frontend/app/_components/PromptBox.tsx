"use client"

import type { FormEvent, KeyboardEvent as ReactKeyboardEvent, ReactNode, RefObject } from "react"
import type { BuildKind } from "../../lib/stages"
import { RepoIcon, SendIcon, SparkIcon } from "./Icons"

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

	const placeholder = props.placeholder ?? (mode === "prompt"
		? "Describe the app you want, who it's for, and what it should do…"
		: "Paste a public GitHub repository URL…")

	return (
		<div className="prompt-wrap" data-size={size}>
			{blocked ? (
				<div className="prompt prompt--blocked">{blocked}</div>
			) : (
				<form className="prompt" onSubmit={onSubmit}>
					<label className="sr-only" htmlFor={`prompt-${size}`}>
						{mode === "prompt" ? "Describe your app" : "Public repository URL"}
					</label>
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
						<div className="mode" role="radiogroup" aria-label="What are you sending?">
							<button type="button" role="radio" aria-checked={mode === "prompt"} onClick={() => setMode("prompt")} disabled={submitting}>
								<SparkIcon />
								{size === "hero" ? <><span className="mode-long">Describe an app</span><span className="mode-short">Prompt</span></> : "Prompt"}
							</button>
							<button type="button" role="radio" aria-checked={mode === "deploy"} onClick={() => setMode("deploy")} disabled={submitting}>
								<RepoIcon />
								{size === "hero" ? <><span className="mode-long">GitHub repo</span><span className="mode-short">Repo</span></> : "Repo"}
							</button>
						</div>
						{costLabel && <span className="prompt-cost">{costLabel}</span>}
						<button type="submit" className="send" disabled={!canSubmit} aria-label={submitting ? "Sending" : "Start build"} aria-busy={submitting}>
							<SendIcon />
						</button>
					</div>
				</form>
			)}
			{error && <p className="prompt-error" role="alert">{error}</p>}
		</div>
	)
}
