export const corsmiddlewares = (req:any, res:any, next:any) => {
    const frontendOrigin = process.env.FRONTEND_ORIGIN || "http://localhost:5173"
    if (req.headers.origin === frontendOrigin) {
        res.setHeader("Access-Control-Allow-Origin", frontendOrigin)
        res.setHeader("Vary", "Origin")
    }
    res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS")
    res.setHeader("Access-Control-Allow-Headers", "Content-Type")

    if (req.method === "OPTIONS") {
        res.sendStatus(204)
        return
    }
    next()
}