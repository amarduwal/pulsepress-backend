import { logger } from "../../lib/logger"

/**
 * Analyze if RSS content is full article or just a snippet
 */
export function isFullContent(content: string, title: string): boolean {
  if (!content) return false

  // Remove HTML tags for analysis
  const plainText = content.replace(/<[^>]*>/g, " ").trim()
  const wordCount = plainText.split(/\s+/).length

  // Heuristics to determine if content is full
  const indicators = {
    minWordCount: wordCount >= 250, // Full articles usually have 250+ words
    minCharCount: plainText.length >= 1000, // And 1000+ characters
    hasMultipleParagraphs: (content.match(/<p>/gi) || []).length >= 3,
    hasReadMore: /read more|continue reading|full story|view more/i.test(content),
    endsAbruptly: /\.\.\.|…$/.test(plainText.trim()),
  }

  // If it says "read more", it's definitely a snippet
  if (indicators.hasReadMore || indicators.endsAbruptly) {
    logger.debug({ title, wordCount, reason: "read_more_or_ellipsis" }, "Detected snippet")
    return false
  }

  // If it's long enough and has structure, likely full content
  if (indicators.minWordCount && indicators.minCharCount) {
    logger.debug({ title, wordCount, charCount: plainText.length }, "Detected full content")
    return true
  }

  logger.debug({ title, wordCount, charCount: plainText.length }, "Detected snippet")
  return false
}

/**
 * Extract text statistics for logging
 */
export function getContentStats(content: string): {
  wordCount: number
  charCount: number
  paragraphs: number
  hasImages: boolean
} {
  const plainText = content.replace(/<[^>]*>/g, " ").trim()
  const wordCount = plainText.split(/\s+/).filter(w => w.length > 0).length
  const paragraphs = (content.match(/<p>/gi) || []).length
  const hasImages = /<img/i.test(content)

  return {
    wordCount,
    charCount: plainText.length,
    paragraphs,
    hasImages,
  }
}

/**
 * Check if content needs scraping
 */
export function needsScraping(
  content: string,
  sourceType: string,
  title: string
): boolean {
  // If source explicitly says it's snippet-only
  if (sourceType === "rss-scrape") {
    return true
  }

  // If source says it's full content, trust it (unless proven otherwise)
  if (sourceType === "rss-full") {
    const isFull = isFullContent(content, title)
    if (!isFull) {
      logger.warn({ title, sourceType }, "Source marked as full-content but content looks like snippet")
      return true
    }
    return false
  }

  // Auto-detect for unmarked sources
  return !isFullContent(content, title)
}
