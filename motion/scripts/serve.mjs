#!/usr/bin/env node
/** Serves the film for the browser preview: node scripts/serve.mjs [port] */
import { startServer } from "./lib/server.mjs"

const port = Number(process.argv[2] ?? process.env.PORT ?? 4173)
const { url } = await startServer(port)
console.log(`rwaft films preview: ${url}`)
console.log(`  product overview: ${url}/overview.html   launch loop: ${url}/index.html`)
console.log(`  add ?debug=1 for the HUD, ?t=10.2 to jump to a time`)
