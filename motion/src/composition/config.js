/**
 * Output format. The composition is laid out in world pixels and framed by
 * the camera, so another aspect ratio is a new VIEW plus, if wanted, a
 * different camera fill; nothing else is tied to 1440 × 1440.
 */
export const FORMATS = {
	square: { width: 1440, height: 1440, fill: 0.82 },
	landscape: { width: 1920, height: 1080, fill: 0.8 },
	portrait: { width: 1080, height: 1920, fill: 0.86 },
}

export const formatFromQuery = () => {
	const name = new URLSearchParams(location.search).get("format")
	return FORMATS[name] ?? FORMATS.square
}

export const FPS = 60
