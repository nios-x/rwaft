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
export const SparkIcon = icon(<path d="M8 2.4 9.3 6.4l4 1.3-4 1.3L8 13l-1.3-4-4-1.3 4-1.3L8 2.4Z" />)
export const CheckIcon = icon(<path d="m3.6 8.4 2.8 2.8 6-6.4" />)
export const CrossIcon = icon(<path d="M4.4 4.4l7.2 7.2M11.6 4.4l-7.2 7.2" />)
export const CopyIcon = icon(<><rect x="5.4" y="5.4" width="7.4" height="7.4" rx="1.4" /><path d="M10.4 5.4V4a1 1 0 0 0-1-1H4a1 1 0 0 0-1 1v5.4a1 1 0 0 0 1 1h1.4" /></>)
export const RefreshIcon = icon(<><path d="M12.8 7.4A4.8 4.8 0 0 0 4 5.2M3.2 8.6A4.8 4.8 0 0 0 12 10.8" /><path d="M4 2.8v2.6h2.6M12 13.2v-2.6H9.4" /></>)
export const SignOutIcon = icon(<><path d="M6.4 13.2H4a1 1 0 0 1-1-1V3.8a1 1 0 0 1 1-1h2.4" /><path d="m10 5 3 3-3 3M13 8H6.4" /></>)

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
