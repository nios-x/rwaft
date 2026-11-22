import type { SVGProps } from "react"

/** One stroke family for the whole console: 16px grid, 1.6 stroke, round joins. */
const base: SVGProps<SVGSVGElement> = {
	viewBox: "0 0 16 16",
	fill: "none",
	stroke: "currentColor",
	strokeWidth: 1.6,
	strokeLinecap: "round",
	strokeLinejoin: "round",
	"aria-hidden": true,
}

type IconProps = SVGProps<SVGSVGElement>
const icon = (paths: React.ReactNode) => {
	const Icon = (props: IconProps) => <svg {...base} {...props}>{paths}</svg>
	return Icon
}

export const SunIcon = icon(<><circle cx="8" cy="8" r="2.8" /><path d="M8 1.8v1.4M8 12.8v1.4M1.8 8h1.4M12.8 8h1.4M3.6 3.6l1 1M11.4 11.4l1 1M3.6 12.4l1-1M11.4 4.6l1-1" /></>)
export const MoonIcon = icon(<path d="M13.2 9.6A5.4 5.4 0 0 1 6.4 2.8a5.4 5.4 0 1 0 6.8 6.8Z" />)
export const ChevronDown = icon(<path d="m4.5 6.5 3.5 3.5 3.5-3.5" />)
export const ChevronRight = icon(<path d="m6.5 4.5 3.5 3.5-3.5 3.5" />)
export const ChevronLeft = icon(<path d="m9.5 4.5-3.5 3.5 3.5 3.5" />)
export const CoinIcon = icon(<><ellipse cx="8" cy="5" rx="4.6" ry="2" /><path d="M3.4 5v6c0 1.1 2.1 2 4.6 2s4.6-.9 4.6-2V5M3.4 8c0 1.1 2.1 2 4.6 2s4.6-.9 4.6-2" /></>)
export const ExternalIcon = icon(<path d="M6.6 3.4H12.6v6M12.6 3.4 4 12" />)
export const SendIcon = icon(<path d="M8 12.6V3.6M4.4 7.2 8 3.6l3.6 3.6" />)
export const RepoIcon = icon(<><path d="M3.8 2.8h7.4a1 1 0 0 1 1 1v9.4H5.3a1.5 1.5 0 0 1-1.5-1.5V2.8Z" /><path d="M5.3 10.8h6.9" /></>)
export const PullRequestIcon = icon(<><circle cx="4.5" cy="3.6" r="1.6" /><circle cx="4.5" cy="12.4" r="1.6" /><circle cx="11.5" cy="12.4" r="1.6" /><path d="M4.5 5.2v5.6M11.5 10.8V6.6a2 2 0 0 0-2-2H7.6M9 3.2 7.6 4.6 9 6" /></>)
export const BranchIcon = icon(<><circle cx="4.5" cy="3.6" r="1.6" /><circle cx="4.5" cy="12.4" r="1.6" /><circle cx="11.5" cy="4.6" r="1.6" /><path d="M4.5 5.2v5.6M11.5 6.2c0 3.2-7 2.2-7 4.6" /></>)
export const SparkIcon = icon(<path d="M8 2.4 9.3 6.4l4 1.3-4 1.3L8 13l-1.3-4-4-1.3 4-1.3L8 2.4Z" />)
export const CheckIcon = icon(<path d="m3.6 8.4 2.8 2.8 6-6.4" />)
export const CrossIcon = icon(<path d="M4.4 4.4l7.2 7.2M11.6 4.4l-7.2 7.2" />)
export const CopyIcon = icon(<><rect x="5.4" y="5.4" width="7.4" height="7.4" rx="1.4" /><path d="M10.4 5.4V4a1 1 0 0 0-1-1H4a1 1 0 0 0-1 1v5.4a1 1 0 0 0 1 1h1.4" /></>)
export const RefreshIcon = icon(<><path d="M12.8 7.4A4.8 4.8 0 0 0 4 5.2M3.2 8.6A4.8 4.8 0 0 0 12 10.8" /><path d="M4 2.8v2.6h2.6M12 13.2v-2.6H9.4" /></>)
export const SoundIcon = icon(<><path d="M2.8 6.2h2.2L8.4 3.4v9.2L5 9.8H2.8V6.2Z" /><path d="M10.8 5.8a3 3 0 0 1 0 4.4M12.6 4a5.4 5.4 0 0 1 0 8" /></>)
export const LockIcon = icon(<><rect x="3.4" y="7" width="9.2" height="6.4" rx="1.6" /><path d="M5.4 7V5.2a2.6 2.6 0 0 1 5.2 0V7" /></>)
export const SearchIcon = icon(<><circle cx="7.2" cy="7.2" r="4.4" /><path d="m10.4 10.4 3 3" /></>)
export const PlusIcon = icon(<path d="M8 3.4v9.2M3.4 8h9.2" />)
export const MoreIcon = icon(<><circle cx="3.6" cy="8" r=".9" fill="currentColor" /><circle cx="8" cy="8" r=".9" fill="currentColor" /><circle cx="12.4" cy="8" r=".9" fill="currentColor" /></>)
export const GridIcon = icon(<><rect x="2.6" y="2.6" width="4.4" height="4.4" rx="1.1" /><rect x="9" y="2.6" width="4.4" height="4.4" rx="1.1" /><rect x="2.6" y="9" width="4.4" height="4.4" rx="1.1" /><rect x="9" y="9" width="4.4" height="4.4" rx="1.1" /></>)
export const TrashIcon = icon(<><path d="M3 4.6h10M6.4 4.6V3.4a.8.8 0 0 1 .8-.8h1.6a.8.8 0 0 1 .8.8v1.2" /><path d="M4.4 4.6l.6 8a1 1 0 0 0 1 .9h4a1 1 0 0 0 1-.9l.6-8" /></>)
export const OpenAppIcon = icon(<><rect x="2.4" y="3" width="11.2" height="10" rx="1.6" /><path d="M2.4 6h11.2" /></>)
export const SignOutIcon =icon(<><path d="M6.4 13.2H4a1 1 0 0 1-1-1V3.8a1 1 0 0 1 1-1h2.4" /><path d="m10 5 3 3-3 3M13 8H6.4" /></>)

/** GitHub's own mark is a filled shape, so it opts out of the stroke family. */
export const GitHubIcon = (props: IconProps) => (
	<svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true" {...props}>
		<path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8Z" />
	</svg>
)

/** X's mark, filled like GitHub's. */
export const XIcon = (props: IconProps) => (
	<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" {...props}>
		<path d="M18.901 1.153h3.68l-8.04 9.19L24 22.846h-7.406l-5.8-7.584-6.638 7.584H.474l8.6-9.83L0 1.154h7.594l5.243 6.932ZM17.61 20.644h2.039L6.486 3.24H4.298Z" />
	</svg>
)

/** The rwaft mark: three log lines resolving into one live endpoint. */
export const Mark = (props: IconProps) => (
	<svg viewBox="0 0 28 28" fill="none" aria-hidden="true" {...props}>
		<rect x="0.5" y="0.5" width="27" height="27" rx="8" fill="var(--ink)" />
		<g stroke="var(--on-ink)" strokeWidth="2.1" strokeLinecap="round">
			<path d="M6.6 9.6h6.4" />
			<path d="M6.6 14h8.9" />
			<path d="M6.6 18.4h5.4" />
		</g>
		<circle cx="19.7" cy="14" r="2.6" fill="var(--accent)" />
	</svg>
)
