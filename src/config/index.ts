import dotenv from "dotenv"
import { z } from "zod"

dotenv.config()

const configSchema = z.object({
  nodeEnv: z.enum(["development", "production", "test"]).default("development"),
  port: z.coerce.number().default(5000),
  apiVersion: z.string().default("v1"),

  database: z.object({
    url: z.string(),
    poolMin: z.coerce.number().default(2),
    poolMax: z.coerce.number().default(10),
  }),

  redis: z.object({
    url: z.string(),
    password: z.string().optional(),
  }),

  jwt: z.object({
    secret: z.string().min(32),
    expiresIn: z.string().default("7d"),
    refreshSecret: z.string().min(32),
    refreshExpiresIn: z.string().default("30d"),
  }),

  rateLimit: z.object({
    windowMs: z.coerce.number().default(900000),
    maxRequests: z.coerce.number().default(500),
  }),

  upload: z.object({
    maxSize: z.coerce.number().default(5242880),
    dir: z.string().default("./uploads"),
  }),

  ai: z.object({
    huggingfaceApiKey: z.string().optional(),
    huggingfaceApiUrl: z.string().default("https://api-inference.huggingface.co/models"),
  }),

  ingestion: z.object({
    fetchIntervalMinutes: z.coerce.number().default(30),
    maxArticlesPerFetch: z.coerce.number().default(50),
  }),

  cors: z.object({
    origin: z
      .string()
      .transform((val) => val.split(',').map((s) => s.trim()))
      .default('http://localhost:3000'),
  }),

  logging: z.object({
    level: z.enum(["fatal", "error", "warn", "info", "debug", "trace"]).default("info"),
  }),
})

const rawConfig = {
  nodeEnv: process.env.NODE_ENV,
  port: process.env.PORT,
  apiVersion: process.env.API_VERSION,

  database: {
    url: process.env.DATABASE_URL,
    poolMin: process.env.DB_POOL_MIN,
    poolMax: process.env.DB_POOL_MAX,
  },

  redis: {
    url: process.env.REDIS_URL,
    password: process.env.REDIS_PASSWORD,
  },

  jwt: {
    secret: process.env.JWT_SECRET,
    expiresIn: process.env.JWT_EXPIRES_IN,
    refreshSecret: process.env.JWT_REFRESH_SECRET,
    refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN,
  },

  rateLimit: {
    windowMs: process.env.RATE_LIMIT_WINDOW_MS,
    maxRequests: process.env.RATE_LIMIT_MAX_REQUESTS,
  },

  upload: {
    maxSize: process.env.UPLOAD_MAX_SIZE,
    dir: process.env.UPLOAD_DIR,
  },

  ai: {
    huggingfaceApiKey: process.env.HUGGINGFACE_API_KEY,
    huggingfaceApiUrl: process.env.HUGGINGFACE_API_URL,
  },

  ingestion: {
    fetchIntervalMinutes: process.env.FETCH_INTERVAL_MINUTES,
    maxArticlesPerFetch: process.env.MAX_ARTICLES_PER_FETCH,
  },

  cors: {
    origin: process.env.CORS_ORIGIN,
  },

  logging: {
    level: process.env.LOG_LEVEL,
  },
}

export const config = configSchema.parse(rawConfig)
