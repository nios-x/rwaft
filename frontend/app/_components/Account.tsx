"use client"

import Link from "next/link"
import { useEffect, useRef, useState } from "react"
import { BACKEND_URL, readApiJson } from "../../lib/config"
import { loadGoogleIdentity, registerCredentialHandler, type AccountState, type TokenPack } from "../../lib/useAccount"
import type { Theme } from "../../lib/useTheme"
import { ChevronDown, CoinIcon, GridIcon, SignOutIcon } from "./Icons"

export const TOKEN_SHOP_ID = "token-shop"
export const openTokenShop = () => document.getElementById(TOKEN_SHOP_ID)?.showPopover()

const formatPrice = (pack: TokenPack, currency: string) =>
	new Intl.NumberFormat(undefined, { style: "currency", currency: currency.toUpperCase() }).format(pack.amount / 100)

export function GoogleButton({ auth, theme, width = 220 }: { auth: AccountState; theme: Theme; width?: number }) {
	const slot = useRef<HTMLDivElement>(null)
	const [error, setError] = useState("")
	const clientId = auth.config?.googleClientId
	const { signIn } = auth

	useEffect(() => registerCredentialHandler((credential) => {
		setError("")
		signIn(credential).catch((failure: unknown) => {
			setError(failure instanceof Error ? failure.message : "Sign-in failed")
		})
	}), [signIn])

	useEffect(() => {
		if (!clientId) return
		let cancelled = false
		loadGoogleIdentity(clientId)
			.then(() => {
				if (cancelled || !slot.current || !window.google) return
				slot.current.replaceChildren()
				window.google.accounts.id.renderButton(slot.current, {
					theme: theme === "dark" ? "filled_black" : "outline",
					size: "large",
					shape: "pill",
					// One button for both: a first sign-in creates the account.
					text: "continue_with",
					logo_alignment: "left",
					width,
				})
			})
			.catch((failure: unknown) => {
				if (!cancelled) setError(failure instanceof Error ? failure.message : "Google sign-in could not load")
			})
		return () => { cancelled = true }
	}, [clientId, width, theme])

	if (!clientId) return null
	return (
		<div className="google-slot">
			<div ref={slot} style={{ minHeight: 40, minWidth: width }} />
			{error && <p className="field-error" role="alert">{error}</p>}
		</div>
	)
}

/** Top-right: who is signed in, with their balance and the way out. */
export function AccountPill({ auth, theme }: { auth: AccountState; theme: Theme }) {
	const { config, account, checking } = auth
	const [open, setOpen] = useState(false)
	const root = useRef<HTMLDivElement>(null)

	useEffect(() => {
		if (!open) return
		const close = (event: MouseEvent) => {
			if (!root.current?.contains(event.target as Node)) setOpen(false)
		}
		const onKey = (event: KeyboardEvent) => event.key === "Escape" && setOpen(false)
		document.addEventListener("mousedown", close)
		document.addEventListener("keydown", onKey)
		return () => {
			document.removeEventListener("mousedown", close)
			document.removeEventListener("keydown", onKey)
		}
	}, [open])

	if (!config) return <div className="account-pill account-pill--ghost" aria-hidden="true" />
	if (!account) {
		if (checking) return <div className="account-pill account-pill--ghost" aria-label="Checking your session" />
		// With billing on, the prompt box already shows the sign-in button where the action is.
		if (!config.googleClientId || config.billing) return null
		return <GoogleButton auth={auth} theme={theme} width={196} />
	}

	return (
		<div className="account-menu" ref={root}>
			<button type="button" className="account-pill" aria-expanded={open} aria-haspopup="menu" onClick={() => setOpen((value) => !value)}>
				{account.picture ? (
					// Google avatars refuse hotlinks that carry a referrer.
					// eslint-disable-next-line @next/next/no-img-element
					<img className="avatar" src={account.picture} alt="" width={30} height={30} referrerPolicy="no-referrer" />
				) : (
					<span className="avatar" aria-hidden="true">{(account.name || account.email).slice(0, 1).toUpperCase()}</span>
				)}
				<span className="account-pill-name">{account.name || account.email}</span>
				<ChevronDown className="account-pill-chev" />
			</button>
			{open && (
				<div className="menu" role="menu">
					<p className="menu-head">
						<strong>{account.name}</strong>
						<span>{account.email}</span>
					</p>
					<Link href="/dashboard" role="menuitem" className="menu-item" onClick={() => setOpen(false)}>
						<GridIcon /> Dashboard
					</Link>
					{config.billing && (
						<button type="button" role="menuitem" className="menu-item" onClick={() => { setOpen(false); openTokenShop() }}>
							<CoinIcon /> Recharge credits · {account.tokens} left
						</button>
					)}
					<button type="button" role="menuitem" className="menu-item" onClick={() => { setOpen(false); auth.signOut() }}>
						<SignOutIcon /> Sign out
					</button>
				</div>
			)}
		</div>
	)
}

/** ", next on Tue 2 Dec" while a weekly top-up is waiting; nothing when none is. */
const refillNote = (nextRefillAt: number | null | undefined) => {
	if (typeof nextRefillAt !== "number") return ""
	if (nextRefillAt <= Date.now()) return ", due now"
	return `, next on ${new Date(nextRefillAt).toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" })}`
}

/** The recharge panel. Opens whenever billing is on, so recharging is never hidden. */
export function TokenShop({ auth }: { auth: AccountState }) {
	const { config, account } = auth
	const [pending, setPending] = useState<string | null>(null)
	const [error, setError] = useState("")
	const [notice, setNotice] = useState("")
	if (!config?.billing || !account) return null
	const canPay = config.payments !== null

	const addTestCredits = async () => {
		setPending("test")
		setError("")
		setNotice("")
		try {
			const response = await fetch(`${BACKEND_URL}/billing/test-credits`, { method: "POST", headers: auth.authHeaders() })
			const data = await readApiJson<{ added?: number; balance?: number; message?: string }>(response)
			if (!response.ok || typeof data.balance !== "number") throw new Error(data.message || "Could not add credits")
			auth.setBalance(data.balance)
			setNotice(data.added ? `Added ${data.added} test credits.` : "Your test balance is already at its limit.")
		} catch (failure) {
			setError(failure instanceof Error ? failure.message : "Could not add credits")
		} finally {
			setPending(null)
		}
	}

	const buy = async (pack: TokenPack) => {
		setPending(pack.id)
		setError("")
		try {
			const response = await fetch(`${BACKEND_URL}/billing/checkout`, {
				method: "POST",
				headers: { "Content-Type": "application/json", ...auth.authHeaders() },
				body: JSON.stringify({ pack: pack.id }),
			})
			const data = await readApiJson<{ url?: string; message?: string }>(response)
			if (!response.ok || !data.url) throw new Error(data.message || "Could not start checkout")
			window.location.assign(data.url)
		} catch (failure) {
			setError(failure instanceof Error ? failure.message : "Could not start checkout")
			setPending(null)
		}
	}

	return (
		<div id={TOKEN_SHOP_ID} popover="auto" className="shop" aria-labelledby="shop-title">
			<header className="shop-head">
				<span className="shop-icon"><CoinIcon /></span>
				<h2 id="shop-title">Recharge credits</h2>
				<button type="button" className="text-btn" popoverTarget={TOKEN_SHOP_ID} popoverTargetAction="hide">Close</button>
			</header>
			<p className="shop-costs">
				You have <strong>{account.tokens} credit{account.tokens === 1 ? "" : "s"}</strong>. Every chat costs {config.costs.prompt}, a repo deploy {config.costs.deploy}, and failed builds are refunded.
			</p>
			{(config.weeklyTokens ?? 0) > 0 && (
				<p className="shop-refill">
					Free top-up to <strong>{config.weeklyTokens} credits</strong> every week{refillNote(account.nextRefillAt)}.
				</p>
			)}
			<ul className="shop-packs">
				{config.packs.map((pack) => (
					<li key={pack.id} className="shop-pack">
						<span className="shop-pack-tokens"><strong>{pack.tokens}</strong> credits</span>
						<span className="shop-pack-builds">about {Math.floor(pack.tokens / Math.max(1, config.costs.prompt))} chats · {formatPrice(pack, config.currency)}</span>
						<button type="button" className="pill-btn pill-btn--ink" onClick={() => buy(pack)} disabled={!canPay || pending !== null} aria-busy={pending === pack.id}>
							{pending === pack.id ? "Opening…" : canPay ? `Pay ${formatPrice(pack, config.currency)}` : "Soon"}
						</button>
					</li>
				))}
			</ul>
			{config.testCredits && (
				<div className="shop-test">
					<button type="button" className="pill-btn pill-btn--soft" onClick={addTestCredits} disabled={pending !== null} aria-busy={pending === "test"}>
						{pending === "test" ? "Adding…" : "Add 5 test credits"}
					</button>
					<span>Local testing only, while payments aren&apos;t connected.</span>
				</div>
			)}
			{notice && <p className="shop-notice" role="status">{notice}</p>}
			{error && <p className="field-error shop-error" role="alert">{error}</p>}
			<p className="shop-foot">
				{canPay
					? "Payment happens on Dodo Payments' secure checkout page. Credits arrive as soon as it confirms."
					: "Online payment isn't connected yet. Credits can be bought here as soon as the site's payment provider is set up."}
			</p>
		</div>
	)
}
