# backend

To install dependencies:

```bash
bun install
```

To run:

```bash
bun run index.ts
```

This project was created using `bun init` in bun v1.3.14. [Bun](https://bun.com) is a fast all-in-one JavaScript runtime.

Set `DEPLOYMENT_DOMAIN` to the base domain used for deployed sites, such as
`example.com`. The deploy endpoint then returns URLs like
`https://<deployment-id>.example.com/`. For local development, the default is
`localhost:3000`, producing URLs like `http://<deployment-id>.localhost:3000/`.
