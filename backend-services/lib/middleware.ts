export const corsmiddlewares = (req: any, res: any, next: any) => {
    const configuredOrigins = (process.env.FRONTEND_ORIGIN || "http://localhost:3001")
        .split(",")
        .map((o: string) => o.trim())
    const reqOrigin = req.headers.origin

    if (configuredOrigins.includes("*") || (reqOrigin && configuredOrigins.includes(reqOrigin))) {
        res.setHeader("Access-Control-Allow-Origin", reqOrigin || "*")
        res.setHeader("Vary", "Origin")
    } else if (configuredOrigins.length === 1 && configuredOrigins[0] !== "*") {
        res.setHeader("Access-Control-Allow-Origin", configuredOrigins[0])
    }

    res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS")
    res.setHeader("Access-Control-Allow-Headers", "Content-Type,Authorization")

    if (req.method === "OPTIONS") {
        res.sendStatus(204)
        return
    }
    next()
}