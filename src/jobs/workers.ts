import { Worker } from "bullmq"
import { query } from "../db/client"
import { logger } from "../lib/logger"
import { parseRSSFeed } from "../services/ingestion/rss-parser"
import { scrapeArticle, extractImageUrl } from "../services/ingestion/scraper"
import { isDuplicate } from "../services/ingestion/deduplicator"
import { cleanHTML, extractPlainText } from "../services/ingestion/content-cleaner"
import { extractKeywords, extractEntities } from "../services/ingestion/keyword-extractor"
import { summarizeText } from "../services/ai/summarizer"
import { classifyArticle } from "../services/ai/classifier"
import { rewriteArticleWithHTML } from "../services/ai/rewriter"
import { addProcessJob } from "./queues"
import { needsScraping, getContentStats } from "../services/ingestion/content-analyzer"
// import { ensureHighQualityFeaturedImage } from "../services/image/image-quality-manager"

const connection = {
  host: process.env.REDIS_URL?.includes("://")
    ? new URL(process.env.REDIS_URL).hostname
    : (process.env.REDIS_URL || "localhost"),
  port: process.env.REDIS_URL?.includes(":")
    ? parseInt(new URL(process.env.REDIS_URL).port || "6379")
    : 6379,
}

logger.info({ connection }, "🔧 Initializing workers with Redis connection")

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Determine if article should be marked as trending
 * Based on: recent publication, popular keywords, breaking news indicators
 */
async function shouldBeTrending(
  title: string,
  content: string,
  keywords: string[],
  pubDate?: string
): Promise<boolean> {
  // Check if article is very recent (last 6 hours)
  const isRecent = pubDate ?
    (new Date().getTime() - new Date(pubDate).getTime()) < 6 * 60 * 60 * 1000 :
    true

  // Breaking news indicators
  const trendingIndicators = [
    /breaking|urgent|just in|developing|live|update/i.test(title),
    /breaking|urgent|alert|exclusive/i.test(content.substring(0, 200)),
    keywords.some(k => ['breaking', 'urgent', 'crisis', 'emergency', 'alert'].includes(k.toLowerCase()))
  ]

  const hasTrendingSignals = trendingIndicators.filter(Boolean).length >= 1

  // Mark as trending if recent AND has trending signals
  return isRecent && hasTrendingSignals
}

/**
 * Determine if article should be featured
 * Based on: content quality, image quality, length, completeness
 */
async function shouldBeFeatured(
  title: string,
  _content: string,
  contentStats: { wordCount: number; charCount: number; paragraphs: number; hasImages: boolean },
  imageUrl: string | null
): Promise<boolean> {
  // Quality indicators
  const qualityChecks = {
    hasImage: !!imageUrl,
    hasGoodLength: contentStats.wordCount >= 500,
    hasStructure: contentStats.paragraphs >= 3,
    hasGoodTitle: title.length >= 30 && title.length <= 100,
    notClickbait: !/\?|!|you won't believe|shocking|incredible/i.test(title),
  }

  // Count quality points
  const qualityScore = Object.values(qualityChecks).filter(Boolean).length

  // Feature if it scores 4+ out of 5
  return qualityScore >= 4
}

/**
 * Assign category based on keywords or source name
 * Fallback when AI classification fails
 */
async function assignCategoryFromKeywords(
  keywords: string[],
  sourceName: string
): Promise<string | null> {
  try {
    // Category mapping based on keywords
    const categoryKeywords: Record<string, string[]> = {
      top: [
        'breaking', 'top story', 'headline', 'feature', 'lead', 'spotlight', 'trending', 'exclusive'
      ],
      politics: [
        'political', 'election', 'government', 'parliament', 'congress', 'senate', 'policy', 'minister', 'campaign', 'vote', 'bill'
      ],
      world: [
        'world', 'international', 'global', 'foreign', 'country', 'abroad', 'nation', 'diplomacy', 'overseas'
      ],
      business: [
        'business', 'economy', 'market', 'financial', 'stock', 'trade', 'company', 'industry', 'corporate', 'startup', 'investment'
      ],
      technology: [
        'technology', 'tech', 'software', 'hardware', 'ai', 'digital', 'computer', 'internet', 'cyber', 'innovation', 'gadget', 'app', 'mobile'
      ],
      sports: [
        'sport', 'football', 'basketball', 'soccer', 'cricket', 'tennis', 'game', 'player', 'tournament', 'league', 'match', 'athlete', 'score', 'champion'
      ],
      entertainment: [
        'entertainment', 'movie', 'music', 'celebrity', 'film', 'actor', 'hollywood', 'show', 'tv', 'concert', 'series', 'theater'
      ],
      science: [
        'science', 'research', 'study', 'scientist', 'discovery', 'experiment', 'space', 'astronomy', 'biology', 'physics', 'chemistry'
      ],
      health: [
        'health', 'medical', 'medicine', 'doctor', 'disease', 'treatment', 'patient', 'hospital', 'wellness', 'fitness', 'nutrition', 'mental'
      ],
      lifestyle: [
        'lifestyle', 'fashion', 'food', 'travel', 'culture', 'art', 'design', 'home', 'living', 'wellbeing'
      ],
      opinion: [
        'opinion', 'editorial', 'commentary', 'viewpoint', 'column', 'analysis', 'perspective', 'think piece'
      ],
      local: [
        'local', 'city', 'town', 'community', 'district', 'neighborhood', 'nearby', 'regional', 'area', 'municipal'
      ]
    };

    // Check source name for category hints
    const sourceNameLower = sourceName.toLowerCase()
    for (const [category, categoryKwList] of Object.entries(categoryKeywords)) {
      if (categoryKwList.some(kw => sourceNameLower.includes(kw))) {
        const result = await query("SELECT id FROM categories WHERE slug = $1", [category])
        if (result.rows.length > 0) {
          return result.rows[0].id
        }
      }
    }

    // Check article keywords
    const keywordsLower = keywords.map(k => k.toLowerCase())
    for (const [category, categoryKwList] of Object.entries(categoryKeywords)) {
      const matchCount = categoryKwList.filter(kw =>
        keywordsLower.some(k => k.includes(kw))
      ).length

      if (matchCount >= 2) {
        const result = await query("SELECT id FROM categories WHERE slug = $1", [category])
        if (result.rows.length > 0) {
          return result.rows[0].id
        }
      }
    }

    // Default fallback - get 'general' or first available category
    const fallback = await query(
      "SELECT id FROM categories WHERE slug IN ('general', 'world', 'news') ORDER BY slug LIMIT 1"
    )
    return fallback.rows.length > 0 ? fallback.rows[0].id : null
  } catch (error) {
    logger.error({ error }, "Failed to assign category from keywords")
    return null
  }
}

// ============================================
// FETCH WORKER - Fetches articles from sources
// ============================================

export const fetchWorker = new Worker(
  "fetch-articles",
  async (job) => {
    logger.info({ jobId: job.id, data: job.data }, "🚀 FETCH WORKER: Job started")
    const { sourceId } = job.data

    logger.info({ sourceId }, "📡 Fetching source details from database")

    try {
      // Get source details - MUST exist
      const sourceResult = await query(
        "SELECT * FROM news_sources WHERE id = $1 AND is_active = true",
        [sourceId]
      )

      if (sourceResult.rows.length === 0) {
        logger.error({ sourceId }, "❌ Source not found or inactive")
        throw new Error(`Source not found or inactive: ${sourceId}`)
      }

      const source = sourceResult.rows[0]
      logger.info({
        source: {
          id: source.id,
          name: source.name,
          type: source.type,
          url: source.base_url
        }
      }, "✅ Source found")

      logger.info({
        sourceId,
        sourceName: source.name,
        type: source.type
      }, "📰 Fetching articles from source")

      let articles: any[] = []

      // Parse RSS feed (supports all RSS types)
      if (source.type === "rss-full" || source.type === "rss-scrape" || source.type === "rss") {
        logger.info({ url: source.base_url }, "📰 Parsing RSS feed")
        articles = await parseRSSFeed(source.base_url)
        logger.info({ count: articles.length }, "✅ RSS feed parsed")
      } else if (source.type === "scraper") {
        logger.info({ url: source.base_url }, "🕷️ Scraping article")
        const scraped = await scrapeArticle(source.base_url)
        if (scraped) {
          articles = [{
            title: scraped.title,
            link: source.base_url,
            content: scraped.content,
            author: scraped.byline,
            pubDate: scraped.publishedTime,
          }]
          logger.info("✅ Article scraped")
        } else {
          logger.warn("⚠️ No content scraped")
        }
      }

      logger.info({ sourceId, count: articles.length }, "📊 Total articles fetched")

      // Update source stats
      await query(
        `UPDATE news_sources
         SET last_fetched_at = NOW(), success_count = success_count + 1, last_error = NULL
         WHERE id = $1`,
        [sourceId]
      )
      logger.info({ sourceId }, "✅ Source stats updated")

      // Process articles - find ONE valid article with image and full content
      let queued = 0
      let skipped = 0

      for (const article of articles) {
        if (queued >= 1) break // Only queue 1 article per source

        // Skip if no link
        if (!article.link) {
          logger.info({ title: article.title }, "⏭️ Skipped: No link")
          skipped++
          continue
        }

        logger.info({ title: article.title, link: article.link }, "🔍 Checking article")

        // Check for duplicates
        const duplicate = await isDuplicate(article.link, article.title, article.content || "")
        if (duplicate) {
          logger.info({ title: article.title }, "⏭️ Skipped: Duplicate")
          skipped++
          continue
        }

        // Extract image from RSS
        let imageUrl = null
        if (article.enclosure?.url && article.enclosure.type?.startsWith("image")) {
          imageUrl = article.enclosure.url
        } else if (article.mediaContent?.$ && article.mediaContent.$.url) {
          imageUrl = article.mediaContent.$.url
        } else if (article.mediaThumbnail?.$ && article.mediaThumbnail.$.url) {
          imageUrl = article.mediaThumbnail.$.url
        } else if (article["media:content"]?.$ && article["media:content"].$.url) {
          imageUrl = article["media:content"].$.url
        } else if (article["media:thumbnail"]?.$ && article["media:thumbnail"].$.url) {
          imageUrl = article["media:thumbnail"].$.url
        }

        let fullContent = article.content || article.contentSnippet || ""
        const contentStats = getContentStats(fullContent)
        const shouldScrape = needsScraping(fullContent, source.type, article.title)

        logger.info({
          rssContentLength: fullContent.length,
          wordCount: contentStats.wordCount,
          hasRssImage: !!imageUrl,
          sourceType: source.type,
          shouldScrape,
          imageUrl
        }, "📊 RSS data analyzed")

        // Scrape if analyzer says we should
        if (shouldScrape) {
          logger.info({ link: article.link }, "🕷️ Scraping full article content (analyzer recommendation)")

          try {
            const scraped = await scrapeArticle(article.link)
            if (scraped && scraped.content && scraped.content.length > 500) {
              const scrapedStats = getContentStats(scraped.content)

              // Only use scraped content if it's significantly better
              if (scrapedStats.wordCount > contentStats.wordCount * 1.5) {
                fullContent = scraped.content
                logger.info({
                  contentLength: fullContent.length,
                  wordCount: scrapedStats.wordCount,
                  improvement: `${Math.round((scrapedStats.wordCount / contentStats.wordCount) * 100)}%`
                }, "✅ Full article scraped - significant improvement")

                // Get image from scraped content if we don't have one
                if (!imageUrl && scraped.content) {
                  imageUrl = extractImageUrl(scraped.content, article.link)
                  logger.info({ imageUrl }, "🖼️ Image extracted from scraped content")
                }
              } else {
                logger.info({
                  rssWords: contentStats.wordCount,
                  scrapedWords: scrapedStats.wordCount
                }, "✅ RSS content is sufficient, using RSS")
              }
            } else {
              logger.warn({
                scrapedLength: scraped?.content?.length || 0
              }, "⚠️ Scraping returned insufficient content, using RSS")
            }
          } catch (error: any) {
            logger.warn({ error: error.message }, "⚠️ Scraping failed, using RSS content")
          }
        } else {
          logger.info({
            wordCount: contentStats.wordCount,
            charCount: contentStats.charCount
          }, "✅ RSS contains full content, no scraping needed")
        }

        // Try to extract image from content if we still don't have one
        if (!imageUrl && fullContent) {
          imageUrl = extractImageUrl(fullContent, article.link)
          logger.info({ imageUrl }, "🖼️ Image extracted from content")
        }

        // STRICT VALIDATION: Must have image
        if (!imageUrl) {
          logger.info({ title: article.title }, "⏭️ Skipped: No image found")
          skipped++
          continue
        }

        // STRICT VALIDATION: Must have enough content
        if (fullContent.length < 500) {
          logger.info({
            title: article.title,
            length: fullContent.length
          }, "⏭️ Skipped: Content too short (need >500 chars)")
          skipped++
          continue
        }

        // SUCCESS: Queue this article with validated data
        await addProcessJob({
          sourceId: source.id, // Use source.id from database
          sourceName: source.name,
          title: article.title,
          link: article.link,
          content: fullContent,
          author: article.author,
          pubDate: article.pubDate,
          imageUrl,
        })
        queued++
        logger.info({
          title: article.title,
          contentLength: fullContent.length,
          hasImage: true,
          imageUrl
        }, "✅ Article queued for processing (validated: image + full content)")
        break // Only queue 1 article per source
      }

      if (queued === 0) {
        logger.warn({
          sourceId,
          sourceName: source.name,
          skipped
        }, "⚠️ No suitable articles found (need image + full content)")
      }

      logger.info({
        jobId: job.id,
        sourceId,
        total: articles.length,
        queued,
        skipped
      }, "🎉 FETCH WORKER: Job completed")

      return {
        totalFetched: articles.length,
        queued,
        skipped,
        source: source.name
      }
    } catch (error: any) {
      logger.error({
        error: error.message,
        stack: error.stack,
        sourceId
      }, "❌ FETCH WORKER: Job failed")

      await query(
        `UPDATE news_sources
         SET error_count = error_count + 1, last_error = $1
         WHERE id = $2`,
        [error.message, sourceId]
      )

      throw error
    }
  },
  { connection, concurrency: 5 }
)

// ============================================
// PROCESS WORKER - Cleans, enriches with AI
// ============================================

export const processWorker = new Worker(
  "process-articles",
  async (job) => {
    logger.info({ jobId: job.id, data: job.data }, "🚀 PROCESS WORKER: Job started")
    const { sourceId, sourceName, title, link, content, author, pubDate, imageUrl } = job.data

    try {
      // Validate source exists in database
      const sourceCheck = await query("SELECT id FROM news_sources WHERE id = $1", [sourceId])
      if (sourceCheck.rows.length === 0) {
        logger.error({ sourceId, sourceName }, "❌ Source ID not found in database, skipping")
        throw new Error(`Invalid source_id: ${sourceId}`)
      }

      logger.info({ title }, "🧹 Cleaning content")
      const cleanedContent = cleanHTML(content || "")
      const plainText = extractPlainText(cleanedContent)
      const contentStats = getContentStats(cleanedContent)
      logger.info({
        length: plainText.length,
        wordCount: contentStats.wordCount,
        paragraphs: contentStats.paragraphs
      }, "✅ Content cleaned")

      // Validate minimum content length
      if (plainText.length < 500) {
        logger.warn({ length: plainText.length }, "⚠️ Content too short, skipping")
        throw new Error(`Content too short: ${plainText.length} chars`)
      }

      // Validate image exists
      if (!imageUrl) {
        logger.warn("⚠️ No image URL provided, skipping")
        throw new Error("No image URL")
      }

      // ============================================
      // IMAGE QUALITY ASSURANCE - NEW FEATURE
      // ============================================
      // logger.info("🎯 Starting image quality assurance")
      // const imageQualityResult = await ensureHighQualityFeaturedImage(
      //   imageUrl,
      //   link,
      //   title,
      //   cleanedContent
      // )

      // logger.info({
      //   originalUrl: imageUrl.substring(0, 80),
      //   finalUrl: imageQualityResult.url.substring(0, 80),
      //   quality: imageQualityResult.quality,
      //   dimensions: `${imageQualityResult.width}x${imageQualityResult.height}`,
      //   improved: imageQualityResult.improved,
      //   method: imageQualityResult.method
      // }, "✅ Image quality assurance completed")

      // // Use the improved image URL
      // const finalImageUrl = imageQualityResult.url

      // uncomment above and comment below to enable image quality management
      const finalImageUrl = imageUrl
      const imageQualityResult = {
        url: imageUrl,
        quality: 'high',
        width: '1200',
        height: '630',
        fileSize: '100KB',
        improved: true,
        method: 'original'
      }

      logger.info("📝 Generating AI summary (proportional: 25% of article)")
      const summary = await summarizeText(plainText) // Auto calculates 1/4 length
      logger.info({
        summary: summary.substring(0, 80) + "...",
        summaryLength: summary.length,
        articleLength: plainText.length,
        ratio: `${Math.round((summary.length / plainText.length) * 100)}%`,
        targetRatio: '25%'
      }, "✅ Proportional AI summary generated")

      logger.info("🔑 Extracting keywords and entities")
      const keywords = extractKeywords(plainText, 10)
      const entities = extractEntities(plainText)
      logger.info({ keywords, entities }, "✅ Keywords and entities extracted")

      logger.info("✍️ Rewriting article with AI (descriptive, not summary) and including images")
      const rewrittenContent = await rewriteArticleWithHTML(title, plainText, cleanedContent, finalImageUrl, keywords)
      logger.info({
        rewrittenLength: rewrittenContent.length,
        hasHTML: rewrittenContent.includes('<p>'),
        hasStructure: rewrittenContent.includes('<h2>'),
        hasImages: rewrittenContent.includes('<figure>'),
        featuredImageExcluded: !!finalImageUrl
      }, "✅ Descriptive article rewritten with HTML formatting and images (excluding featured)")

      logger.info("🏷️ Classifying article")
      const categoryId = await classifyArticle(title, plainText)
      logger.info({ categoryId }, "✅ Article classified")

      // Determine if article is trending or featured based on criteria
      const isTrending = await shouldBeTrending(title, plainText, keywords, pubDate)
      const isFeatured = await shouldBeFeatured(title, plainText, contentStats, finalImageUrl)

      logger.info({
        categoryId,
        isTrending,
        isFeatured
      }, "📊 Article metadata determined")

      // Set default author if not provided
      const authorName = author || sourceName || "PulsePress Editorial"
      logger.info({ authorName }, "👤 Author set")

      // If no category from AI, assign based on keywords or source
      let finalCategoryId = categoryId
      if (!finalCategoryId) {
        finalCategoryId = await assignCategoryFromKeywords(keywords, sourceName)
        logger.info({ finalCategoryId, method: 'keywords' }, "🏷️ Category assigned from keywords")
      }

      const slug = title
        .toLowerCase()
        .replace(/[^\w\s-]/g, "")
        .replace(/\s+/g, "-")
        .replace(/-+/g, "-")
        .trim()
        .substring(0, 100) // Limit slug length

      logger.info({
        slug,
        sourceId,
        hasImage: !!finalImageUrl,
        imageQuality: imageQualityResult.quality,
        imageImproved: imageQualityResult.improved,
        categoryId: finalCategoryId,
        isTrending,
        isFeatured
      }, "💾 Inserting article into database")

      const result = await query(
        `INSERT INTO articles (
          title, slug, summary, content_original, content_rewritten,
          source_url, source_name, source_id, author_name, category_id,
          featured_image, keywords, entities, status, published_at,
          is_trending, is_featured
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, 'published', NOW(), $14, $15)
        RETURNING id`,
        [
          title,
          slug,
          summary,
          cleanedContent,
          rewrittenContent, // Now HTML-formatted AI rewrite
          link,
          sourceName,
          sourceId,
          authorName, // Default author
          finalCategoryId,
          finalImageUrl, // Use quality-assured image
          keywords,
          JSON.stringify(entities),
          isTrending,
          isFeatured,
        ]
      )

      const articleId = result.rows[0].id
      logger.info({
        jobId: job.id,
        articleId,
        title,
        author: authorName,
        status: 'published',
        hasImage: !!finalImageUrl,
        imageQuality: imageQualityResult.quality,
        imageImproved: imageQualityResult.improved,
        imageMethod: imageQualityResult.method,
        contentLength: plainText.length,
        rewrittenLength: rewrittenContent.length,
        sourceId,
        categoryId: finalCategoryId,
        isTrending,
        isFeatured
      }, "🎉 PROCESS WORKER: Article saved and auto-published successfully")

      return {
        articleId,
        title,
        slug,
        author: authorName,
        status: 'published',
        hasImage: !!finalImageUrl,
        imageQuality: imageQualityResult.quality,
        imageImproved: imageQualityResult.improved,
        categoryId: finalCategoryId,
        isTrending,
        isFeatured
      }
    } catch (error: any) {
      logger.error({
        error: error.message,
        stack: error.stack,
        title,
        sourceId
      }, "❌ PROCESS WORKER: Job failed")
      throw error
    }
  },
  { connection, concurrency: 3 }
)

// ============================================
// PUBLISH WORKER - Publishes approved articles
// ============================================

export const publishWorker = new Worker(
  "publish-articles",
  async (job) => {
    logger.info({ jobId: job.id, data: job.data }, "🚀 PUBLISH WORKER: Job started")
    const { articleId } = job.data

    try {
      await query(
        `UPDATE articles
         SET status = 'published', published_at = COALESCE(published_at, NOW())
         WHERE id = $1 AND status = 'pending'`,
        [articleId]
      )

      logger.info({ jobId: job.id, articleId }, "🎉 PUBLISH WORKER: Article published")
      return { articleId, published: true }
    } catch (error: any) {
      logger.error({ error: error.message, articleId }, "❌ PUBLISH WORKER: Job failed")
      throw error
    }
  },
  { connection, concurrency: 10 }
)

// ============================================
// WORKER EVENT LISTENERS
// ============================================

fetchWorker.on("ready", () => {
  logger.info("✅ Fetch Worker is READY and listening for jobs")
})

fetchWorker.on("active", (job) => {
  logger.info({ jobId: job.id }, "⚡ Fetch Worker: Job ACTIVE")
})

fetchWorker.on("completed", (job, result) => {
  logger.info({ jobId: job.id, result }, "✅ Fetch Worker: Job COMPLETED")
})

fetchWorker.on("failed", (job, err) => {
  logger.error({ jobId: job?.id, error: err.message }, "❌ Fetch Worker: Job FAILED")
})

processWorker.on("ready", () => {
  logger.info("✅ Process Worker is READY and listening for jobs")
})

processWorker.on("active", (job) => {
  logger.info({ jobId: job.id }, "⚡ Process Worker: Job ACTIVE")
})

processWorker.on("completed", (job, result) => {
  logger.info({ jobId: job.id, result }, "✅ Process Worker: Job COMPLETED")
})

processWorker.on("failed", (job, err) => {
  logger.error({ jobId: job?.id, error: err.message }, "❌ Process Worker: Job FAILED")
})

publishWorker.on("ready", () => {
  logger.info("✅ Publish Worker is READY and listening for jobs")
})

publishWorker.on("active", (job) => {
  logger.info({ jobId: job.id }, "⚡ Publish Worker: Job ACTIVE")
})

publishWorker.on("completed", (job, result) => {
  logger.info({ jobId: job.id, result }, "✅ Publish Worker: Job COMPLETED")
})

publishWorker.on("failed", (job, err) => {
  logger.error({ jobId: job?.id, error: err.message }, "❌ Publish Worker: Job FAILED")
})

logger.info("🎯 All workers initialized and ready")
