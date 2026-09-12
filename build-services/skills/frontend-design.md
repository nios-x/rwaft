---
name: frontend-design
description: Create distinctive, production-grade frontend interfaces with high design quality. Use this skill when the user asks to build web components, pages, artifacts, posters, or applications.
---

This skill guides creation of distinctive, production-grade frontend interfaces that avoid generic "AI slop" aesthetics. Implement real working code with exceptional attention to aesthetic details and creative choices.

## Design Thinking

Before coding, understand the context and commit to a BOLD aesthetic direction:
- **Purpose**: What problem does this interface solve? Who uses it?
- **Tone**: Pick an extreme: brutally minimal, maximalist chaos, retro-futuristic, organic/natural, luxury/refined, playful/toy-like, editorial/magazine, brutalist/raw, art deco/geometric, soft/pastel, industrial/utilitarian, etc.
- **Constraints**: Technical requirements (framework, performance, accessibility).
- **Differentiation**: What makes this UNFORGETTABLE? What's the one thing someone will remember?

**CRITICAL**: Choose a clear conceptual direction and execute it with precision. Bold maximalism and refined minimalism both work - the key is intentionality, not intensity.

## Frontend Aesthetics Guidelines

Focus on:
- **Typography**: Choose fonts that are beautiful, unique, and interesting. Avoid generic fonts like Arial and Inter; opt instead for distinctive choices that elevate the frontend's aesthetics.
- **Color & Theme**: Commit to a cohesive aesthetic. Use CSS variables for consistency. Dominant colors with sharp accents outperform timid, evenly-distributed palettes.
- **Motion**: Use animations for effects and micro-interactions. Focus on high-impact moments: one well-orchestrated page load with staggered reveals creates more delight than scattered micro-interactions.
- **Spatial Composition**: Unexpected layouts. Asymmetry. Overlap. Diagonal flow. Grid-breaking elements. Generous negative space OR controlled density.
- **Backgrounds & Visual Details**: Create atmosphere and depth rather than defaulting to solid colors. Add contextual effects and textures that match the overall aesthetic.

NEVER use generic AI-generated aesthetics like overused font families (Inter, Roboto, Arial, system fonts), cliched color schemes (particularly purple gradients on white backgrounds), predictable layouts and component patterns.

Interpret creatively and make unexpected choices that feel genuinely designed for the context. No design should be the same.

**IMPORTANT**: Match implementation complexity to the aesthetic vision. Maximalist designs need elaborate code with extensive animations and effects. Minimalist or refined designs need restraint, precision, and careful attention to spacing, typography, and subtle details.

## Working inside this pipeline

The guidance above is the goal; these are the hard constraints of the project you are
building in. Where the two collide, the constraint wins — a design that does not build
ships nothing.

- **Tailwind v4 is available and already wired up.** Utilities, plain CSS, or a mix are
  all fine — but keep `@import "tailwindcss";` at the top of `src/index.css` and
  `tailwindcss()` in `vite.config.ts`. Declare the visual language once as tokens in a
  `@theme` block (color, type scale, spacing, radii, shadows, easing) so the aesthetic
  has a single source of truth. See the tailwind-design-system skill for the mechanics.
- **Load fonts from CSS, not HTML.** `index.html` is off limits, so a webfont must come
  from an `@import url("https://fonts.googleapis.com/css2?family=...&display=swap")` in
  `src/index.css`. Every `@import` must precede all other rules, so put the font import
  next to the Tailwind one at the very top, then expose the family as a `--font-*` token
  in `@theme`. Always give the display face a real fallback stack.
- **Relative asset paths.** The build is served from a subpath, so a root-absolute URL
  (`/logo.svg`, `url(/bg.png)`) 404s in production. Reference assets by importing them
  from `src/` or with a relative path.
- **Prefer CSS over dependencies.** Gradients, masks, filters, `clip-path`, blend modes,
  transforms and keyframes carry most of an aesthetic with no install cost. Add an
  animation or UI package only when neither Tailwind nor hand-written CSS can do the job.
- **Motion has an off switch.** Wrap non-essential animation in
  `@media (prefers-reduced-motion: reduce)` and neutralise it there.
- **Small screens are not an afterthought.** Every layout, including the grid-breaking
  ones, must hold together down to ~360px wide with no horizontal overflow.
- **Contrast is part of the aesthetic.** A committed palette still has to clear WCAG AA
  on body text and interactive labels.
- **`npm run build` must pass.** Ambition never justifies a type error, a missing import,
  an unresolved font or an orphan component.
