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
