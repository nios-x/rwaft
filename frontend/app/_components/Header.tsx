"use client"

import type { ReactNode } from "react"
import type { AccountState } from "../../lib/useAccount"
import type { Theme } from "../../lib/useTheme"
import { AccountPill, openTokenShop } from "./Account"
import { CoinIcon, Mark, MoonIcon, SunIcon } from "./Icons"
import { SiteNav } from "./SiteNav"

interface HeaderProps {
	auth: AccountState
	theme: Theme
	setTheme: (theme: Theme) => void
	onHome: () => void
	running: number
	waiting: number
	/** Workspace only: the build's title and status, between the logo and the actions. */
	children?: ReactNode
}

export function Header({ auth, theme, setTheme, onHome, running, waiting, children }: HeaderProps) {
	const { config, account } = auth
	const billing = Boolean(config?.billing)

	return (
		<header className="header">
			<button type="button" className="brand" onClick={onHome} aria-label="rwaft home">
				<Mark className="brand-mark" />
				<span>rwaft</span>
			</button>

			{children ? <div className="header-middle">{children}</div> : <SiteNav className="site-nav--home" />}

			<div className="header-right">
				{(running > 0 || waiting > 0) && (
					<span className="chip" title="Builds run one at a time; this is the shared line">
						<span className="chip-dot" aria-hidden="true" />
						{running} building{waiting > 0 ? ` · ${waiting} waiting` : ""}
					</span>
				)}
				{config && !billing && <span className="chip">Free</span>}
				{billing && account && (
					<button type="button" className="chip chip--button" onClick={openTokenShop} title="Recharge credits" aria-label={`${account.tokens} credits left. Recharge credits`}>
						<CoinIcon /> {account.tokens} credit{account.tokens === 1 ? "" : "s"}
						<span className="chip-action">Recharge</span>
					</button>
				)}
				<button
					type="button"
					className="icon-btn"
					aria-label={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"}
					onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
				>
					{theme === "dark" ? <SunIcon /> : <MoonIcon />}
				</button>
				<AccountPill auth={auth} theme={theme} />
			</div>
		</header>
	)
}
