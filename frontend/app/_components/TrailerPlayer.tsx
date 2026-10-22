"use client"

import { useEffect, useRef, useState } from "react"
import { SoundIcon } from "./Icons"

/**
 * The trailer, started with sound as the page opens. Browsers allow that only
 * after the visitor has interacted with the site, which following the navbar
 * link counts as. Arriving cold, the unmuted play() is refused, so it plays
 * muted instead and offers the sound behind one tap.
 */
export function TrailerPlayer({ src, poster, label }: { src: string; poster: string; label: string }) {
	const video = useRef<HTMLVideoElement>(null)
	// Follows the element through onVolumeChange, so unmuting from the native controls also hides the button.
	const [muted, setMuted] = useState(false)

	useEffect(() => {
		const element = video.current
		if (!element) return
		element.play().catch((error: unknown) => {
			if (!(error instanceof DOMException) || error.name !== "NotAllowedError") return
			element.muted = true
			// No autoplay at all (iOS Low Power Mode): leave the sound on for the play button.
			element.play().catch(() => {
				element.muted = false
			})
		})
	}, [])

	function playWithSound() {
		const element = video.current
		if (!element) return
		element.muted = false
		element.currentTime = 0
		void element.play()
	}

	return (
		<div className="trailer">
			<video
				ref={video}
				className="trailer-video"
				src={src}
				poster={poster}
				width={960}
				height={540}
				controls
				playsInline
				preload="auto"
				aria-label={label}
				onVolumeChange={(event) => setMuted(event.currentTarget.muted)}
			/>
			{muted && (
				<button type="button" className="pill-btn pill-btn--ink trailer-sound" onClick={playWithSound}>
					<SoundIcon /> Play with sound
				</button>
			)}
		</div>
	)
}
