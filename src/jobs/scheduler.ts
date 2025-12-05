import { query } from "../db/client"
import { logger } from "../lib/logger"
import { addFetchJob } from "./queues"

export async function scheduleFetchJobs() {
  try {
    logger.info("🔄 Scheduler running - fetching 5 random sources")

    // Get 5 random active sources
    const result = await query(
      `SELECT id, name, base_url, type
       FROM news_sources
       WHERE is_active = true
       ORDER BY RANDOM()
       LIMIT 5`
    )

    const sources = result.rows

    if (sources.length === 0) {
      logger.warn("⚠️ No active sources found")
      return
    }

    logger.info({
      count: sources.length,
      sources: sources.map(s => ({ id: s.id, name: s.name }))
    }, "📋 Selected random sources for fetching")

    // Queue fetch job for each source (will create exactly 5 jobs)
    let queued = 0
    for (const source of sources) {
      try {
        await addFetchJob(source.id)
        queued++
        logger.info({
          sourceId: source.id,
          sourceName: source.name,
          queued: `${queued}/5`
        }, "➕ Added fetch job to queue")
      } catch (error: any) {
        logger.error({ error: error.message, sourceId: source.id },
          "❌ Failed to add fetch job")
      }
    }

    logger.info({ queued }, `✅ Scheduled ${queued} fetch jobs (target: 5, max articles: 5)`)
  } catch (error) {
    logger.error({ error }, "❌ Failed to schedule fetch jobs")
  }
}

// Run scheduler at specified interval
export function startScheduler() {
  logger.info("🚀 Starting job scheduler")

  // Run immediately on startup
  scheduleFetchJobs()

  // Then run every 30 minutes (adjust as needed)
  const intervalMinutes = parseInt(process.env.SCHEDULER_INTERVAL_MINUTES || "30")
  const intervalMs = intervalMinutes * 60 * 1000

  logger.info({ intervalMinutes }, `⏰ Scheduler will run every ${intervalMinutes} minutes`)

  setInterval(scheduleFetchJobs, intervalMs)
}
