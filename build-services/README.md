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

To install dependencies:

```bash
bun install
```

To run:

```bash
bun run index.ts
```

This project was created using `bun init` in bun v1.3.14. [Bun](https://bun.com) is a fast all-in-one JavaScript runtime.
