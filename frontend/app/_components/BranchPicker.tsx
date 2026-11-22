"use client"

import { useEffect, useId, useMemo, useRef, useState } from "react"
import type { KeyboardEvent } from "react"
import { isBranchName, type RepoBranches } from "../../lib/useRepoBranches"
import { BranchIcon, CheckIcon, ChevronDown, SearchIcon } from "./Icons"

/**
 * The pull request tab's base branch: a list of the repository's real
 * branches with a search box, rather than a field to type a name into. The
 * list comes from lib/useRepoBranches.ts. A private repository can't be read
 * before GitHub's consent screen, so there the search box offers the name
 * typed as a choice of its own.
 */

interface Option {
	/** "" is the repository's default branch. */
	value: string
	name: string
	isDefault?: boolean
	custom?: boolean
}

interface BranchPickerProps {
	/** "owner/name", or null until the field holds a repository. */
	repo: string | null
	branches: RepoBranches
	base: string
	setBase: (value: string) => void
	disabled: boolean
	/** The chat's box sits at the bottom of the screen, so its list opens upward. */
	placement: "below" | "above"
}

export function BranchPicker({ repo, branches, base, setBase, disabled, placement }: BranchPickerProps) {
	const [open, setOpen] = useState(false)
	const [query, setQuery] = useState("")
	const [active, setActive] = useState(0)
	const root = useRef<HTMLDivElement>(null)
	const trigger = useRef<HTMLButtonElement>(null)
	const listId = useId()
	const needle = query.trim()

	const options = useMemo((): Option[] => {
		const lower = needle.toLowerCase()
		const list: Option[] = branches.state === "ready"
			? branches.branches
				.filter((name) => !lower || name.toLowerCase().includes(lower))
				.map((name) => name === branches.defaultBranch ? { value: "", name, isDefault: true } : { value: name, name })
			: (!lower || "default branch".includes(lower) ? [{ value: "", name: "Default branch", isDefault: true }] : [])
		const exact = branches.state === "ready" && branches.branches.includes(needle)
		// Typed names are offered where the list can't be complete: private
		// repositories, failed lookups and lists GitHub cut short.
		const canType = branches.state !== "ready" || branches.truncated
		if (needle && !exact && canType && isBranchName(needle)) list.push({ value: needle, name: needle, custom: true })
		return list
	}, [branches, needle])

	const close = (focusTrigger: boolean) => {
		setOpen(false)
		setQuery("")
		if (focusTrigger) trigger.current?.focus()
	}

	useEffect(() => {
		if (!open) return
		const onDown = (event: MouseEvent) => {
			if (!root.current?.contains(event.target as Node)) {
				setOpen(false)
				setQuery("")
			}
		}
		document.addEventListener("mousedown", onDown)
		return () => document.removeEventListener("mousedown", onDown)
	}, [open])

	const choose = (option: Option) => {
		setBase(option.value)
		close(true)
	}

	const onKey = (event: KeyboardEvent<HTMLInputElement>) => {
		if (event.key === "ArrowDown" || event.key === "ArrowUp") {
			event.preventDefault()
			if (options.length === 0) return
			setActive((current) => (current + (event.key === "ArrowDown" ? 1 : -1) + options.length) % options.length)
		} else if (event.key === "Enter") {
			// Never the form's submit: Enter here picks a branch.
			event.preventDefault()
			const option = options[Math.min(active, options.length - 1)]
			if (option) choose(option)
		} else if (event.key === "Escape") {
			event.preventDefault()
			event.stopPropagation()
			close(true)
		} else if (event.key === "Tab") {
			close(false)
		}
	}

	const shown = base || (branches.state === "ready" ? branches.defaultBranch : "")
	const activeIndex = Math.min(active, Math.max(options.length - 1, 0))

	return (
		<div className="branch-picker" ref={root} data-placement={placement}>
			<button
				ref={trigger}
				type="button"
				className="branch-trigger"
				aria-haspopup="listbox"
				aria-expanded={open}
				disabled={disabled || !repo}
				aria-label={`Base branch: ${shown || "default branch"}`}
				title={repo ? "The branch to open the pull request against" : "Enter a repository first"}
				onClick={() => {
					if (open) close(false)
					else {
						setActive(0)
						setOpen(true)
					}
				}}
			>
				<BranchIcon />
				<span className="prompt-option-label">Base</span>
				<span className="branch-value" data-empty={!shown || undefined}>{shown || "default branch"}</span>
				{!base && branches.state === "ready" && <span className="branch-tag">default</span>}
				<ChevronDown className="branch-chev" />
			</button>

			{open && (
				<div className="branch-menu" role="dialog" aria-label="Base branch">
					<div className="branch-search">
						<SearchIcon />
						<input
							autoFocus
							role="combobox"
							aria-expanded="true"
							aria-controls={listId}
							aria-autocomplete="list"
							aria-activedescendant={options.length > 0 ? `${listId}-${activeIndex}` : undefined}
							aria-label="Find a branch"
							placeholder={branches.state === "ready" ? "Find a branch…" : "Find or name a branch…"}
							value={query}
							onChange={(event) => {
								setQuery(event.target.value)
								setActive(0)
							}}
							onKeyDown={onKey}
							spellCheck={false}
							autoComplete="off"
							autoCapitalize="off"
							maxLength={200}
						/>
					</div>
					<ul id={listId} role="listbox" className="branch-list" aria-label={`Branches of ${repo ?? "the repository"}`}>
						{options.map((option, index) => {
							const selected = option.value === base && !option.custom ? true : option.custom ? false : undefined
							return (
								<li
									key={`${option.custom ? "custom" : "branch"}-${option.value || "default"}`}
									id={`${listId}-${index}`}
									role="option"
									aria-selected={selected ?? false}
									className="branch-option"
									data-active={index === activeIndex || undefined}
									onMouseEnter={() => setActive(index)}
									onMouseDown={(event) => event.preventDefault()}
									onClick={() => choose(option)}
								>
									<span className="branch-check" aria-hidden="true">{selected ? <CheckIcon /> : null}</span>
									{option.custom ? (
										<span className="branch-name">Use <code>{option.name}</code></span>
									) : (
										<span className="branch-name"><code>{option.name}</code></span>
									)}
									{option.isDefault && branches.state === "ready" && <span className="branch-tag">default</span>}
								</li>
							)
						})}
						{(branches.state === "loading" || branches.state === "idle") && <li className="branch-note" role="presentation"><span className="branch-spinner" aria-hidden="true" /> Loading branches…</li>}
						{branches.state === "ready" && options.length === 0 && <li className="branch-note" role="presentation">No branch matches &ldquo;{needle}&rdquo;</li>}
					</ul>
					{branches.state === "unlisted" && (
						<p className="branch-foot">Private repositories can&apos;t be listed before GitHub access. Search for a branch by name to use it.</p>
					)}
					{branches.state === "error" && <p className="branch-foot" role="alert">{branches.message}. Search for a branch by name to use it.</p>}
					{branches.state === "ready" && branches.truncated && <p className="branch-foot">Showing the first {branches.branches.length} branches. Search for others by name.</p>}
				</div>
			)}
		</div>
	)
}
