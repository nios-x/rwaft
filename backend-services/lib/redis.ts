import { createClient } from "redis"
export const getRedisClient = async()=>{
    const redisUrl = process.env.REDIS_URL
    if (!redisUrl) {
        throw new Error("REDIS_URL is not configured")
    }
    const redisClient = createClient({ url: redisUrl })
    redisClient.on("error", (error) => {
        console.error("Redis error:", error)
    })
    await redisClient.connect()
    return redisClient;
} 