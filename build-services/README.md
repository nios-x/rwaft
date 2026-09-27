# builder-worker

Consumes deployment IDs from the Redis queue `rwaft:deploy`, downloads the
repository files from Cloudinary, and runs `npm install` followed by
`npm run build`. Projects and their generated `dist` folders are saved under
`builds/<deployment-id>`.

Set `REDIS_URL` before starting the worker:

```powershell
$env:REDIS_URL="redis://localhost:6379"
$env:CLOUDINARY_CLOUD_NAME="your-cloud-name"
$env:CLOUDINARY_API_KEY="your-api-key"
$env:CLOUDINARY_API_SECRET="your-api-secret"
```

## Prompt pipeline

A prompt job runs in three stages, all inside `lib/ai.ts`:

1. **Plan** — `planApplication` makes one tool-free call that turns the user's
   request into a product brief (views, testable features, data + seed records,
   palette and fonts, copy). The brief is logged to the user's build console and
   prepended to the generation prompt. If it fails, generation uses the raw prompt.
2. **Generate** — `generateToolCalls` applies every file operation to disk as it
   arrives, so the model's `read_file`, searches and `npm run build` see its own
   work, and a failed patch comes back as an error it can retry.
3. **Verify** — when the model stops calling tools, the worker runs the real
   normalize → install → build → undefined-identifier check and sends any failure
   back into the same conversation (up to 3 rounds). Once it builds, an advisory
   scan (`findPlaceholderIssues` in `lib/validate.ts`) flags lorem ipsum, dead
   `href="#"` links, no-op handlers, `alert()`, dead image hosts, `BrowserRouter`
   and root-absolute URLs, and asks for one polish pass.

The old cold-start repair loop in `index.ts` still runs after this as a fallback.

Tunables: `AI_MAX_ITERATIONS` (default 40), `AI_TIMEOUT_MS` (default 120000),
`JOB_TIMEOUT_MS` (default 20 minutes). The model matters more than any of this:
`OPENROUTER_MODEL` / `AI_MODEL` pick it, and OpenRouter is tried first.

## Skills

`skills/*.md` hold instruction blocks that get appended to the AI's system
prompt. They are plain markdown with YAML frontmatter; the frontmatter is
stripped before the body is sent to the model, so it is there for readers, not
for the AI.

A pass opts in by name:

```ts
await generateToolCalls(prompt, projectDir, { skills: ["frontend-design"] })
```

The prompt worker attaches `frontend-design` and `tailwind-design-system` to
the first generation pass. Repair passes attach none — design guidance is
tokens a build-error fix has no use for, and every iteration resends the whole
system prompt.

Adding a skill is just dropping a file in `skills/` and naming it in that
array; nothing else needs to change. A skill that cannot be read logs a warning
and the build continues without it.

Edit them freely, but keep them honest about the scaffold: each one ends with a
section describing what is actually installed and which files are off limits.
Guidance that contradicts the scaffold costs a build.
To install dependencies:

```bash
bun install
```

To run:

```bash
bun run index.ts
```

This project was created using `bun init` in bun v1.3.14. [Bun](https://bun.com) is a fast all-in-one JavaScript runtime.
