const backendUrl = process.env.BACKEND_URL || "http://localhost:3000"
const prompt = process.argv.slice(2).join(" ") || "Create a minimal page with a heading that says OpenRouter fallback test."

const response = await fetch(`${backendUrl}/prompt`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ prompt }),
})

const body = await response.json().catch(() => ({}))
console.log(JSON.stringify({
  endpoint: `${backendUrl}/prompt`,
  statusCode: response.status,
  status: body.status,
  id: body.id,
  queued: response.ok,
}, null, 2))

if (!response.ok) process.exitCode = 1
