import express from "express"
import { fetchQueue, processQueue, publishQueue } from "../jobs/queues"
import { logger } from "../lib/logger"
import { redis } from "../lib/redis"

const router = express.Router()

// Queue statistics dashboard
router.get("/dashboard", async (req, res) => {
  try {
    const [fetchCounts, processCounts, publishCounts] = await Promise.all([
      fetchQueue.getJobCounts(),
      processQueue.getJobCounts(),
      publishQueue.getJobCounts(),
    ])

    const [fetchWaiting, processWaiting, publishWaiting] = await Promise.all([
      fetchQueue.getWaiting(),
      processQueue.getWaiting(),
      publishQueue.getWaiting(),
    ])

    const [fetchActive, processActive, publishActive] = await Promise.all([
      fetchQueue.getActive(),
      processQueue.getActive(),
      publishQueue.getActive(),
    ])

    const [fetchCompleted, processCompleted, publishCompleted] = await Promise.all([
      fetchQueue.getCompleted(),
      processQueue.getCompleted(),
      publishQueue.getCompleted(),
    ])

    const [fetchFailed, processFailed, publishFailed] = await Promise.all([
      fetchQueue.getFailed(),
      processQueue.getFailed(),
      publishQueue.getFailed(),
    ])

    res.json({
      timestamp: new Date().toISOString(),
      queues: {
        fetch: {
          counts: fetchCounts,
          waiting: fetchWaiting.length,
          active: fetchActive.length,
          completed: fetchCompleted.length,
          failed: fetchFailed.length,
          waitingJobs: fetchWaiting.slice(0, 5).map(j => ({ id: j.id, data: j.data })),
          activeJobs: fetchActive.slice(0, 5).map(j => ({ id: j.id, data: j.data })),
        },
        process: {
          counts: processCounts,
          waiting: processWaiting.length,
          active: processActive.length,
          completed: processCompleted.length,
          failed: processFailed.length,
          waitingJobs: processWaiting.slice(0, 5).map(j => ({ id: j.id, data: j.data })),
          activeJobs: processActive.slice(0, 5).map(j => ({ id: j.id, data: j.data })),
        },
        publish: {
          counts: publishCounts,
          waiting: publishWaiting.length,
          active: publishActive.length,
          completed: publishCompleted.length,
          failed: publishFailed.length,
          waitingJobs: publishWaiting.slice(0, 5).map(j => ({ id: j.id, data: j.data })),
          activeJobs: publishActive.slice(0, 5).map(j => ({ id: j.id, data: j.data })),
        },
      },
    })
  } catch (error: any) {
    logger.error({ error }, "Failed to get queue dashboard")
    res.status(500).json({ error: error.message })
  }
})

// Get failed jobs
router.get("/failed/:queue", async (req, res) => {
  try {
    const { queue } = req.params
    let targetQueue

    switch (queue) {
      case "fetch":
        targetQueue = fetchQueue
        break
      case "process":
        targetQueue = processQueue
        break
      case "publish":
        targetQueue = publishQueue
        break
      default:
        return res.status(400).json({ error: "Invalid queue name" })
    }

    const failed = await targetQueue.getFailed()

    const failedDetails = await Promise.all(
      failed.slice(0, 20).map(async (job) => ({
        id: job.id,
        data: job.data,
        failedReason: job.failedReason,
        stacktrace: job.stacktrace,
        attemptsMade: job.attemptsMade,
        timestamp: job.timestamp,
      }))
    )

    res.json({ queue, count: failed.length, jobs: failedDetails })
  } catch (error: any) {
    logger.error({ error }, "Failed to get failed jobs")
    res.status(500).json({ error: error.message })
  }
})

// Retry failed job
router.post("/retry/:queue/:jobId", async (req, res) => {
  try {
    const { queue, jobId } = req.params
    let targetQueue

    switch (queue) {
      case "fetch":
        targetQueue = fetchQueue
        break
      case "process":
        targetQueue = processQueue
        break
      case "publish":
        targetQueue = publishQueue
        break
      default:
        return res.status(400).json({ error: "Invalid queue name" })
    }

    const job = await targetQueue.getJob(jobId)

    if (!job) {
      return res.status(404).json({ error: "Job not found" })
    }

    await job.retry()
    logger.info({ queue, jobId }, "Job retried")

    res.json({ success: true, message: "Job retried", jobId })
  } catch (error: any) {
    logger.error({ error }, "Failed to retry job")
    res.status(500).json({ error: error.message })
  }
})

// Clean old jobs
router.post("/clean/:queue", async (req, res) => {
  try {
    const { queue } = req.params
    const { status = "completed", grace = 3600000 } = req.body // 1 hour default

    let targetQueue

    switch (queue) {
      case "fetch":
        targetQueue = fetchQueue
        break
      case "process":
        targetQueue = processQueue
        break
      case "publish":
        targetQueue = publishQueue
        break
      default:
        return res.status(400).json({ error: "Invalid queue name" })
    }

    const cleaned = await targetQueue.clean(grace, 100, status)
    logger.info({ queue, status, count: cleaned.length }, "Cleaned jobs")

    res.json({ success: true, cleaned: cleaned.length })
  } catch (error: any) {
    logger.error({ error }, "Failed to clean jobs")
    res.status(500).json({ error: error.message })
  }
})

// Get job details
router.get("/job/:queue/:jobId", async (req, res) => {
  try {
    const { queue, jobId } = req.params
    let targetQueue

    switch (queue) {
      case "fetch":
        targetQueue = fetchQueue
        break
      case "process":
        targetQueue = processQueue
        break
      case "publish":
        targetQueue = publishQueue
        break
      default:
        return res.status(400).json({ error: "Invalid queue name" })
    }

    const job = await targetQueue.getJob(jobId)

    if (!job) {
      return res.status(404).json({ error: "Job not found" })
    }

    const state = await job.getState()

    res.json({
      id: job.id,
      name: job.name,
      data: job.data,
      progress: job.progress,
      attemptsMade: job.attemptsMade,
      failedReason: job.failedReason,
      stacktrace: job.stacktrace,
      returnvalue: job.returnvalue,
      finishedOn: job.finishedOn,
      processedOn: job.processedOn,
      timestamp: job.timestamp,
      state,
    })
  } catch (error: any) {
    logger.error({ error }, "Failed to get job details")
    res.status(500).json({ error: error.message })
  }
})

// Check Redis connection
router.get("/redis-status", async (req, res) => {
  try {
    const pong = await redis.ping()
    const info = await redis.info()

    res.json({
      connected: pong === "PONG",
      info: info.split("\n").slice(0, 20).join("\n"),
    })
  } catch (error: any) {
    res.status(500).json({ error: error.message, connected: false })
  }
})

// Get all Redis keys (for debugging)
router.get("/redis-keys", async (req, res) => {
  try {
    const keys = await redis.keys("bull:*")
    const grouped: Record<string, number> = {}

    keys.forEach(key => {
      const prefix = key.split(":")[1]
      grouped[prefix] = (grouped[prefix] || 0) + 1
    })

    res.json({
      total: keys.length,
      grouped,
      sample: keys.slice(0, 20),
    })
  } catch (error: any) {
    logger.error({ error }, "Failed to get Redis keys")
    res.status(500).json({ error: error.message })
  }
})

// Pause/Resume queue
router.post("/pause/:queue", async (req, res) => {
  try {
    const { queue } = req.params
    let targetQueue

    switch (queue) {
      case "fetch":
        targetQueue = fetchQueue
        break
      case "process":
        targetQueue = processQueue
        break
      case "publish":
        targetQueue = publishQueue
        break
      default:
        return res.status(400).json({ error: "Invalid queue name" })
    }

    await targetQueue.pause()
    logger.info({ queue }, "Queue paused")

    res.json({ success: true, message: "Queue paused" })
  } catch (error: any) {
    logger.error({ error }, "Failed to pause queue")
    res.status(500).json({ error: error.message })
  }
})

router.post("/resume/:queue", async (req, res) => {
  try {
    const { queue } = req.params
    let targetQueue

    switch (queue) {
      case "fetch":
        targetQueue = fetchQueue
        break
      case "process":
        targetQueue = processQueue
        break
      case "publish":
        targetQueue = publishQueue
        break
      default:
        return res.status(400).json({ error: "Invalid queue name" })
    }

    await targetQueue.resume()
    logger.info({ queue }, "Queue resumed")

    res.json({ success: true, message: "Queue resumed" })
  } catch (error: any) {
    logger.error({ error }, "Failed to resume queue")
    res.status(500).json({ error: error.message })
  }
})

export default router
