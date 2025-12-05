import { query } from "../../db/client"
import { logger } from "../../lib/logger"
import crypto from "crypto"

function normalizeUrl(url: string): string {
  try {
    const parsed = new URL(url)
    // Remove query parameters and fragments
    return `${parsed.protocol}//${parsed.host}${parsed.pathname}`.toLowerCase()
  } catch {
    return url.toLowerCase()
  }
}

function generateContentHash(content: string): string {
  return crypto.createHash("md5").update(content.toLowerCase().trim()).digest("hex")
}

export async function isDuplicate(sourceUrl: string, title: string, content: string): Promise<boolean> {
  try {
    const normalizedUrl = normalizeUrl(sourceUrl)

    // Check by URL
    const urlResult = await query("SELECT id FROM articles WHERE source_url = $1", [normalizedUrl])

    if (urlResult.rows.length > 0) {
      logger.debug({ sourceUrl }, "Duplicate found by URL")
      return true
    }

    // Check by title similarity (exact match)
    const titleResult = await query("SELECT id FROM articles WHERE LOWER(title) = LOWER($1)", [title])

    if (titleResult.rows.length > 0) {
      logger.debug({ title }, "Duplicate found by title")
      return true
    }

    // Check by content hash (for very similar content)
    const contentHash = generateContentHash(content)
    const hashResult = await query(
      `SELECT id FROM articles 
       WHERE MD5(LOWER(TRIM(COALESCE(content_original, '')))) = $1`,
      [contentHash],
    )

    if (hashResult.rows.length > 0) {
      logger.debug({ contentHash }, "Duplicate found by content hash")
      return true
    }

    return false
  } catch (error) {
    logger.error({ error }, "Error checking for duplicates")
    return false
  }
}

export async function findSimilarArticles(title: string, limit = 5): Promise<any[]> {
  try {
    // Use trigram similarity to find similar articles
    const result = await query(
      `SELECT id, title, slug, similarity(title, $1) as sim
       FROM articles
       WHERE status = 'published'
         AND similarity(title, $1) > 0.3
       ORDER BY sim DESC
       LIMIT $2`,
      [title, limit],
    )

    return result.rows
  } catch (error) {
    logger.error({ error }, "Error finding similar articles")
    return []
  }
}
