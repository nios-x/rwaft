/**
 * rwaft's icon family (frontend/app/_components/Icons.tsx): a 16 px grid,
 * 1.6 stroke, round caps and joins. Copied path for path so the film draws
 * the same glyphs as the product. Clock is new, drawn to the same rules.
 */
const stroke = (paths, width = 1.6) =>
	`<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`

export const icons = {
	spark: stroke(`<path d="M8 2.4 9.3 6.4l4 1.3-4 1.3L8 13l-1.3-4-4-1.3 4-1.3L8 2.4Z"/>`),
	repo: stroke(`<path d="M3.8 2.8h7.4a1 1 0 0 1 1 1v9.4H5.3a1.5 1.5 0 0 1-1.5-1.5V2.8Z"/><path d="M5.3 10.8h6.9"/>`),
	check: stroke(`<path d="m3.6 8.4 2.8 2.8 6-6.4"/>`),
	checkBold: stroke(`<path pathLength="1" d="m3.6 8.4 2.8 2.8 6-6.4"/>`, 2.2),
	copy: stroke(`<rect x="5.4" y="5.4" width="7.4" height="7.4" rx="1.4"/><path d="M10.4 5.4V4a1 1 0 0 0-1-1H4a1 1 0 0 0-1 1v5.4a1 1 0 0 0 1 1h1.4"/>`),
	refresh: stroke(`<path d="M12.8 7.4A4.8 4.8 0 0 0 4 5.2M3.2 8.6A4.8 4.8 0 0 0 12 10.8"/><path d="M4 2.8v2.6h2.6M12 13.2v-2.6H9.4"/>`),
	external: stroke(`<path d="M6.6 3.4H12.6v6M12.6 3.4 4 12"/>`),
	send: stroke(`<path d="M8 12.6V3.6M4.4 7.2 8 3.6l3.6 3.6"/>`, 2),
	clock: stroke(`<circle cx="8" cy="8" r="5.6"/><path d="M8 5v3.2l2 1.3"/>`),
	github: `<svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8Z"/></svg>`,
}
