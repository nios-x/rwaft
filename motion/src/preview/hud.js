import { worldToScreen } from "../engine/camera.js"
import { FPS } from "../composition/config.js"

/**
 * Debug overlay drawn inside the stage, in screen space. It reads the info
 * seek() returns, so it can be rendered into frames too (`?debug=1`).
 */
export function createHud(stage, view, { grid, BEATS }) {
	const root = document.createElement("div")
	root.className = "hud"
	root.innerHTML = `
		<div class="hud-panel">
			<div class="hud-row"><b data-k="time"></b><span data-k="frame"></span></div>
			<div class="hud-row"><span class="hud-beat" data-k="flash"></span><b data-k="beat"></b><span data-k="bar"></span></div>
			<div class="hud-label" data-k="label"></div>
			<div class="hud-grid">
				<span>scene</span><b data-k="scene"></b>
				<span>camera</span><b data-k="camera"></b>
				<span>cursor</span><b data-k="cursor"></b>
				<span>screen</span><b data-k="screen"></b>
				<span>shell</span><b data-k="shell"></b>
			</div>
		</div>
		<div class="hud-guides">
			<div class="hud-safe"></div>
			<div class="hud-cross-h"></div>
			<div class="hud-cross-v"></div>
			<div class="hud-shell"></div>
		</div>`
	stage.appendChild(root)
	const k = Object.fromEntries([...root.querySelectorAll("[data-k]")].map((el) => [el.dataset.k, el]))
	const shellBox = root.querySelector(".hud-shell")

	return {
		root,
		show(on) {
			root.style.display = on ? "" : "none"
		},
		guides(on) {
			root.querySelector(".hud-guides").style.display = on ? "" : "none"
		},
		update(info) {
			if (!info) return
			const { t, cam, shell, cursor, scene } = info
			if (!shell) shellBox.style.display = "none"
			const pos = grid.position(t)
			const beatNumber = Math.floor(grid.beatAt(t))
			const intoBeat = grid.beatAt(t) - beatNumber
			k.time.textContent = `${t.toFixed(3)} s`
			k.frame.textContent = `frame ${Math.round(t * FPS)}`
			k.beat.textContent = `beat ${beatNumber}`
			k.bar.textContent = `bar ${pos.bar} · ${pos.beat}/4`
			k.label.textContent = BEATS[beatNumber - 1] ?? ""
			k.flash.style.opacity = String(Math.max(0, 1 - intoBeat * 3))
			k.flash.dataset.down = pos.beat === 1 ? "1" : ""
			k.scene.textContent = scene.label
			k.camera.textContent = `${cam.s.toFixed(3)}× @ ${cam.cx.toFixed(0)}, ${cam.cy.toFixed(0)}`
			k.cursor.textContent = `${cursor.world[0].toFixed(1)}, ${cursor.world[1].toFixed(1)}`
			k.screen.textContent = `${cursor.screen[0].toFixed(0)}, ${cursor.screen[1].toFixed(0)}`
			if (!shell) return
			k.shell.textContent = `${shell.w.toFixed(0)} × ${shell.h.toFixed(0)} r${shell.radius.toFixed(1)}`
			const [x0, y0] = worldToScreen(cam, shell.l, shell.t, view)
			const [x1, y1] = worldToScreen(cam, shell.r, shell.b, view)
			Object.assign(shellBox.style, { left: `${x0}px`, top: `${y0}px`, width: `${x1 - x0}px`, height: `${y1 - y0}px` })
		},
	}
}
