import express from "express"
import helmet from "helmet"
import cors from "cors"
import compression from "compression"
import cookieParser from "cookie-parser"
import pinoHttp from "pino-http"
import { config } from "./config"
import { logger } from "./lib/logger"
import { connectRedis } from "./lib/redis"
import { generalLimiter } from "./middleware/rate-limit"
import { errorHandler, notFoundHandler } from "./middleware/error"

// Import routes
import authRoutes from "./routes/auth"
import userRoutes from "./routes/users"
import articleRoutes from "./routes/articles"
import categoryRoutes from "./routes/categories"
import commentRoutes from "./routes/comments"
import bookmarkRoutes from "./routes/bookmarks"
import searchRoutes from "./routes/search"
import analyticsRoutes from "./routes/analytics"
import sourceRoutes from "./routes/sources"
import monitorRoutes from "./routes/monitor"
import testRoutes from "./routes/test"

// Import workers and scheduler
import { fetchWorker, processWorker, publishWorker } from "./jobs/workers"
import { startScheduler } from "./jobs/scheduler"

const app = express()

// Security middleware
app.use(helmet())
app.use(
  cors({
    origin: config.cors.origin,
    credentials: true,
  }),
)

// Body parsing
app.use(express.json({ limit: "10mb" }))
app.use(express.urlencoded({ extended: true, limit: "10mb" }))
app.use(cookieParser())

// Compression
app.use(compression())

// Logging
app.use(pinoHttp({ logger }))

// Rate limiting
app.use(generalLimiter)

// Health check
app.get("/health", (req, res) => {
  res.json({ ok: true, status: "healthy", timestamp: new Date().toISOString() })
})

// API routes
const apiRouter = express.Router()

apiRouter.use("/auth", authRoutes)
apiRouter.use("/users", userRoutes)
apiRouter.use("/articles", articleRoutes)
apiRouter.use("/categories", categoryRoutes)
apiRouter.use("/comments", commentRoutes)
apiRouter.use("/bookmarks", bookmarkRoutes)
apiRouter.use("/search", searchRoutes)
apiRouter.use("/analytics", analyticsRoutes)
apiRouter.use("/sources", sourceRoutes)
apiRouter.use("/monitor", monitorRoutes)
apiRouter.use("/test", testRoutes)

app.use(`/api/${config.apiVersion}`, apiRouter)

// Error handlers
app.use(notFoundHandler)
app.use(errorHandler)

// Start server
async function start() {
  try {
    // Connect to Redis
    logger.info("🔌 Connecting to Redis...")
    await connectRedis()
    logger.info("✅ Connected to Redis")

    // Workers are already initialized by importing them
    logger.info("🎯 Workers initialized and listening")

    // Start job scheduler
    logger.info("🚀 Starting scheduler...")
    startScheduler()

    // Start server
    app.listen(config.port, () => {
      logger.info(`✅ Server running on port ${config.port} in ${config.nodeEnv} mode`)
      logger.info(`📊 Monitor: http://localhost:${config.port}/api/${config.apiVersion}/monitor/dashboard`)
      logger.info(`🧪 Test: http://localhost:${config.port}/api/${config.apiVersion}/test/fetch-all`)
    })
  } catch (error) {
    logger.error({ error }, "❌ Failed to start server")
    process.exit(1)
  }
}

// Handle shutdown
process.on("SIGTERM", async () => {
  logger.info("SIGTERM received, shutting down gracefully")

  // Close workers
  await fetchWorker.close()
  await processWorker.close()
  await publishWorker.close()

  process.exit(0)
})

process.on("SIGINT", async () => {
  logger.info("SIGINT received, shutting down gracefully")

  // Close workers
  await fetchWorker.close()
  await processWorker.close()
  await publishWorker.close()

  process.exit(0)
})

start()
