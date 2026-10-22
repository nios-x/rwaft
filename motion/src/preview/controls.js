import { FPS } from "../composition/config.js"

/**
 * Preview transport. The clock here only produces a time; every frame is
 * still drawn by seek(t), so scrubbing, stepping and playing all show the
 * exact frames the renderer will capture.
 *
 * Keys: Space play/pause · ←/→ one frame · Shift+←/→ one beat ·
 * [ / ] previous/next scene · Home start · D HUD · G guides · L loop
 */
export function createControls(host, { seek, onFrame, map }) {
	const { BEATS, CUES, DURATION, SCENES, grid } = map
	const root = document.createElement("div")
	root.className = "controls"
	root.innerHTML = `
		<div class="ctl-row">
			<button data-a="play" title="Play / pause (Space)">Play</button>
			<button data-a="prev" title="Previous beat (Shift+←)">−beat</button>
			<button data-a="next" title="Next beat (Shift+→)">+beat</button>
			<span class="ctl-time"><b data-k="time">0.000</b> s · frame <b data-k="frame">0</b> · beat <b data-k="beat">1</b></span>
			<label class="ctl-jump">jump to <input data-k="jump" type="text" inputmode="decimal" placeholder="t (s) or b12" size="9"></label>
			<label>speed <select data-k="speed"><option>0.1</option><option>0.25</option><option>0.5</option><option selected>1</option></select></label>
			<label><input type="checkbox" data-k="loop" checked> loop</label>
			<label><input type="checkbox" data-k="hud"> HUD</label>
			<label><input type="checkbox" data-k="guides"> guides</label>
		</div>
		<div class="ctl-scrub" data-k="scrub">
			<div class="ctl-scenes"></div>
			<div class="ctl-ticks"></div>
			<div class="ctl-cues"></div>
			<div class="ctl-head" data-k="head"></div>
		</div>`
	host.appendChild(root)
	const k = Object.fromEntries([...root.querySelectorAll("[data-k]")].map((el) => [el.dataset.k, el]))
	const pct = (t) => `${(t / DURATION) * 100}%`

	const scenes = root.querySelector(".ctl-scenes")
	SCENES.forEach((scene, i) => {
		const el = document.createElement("div")
		el.className = "ctl-scene"
		el.dataset.alt = String(i % 2)
		el.style.left = pct(scene.from)
		el.style.width = pct(scene.to - scene.from)
		el.textContent = scene.label
		scenes.appendChild(el)
	})
	const ticks = root.querySelector(".ctl-ticks")
	for (let b = 1; b <= grid.beats; b++) {
		const el = document.createElement("div")
		el.className = "ctl-tick"
		el.dataset.down = (b - 1) % grid.beatsPerBar === 0 ? "1" : ""
		el.style.left = pct(grid.beat(b))
		el.title = `Beat ${b}: ${BEATS[b - 1]}`
		el.textContent = (b - 1) % grid.beatsPerBar === 0 ? String(b) : ""
		ticks.appendChild(el)
	}
	const cues = root.querySelector(".ctl-cues")
	CUES.forEach((cue) => {
		const el = document.createElement("div")
		el.className = "ctl-cue"
		el.dataset.kind = cue.kind
		el.style.left = pct(cue.at)
		el.title = `${cue.kind} @ ${cue.at.toFixed(3)} s`
		cues.appendChild(el)
	})

	const state = { t: 0, playing: false, speed: 1, loop: true, startedAt: 0, startT: 0 }
	const params = new URLSearchParams(location.search)
	if (params.has("t")) state.t = Number(params.get("t")) || 0

	const draw = () => {
		const info = seek(state.t)
		k.time.textContent = state.t.toFixed(3)
		k.frame.textContent = String(Math.round(state.t * FPS))
		k.beat.textContent = grid.beatAt(state.t).toFixed(2)
		k.head.style.left = pct(state.t)
		onFrame(info)
	}

	const setTime = (t) => {
		state.t = state.loop ? grid.wrap(t) : Math.min(DURATION, Math.max(0, t))
		if (state.playing) {
			state.startedAt = performance.now()
			state.startT = state.t
		}
		draw()
	}

	const tick = (now) => {
		if (!state.playing) return
		const t = state.startT + ((now - state.startedAt) / 1000) * state.speed
		if (!state.loop && t >= DURATION) {
			state.playing = false
			state.t = DURATION
		} else state.t = grid.wrap(t)
		draw()
		requestAnimationFrame(tick)
	}

	const toggle = () => {
		state.playing = !state.playing
		root.querySelector('[data-a="play"]').textContent = state.playing ? "Pause" : "Play"
		if (state.playing) {
			state.startedAt = performance.now()
			state.startT = state.t
			requestAnimationFrame(tick)
		}
	}

	const step = {
		frame: (d) => setTime(Math.round(state.t * FPS + d) / FPS),
		beat: (d) => setTime(grid.beat(Math.round(grid.beatAt(state.t)) + d)),
		scene: (d) => {
			const i = SCENES.findIndex((s) => state.t >= s.from && state.t < s.to)
			const next = SCENES[(i + d + SCENES.length) % SCENES.length]
			setTime(next.from)
		},
	}

	root.querySelector('[data-a="play"]').onclick = toggle
	root.querySelector('[data-a="prev"]').onclick = () => step.beat(-1)
	root.querySelector('[data-a="next"]').onclick = () => step.beat(1)
	k.speed.onchange = () => {
		state.speed = Number(k.speed.value)
		setTime(state.t)
	}
	k.loop.onchange = () => (state.loop = k.loop.checked)
	k.jump.onkeydown = (event) => {
		if (event.key !== "Enter") return
		const raw = k.jump.value.trim().toLowerCase()
		const t = raw.startsWith("b") ? grid.beat(Number(raw.slice(1))) : Number(raw)
		if (Number.isFinite(t)) setTime(t)
		k.jump.blur()
	}

	const scrub = (event) => {
		const box = k.scrub.getBoundingClientRect()
		setTime(((event.clientX - box.left) / box.width) * DURATION)
	}
	k.scrub.onpointerdown = (event) => {
		k.scrub.setPointerCapture(event.pointerId)
		scrub(event)
		k.scrub.onpointermove = scrub
	}
	k.scrub.onpointerup = () => (k.scrub.onpointermove = null)

	window.addEventListener("keydown", (event) => {
		if (event.target instanceof HTMLInputElement) return
		if (event.code === "Space") {
			event.preventDefault()
			toggle()
		} else if (event.key === "ArrowRight") step[event.shiftKey ? "beat" : "frame"](1)
		else if (event.key === "ArrowLeft") step[event.shiftKey ? "beat" : "frame"](-1)
		else if (event.key === "]") step.scene(1)
		else if (event.key === "[") step.scene(-1)
		else if (event.key === "Home") setTime(0)
		else if (event.key === "d" || event.key === "D") k.hud.click()
		else if (event.key === "g" || event.key === "G") k.guides.click()
		else if (event.key === "l" || event.key === "L") k.loop.click()
	})

	return { root, draw, state, hudToggle: k.hud, guidesToggle: k.guides }
}
