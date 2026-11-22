"use client"

import Link from "next/link"
import { useEffect, useMemo, useRef, useState } from "react"
import type { MouseEvent, ReactNode } from "react"
import { relativeTime } from "../../lib/builds"
import {
	KIND_LABEL,
	STATUS_LABEL,
	STATUS_STATE,
	duration,
	fullDate,
	hostOf,
	inFlight,
	toRecentBuild,
	type Deployment,
	type DeploymentStatus,
	type Project,
} from "../../lib/deployments"
import { addRecentBuild, useRecentBuilds } from "../../lib/recentBuilds"
import type { BuildKind } from "../../lib/stages"
import { GitHubExport } from "./GitHubExport"
import {
	CheckIcon,
	ChevronLeft,
	CopyIcon,
	CrossIcon,
	ExternalIcon,
	GitHubIcon,
	MoreIcon,
	OpenAppIcon,
	PlusIcon,
	PullRequestIcon,
	RepoIcon,
	SearchIcon,
	SparkIcon,
	TrashIcon,
} from "./Icons"

// ── Small shared parts ──────────────────────────────────────────────────────

export function StatusPill({ status }: { status: DeploymentStatus }) {
	return <span className="status" data-state={STATUS_STATE[status] ?? "unknown"}>{STATUS_LABEL[status]}</span>
}

const KIND_ICON: Record<BuildKind, (props: { className?: string }) => ReactNode> = {
	prompt: SparkIcon,
	deploy: RepoIcon,
	pr: PullRequestIcon,
}

/** The project's mark: its first letter, as an avatar would carry it. */
function Tile({ project, size = "md" }: { project: Project; size?: "md" | "lg" }) {
	const letter = project.title.replace(/^[^A-Za-z0-9]+/, "").slice(0, 1).toUpperCase() || "R"
	return <span className="dash-tile" data-size={size} aria-hidden="true">{letter}</span>
}

/** Copies, then shows a check for a moment, like the workspace's address bar. */
function useCopy() {
	const [copied, setCopied] = useState<string | null>(null)
	useEffect(() => {
		if (!copied) return
		const timer = setTimeout(() => setCopied(null), 1_600)
		return () => clearTimeout(timer)
	}, [copied])
	const copy = async (text: string) => {
		try {
			await navigator.clipboard.writeText(text)
			setCopied(text)
		} catch { /* clipboard blocked: the link is on screen to select by hand */ }
	}
	return { copied, copy }
}

/** Where the project's link points: the newest live version, or its pull request. */
function projectLink(project: Project): { url: string; label: string } | null {
	if (project.kind === "pr") {
		if (project.pr) return { url: project.pr.url, label: `${project.repo?.label ?? "Pull request"}${project.pr.number ? ` #${project.pr.number}` : ""}` }
		return project.repo ? { url: project.repo.url, label: project.repo.label } : null
	}
	return project.live ? { url: project.live.url, label: hostOf(project.live.url) } : null
}

/** "Open in rwaft": the console opens builds from this browser's list, so it goes there first. */
function OpenInConsole({ deployment, className, children, role, title }: { deployment: Deployment; className: string; children: ReactNode; role?: "menuitem"; title?: string }) {
	const recent = useRecentBuilds()
	const remember = () => addRecentBuild(toRecentBuild(deployment, recent.find((build) => build.id === deployment.id)))
	return <Link href={`/#build=${deployment.id}`} className={className} onClick={remember} role={role} title={title}>{children}</Link>
}

function RepoChip({ project }: { project: Project }) {
	if (!project.repo) return <span className="dash-git dash-git--none"><GitHubIcon /> Not on GitHub</span>
	const Icon = project.repo.github ? GitHubIcon : RepoIcon
	return (
		<a className="dash-git" href={project.repo.url} target="_blank" rel="noreferrer" title={`Open ${project.repo.label}`}>
			<Icon /> <span>{project.repo.label}</span>
			{project.kind === "pr" && project.pr?.number ? <><PullRequestIcon className="dash-git-pr" /> <span>#{project.pr.number}</span></> : null}
		</a>
	)
}

// ── Project menu ────────────────────────────────────────────────────────────

function ProjectMenu({ project, onRemove, onOpenChange }: { project: Project; onRemove: (project: Project) => Promise<void>; onOpenChange?: (open: boolean) => void }) {
	const [open, setOpen] = useState(false)
	const [confirming, setConfirming] = useState(false)
	const [busy, setBusy] = useState(false)
	const [error, setError] = useState("")
	const root = useRef<HTMLDivElement>(null)
	const { copied, copy } = useCopy()
	const link = projectLink(project)

	const setMenu = (value: boolean) => {
		setOpen(value)
		onOpenChange?.(value)
		if (!value) {
			setConfirming(false)
			setError("")
		}
	}

	useEffect(() => {
		if (!open) return
		const close = (event: Event) => {
			if (!root.current?.contains(event.target as Node)) {
				setOpen(false)
				setConfirming(false)
				setError("")
				onOpenChange?.(false)
			}
		}
		const onKey = (event: KeyboardEvent) => {
			if (event.key !== "Escape") return
			setOpen(false)
			setConfirming(false)
			onOpenChange?.(false)
		}
		document.addEventListener("mousedown", close)
		document.addEventListener("keydown", onKey)
		return () => {
			document.removeEventListener("mousedown", close)
			document.removeEventListener("keydown", onKey)
		}
	}, [open, onOpenChange])

	const remove = async () => {
		setBusy(true)
		setError("")
		try {
			await onRemove(project)
		} catch (removeError) {
			setError(removeError instanceof Error ? removeError.message : "That couldn't be removed right now")
			setBusy(false)
		}
	}

	return (
		<div className="dash-menu" ref={root}>
			<button
				type="button"
				className="icon-btn dash-menu-btn"
				aria-label={`More actions for ${project.title}`}
				aria-haspopup="menu"
				aria-expanded={open}
				onClick={() => setMenu(!open)}
			>
				<MoreIcon />
			</button>
			{open && (
				<div className="menu dash-menu-list" role="menu">
					{confirming ? (
						<div className="dash-confirm">
							<p><strong>Remove this project?</strong> It leaves your dashboard and this browser&apos;s list. {project.kind === "pr" ? "The pull request stays open on GitHub." : "Its live site stays up."}</p>
							{error && <p className="field-error" role="alert">{error}</p>}
							<div className="dash-confirm-actions">
								<button type="button" className="text-btn dash-danger" onClick={() => void remove()} disabled={busy}>{busy ? "Removing…" : "Remove"}</button>
								<button type="button" className="text-btn" onClick={() => setConfirming(false)} disabled={busy}>Cancel</button>
							</div>
						</div>
					) : (
						<>
							{link ? (
								<a role="menuitem" className="menu-item" href={link.url} target="_blank" rel="noreferrer" onClick={() => setMenu(false)}>
									<ExternalIcon /> {project.kind === "pr" ? "Open pull request" : "Visit site"}
								</a>
							) : (
								<button type="button" role="menuitem" className="menu-item" disabled><ExternalIcon /> No live link yet</button>
							)}
							<button type="button" role="menuitem" className="menu-item" disabled={!link} onClick={() => link && void copy(link.url)}>
								{copied ? <CheckIcon /> : <CopyIcon />} {copied ? "Link copied" : "Copy link"}
							</button>
							<OpenInConsole deployment={project.latest} className="menu-item" role="menuitem">
								<OpenAppIcon /> Open in rwaft
							</OpenInConsole>
							{project.repo && (
								<a role="menuitem" className="menu-item" href={project.repo.url} target="_blank" rel="noreferrer" onClick={() => setMenu(false)}>
									<GitHubIcon /> View on {project.repo.github ? "GitHub" : hostOf(new URL(project.repo.url).origin)}
								</a>
							)}
							<hr className="dash-menu-rule" />
							<button type="button" role="menuitem" className="menu-item dash-danger" onClick={() => setConfirming(true)}>
								<TrashIcon /> Remove from dashboard
							</button>
						</>
					)}
				</div>
			)}
		</div>
	)
}

// ── Projects ────────────────────────────────────────────────────────────────

type KindFilter = "all" | BuildKind

const KIND_FILTERS: { value: KindFilter; label: string }[] = [
	{ value: "all", label: "All" },
	{ value: "prompt", label: "Apps" },
	{ value: "deploy", label: "Repos" },
	{ value: "pr", label: "Pull requests" },
]

const matches = (text: string, query: string) => text.toLowerCase().includes(query)

function projectMatches(project: Project, query: string): boolean {
	if (!query) return true
	return matches(project.title, query)
		|| (project.live ? matches(project.live.url, query) : false)
		|| (project.repo ? matches(project.repo.label, query) : false)
		|| project.deployments.some((deployment) => matches(deployment.source, query) || deployment.id.includes(query))
}

/** The card's second line: what was asked last, or why it failed. */
function latestLine(project: Project): { text: string; lead?: string; tone?: "failed" } | null {
	const { latest } = project
	if (latest.status === "failed" && latest.error) return { text: latest.error, tone: "failed" }
	if (project.kind === "deploy" || !latest.source) return null
	return { text: latest.source, ...(latest.parent ? { lead: "Latest change" } : {}) }
}

function ProjectCard({ project, onOpen, onRemove }: { project: Project; onOpen: (id: string) => void; onRemove: (project: Project) => Promise<void> }) {
	const [menuOpen, setMenuOpen] = useState(false)
	const link = projectLink(project)
	const line = latestLine(project)
	const versions = project.deployments.length
	const open = (event: MouseEvent<HTMLAnchorElement>) => {
		if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return
		event.preventDefault()
		onOpen(project.id)
	}

	return (
		<li className="dash-card" data-menu={menuOpen || undefined}>
			<div className="dash-card-head">
				<Tile project={project} />
				<div className="dash-card-id">
					<a className="dash-card-link" href={`/dashboard?project=${project.id}`} onClick={open}>{project.title}</a>
					{link ? (
						<a className="dash-addr" href={link.url} target="_blank" rel="noreferrer">
							<span className="dash-dot" data-state={project.kind === "pr" ? "live" : "live"} aria-hidden="true" />
							<span className="dash-addr-text">{link.label}</span>
						</a>
					) : (
						<span className="dash-addr dash-addr--none">
							<span className="dash-dot" data-state={STATUS_STATE[project.latest.status] ?? "unknown"} aria-hidden="true" />
							{inFlight(project.latest) ? "Going live soon" : "No live link yet"}
						</span>
					)}
				</div>
				<ProjectMenu project={project} onRemove={onRemove} onOpenChange={setMenuOpen} />
			</div>
			<div className="dash-card-git"><RepoChip project={project} /></div>
			{line && (
				<p className="dash-card-line" data-tone={line.tone}>
					{line.lead && <span className="dash-card-lead">{line.lead} · </span>}
					{line.text}
				</p>
			)}
			<div className="dash-card-foot">
				<StatusPill status={project.latest.status} />
				<span>
					{KIND_LABEL[project.kind]} · {versions} {project.kind === "deploy" ? (versions === 1 ? "deploy" : "deploys") : versions === 1 ? "version" : "versions"} · {relativeTime(project.updatedAt)}
					{project.local ? " · This device" : ""}
				</span>
			</div>
		</li>
	)
}

function CardSkeleton() {
	return (
		<li className="dash-card dash-card--skeleton" aria-hidden="true">
			<div className="dash-card-head">
				<span className="dash-tile dash-bone" />
				<div className="dash-card-id">
					<span className="dash-bone" style={{ width: "62%" }} />
					<span className="dash-bone dash-bone--sm" style={{ width: "44%" }} />
				</div>
			</div>
			<span className="dash-bone dash-bone--chip" />
			<span className="dash-bone dash-bone--sm" style={{ width: "80%" }} />
			<span className="dash-bone dash-bone--sm" style={{ width: "50%" }} />
		</li>
	)
}

function SearchField({ value, onChange, label }: { value: string; onChange: (value: string) => void; label: string }) {
	return (
		<label className="dash-search">
			<SearchIcon />
			<input
				type="search"
				value={value}
				onChange={(event) => onChange(event.target.value)}
				placeholder={label}
				aria-label={label}
				spellCheck={false}
				autoComplete="off"
			/>
			{value && (
				<button type="button" className="dash-search-clear" aria-label="Clear search" onClick={() => onChange("")}>
					<CrossIcon />
				</button>
			)}
		</label>
	)
}

function Segmented<T extends string>({ label, value, options, onChange }: { label: string; value: T; options: { value: T; label: string; count?: number }[]; onChange: (value: T) => void }) {
	return (
		<div className="dash-seg" role="radiogroup" aria-label={label}>
			{options.map((option) => (
				<button key={option.value} type="button" role="radio" aria-checked={value === option.value} onClick={() => onChange(option.value)}>
					{option.label}
					{option.count !== undefined && <span className="dash-seg-count">{option.count}</span>}
				</button>
			))}
		</div>
	)
}

interface ProjectsViewProps {
	heading: string
	projects: Project[]
	loading: boolean
	onOpen: (id: string) => void
	onRemove: (project: Project) => Promise<void>
}

export function ProjectsView({ heading, projects, loading, onOpen, onRemove }: ProjectsViewProps) {
	const [query, setQuery] = useState("")
	const [kind, setKind] = useState<KindFilter>("all")
	const needle = query.trim().toLowerCase()
	const shown = useMemo(
		() => projects.filter((project) => (kind === "all" || project.kind === kind) && projectMatches(project, needle)),
		[projects, kind, needle]
	)
	const live = projects.filter((project) => project.live || (project.kind === "pr" && project.pr)).length
	const onGitHub = projects.filter((project) => project.repo?.github).length
	const counts = (value: KindFilter) => value === "all" ? projects.length : projects.filter((project) => project.kind === value).length

	return (
		<section className="dash-section" aria-labelledby="projects-heading">
			<div className="dash-head">
				<div>
					<h1 id="projects-heading">{heading}</h1>
					{!loading && projects.length > 0 && (
						<p className="dash-sub">
							{projects.length} project{projects.length === 1 ? "" : "s"} · {live} live · {onGitHub} on GitHub
						</p>
					)}
				</div>
				<Link href="/" className="pill-btn pill-btn--ink dash-new"><PlusIcon /> New project</Link>
			</div>

			{(loading || projects.length > 0) && (
				<div className="dash-toolbar">
					<SearchField value={query} onChange={setQuery} label="Search projects, links and prompts" />
					<Segmented
						label="Show"
						value={kind}
						onChange={setKind}
						options={KIND_FILTERS.map((option) => ({ ...option, count: loading ? undefined : counts(option.value) }))}
					/>
				</div>
			)}

			{loading ? (
				<ul className="dash-grid" aria-busy="true" aria-label="Loading projects">
					{Array.from({ length: 6 }, (_, index) => <CardSkeleton key={index} />)}
				</ul>
			) : projects.length === 0 ? (
				<div className="dash-empty">
					<h2>No projects yet</h2>
					<p>Describe an app on the home screen, or paste a GitHub repository. Each one shows up here with its live link, every version and its code on GitHub.</p>
					<Link href="/" className="pill-btn pill-btn--ink">Build your first app</Link>
				</div>
			) : shown.length === 0 ? (
				<div className="dash-empty dash-empty--quiet">
					<h2>Nothing matches</h2>
					<p>No {kind === "all" ? "project" : KIND_LABEL[kind].toLowerCase()} has {needle ? <>&ldquo;{query.trim()}&rdquo; in its name, link or prompts</> : "been made yet"}.</p>
					<button type="button" className="text-btn" onClick={() => { setQuery(""); setKind("all") }}>Show every project</button>
				</div>
			) : (
				<ul className="dash-grid">
					{shown.map((project) => <ProjectCard key={project.id} project={project} onOpen={onOpen} onRemove={onRemove} />)}
				</ul>
			)}
		</section>
	)
}

// ── Project detail ──────────────────────────────────────────────────────────

/** The newest live version, drawn at desktop width and scaled into the card. */
function LivePreview({ deployment, building }: { deployment: Deployment; building: boolean }) {
	const frame = useRef<HTMLDivElement>(null)
	const [scale, setScale] = useState(0)
	useEffect(() => {
		const element = frame.current
		if (!element) return
		const observer = new ResizeObserver(([entry]) => setScale((entry?.contentRect.width ?? 0) / 1280))
		observer.observe(element)
		return () => observer.disconnect()
	}, [])

	return (
		<a className="dash-shot" href={deployment.url} target="_blank" rel="noreferrer" aria-label={`Open ${hostOf(deployment.url)}`}>
			<div className="dash-shot-frame" ref={frame}>
				{scale > 0 && (
					<iframe
						src={deployment.url}
						title={`Preview of ${hostOf(deployment.url)}`}
						loading="lazy"
						tabIndex={-1}
						sandbox="allow-scripts allow-same-origin"
						style={{ transform: `scale(${scale})` }}
					/>
				)}
			</div>
			{building && <span className="dash-shot-note"><span className="chip-dot" aria-hidden="true" /> Building a new version</span>}
			<span className="dash-shot-open"><ExternalIcon /> Visit</span>
		</a>
	)
}

function PreviewPanel({ project }: { project: Project }) {
	const { latest, live } = project
	if (project.kind === "pr") {
		return (
			<div className="dash-shot dash-shot--state">
				<span className="dash-state-icon"><GitHubIcon /></span>
				{project.pr ? (
					<>
						<p className="dash-state-title">{project.pr.title || "Pull request"}</p>
						<p className="dash-state-text">
							#{project.pr.number} on {project.repo?.label}
							{project.pr.branch && <> · {project.pr.branch}{project.pr.base ? ` → ${project.pr.base}` : ""}</>}
							{project.pr.fork ? " · from your fork" : ""}
						</p>
						<a className="text-btn" href={project.pr.url} target="_blank" rel="noreferrer">Open on GitHub</a>
					</>
				) : (
					<>
						<p className="dash-state-title">{inFlight(latest) ? "Writing the change…" : "No pull request was opened"}</p>
						<p className="dash-state-text">{latest.error ?? `For ${project.repo?.label ?? "the repository"}.`}</p>
						<OpenInConsole deployment={latest} className="text-btn">{inFlight(latest) ? "Watch it in rwaft" : "See what happened"}</OpenInConsole>
					</>
				)}
			</div>
		)
	}
	if (live) return <LivePreview deployment={live} building={latest !== live && inFlight(latest)} />
	if (inFlight(latest)) {
		return (
			<div className="dash-shot dash-shot--state">
				<span className="spinner" aria-hidden="true" />
				<p className="dash-state-title">{latest.status === "queued" ? "Waiting in line" : "Building the first version"}</p>
				<p className="dash-state-text">The preview appears here when it goes live.</p>
				<OpenInConsole deployment={latest} className="text-btn">Watch the build</OpenInConsole>
			</div>
		)
	}
	return (
		<div className="dash-shot dash-shot--state">
			<span className="dash-state-icon" data-tone={latest.status === "failed" ? "failed" : undefined}>{latest.status === "failed" ? <CrossIcon /> : <OpenAppIcon />}</span>
			<p className="dash-state-title">{latest.status === "failed" ? "This build didn't finish" : "No preview"}</p>
			<p className="dash-state-text">{latest.status === "failed" ? latest.error ?? "It stopped before going live, and its credits were refunded." : "rwaft doesn't know how this build ended."}</p>
			<OpenInConsole deployment={latest} className="text-btn">Open in rwaft</OpenInConsole>
		</div>
	)
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
	return (
		<div className="dash-fact">
			<dt>{label}</dt>
			<dd>{children}</dd>
		</div>
	)
}

function VersionRow({ deployment, number, kind }: { deployment: Deployment; number: number; kind: BuildKind }) {
	const took = duration(deployment)
	const label = kind === "deploy" ? `Deploy ${number}` : kind === "pr" ? (deployment.parent ? `Commit ${number}` : "Opened") : deployment.parent ? `v${number}` : "v1"
	const target = kind === "pr" ? deployment.pr?.url : deployment.status === "ready" ? deployment.url : null
	return (
		<li className="dash-row">
			<div className="dash-row-status">
				<StatusPill status={deployment.status} />
				{took && <span className="dash-row-took">{took}</span>}
			</div>
			<div className="dash-row-main">
				<span className="dash-row-label">{label}{!deployment.parent && kind === "prompt" ? " · Original" : ""}</span>
				<span className="dash-row-text" data-tone={deployment.status === "failed" && deployment.error ? "failed" : undefined}>
					{deployment.status === "failed" && deployment.error ? deployment.error : deployment.source || hostOf(deployment.url)}
				</span>
			</div>
			<div className="dash-row-link">
				{target ? <a href={target} target="_blank" rel="noreferrer">{hostOf(target)}</a> : <span className="dash-faint">{deployment.status === "failed" ? "Not live" : inFlight(deployment) ? "Not live yet" : "—"}</span>}
			</div>
			<time className="dash-row-time" dateTime={new Date(deployment.createdAt).toISOString()} title={fullDate(deployment.createdAt)}>{relativeTime(deployment.createdAt)}</time>
			<OpenInConsole deployment={deployment} className="icon-btn dash-row-open" title="Open in rwaft">
				<OpenAppIcon /><span className="sr-only">Open {label} in rwaft</span>
			</OpenInConsole>
		</li>
	)
}

interface ProjectDetailProps {
	project: Project | null
	loading: boolean
	back: { href: string; onClick: (event: MouseEvent<HTMLAnchorElement>) => void }
	onRemove: (project: Project) => Promise<void>
	headers: () => Record<string, string>
}

export function ProjectDetail({ project, loading, back, onRemove, headers }: ProjectDetailProps) {
	const { copied, copy } = useCopy()

	if (!project) {
		return (
			<section className="dash-section">
				<a className="dash-back" {...back}><ChevronLeft /> Projects</a>
				{loading ? (
					<div className="dash-detail-skeleton" aria-busy="true" aria-label="Loading project">
						<span className="dash-bone" style={{ width: "40%", height: 28 }} />
						<span className="dash-bone" style={{ height: 320, borderRadius: 14 }} />
					</div>
				) : (
					<div className="dash-empty">
						<h1>This project isn&apos;t in your list</h1>
						<p>It may have been removed, or it was built on another account.</p>
						<a className="pill-btn pill-btn--ink" {...back}>See all projects</a>
					</div>
				)}
			</section>
		)
	}

	const { latest, live, deployments, kind } = project
	const link = projectLink(project)
	const took = duration(latest)
	const total = deployments.length
	const pushable = kind === "prompt" && !project.repo && live && !live.local ? live : null

	return (
		<section className="dash-section" aria-labelledby="project-heading">
			<a className="dash-back" {...back}><ChevronLeft /> Projects</a>

			<div className="dash-detail-head">
				<Tile project={project} size="lg" />
				<div className="dash-detail-id">
					<h1 id="project-heading">{project.title}</h1>
					<p className="dash-sub">
						{KIND_LABEL[kind]} · started {relativeTime(project.createdAt)} · {total} {kind === "deploy" ? (total === 1 ? "deploy" : "deploys") : total === 1 ? "version" : "versions"}
						{project.local ? " · saved in this browser only" : ""}
					</p>
				</div>
				<div className="dash-detail-actions">
					{link ? (
						<a className="pill-btn pill-btn--ink" href={link.url} target="_blank" rel="noreferrer">
							{kind === "pr" ? "Open pull request" : "Visit"} <ExternalIcon />
						</a>
					) : (
						<OpenInConsole deployment={latest} className="pill-btn pill-btn--ink">Open in rwaft</OpenInConsole>
					)}
					<ProjectMenu project={project} onRemove={onRemove} />
				</div>
			</div>

			<div className="dash-overview">
				<PreviewPanel project={project} />
				<dl className="dash-facts">
					<Fact label={kind === "pr" ? "Pull request" : "Live link"}>
						{link ? (
							<span className="dash-fact-link">
								<a href={link.url} target="_blank" rel="noreferrer">{link.label}</a>
								<button type="button" className="icon-btn dash-copy" onClick={() => void copy(link.url)} aria-label={copied ? "Link copied" : "Copy link"}>
									{copied ? <CheckIcon /> : <CopyIcon />}
								</button>
							</span>
						) : <span className="dash-faint">{inFlight(latest) ? "Going live soon" : "None yet"}</span>}
					</Fact>
					<Fact label="Status">
						{live && live !== latest && inFlight(latest) ? (
							<span className="dash-fact-status">
								<StatusPill status="ready" />
								<span className="dash-faint">v{total - deployments.indexOf(live)} is live · a newer version is {latest.status === "queued" ? "in line" : "building"}</span>
							</span>
						) : (
							<span className="dash-fact-status">
								<StatusPill status={latest.status} />
								{took && <span className="dash-faint">in {took}</span>}
							</span>
						)}
						{latest.status === "failed" && latest.error && <span className="dash-fact-error">{latest.error}</span>}
					</Fact>
					<Fact label="Updated">
						<span title={fullDate(latest.createdAt)}>{fullDate(latest.createdAt)}</span>
					</Fact>
					<Fact label={kind === "deploy" ? "Source" : total > 1 ? "Last request" : "Prompt"}>
						{kind === "deploy" && project.repo ? (
							<a href={project.repo.url} target="_blank" rel="noreferrer">{project.repo.url.replace(/^https:\/\//, "")}</a>
						) : (
							<q className="dash-fact-quote">{latest.source || "—"}</q>
						)}
					</Fact>
					<Fact label="GitHub">
						{project.repo ? (
							<span className="dash-fact-git">
								<RepoChip project={project} />
								{project.pr && kind === "pr" && project.pr.branch && <span className="dash-faint">{project.pr.branch}</span>}
							</span>
						) : pushable ? (
							<GitHubExport build={toRecentBuild(pushable)} headers={headers} />
						) : (
							<span className="dash-faint">Not on GitHub</span>
						)}
					</Fact>
					{project.charged > 0 && (
						<Fact label="Credits">
							{project.charged} used across {total} {kind === "deploy" ? (total === 1 ? "deploy" : "deploys") : total === 1 ? "version" : "versions"}
						</Fact>
					)}
				</dl>
			</div>

			<div className="dash-subhead">
				<h2>{kind === "deploy" ? "Deploys" : kind === "pr" ? "Changes" : "Versions"}</h2>
				<span className="dash-faint">Newest first</span>
			</div>
			<ol className="dash-list">
				{deployments.map((deployment, index) => (
					<VersionRow key={deployment.id} deployment={deployment} number={total - index} kind={kind} />
				))}
			</ol>
		</section>
	)
}

// ── Deployments ─────────────────────────────────────────────────────────────

type StatusFilter = "all" | "ready" | "building" | "failed"

const STATUS_FILTERS: { value: StatusFilter; label: string }[] = [
	{ value: "all", label: "All" },
	{ value: "ready", label: "Live" },
	{ value: "building", label: "In progress" },
	{ value: "failed", label: "Failed" },
]

const statusMatches = (deployment: Deployment, filter: StatusFilter) =>
	filter === "all" ? true : filter === "building" ? inFlight(deployment) : deployment.status === filter

interface DeploymentsViewProps {
	deployments: Deployment[]
	projects: Project[]
	loading: boolean
	onOpenProject: (id: string) => void
}

export function DeploymentsView({ deployments, projects, loading, onOpenProject }: DeploymentsViewProps) {
	const [query, setQuery] = useState("")
	const [status, setStatus] = useState<StatusFilter>("all")
	const needle = query.trim().toLowerCase()
	const titles = useMemo(() => new Map(projects.map((project) => [project.id, project.title])), [projects])
	const shown = useMemo(
		() => deployments.filter((deployment) => statusMatches(deployment, status) && (!needle
			|| matches(deployment.source, needle)
			|| matches(deployment.url, needle)
			|| deployment.id.includes(needle)
			|| matches(titles.get(deployment.root) ?? "", needle))),
		[deployments, status, needle, titles]
	)

	return (
		<section className="dash-section" aria-labelledby="deployments-heading">
			<div className="dash-head">
				<div>
					<h1 id="deployments-heading">Deployments</h1>
					{!loading && deployments.length > 0 && (
						<p className="dash-sub">Every build, change and pull request, newest first</p>
					)}
				</div>
				<Link href="/" className="pill-btn pill-btn--ink dash-new"><PlusIcon /> New project</Link>
			</div>

			<div className="dash-toolbar">
				<SearchField value={query} onChange={setQuery} label="Search deployments" />
				<Segmented
					label="Status"
					value={status}
					onChange={setStatus}
					options={STATUS_FILTERS.map((option) => ({ ...option, count: loading ? undefined : deployments.filter((deployment) => statusMatches(deployment, option.value)).length }))}
				/>
			</div>

			{loading ? (
				<ol className="dash-list" aria-busy="true" aria-label="Loading deployments">
					{Array.from({ length: 6 }, (_, index) => (
						<li key={index} className="dash-row" aria-hidden="true">
							<span className="dash-bone dash-bone--chip" />
							<span className="dash-bone dash-bone--sm" style={{ width: "70%" }} />
							<span className="dash-bone dash-bone--sm" style={{ width: "60%" }} />
							<span className="dash-bone dash-bone--sm" style={{ width: "50%" }} />
						</li>
					))}
				</ol>
			) : deployments.length === 0 ? (
				<div className="dash-empty">
					<h2>No deployments yet</h2>
					<p>Every build you start while signed in is listed here, with how it went and where it lives.</p>
					<Link href="/" className="pill-btn pill-btn--ink">Start a build</Link>
				</div>
			) : shown.length === 0 ? (
				<div className="dash-empty dash-empty--quiet">
					<h2>Nothing matches</h2>
					<p>Try another word, or show every status.</p>
					<button type="button" className="text-btn" onClick={() => { setQuery(""); setStatus("all") }}>Show every deployment</button>
				</div>
			) : (
				<ol className="dash-list dash-list--deployments">
					{shown.map((deployment) => {
						const Icon = KIND_ICON[deployment.kind]
						const target = deployment.kind === "pr" ? deployment.pr?.url : deployment.status === "ready" ? deployment.url : null
						const took = duration(deployment)
						return (
							<li key={deployment.id} className="dash-row">
								<div className="dash-row-main">
									{target ? (
										<a className="dash-row-addr" href={target} target="_blank" rel="noreferrer">{hostOf(target)}</a>
									) : (
										<span className="dash-row-addr dash-faint">{deployment.status === "failed" ? "Not live" : inFlight(deployment) ? "Not live yet" : hostOf(deployment.url)}</span>
									)}
									<span className="dash-row-id">{deployment.id}{deployment.local ? " · This device" : ""}</span>
								</div>
								<div className="dash-row-status">
									<StatusPill status={deployment.status} />
									{took && <span className="dash-row-took">{took}</span>}
								</div>
								<div className="dash-row-project">
									<button type="button" className="dash-row-project-btn" onClick={() => onOpenProject(deployment.root)}>
										{titles.get(deployment.root) ?? "Project"}
									</button>
									<span className="dash-row-text" data-tone={deployment.status === "failed" && deployment.error ? "failed" : undefined}>
										<Icon className="dash-row-kind" />
										{deployment.status === "failed" && deployment.error ? deployment.error : deployment.parent ? `Change: ${deployment.source}` : deployment.source || KIND_LABEL[deployment.kind]}
									</span>
								</div>
								<time className="dash-row-time" dateTime={new Date(deployment.createdAt).toISOString()} title={fullDate(deployment.createdAt)}>{relativeTime(deployment.createdAt)}</time>
								<OpenInConsole deployment={deployment} className="icon-btn dash-row-open" title="Open in rwaft">
									<OpenAppIcon /><span className="sr-only">Open in rwaft</span>
								</OpenInConsole>
							</li>
						)
					})}
				</ol>
			)}
		</section>
	)
}
