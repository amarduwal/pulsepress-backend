import { Queue, QueueEvents } from "bullmq"
import { logger } from "../lib/logger"

const connection = {
  host: process.env.REDIS_URL?.includes("://")
    ? new URL(process.env.REDIS_URL).hostname
    : (process.env.REDIS_URL || "localhost"),
  port: process.env.REDIS_URL?.includes(":")
    ? parseInt(new URL(process.env.REDIS_URL).port || "6379")
    : 6379,
}

// Define queues
export const fetchQueue = new Queue("fetch-articles", { connection })
export const processQueue = new Queue("process-articles", { connection })
export const publishQueue = new Queue("publish-articles", { connection })

// Queue events for monitoring
const fetchEvents = new QueueEvents("fetch-articles", { connection })
const processEvents = new QueueEvents("process-articles", { connection })
const publishEvents = new QueueEvents("publish-articles", { connection })

fetchEvents.on("completed", ({ jobId }) => {
  logger.info({ jobId }, "Fetch job completed")
})

fetchEvents.on("failed", ({ jobId, failedReason }) => {
  logger.error({ jobId, failedReason }, "Fetch job failed")
})

processEvents.on("completed", ({ jobId }) => {
  logger.info({ jobId }, "Process job completed")
})

processEvents.on("failed", ({ jobId, failedReason }) => {
  logger.error({ jobId, failedReason }, "Process job failed")
})

publishEvents.on("completed", ({ jobId }) => {
  logger.info({ jobId }, "Publish job completed")
})

publishEvents.on("failed", ({ jobId, failedReason }) => {
  logger.error({ jobId, failedReason }, "Publish job failed")
})

export async function addFetchJob(sourceId: string) {
  await fetchQueue.add("fetch", { sourceId }, { attempts: 3, backoff: { type: "exponential", delay: 5000 } })
}

export async function addProcessJob(articleData: any) {
  await processQueue.add("process", articleData, { attempts: 2, backoff: { type: "exponential", delay: 10000 } })
}

export async function addPublishJob(articleId: string) {
  await publishQueue.add("publish", { articleId }, { attempts: 1 })
}
