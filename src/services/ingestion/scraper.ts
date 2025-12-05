import axios from "axios"
import * as cheerio from "cheerio"
import { Readability } from "@mozilla/readability"
import { JSDOM } from "jsdom"
import { logger } from "../../lib/logger"

export interface ScrapedArticle {
  title: string
  content: string
  excerpt: string
  byline?: string
  siteName?: string
  publishedTime?: string
}

export async function scrapeArticle(url: string): Promise<ScrapedArticle | null> {
  try {
    logger.info({ url }, "🕷️ Scraping article")

    // Fetch the page with better headers
    const response = await axios.get(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.5",
        "Accept-Encoding": "gzip, deflate, br",
        "Connection": "keep-alive",
        "Upgrade-Insecure-Requests": "1",
        "Cache-Control": "max-age=0",
      },
      timeout: 15000,
      maxRedirects: 5,
      validateStatus: (status) => status < 500, // Accept redirects
    })

    if (response.status !== 200) {
      logger.warn({ url, status: response.status }, "Non-200 status code")
      return null
    }

    const html = response.data

    // Parse with Readability
    const dom = new JSDOM(html, { url })
    const reader = new Readability(dom.window.document, {
      charThreshold: 200, // Lower threshold for better content extraction
    })
    const article = reader.parse()

    if (!article || !article.content) {
      logger.warn({ url }, "Readability failed to parse article")
      return null
    }

    // Extract additional metadata with Cheerio
    const $ = cheerio.load(html)
    const publishedTime =
      $('meta[property="article:published_time"]').attr("content") ||
      $('meta[name="publish-date"]').attr("content") ||
      $('meta[property="og:published_time"]').attr("content") ||
      $("time[datetime]").attr("datetime") ||
      $('meta[name="date"]').attr("content")

    // Clean up content - remove scripts, styles, etc.
    const cleanContent = article.content
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "")
      .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, "")
      .replace(/<!--[\s\S]*?-->/g, "")

    logger.info({
      url,
      title: article.title,
      contentLength: cleanContent.length,
      hasExcerpt: !!article.excerpt
    }, "✅ Article scraped successfully")

    return {
      title: article.title,
      content: cleanContent,
      excerpt: article.excerpt || article.textContent?.substring(0, 200) || "",
      byline: article.byline,
      siteName: article.siteName,
      publishedTime,
    }
  } catch (error: any) {
    if (error.response) {
      logger.error({
        url,
        status: error.response.status,
        statusText: error.response.statusText
      }, "HTTP error while scraping")
    } else if (error.code === "ECONNABORTED") {
      logger.error({ url }, "Scraping timeout")
    } else {
      logger.error({ url, error: error.message }, "Failed to scrape article")
    }
    return null
  }
}

export function extractImageUrl(html: string, baseUrl: string): string | null {
  try {
    const $ = cheerio.load(html)

    // Priority 1: Open Graph image (usually high quality)
    let imageUrl =
      $('meta[property="og:image"]').attr("content") ||
      $('meta[property="og:image:url"]').attr("content") ||
      $('meta[property="og:image:secure_url"]').attr("content")

    if (imageUrl && isHighQualityImage(imageUrl)) {
      return makeAbsoluteUrl(imageUrl, baseUrl)
    }

    // Priority 2: Twitter Card image (usually high quality)
    imageUrl =
      $('meta[name="twitter:image"]').attr("content") ||
      $('meta[name="twitter:image:src"]').attr("content") ||
      $('meta[property="twitter:image"]').attr("content")

    if (imageUrl && isHighQualityImage(imageUrl)) {
      return makeAbsoluteUrl(imageUrl, baseUrl)
    }

    // Priority 3: Article image tag
    imageUrl = $('meta[itemprop="image"]').attr("content")

    if (imageUrl && isHighQualityImage(imageUrl)) {
      return makeAbsoluteUrl(imageUrl, baseUrl)
    }

    // Priority 4: Link rel image
    imageUrl = $('link[rel="image_src"]').attr("href")

    if (imageUrl && isHighQualityImage(imageUrl)) {
      return makeAbsoluteUrl(imageUrl, baseUrl)
    }

    // Priority 5: Find largest image in article content
    const articleImages: Array<{ url: string; size: number }> = []

    $("article img, .article img, #article img, .content img, .entry-content img, .post-content img, main img").each((i, elem) => {
      const src = $(elem).attr("src") || $(elem).attr("data-src") || $(elem).attr("data-lazy-src")
      const width = parseInt($(elem).attr("width") || "0")
      const height = parseInt($(elem).attr("height") || "0")

      if (src && !isExcludedImage(src)) {
        // Estimate size (width * height, or default to URL-based heuristics)
        let estimatedSize = width * height

        // If no dimensions, estimate from URL
        if (estimatedSize === 0) {
          if (/\d{3,4}x\d{3,4}/.test(src) || /w=\d{3,4}/.test(src)) {
            const match = src.match(/(\d{3,4})/)
            estimatedSize = match ? parseInt(match[1]) * parseInt(match[1]) : 1000
          } else {
            estimatedSize = 1000 // Default medium size
          }
        }

        articleImages.push({ url: src, size: estimatedSize })
      }
    })

    // Sort by size and get largest
    if (articleImages.length > 0) {
      articleImages.sort((a, b) => b.size - a.size)
      const largestImage = articleImages[0]

      // Only use if it's reasonably large (at least 300x300 equivalent)
      if (largestImage.size >= 90000) {
        return makeAbsoluteUrl(largestImage.url, baseUrl)
      }
    }

    // Priority 6: Any img in document (last resort)
    const anyImages: Array<{ url: string; size: number }> = []

    $("img").each((i, elem) => {
      const src = $(elem).attr("src") || $(elem).attr("data-src")
      const width = parseInt($(elem).attr("width") || "0")
      const height = parseInt($(elem).attr("height") || "0")

      if (src && !isExcludedImage(src)) {
        anyImages.push({
          url: src,
          size: width * height || guessImageSize(src)
        })
      }
    })

    if (anyImages.length > 0) {
      anyImages.sort((a, b) => b.size - a.size)
      const bestImage = anyImages[0]

      // Only use if decent quality
      if (bestImage.size >= 90000) {
        return makeAbsoluteUrl(bestImage.url, baseUrl)
      }
    }

    return null
  } catch (error) {
    logger.error({ error, baseUrl }, "Failed to extract image URL")
    return null
  }
}

/**
 * Check if image URL indicates high quality
 */
function isHighQualityImage(url: string): boolean {
  const lowQualityIndicators = [
    /thumb/i,
    /thumbnail/i,
    /small/i,
    /tiny/i,
    /icon/i,
    /avatar/i,
    /logo/i,
    /favicon/i,
    /sprite/i,
    /\d{1,2}x\d{1,2}/, // Very small dimensions like 16x16
    /w=\d{1,2}[^\d]/, // Width less than 100
    /h=\d{1,2}[^\d]/, // Height less than 100
  ]

  return !lowQualityIndicators.some(pattern => pattern.test(url))
}

/**
 * Check if image should be excluded
 */
function isExcludedImage(url: string): boolean {
  const excludePatterns = [
    /logo/i,
    /icon/i,
    /favicon/i,
    /avatar/i,
    /gravatar/i,
    /emoji/i,
    /badge/i,
    /button/i,
    /banner/i,
    /ad[_-]/i,
    /sponsor/i,
    /tracking/i,
    /pixel/i,
    /1x1/i,
    /\.gif$/i, // Usually small animated gifs
  ]

  return excludePatterns.some(pattern => pattern.test(url))
}

/**
 * Guess image size from URL patterns
 */
function guessImageSize(url: string): number {
  // Look for dimension hints in URL
  const dimensionMatch = url.match(/(\d{3,4})x(\d{3,4})/)
  if (dimensionMatch) {
    return parseInt(dimensionMatch[1]) * parseInt(dimensionMatch[2])
  }

  const widthMatch = url.match(/w=(\d{3,4})/)
  if (widthMatch) {
    const width = parseInt(widthMatch[1])
    return width * width // Assume square
  }

  // Check for quality indicators
  if (/large|big|full|original|hd|high/i.test(url)) {
    return 500000 // High estimate
  }

  if (/medium|med/i.test(url)) {
    return 200000 // Medium estimate
  }

  return 100000 // Default estimate
}

/**
 * Make URL absolute
 */
function makeAbsoluteUrl(url: string, baseUrl: string): string {
  try {
    return new URL(url, baseUrl).href
  } catch {
    return url
  }
}
