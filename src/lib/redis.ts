import { createClient } from "redis"
import { config } from "../config"
import { logger } from "./logger"

export const redis = createClient({
  url: config.redis.url,
  password: config.redis.password,
})

redis.on("error", (err) => {
  logger.error({ err }, "Redis client error")
})

redis.on("connect", () => {
  logger.info("Redis client connected")
})

export async function connectRedis() {
  await redis.connect()
}

export async function disconnectRedis() {
  await redis.disconnect()
}

// Cache helper functions
export async function cacheGet<T>(key: string): Promise<T | null> {
  try {
    const data = await redis.get(key)
    return data ? JSON.parse(data) : null
  } catch (error) {
    logger.error({ error, key }, "Cache get error")
    return null
  }
}

export async function cacheSet(key: string, value: any, expirationSeconds?: number): Promise<void> {
  try {
    const data = JSON.stringify(value)
    if (expirationSeconds) {
      await redis.setEx(key, expirationSeconds, data)
    } else {
      await redis.set(key, data)
    }
  } catch (error) {
    logger.error({ error, key }, "Cache set error")
  }
}

export async function cacheDelete(key: string): Promise<void> {
  try {
    await redis.del(key)
  } catch (error) {
    logger.error({ error, key }, "Cache delete error")
  }
}

export async function cacheDeletePattern(pattern: string): Promise<void> {
  try {
    const keys = await redis.keys(pattern)
    if (keys.length > 0) {
      await redis.del(keys)
    }
  } catch (error) {
    logger.error({ error, pattern }, "Cache delete pattern error")
  }
}
