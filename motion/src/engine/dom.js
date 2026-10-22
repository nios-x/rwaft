/**
 * Tiny DOM helpers. The scene is built once; seek() then only writes styles.
 *
 * `css` skips writes whose value has not changed. That is a cache of what the
 * DOM already holds, not animation state: the frame is still decided by time
 * alone, it just avoids re-setting identical properties 1,000 times a second.
 */

export function h(tag, className, parent, content) {
	const el = document.createElement(tag)
	if (className) el.className = className
	if (content != null) {
		if (typeof content === "string" && content.trimStart().startsWith("<")) el.innerHTML = content
		else el.textContent = content
	}
	if (parent) parent.appendChild(el)
	return el
}

const written = new WeakMap()

export function css(el, styles) {
	let cache = written.get(el)
	if (!cache) {
		cache = Object.create(null)
		written.set(el, cache)
	}
	for (const key in styles) {
		const value = styles[key]
		if (cache[key] === value) continue
		cache[key] = value
		if (key.startsWith("--")) el.style.setProperty(key, value)
		else el.style[key] = value
	}
}

export function text(el, value) {
	if (el.textContent !== value) el.textContent = value
}

const px = (n) => `${+n.toFixed(3)}px`

/** Positions an absolutely placed element at a rect given relative to an origin. */
export function place(el, rect, origin = { l: 0, t: 0 }, extra = {}) {
	css(el, {
		left: px(rect.l - origin.l),
		top: px(rect.t - origin.t),
		width: px(rect.r - rect.l),
		height: px(rect.b - rect.t),
		...(rect.radius != null ? { borderRadius: px(rect.radius) } : {}),
		...extra,
	})
}

/** Positions an element by a point (its top-left) relative to an origin. */
export function at(el, x, y, origin = { l: 0, t: 0 }, extra = {}) {
	css(el, { left: px(x - origin.l), top: px(y - origin.t), ...extra })
}

/** Measures rendered text once at build time; fonts must already be loaded. */
export function measure(content, className, host = document.body) {
	const probe = h("span", className, host, content)
	probe.style.position = "absolute"
	probe.style.visibility = "hidden"
	probe.style.whiteSpace = "pre"
	const width = probe.getBoundingClientRect().width
	probe.remove()
	return width
}

export { px }
