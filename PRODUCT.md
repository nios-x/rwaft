# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Non-technical makers. They describe an app in plain words and want a live URL they can share; they do not know or care what Vite, npm or a bundler is. Deploying a public React repository is a secondary path, mostly used by developers.

## Product Purpose

rwaft turns a plain-language prompt (or a public React repo) into a deployed website. An AI writes the app, the platform installs, builds and repairs it, and the result is hosted at its own URL. Success is a maker going from idea to a link they can open and share, without leaving the page.

## Positioning

The pipeline is not hidden. Where other prompt-to-app tools show a spinner, rwaft streams the real build as it happens: dependency installs, each AI iteration, bundler output, and the repairs it makes when a build fails, then hands over the URL. Watching the real work is the product's proof.

## Operating Context

- Builds take minutes, not seconds. The maker waits and watches.
- Builds run one at a time per worker. When someone else's build is running, a new job waits in a shared line and should show its place in it.
- With `PROD=true`, building requires a Google account and costs tokens (deploy and prompt have separate costs; new accounts get a signup grant). Failed builds are refunded. With `PROD=false` everything is free and anonymous use works.
- Tokens are bought in packs through a hosted checkout. Stripe is implemented today; Dodo Payments is the planned provider.

## Capabilities and Constraints

- Prompt flow scaffolds Vite + React + TypeScript; repo flow supports Vite and Create React App projects from GitHub, GitLab or Bitbucket.
- Per-hour rate limits on both build types.
- Live log over Server-Sent Events, with history replay on reconnect.
- Frontend is Next.js on Vercel; API and worker run in Docker (Render).

## Brand Commitments

- Name is lowercase "rwaft".
- The existing logo mark (three log lines resolving into one live endpoint dot) expresses the product's argument.

## Evidence on Hand

No testimonials, customer logos, usage numbers or benchmarks exist. None may be invented.

## Product Principles

1. Show the real work. The live build is the proof; never replace it with a spinner or a fake progress bar.
2. Plain words first. The maker should never need to know build-tool vocabulary to understand what is happening or what went wrong.
3. Honest about cost and waiting. Token cost, balance, refunds and place in line are always visible before and during a build.
4. Density over emptiness. This is a working tool with real state on screen, not one input floating in a void.
