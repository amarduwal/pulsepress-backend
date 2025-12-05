import express from "express"
import { addFetchJob, addProcessJob, addPublishJob } from "../jobs/queues"
import { logger } from "../lib/logger"
import { query } from "../db/client"

const router = express.Router()

// Trigger fetch for a specific source
router.post("/fetch/:sourceId", async (req, res) => {
  try {
    const { sourceId } = req.params
    await addFetchJob(sourceId)
    logger.info({ sourceId }, "Fetch job queued")
    res.json({ success: true, message: "Fetch job queued", sourceId })
  } catch (error: any) {
    logger.error({ error }, "Failed to queue fetch job")
    res.status(500).json({ error: error.message })
  }
})

// Trigger fetch for all active sources
router.post("/fetch-all", async (req, res) => {
  try {
    const result = await query("SELECT id FROM news_sources WHERE is_active = true")

    for (const source of result.rows) {
      await addFetchJob(source.id)
    }

    logger.info({ count: result.rows.length }, "Queued fetch jobs for all sources")
    res.json({
      success: true,
      message: "Fetch jobs queued",
      count: result.rows.length
    })
  } catch (error: any) {
    logger.error({ error }, "Failed to queue fetch jobs")
    res.status(500).json({ error: error.message })
  }
})

// Manually add a test article to process
router.post("/process-test", async (req, res) => {
  try {
    const testArticle = {
      sourceId: "test-source",
      sourceName: "Test Source",
      title: "Test Article",
      link: "https://example.com/test-article",
      content: "<p>This is test content for the article processing pipeline.</p>",
      author: "Test Author",
      pubDate: new Date().toISOString(),
    }

    await addProcessJob(testArticle)

    logger.info("Test article queued for processing")
    res.json({ success: true, message: "Test article queued", data: testArticle })
  } catch (error: any) {
    logger.error({ error }, "Failed to queue test article")
    res.status(500).json({ error: error.message })
  }
})

// Get queue stats
router.get("/queue-stats", async (req, res) => {
  try {
    const { fetchQueue, processQueue, publishQueue } = await import("../jobs/queues")

    const [fetchCounts, processCounts, publishCounts] = await Promise.all([
      fetchQueue.getJobCounts(),
      processQueue.getJobCounts(),
      publishQueue.getJobCounts(),
    ])

    res.json({
      fetch: fetchCounts,
      process: processCounts,
      publish: publishCounts,
    })
  } catch (error: any) {
    logger.error({ error }, "Failed to get queue stats")
    res.status(500).json({ error: error.message })
  }
})

// Clear all jobs and start fresh
router.post("/clear-all-jobs", async (req, res) => {
  try {
    const { fetchQueue, processQueue, publishQueue } = await import("../jobs/queues")

    // Drain all queues (remove all jobs)
    await Promise.all([
      fetchQueue.drain(),
      processQueue.drain(),
      publishQueue.drain(),
    ])

    // Clean failed jobs
    await Promise.all([
      fetchQueue.clean(0, 1000, "failed"),
      processQueue.clean(0, 1000, "failed"),
      publishQueue.clean(0, 1000, "failed"),
    ])

    // Clean completed jobs
    await Promise.all([
      fetchQueue.clean(0, 1000, "completed"),
      processQueue.clean(0, 1000, "completed"),
      publishQueue.clean(0, 1000, "completed"),
    ])

    logger.info("All jobs cleared from queues")

    res.json({
      success: true,
      message: "All jobs cleared from all queues"
    })
  } catch (error: any) {
    logger.error({ error }, "Failed to clear jobs")
    res.status(500).json({ error: error.message })
  }
})

export default router
