"use client"

import { useCallback, useSyncExternalStore } from "react"

export type Theme = "light" | "dark"

const STORAGE_KEY = "rwaft:theme"
const CHANGE_EVENT = "rwaft:theme-change"

/**
 * The theme lives on <html data-theme>. layout.tsx sets it before first paint
 * (stored choice, else the OS preference), so this hook only reads and flips it.
 */
const read = (): Theme => (document.documentElement.dataset.theme === "dark" ? "dark" : "light")

const subscribe = (onChange: () => void) => {
	window.addEventListener(CHANGE_EVENT, onChange)
	return () => window.removeEventListener(CHANGE_EVENT, onChange)
}

export function useTheme(): [Theme, (theme: Theme) => void] {
	const theme = useSyncExternalStore(subscribe, read, () => "light" as Theme)
	const setTheme = useCallback((next: Theme) => {
		document.documentElement.dataset.theme = next
		try {
			window.localStorage.setItem(STORAGE_KEY, next)
		} catch { /* the choice lasts for this page only */ }
		window.dispatchEvent(new Event(CHANGE_EVENT))
	}, [])
	return [theme, setTheme]
}

/** Inlined into <head>: runs before paint so a dark-mode visitor never sees a white flash. */
export const THEME_BOOT_SCRIPT = `(function(){try{var t=localStorage.getItem("${STORAGE_KEY}");if(t!=="light"&&t!=="dark"){t=matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light"}document.documentElement.dataset.theme=t}catch(e){document.documentElement.dataset.theme="light"}})()`
