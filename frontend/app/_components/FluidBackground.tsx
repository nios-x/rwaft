"use client"

import { useEffect, useRef } from "react"
import type { Theme } from "../../lib/useTheme"

/**
 * Full-bleed animated fluid field behind the whole app.
 *
 * A port of the "Aura UI" simplex-noise beam shader. The original ran inside
 * an iframe that pulled Tailwind's CDN, Iconify, GSAP and three.js just to draw
 * one full-screen quad; this draws the same fragment shader with raw WebGL, so
 * the page loads no third-party script for its background.
 *
 * Kept cheap on purpose: it renders at half resolution (the field is soft
 * enough that nobody can tell), stops while the tab is hidden, draws a single
 * still frame for reduced-motion users, and falls back to a CSS gradient when
 * WebGL is unavailable.
 */

const VERTEX = `
attribute vec2 position;
void main() {
	gl_Position = vec4(position, 0.0, 1.0);
}
`

const FRAGMENT = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif

uniform float u_time;
uniform vec2 u_resolution;
uniform float u_light;

// Compact 2D simplex noise
vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec2 mod289(vec2 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec3 permute(vec3 x) { return mod289(((x * 34.0) + 1.0) * x); }

float snoise(vec2 v) {
	const vec4 C = vec4(0.211324865405187, 0.366025403784439, -0.577350269189626, 0.024390243902439);
	vec2 i = floor(v + dot(v, C.yy));
	vec2 x0 = v - i + dot(i, C.xx);
	vec2 i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
	vec4 x12 = x0.xyxy + C.xxzz;
	x12.xy -= i1;
	i = mod289(i);
	vec3 p = permute(permute(i.y + vec3(0.0, i1.y, 1.0)) + i.x + vec3(0.0, i1.x, 1.0));
	vec3 m = max(0.5 - vec3(dot(x0, x0), dot(x12.xy, x12.xy), dot(x12.zw, x12.zw)), 0.0);
	m = m * m;
	m = m * m;
	vec3 x = 2.0 * fract(p * C.www) - 1.0;
	vec3 h = abs(x) - 0.5;
	vec3 ox = floor(x + 0.5);
	vec3 a0 = x - ox;
	m *= 1.79284291400159 - 0.85373472095314 * (a0 * a0 + h * h);
	vec3 g;
	g.x = a0.x * x0.x + h.x * x0.y;
	g.yz = a0.yz * x12.xz + h.yz * x12.yw;
	return 130.0 * dot(m, g);
}

void main() {
	vec2 uv = gl_FragCoord.xy / u_resolution.xy;
	uv.x *= u_resolution.x / u_resolution.y;

	vec2 st = uv * 0.7;
	st += vec2(snoise(st + u_time * 0.05), snoise(st - u_time * 0.05)) * 0.3;

	float beam = smoothstep(0.1, 0.8, snoise(vec2(st.x + st.y * 1.5 - u_time * 0.15, u_time * 0.02)));
	float tint = snoise(uv * 1.5 + u_time * 0.1) * 0.5 + 0.5;

	// Dark: the original beams of blue-violet light on near-black.
	vec3 darkBase = vec3(0.012, 0.012, 0.02);
	vec3 darkGlow = mix(vec3(0.15, 0.25, 0.85), vec3(0.4, 0.2, 0.9), tint);
	vec3 dark = darkBase + darkGlow * beam * 0.7;

	// Light: the same beams as deep violet washes on white, capped so the
	// secondary text colour (--text-2) still clears 4.5:1 at the beam's peak.
	vec3 lightBase = vec3(0.98, 0.98, 0.985);
	vec3 lightGlow = mix(vec3(0.42, 0.46, 0.96), vec3(0.58, 0.36, 0.95), tint);
	vec3 light = mix(lightBase, lightGlow, beam * 0.68);

	gl_FragColor = vec4(mix(dark, light, u_light), 1.0);
}
`

/** The field is soft; drawing it at half resolution is invisible and a quarter of the work. */
const RENDER_SCALE = 0.5

function compile(gl: WebGLRenderingContext, type: number, source: string): WebGLShader | null {
	const shader = gl.createShader(type)
	if (!shader) return null
	gl.shaderSource(shader, source)
	gl.compileShader(shader)
	if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
		console.warn("[background] Shader failed to compile:", gl.getShaderInfoLog(shader))
		gl.deleteShader(shader)
		return null
	}
	return shader
}

export function FluidBackground({ theme }: { theme: Theme }) {
	const canvas = useRef<HTMLCanvasElement>(null)
	const lightTarget = useRef(theme === "light" ? 1 : 0)
	const redraw = useRef<(() => void) | null>(null)

	// The render loop reads the target; a still (reduced-motion) frame needs a nudge.
	useEffect(() => {
		lightTarget.current = theme === "light" ? 1 : 0
		redraw.current?.()
	}, [theme])

	useEffect(() => {
		const node = canvas.current
		if (!node) return
		const gl = node.getContext("webgl", { alpha: false, antialias: false, depth: false, powerPreference: "low-power" })
		if (!gl) {
			node.dataset.fallback = "true"
			return
		}

		const vertex = compile(gl, gl.VERTEX_SHADER, VERTEX)
		const fragment = compile(gl, gl.FRAGMENT_SHADER, FRAGMENT)
		const program = gl.createProgram()
		if (!vertex || !fragment || !program) {
			node.dataset.fallback = "true"
			return
		}
		gl.attachShader(program, vertex)
		gl.attachShader(program, fragment)
		gl.linkProgram(program)
		if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
			node.dataset.fallback = "true"
			return
		}
		gl.useProgram(program)

		// One full-screen quad, as two triangles.
		const buffer = gl.createBuffer()
		gl.bindBuffer(gl.ARRAY_BUFFER, buffer)
		gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]), gl.STATIC_DRAW)
		const position = gl.getAttribLocation(program, "position")
		gl.enableVertexAttribArray(position)
		gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0)

		const uTime = gl.getUniformLocation(program, "u_time")
		const uResolution = gl.getUniformLocation(program, "u_resolution")
		const uLight = gl.getUniformLocation(program, "u_light")

		const resize = () => {
			const ratio = Math.min(window.devicePixelRatio || 1, 2) * RENDER_SCALE
			node.width = Math.max(1, Math.round(window.innerWidth * ratio))
			node.height = Math.max(1, Math.round(window.innerHeight * ratio))
			gl.viewport(0, 0, node.width, node.height)
			gl.uniform2f(uResolution, node.width, node.height)
		}
		resize()

		const reduced = window.matchMedia("(prefers-reduced-motion: reduce)")
		const start = performance.now()
		let light = lightTarget.current
		let frame = 0

		const draw = (seconds: number) => {
			gl.uniform1f(uTime, seconds)
			gl.uniform1f(uLight, light)
			gl.drawArrays(gl.TRIANGLES, 0, 6)
		}

		const tick = () => {
			frame = 0
			// Ease toward the theme instead of snapping, so a toggle cross-fades.
			light += (lightTarget.current - light) * 0.08
			draw((performance.now() - start) / 1_000)
			schedule()
		}
		const schedule = () => {
			if (!frame && !reduced.matches && !document.hidden) frame = requestAnimationFrame(tick)
		}
		const still = () => {
			light = lightTarget.current
			draw(12)
		}

		redraw.current = () => (reduced.matches ? still() : schedule())
		const onResize = () => {
			resize()
			if (reduced.matches) still()
		}
		const onVisibility = () => {
			if (!document.hidden) schedule()
		}
		const onMotion = () => (reduced.matches ? still() : schedule())

		if (reduced.matches) still()
		else schedule()

		window.addEventListener("resize", onResize)
		document.addEventListener("visibilitychange", onVisibility)
		reduced.addEventListener("change", onMotion)

		return () => {
			if (frame) cancelAnimationFrame(frame)
			redraw.current = null
			window.removeEventListener("resize", onResize)
			document.removeEventListener("visibilitychange", onVisibility)
			reduced.removeEventListener("change", onMotion)
			gl.deleteBuffer(buffer)
			gl.deleteProgram(program)
			gl.deleteShader(vertex)
			gl.deleteShader(fragment)
		}
	}, [])

	return (
		<div className="backdrop" aria-hidden="true">
			<canvas ref={canvas} className="backdrop-canvas" />
			<div className="backdrop-grain" />
			<div className="backdrop-lines" />
		</div>
	)
}
