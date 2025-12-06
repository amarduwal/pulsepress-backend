import axios from "axios"
import * as cheerio from "cheerio"
import sharp from "sharp"
import { logger } from "../../lib/logger"
import fs from "fs/promises"
import path from "path"
import { query } from "../../db/client"

/**
 * Quality thresholds for featured images
 */
const QUALITY_THRESHOLDS = {
  // Minimum acceptable dimensions
  MIN_WIDTH: 800,
  MIN_HEIGHT: 600,
  MIN_PIXELS: 480000, // 800x600

  // Optimal dimensions for social sharing and display
  OPTIMAL_WIDTH: 1200,
  OPTIMAL_HEIGHT: 630,
  OPTIMAL_PIXELS: 756000, // 1200x630

  // File size indicators
  MIN_FILE_SIZE: 50000, // 50KB
  OPTIMAL_FILE_SIZE: 150000, // 150KB

  // Quality indicators
  LOW_QUALITY_KEYWORDS: ['thumb', 'thumbnail', 'small', 'tiny', 'preview', 'icon', '150x', '200x', '300x'],
  HIGH_QUALITY_KEYWORDS: ['large', 'full', 'original', 'hd', 'high', '1200', '1920', 'hero', 'featured']
}

/**
 * Feature flags for controlling behavior
 */
const FEATURE_FLAGS = {
  // Set to false to only use URL alternatives (no enhancement/storage)
  ENABLE_AI_ENHANCEMENT: false,
  ENABLE_IMAGE_STORAGE: false,

  // Set to true to search web for replacement images
  ENABLE_WEB_IMAGE_SEARCH: true,

  // Fallback to stock images if no good alternatives found
  ENABLE_STOCK_IMAGE_FALLBACK: false
}

export interface ImageQualityResult {
  url: string
  quality: 'high' | 'medium' | 'low'
  width: number
  height: number
  fileSize: number
  improved: boolean
  method: 'original' | 'alternative' | 'web-search' | 'enhanced' | 'stock-fallback'
}

/**
 * Main function: Ensure high-quality featured image
 * NOW: Only uses URL alternatives and web search (no storage/enhancement by default)
 */
export async function ensureHighQualityFeaturedImage(
  imageUrl: string,
  articleUrl: string,
  articleTitle: string,
  articleContent: string
): Promise<ImageQualityResult> {
  try {
    logger.info({ imageUrl: imageUrl.substring(0, 80) }, "🎯 Starting image quality assurance")

    // Step 1: Validate current image
    const isCurrentValid = await isValidAndAccessibleImage(imageUrl)
    if (!isCurrentValid) {
      logger.warn({ imageUrl }, "⚠️ Current image URL is not accessible")
    }

    // Step 2: Analyze if valid
    let currentQuality
    if (isCurrentValid) {
      currentQuality = await analyzeImageQuality(imageUrl)
      logger.info({
        quality: currentQuality.quality,
        dimensions: `${currentQuality.width}x${currentQuality.height}`,
        fileSize: `${Math.round(currentQuality.fileSize / 1024)}KB`
      }, "📊 Current image quality analyzed")

      if (currentQuality.quality === 'high') {
        logger.info("✅ Image is already high quality")
        return {
          ...currentQuality,
          improved: false,
          method: 'original'
        }
      }
    } else {
      currentQuality = guessQualityFromUrl(imageUrl)
      currentQuality.quality = 'low'
    }

    // Step 3: Find alternatives
    logger.info("🔍 Searching for alternatives...")
    const alternatives = await findBetterImageAlternatives(
      imageUrl,
      articleUrl,
      // articleTitle,
      articleContent
    )

    for (const altUrl of alternatives) {
      try {
        if (await isValidAndAccessibleImage(altUrl)) {
          const altQuality = await analyzeImageQuality(altUrl)
          logger.info({
            alternativeUrl: altUrl.substring(0, 80),
            quality: altQuality.quality,
            dimensions: `${altQuality.width}x${altQuality.height}`
          }, "🔍 Alternative analyzed")

          if (altQuality.quality === 'high' ||
            (altQuality.quality === 'medium' && currentQuality.quality === 'low')) {
            logger.info("✅ Found better alternative")
            return {
              ...altQuality,
              improved: true,
              method: 'alternative'
            }
          }
        }
      } catch (error: any) {
        logger.warn({ altUrl, error: error.message }, "Alternative check failed")
        continue
      }
    }

    // Step 4: Web search
    if (FEATURE_FLAGS.ENABLE_WEB_IMAGE_SEARCH) {
      logger.info("🌐 Searching web...")
      const webImages = await searchWebForQualityImage(articleTitle, articleContent, articleUrl)

      for (const webImage of webImages) {
        try {
          if (await isValidAndAccessibleImage(webImage)) {
            const webQuality = await analyzeImageQuality(webImage)

            if (webQuality.quality === 'high' || webQuality.quality === 'medium') {
              logger.info({
                webImageUrl: webImage.substring(0, 80),
                quality: webQuality.quality
              }, "✅ Found from web")

              return {
                ...webQuality,
                improved: true,
                method: 'web-search'
              }
            }
          }
        } catch (error: any) {
          continue
        }
      }
    }

    // Step 5: AI Enhancement (if enabled)
    if (FEATURE_FLAGS.ENABLE_AI_ENHANCEMENT && isCurrentValid) {
      logger.info("🎨 Attempting AI enhancement...")
      const enhanced = await enhanceImageWithAI(imageUrl)

      if (enhanced.success) {
        logger.info("✅ Image enhanced")
        return {
          url: enhanced.url,
          quality: 'high',
          width: enhanced.width,
          height: enhanced.height,
          fileSize: enhanced.fileSize,
          improved: true,
          method: 'enhanced'
        }
      }
    }

    // Step 6: Return original or throw
    if (isCurrentValid) {
      logger.warn("⚠️ Using original")
      return {
        ...currentQuality,
        improved: false,
        method: 'original'
      }
    } else {
      logger.error("❌ No valid image found")
      throw new Error("No valid image found")
    }

  } catch (error: any) {
    logger.error({ error: error.message, imageUrl }, "❌ Failed")
    throw error
  }
}

// ============================================
// WEB IMAGE SEARCH - NEW FEATURE
// ============================================

/**
 * Search the web for high-quality images related to article topic
 */
async function searchWebForQualityImage(
  articleTitle: string,
  articleContent: string,
  articleUrl: string  // ← ADD this parameter
): Promise<string[]> {  // ← Change return type to string[]
  try {
    const validImages: string[] = []
    const searchQuery = buildImageSearchQuery(articleTitle, articleContent)
    logger.info({ searchQuery }, "🔎 Built image search query")

    // Strategy 1: Same domain
    const sameDomainImages = await searchSameDomainArticles(articleUrl, searchQuery)
    validImages.push(...sameDomainImages)

    // Strategy 2: News sites
    const newsImages = await searchNewsImages(searchQuery)
    validImages.push(...newsImages)

    return [...new Set(validImages)].slice(0, 5)
  } catch (error: any) {
    logger.error({ error: error.message }, "Web image search failed")
    return []
  }
}

/**
 * Search same domain articles for related images
 */
async function searchSameDomainArticles(articleUrl: string, query: string): Promise<string[]> {
  try {
    const domain = new URL(articleUrl).hostname
    logger.info({ domain, query }, "🔍 Searching same domain for related images")

    const searchUrl = `https://www.google.com/search?q=site:${domain}+${encodeURIComponent(query)}`

    const response = await axios.get(searchUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      },
      timeout: 10000
    })

    const $ = cheerio.load(response.data)
    const relatedUrls: string[] = []

    $('a[href]').each((i, elem) => {
      if (i >= 3) return
      const href = $(elem).attr('href')
      if (href && href.includes(domain) && href !== articleUrl) {
        try {
          const url = new URL(href.replace('/url?q=', '').split('&')[0])
          if (url.hostname.includes(domain)) {
            relatedUrls.push(url.href)
          }
        } catch (e) {
          // Skip invalid URLs
        }
      }
    })

    const images: string[] = []
    for (const url of relatedUrls) {
      try {
        const ogImage = await extractOgImageFromUrl(url)
        if (ogImage) {
          images.push(ogImage)
        }
      } catch (error) {
        continue
      }
    }

    logger.info({ domain, foundImages: images.length }, "✅ Found images from same domain")
    return images
  } catch (error: any) {
    logger.warn({ error: error.message }, "Same domain search failed")
    return []
  }
}

/**
 * Extract og:image from a given URL
 */
async function extractOgImageFromUrl(url: string): Promise<string | null> {
  try {
    const response = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
      },
      timeout: 8000
    })

    const $ = cheerio.load(response.data)

    // Try og:image
    const ogImage =
      $('meta[property="og:image"]').attr('content') ||
      $('meta[property="og:image:url"]').attr('content') ||
      $('meta[property="og:image:secure_url"]').attr('content') ||
      $('meta[name="og:image"]').attr('content')

    if (ogImage) {
      return makeAbsoluteUrl(ogImage, url)
    }

    // Try JSON-LD
    let jsonLdImage: string | null = null
    $('script[type="application/ld+json"]').each((_, elem) => {
      try {
        const jsonLd = $(elem).html()
        if (jsonLd) {
          const data = JSON.parse(jsonLd)

          if (data && data.image) {
            if (typeof data.image === 'string') {
              jsonLdImage = makeAbsoluteUrl(data.image, url)
              return false
            } else if (data.image.url) {
              jsonLdImage = makeAbsoluteUrl(data.image.url, url)
              return false
            } else if (Array.isArray(data.image) && data.image.length > 0) {
              const img = typeof data.image[0] === 'string' ? data.image[0] : data.image[0].url
              if (img) {
                jsonLdImage = makeAbsoluteUrl(img, url)
                return false
              }
            }
          }
        }
      } catch (e) {
        // Continue
      }
      return true
    })

    if (jsonLdImage) {
      return jsonLdImage
    }

    // Try Twitter card
    const twitterImage =
      $('meta[name="twitter:image"]').attr('content') ||
      $('meta[property="twitter:image"]').attr('content')

    if (twitterImage) {
      return makeAbsoluteUrl(twitterImage, url)
    }

    return null
  } catch (error) {
    return null
  }
}

/**
 * Build optimized search query for finding relevant images
 */
function buildImageSearchQuery(title: string, _content: string): string {
  // Clean title
  const cleanTitle = title
    .replace(/^(breaking|update|exclusive|just in):/i, '')
    .replace(/[?!]/g, '')
    .trim()

  // Extract key entities from content (simple approach)
  // const sentences = content.substring(0, 500).match(/[^.!?]+[.!?]/g) || [content.substring(0, 200)]
  // const firstSentence = sentences[0].trim()

  // Combine for search - prioritize title
  const query = `${cleanTitle} news image`.substring(0, 100)

  return query
}

/**
 * Search major news sites for related high-quality images
 */
async function searchNewsImages(query: string): Promise<string[]> {
  try {
    logger.info({ query }, "🔍 Searching news sites for related images")

    const searchUrl = `https://www.google.com/search?q=${encodeURIComponent(query)}&tbm=nws`

    const response = await axios.get(searchUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      },
      timeout: 10000
    })

    const $ = cheerio.load(response.data)
    const articleLinks: string[] = []

    $('a[href*="http"]').each((i, elem) => {
      if (i >= 5) return
      const href = $(elem).attr('href')
      if (href) {
        try {
          const cleanUrl = href.includes('/url?q=')
            ? href.replace('/url?q=', '').split('&')[0]
            : href

          if (cleanUrl.startsWith('http')) {
            articleLinks.push(decodeURIComponent(cleanUrl))
          }
        } catch (e) {
          // Skip
        }
      }
    })

    const images: string[] = []
    for (const link of articleLinks.slice(0, 3)) {
      if (await isNewsWebsite(link)) {
        try {
          const ogImage = await extractOgImageFromUrl(link)
          if (ogImage && await isValidAndAccessibleImage(ogImage)) {
            images.push(ogImage)
          }
        } catch (error) {
          continue
        }
      }
    }

    logger.info({ foundImages: images.length }, "✅ Found images from news sites")
    return images
  } catch (error: any) {
    logger.warn({ error: error.message }, "News site search failed")
    return []
  }
}

/**
 * Check if an image URL is valid and accessible
 */
async function isValidAndAccessibleImage(imageUrl: string): Promise<boolean> {
  try {
    if (!imageUrl || !imageUrl.startsWith('http')) {
      return false
    }

    if (imageUrl.includes('source.unsplash.com') ||
      imageUrl.includes('picsum.photos') ||
      imageUrl.includes('placeholder') ||
      imageUrl.includes('via.placeholder')) {
      logger.debug({ imageUrl }, "Excluding redirect/placeholder URL")
      return false
    }

    const response = await axios.head(imageUrl, {
      timeout: 8000,
      maxRedirects: 5,
      validateStatus: (status) => status >= 200 && status < 400,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
      }
    })

    const contentType = response.headers['content-type']
    if (!contentType || !contentType.startsWith('image/')) {
      logger.debug({ imageUrl, contentType }, "URL does not return image content type")
      return false
    }

    const contentLength = parseInt(response.headers['content-length'] || '0')
    if (contentLength > 0 && contentLength < 5000) {
      logger.debug({ imageUrl, contentLength }, "Image too small (likely icon)")
      return false
    }

    return true
  } catch (error: any) {
    logger.debug({ imageUrl, error: error.message }, "Image URL validation failed")
    return false
  }
}

/**
 * Search DuckDuckGo Images for high-quality results
 */
// async function searchDuckDuckGoImages(query: string): Promise<string[]> {
//   try {
//     // DuckDuckGo image search API endpoint
//     const searchUrl = `https://duckduckgo.com/?q=${encodeURIComponent(query)}&iax=images&ia=images`

//     const response = await axios.get(searchUrl, {
//       headers: {
//         'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
//       },
//       timeout: 10000
//     })

//     const $ = cheerio.load(response.data)
//     const imageUrls: string[] = []

//     // Extract image URLs from page
//     $('img[data-src], img[src]').each((i, elem) => {
//       if (i >= 10) return // Limit to 10
//       const src = $(elem).attr('data-src') || $(elem).attr('src')

//       if (src && src.startsWith('http') && !isExcludedImage(src)) {
//         imageUrls.push(src)
//       }
//     })

//     // Filter and validate
//     const validImages: string[] = []
//     for (const url of imageUrls.slice(0, 5)) {
//       if (await isValidImageUrl(url)) {
//         validImages.push(url)
//       }
//     }

//     return validImages
//   } catch (error) {
//     logger.warn({ error }, "DuckDuckGo image search failed")
//     return []
//   }
// }

/**
 * Search Bing Images for high-quality results
 */
// async function searchBingImages(query: string): Promise<string[]> {
//   try {
//     const searchUrl = `https://www.bing.com/images/search?q=${encodeURIComponent(query)}&qft=+filterui:imagesize-large`

//     const response = await axios.get(searchUrl, {
//       headers: {
//         'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
//       },
//       timeout: 10000
//     })

//     const $ = cheerio.load(response.data)
//     const imageUrls: string[] = []

//     // Extract image URLs from Bing results
//     $('a.iusc').each((i, elem) => {
//       if (i >= 10) return
//       const mAttr = $(elem).attr('m')
//       if (mAttr) {
//         try {
//           const data = JSON.parse(mAttr)
//           if (data.murl && !isExcludedImage(data.murl)) {
//             imageUrls.push(data.murl)
//           }
//         } catch (e) {
//           // Skip invalid JSON
//         }
//       }
//     })

//     // Filter and validate
//     const validImages: string[] = []
//     for (const url of imageUrls.slice(0, 5)) {
//       if (await isValidImageUrl(url)) {
//         validImages.push(url)
//       }
//     }

//     return validImages
//   } catch (error) {
//     logger.warn({ error }, "Bing image search failed")
//     return []
//   }
// }

/**
 * Check if URL is from a reputable news website
 */
async function isNewsWebsite(url: string): Promise<boolean> {
  try {
    const urlLower = url.toLowerCase()

    const result = await query("SELECT base_url FROM news_sources WHERE is_active = true")

    if (result.rows.length > 0) {
      for (const row of result.rows) {
        const baseUrl = row.base_url.toLowerCase()
        try {
          const domain = new URL(baseUrl).hostname
          if (urlLower.includes(domain)) {
            return true
          }
        } catch (e) {
          if (urlLower.includes(baseUrl)) {
            return true
          }
        }
      }
    }

    const commonNewsPatterns = [
      'bbc.com', 'bbc.co.uk', 'cnn.com', 'nytimes.com', 'theguardian.com', 'reuters.com',
      'apnews.com', 'bloomberg.com', 'wsj.com', 'washingtonpost.com', 'forbes.com',
      'techcrunch.com', 'theverge.com', 'wired.com', 'arstechnica.com', 'engadget.com'
    ]

    return commonNewsPatterns.some(pattern => urlLower.includes(pattern))
  } catch (error) {
    logger.warn({ error }, "Failed to check news website")
    const fallbackPatterns = ['bbc.com', 'cnn.com', 'nytimes.com', 'reuters.com']
    return fallbackPatterns.some(pattern => url.toLowerCase().includes(pattern))
  }
}

/**
 * Get stock/placeholder image as last resort fallback
 */
// async function getStockImageFallback(
//   articleTitle: string,
//   articleContent: string
// ): Promise<string | null> {
//   logger.warn("Stock image fallback is disabled - Unsplash source URLs are redirects")
//   logger.info("Consider using Pexels API or Pixabay API for stock images")
//   return null
// }

/**
 * Detect article category for stock image selection
 */
// function detectArticleCategory(title: string, content: string): string {
//   const text = `${title} ${content.substring(0, 500)}`.toLowerCase()

//   const categories = {
//     technology: ['tech', 'software', 'ai', 'computer', 'digital', 'internet', 'startup', 'app'],
//     business: ['business', 'economy', 'market', 'financial', 'stock', 'company', 'trade'],
//     sports: ['sport', 'football', 'basketball', 'soccer', 'game', 'player', 'match', 'athlete'],
//     health: ['health', 'medical', 'doctor', 'hospital', 'disease', 'treatment', 'medicine'],
//     science: ['science', 'research', 'study', 'discovery', 'space', 'scientist', 'experiment'],
//     entertainment: ['movie', 'music', 'film', 'celebrity', 'actor', 'show', 'concert', 'tv'],
//     politics: ['political', 'election', 'government', 'president', 'minister', 'parliament'],
//     world: ['world', 'international', 'global', 'country', 'nation', 'foreign']
//   }

//   for (const [category, keywords] of Object.entries(categories)) {
//     if (keywords.some(kw => text.includes(kw))) {
//       return category
//     }
//   }

//   return 'news' // default
// }

/**
 * Get keywords for stock image search
 */
// function getCategoryKeywords(category: string): string {
//   const keywordMap: Record<string, string> = {
//     technology: 'technology,computer,digital',
//     business: 'business,finance,office',
//     sports: 'sports,athlete,game',
//     health: 'health,medical,wellness',
//     science: 'science,research,laboratory',
//     entertainment: 'entertainment,music,concert',
//     politics: 'politics,government,capitol',
//     world: 'world,globe,international',
//     news: 'news,newspaper,media'
//   }

//   return keywordMap[category] || 'news,media'
// }

// ============================================
// EXISTING FUNCTIONS (PRESERVED)
// ============================================

/**
 * Analyze image quality by downloading and inspecting it
 */
async function analyzeImageQuality(imageUrl: string): Promise<{
  url: string
  quality: 'high' | 'medium' | 'low'
  width: number
  height: number
  fileSize: number
}> {
  try {
    // Download image
    const response = await axios.get(imageUrl, {
      responseType: 'arraybuffer',
      timeout: 15000,
      maxContentLength: 10 * 1024 * 1024, // 10MB max
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
      }
    })

    const buffer = Buffer.from(response.data)
    const fileSize = buffer.length

    // Get image metadata
    const metadata = await sharp(buffer).metadata()
    const width = metadata.width || 0
    const height = metadata.height || 0
    const pixels = width * height

    // Calculate quality score
    let quality: 'high' | 'medium' | 'low' = 'low'

    // Check URL for quality indicators
    const urlLower = imageUrl.toLowerCase()
    const hasLowQualityKeyword = QUALITY_THRESHOLDS.LOW_QUALITY_KEYWORDS.some(kw => urlLower.includes(kw))
    // const hasHighQualityKeyword = QUALITY_THRESHOLDS.HIGH_QUALITY_KEYWORDS.some(kw => urlLower.includes(kw))

    // High quality criteria
    if (
      width >= QUALITY_THRESHOLDS.OPTIMAL_WIDTH &&
      height >= QUALITY_THRESHOLDS.MIN_HEIGHT &&
      pixels >= QUALITY_THRESHOLDS.OPTIMAL_PIXELS &&
      fileSize >= QUALITY_THRESHOLDS.OPTIMAL_FILE_SIZE &&
      !hasLowQualityKeyword
    ) {
      quality = 'high'
    }
    // Medium quality criteria
    else if (
      width >= QUALITY_THRESHOLDS.MIN_WIDTH &&
      height >= QUALITY_THRESHOLDS.MIN_HEIGHT &&
      pixels >= QUALITY_THRESHOLDS.MIN_PIXELS &&
      fileSize >= QUALITY_THRESHOLDS.MIN_FILE_SIZE
    ) {
      quality = 'medium'
    }
    // Low quality
    else {
      quality = 'low'
    }

    return { url: imageUrl, quality, width, height, fileSize }

  } catch (error: any) {
    logger.warn({ error: error.message, imageUrl }, "Failed to download/analyze image, using URL heuristics")
    return guessQualityFromUrl(imageUrl)
  }
}

/**
 * Guess quality from URL when download fails
 */
function guessQualityFromUrl(imageUrl: string): {
  url: string
  quality: 'high' | 'medium' | 'low'
  width: number
  height: number
  fileSize: number
} {
  const urlLower = imageUrl.toLowerCase()

  // Extract dimensions from URL patterns
  const dimensionMatch = imageUrl.match(/(\d{3,4})x(\d{3,4})/)
  const widthMatch = imageUrl.match(/w=(\d{3,4})/)
  const heightMatch = imageUrl.match(/h=(\d{3,4})/)

  let width = 800
  let height = 600

  if (dimensionMatch) {
    width = parseInt(dimensionMatch[1])
    height = parseInt(dimensionMatch[2])
  } else if (widthMatch) {
    width = parseInt(widthMatch[1])
    height = heightMatch ? parseInt(heightMatch[1]) : Math.round(width * 0.67)
  }

  // Check for quality keywords
  const hasLowQuality = QUALITY_THRESHOLDS.LOW_QUALITY_KEYWORDS.some(kw => urlLower.includes(kw))
  const hasHighQuality = QUALITY_THRESHOLDS.HIGH_QUALITY_KEYWORDS.some(kw => urlLower.includes(kw))

  let quality: 'high' | 'medium' | 'low' = 'medium'

  if (hasHighQuality && width >= QUALITY_THRESHOLDS.OPTIMAL_WIDTH) {
    quality = 'high'
  } else if (hasLowQuality || width < QUALITY_THRESHOLDS.MIN_WIDTH) {
    quality = 'low'
  }

  return {
    url: imageUrl,
    quality,
    width,
    height,
    fileSize: quality === 'high' ? 200000 : quality === 'medium' ? 100000 : 50000
  }
}

/**
 * Find better image alternatives using multiple strategies
 */
async function findBetterImageAlternatives(
  currentImageUrl: string,
  articleUrl: string,
  // articleTitle: string,
  articleContent: string
): Promise<string[]> {
  const alternatives: string[] = []

  try {
    // Strategy 1: URL manipulation (try common CDN patterns)
    const urlVariations = generateUrlVariations(currentImageUrl)
    for (const variation of urlVariations) {
      if (await isValidImageUrl(variation)) {
        alternatives.push(variation)
      }
    }

    // Strategy 2: Re-scrape article page for better images
    const pageImages = await scrapeArticleForBestImages(articleUrl, currentImageUrl)
    alternatives.push(...pageImages)

    // Strategy 3: Extract high-quality images from article content HTML
    const contentImages = extractHighQualityImagesFromContent(articleContent, currentImageUrl)
    alternatives.push(...contentImages)

    // Remove duplicates and normalize
    const unique = [...new Set(alternatives.map(url => normalizeUrl(url)))]
      .filter(url => url !== normalizeUrl(currentImageUrl))

    logger.info({ count: unique.length }, "📸 Found alternative image candidates")
    return unique

  } catch (error: any) {
    logger.warn({ error: error.message }, "Failed to find alternatives")
    return []
  }
}

/**
 * Generate URL variations to try higher quality versions
 */
function generateUrlVariations(url: string): string[] {
  const variations: string[] = []

  try {
    const parsed = new URL(url)

    // Pattern 1: Remove size constraints
    const withoutSize = parsed.pathname
      .replace(/-\d{2,4}x\d{2,4}/gi, '')
      .replace(/_\d{2,4}x\d{2,4}/gi, '')
      .replace(/-thumb/gi, '')
      .replace(/-small/gi, '')
      .replace(/-medium/gi, '')

    if (withoutSize !== parsed.pathname) {
      variations.push(`${parsed.origin}${withoutSize}${parsed.search}`)
    }

    // Pattern 2: Replace quality keywords
    const qualityReplacements = [
      { from: /thumb/gi, to: 'large' },
      { from: /thumbnail/gi, to: 'original' },
      { from: /small/gi, to: 'large' },
      { from: /medium/gi, to: 'large' },
      { from: /preview/gi, to: 'full' }
    ]

    for (const { from, to } of qualityReplacements) {
      if (from.test(parsed.pathname)) {
        const replaced = parsed.pathname.replace(from, to)
        variations.push(`${parsed.origin}${replaced}${parsed.search}`)
      }
    }

    // Pattern 3: Modify URL parameters
    const params = new URLSearchParams(parsed.search)

    // Try larger dimensions
    if (params.has('w') || params.has('width')) {
      params.set('w', '1200')
      params.set('width', '1200')
      variations.push(`${parsed.origin}${parsed.pathname}?${params.toString()}`)
    }

    if (params.has('h') || params.has('height')) {
      params.set('h', '800')
      params.set('height', '800')
      variations.push(`${parsed.origin}${parsed.pathname}?${params.toString()}`)
    }

    // Try quality parameters
    params.set('quality', '100')
    params.set('q', '100')
    variations.push(`${parsed.origin}${parsed.pathname}?${params.toString()}`)

    // Pattern 4: Add quality parameters if none exist
    if (!parsed.search) {
      variations.push(`${parsed.origin}${parsed.pathname}?w=1200&h=800&quality=100`)
    }

  } catch (error) {
    // Invalid URL, skip
  }

  return [...new Set(variations)]
}

/**
 * Check if image URL is valid and accessible
 */
async function isValidImageUrl(url: string): Promise<boolean> {
  return await isValidAndAccessibleImage(url)
}


/**
 * Scrape article page for high-quality images
 */
async function scrapeArticleForBestImages(
  articleUrl: string,
  excludeUrl: string
): Promise<string[]> {
  try {
    const response = await axios.get(articleUrl, {
      timeout: 10000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
      }
    })

    const $ = cheerio.load(response.data)
    const candidates: Array<{ url: string; priority: number }> = []

    // Priority 0: JSON-LD (ADD THIS SECTION)
    $('script[type="application/ld+json"]').each((_i, elem) => {
      try {
        const jsonLd = $(elem).html()
        if (jsonLd) {
          const data = JSON.parse(jsonLd)

          let imageUrl: string | null = null

          if (data.image) {
            if (typeof data.image === 'string') {
              imageUrl = data.image
            } else if (data.image.url) {
              imageUrl = data.image.url
            } else if (Array.isArray(data.image) && data.image.length > 0) {
              imageUrl = typeof data.image[0] === 'string' ? data.image[0] : data.image[0].url
            }
          }

          if (imageUrl && !isSameImage(imageUrl, excludeUrl)) {
            candidates.push({ url: makeAbsoluteUrl(imageUrl, articleUrl), priority: 110 })
            logger.info({ imageUrl: imageUrl.substring(0, 80) }, "📰 Found image in JSON-LD")
          }
        }
      } catch (e) {
        // Continue
      }
    })

    // Priority 1: Open Graph image (highest quality, optimized for sharing)
    const ogImage = $('meta[property="og:image"]').attr('content') ||
      $('meta[property="og:image:url"]').attr('content') ||
      $('meta[property="og:image:secure_url"]').attr('content')

    if (ogImage && !isSameImage(ogImage, excludeUrl)) {
      candidates.push({ url: makeAbsoluteUrl(ogImage, articleUrl), priority: 100 })
    }

    // Priority 2: Twitter card large image
    const twitterImage = $('meta[name="twitter:image"]').attr('content') ||
      $('meta[property="twitter:image"]').attr('content')

    if (twitterImage && !isSameImage(twitterImage, excludeUrl)) {
      candidates.push({ url: makeAbsoluteUrl(twitterImage, articleUrl), priority: 90 })
    }

    // Priority 3: Schema.org image
    const schemaImage = $('meta[itemprop="image"]').attr('content')
    if (schemaImage && !isSameImage(schemaImage, excludeUrl)) {
      candidates.push({ url: makeAbsoluteUrl(schemaImage, articleUrl), priority: 85 })
    }

    // Priority 4: Link rel image
    const linkImage = $('link[rel="image_src"]').attr('href')
    if (linkImage && !isSameImage(linkImage, excludeUrl)) {
      candidates.push({ url: makeAbsoluteUrl(linkImage, articleUrl), priority: 80 })
    }

    // Priority 5: Hero/Featured images in article
    const selectors = [
      '.hero-image img',
      '.featured-image img',
      'article img[class*="hero"]',
      'article img[class*="featured"]',
      '.article-image img',
      '.post-thumbnail img'
    ]

    for (const selector of selectors) {
      $(selector).each((i, elem) => {
        const src = $(elem).attr('src') || $(elem).attr('data-src') || $(elem).attr('data-lazy-src')
        if (src && !isSameImage(src, excludeUrl) && !isExcludedImage(src)) {
          candidates.push({ url: makeAbsoluteUrl(src, articleUrl), priority: 70 - i })
        }
      })
    }

    // Sort by priority and return top 5
    return candidates
      .sort((a, b) => b.priority - a.priority)
      .slice(0, 5)
      .map(c => c.url)

  } catch (error: any) {
    logger.warn({ error: error.message, articleUrl }, "Failed to scrape article for images")
    return []
  }
}

/**
 * Extract high-quality images from article content HTML
 */
function extractHighQualityImagesFromContent(
  contentHtml: string,
  excludeUrl: string
): string[] {
  try {
    const $ = cheerio.load(contentHtml)
    const images: Array<{ url: string; score: number }> = []

    $('img').each((_i, elem) => {
      const src = $(elem).attr('src') || $(elem).attr('data-src')
      if (!src || isSameImage(src, excludeUrl) || isExcludedImage(src)) return

      // Score based on attributes
      const width = parseInt($(elem).attr('width') || '0')
      const height = parseInt($(elem).attr('height') || '0')
      const alt = $(elem).attr('alt') || ''

      let score = 0

      // Size indicators
      if (width >= QUALITY_THRESHOLDS.OPTIMAL_WIDTH) score += 30
      else if (width >= QUALITY_THRESHOLDS.MIN_WIDTH) score += 15

      if (height >= QUALITY_THRESHOLDS.MIN_HEIGHT) score += 20
      else if (height >= 400) score += 10

      // Quality keywords in URL
      if (QUALITY_THRESHOLDS.HIGH_QUALITY_KEYWORDS.some(kw => src.toLowerCase().includes(kw))) {
        score += 25
      }

      // Has meaningful alt text
      if (alt.length > 10) score += 10

      // Is in figure element (usually important images)
      if ($(elem).closest('figure').length > 0) score += 15

      if (score > 30) {
        images.push({ url: src, score })
      }
    })

    return images
      .sort((a, b) => b.score - a.score)
      .slice(0, 3)
      .map(img => img.url)

  } catch (error) {
    return []
  }
}

// ============================================
// AI ENHANCEMENT FUNCTIONS (PRESERVED FOR FUTURE USE)
// ============================================

/**
 * Enhance image using AI upscaling
 * NOTE: Currently disabled by default (see FEATURE_FLAGS)
 * Can be enabled by setting ENABLE_AI_ENHANCEMENT = true
 */
async function enhanceImageWithAI(imageUrl: string): Promise<{
  success: boolean
  url: string
  width: number
  height: number
  fileSize: number
}> {
  try {
    // Download original image
    const response = await axios.get(imageUrl, {
      responseType: 'arraybuffer',
      timeout: 15000,
      maxContentLength: 10 * 1024 * 1024
    })

    const buffer = Buffer.from(response.data)
    const metadata = await sharp(buffer).metadata()

    const originalWidth = metadata.width || 800
    const originalHeight = metadata.height || 600

    // Calculate target dimensions (at least 1200x630, maintain aspect ratio)
    const aspectRatio = originalWidth / originalHeight
    let targetWidth = Math.max(originalWidth * 2, QUALITY_THRESHOLDS.OPTIMAL_WIDTH)
    let targetHeight = Math.round(targetWidth / aspectRatio)

    // Ensure minimum height
    if (targetHeight < QUALITY_THRESHOLDS.MIN_HEIGHT) {
      targetHeight = QUALITY_THRESHOLDS.MIN_HEIGHT
      targetWidth = Math.round(targetHeight * aspectRatio)
    }

    logger.info({
      original: `${originalWidth}x${originalHeight}`,
      target: `${targetWidth}x${targetHeight}`,
      upscaleFactor: `${(targetWidth / originalWidth).toFixed(1)}x`
    }, "🎨 Enhancing image with AI")

    // Enhance with Sharp (high-quality upscaling + enhancements)
    const enhanced = await sharp(buffer)
      .resize(targetWidth, targetHeight, {
        kernel: sharp.kernel.lanczos3, // Best quality interpolation
        fit: 'cover',
        position: 'centre'
      })
      .sharpen({ sigma: 1.5 }) // Sharpen to compensate for upscaling
      .normalize() // Auto-adjust contrast and brightness
      .modulate({
        brightness: 1.05, // Slightly brighten
        saturation: 1.1 // Slightly increase saturation
      })
      .jpeg({
        quality: 90,
        progressive: true,
        mozjpeg: true // Use mozjpeg for better compression
      })
      .toBuffer()

    // Save enhanced image to storage (if enabled)
    if (FEATURE_FLAGS.ENABLE_IMAGE_STORAGE) {
      const enhancedUrl = await saveEnhancedImage(enhanced)
      const enhancedMetadata = await sharp(enhanced).metadata()

      return {
        success: true,
        url: enhancedUrl,
        width: enhancedMetadata.width || targetWidth,
        height: enhancedMetadata.height || targetHeight,
        fileSize: enhanced.length
      }
    } else {
      // Return base64 data URL if storage is disabled
      const base64 = enhanced.toString('base64')
      const dataUrl = `data:image/jpeg;base64,${base64}`

      return {
        success: true,
        url: dataUrl,
        width: targetWidth,
        height: targetHeight,
        fileSize: enhanced.length
      }
    }

  } catch (error: any) {
    logger.error({ error: error.message }, "❌ AI enhancement failed")
    return {
      success: false,
      url: imageUrl,
      width: 0,
      height: 0,
      fileSize: 0
    }
  }
}

/**
 * Save enhanced image to storage
 * Supports multiple storage backends
 * NOTE: Currently disabled by default (see FEATURE_FLAGS)
 */
async function saveEnhancedImage(buffer: Buffer): Promise<string> {
  try {
    const filename = `enhanced-${Date.now()}-${Math.random().toString(36).substring(7)}.jpg`

    // Option 1: Local filesystem storage
    if (process.env.STORAGE_TYPE === 'local' || !process.env.STORAGE_TYPE) {
      const uploadDir = process.env.UPLOAD_DIR || './uploads/enhanced'

      // Ensure directory exists
      await fs.mkdir(uploadDir, { recursive: true })

      const filepath = path.join(uploadDir, filename)
      await fs.writeFile(filepath, buffer)

      const baseUrl = process.env.CDN_URL || process.env.BASE_URL || 'http://localhost:3000'
      return `${baseUrl}/uploads/enhanced/${filename}`
    }

    // Option 2: AWS S3 (if you have AWS SDK configured)
    if (process.env.STORAGE_TYPE === 's3' && process.env.AWS_S3_BUCKET) {
      // Placeholder for S3 upload
      // const s3Url = await uploadToS3(buffer, filename)
      // return s3Url
      logger.warn("S3 storage not implemented, falling back to local")
    }

    // Option 3: Cloudflare R2 / other CDN
    if (process.env.STORAGE_TYPE === 'r2' && process.env.CLOUDFLARE_ACCOUNT_ID) {
      // Placeholder for R2 upload
      logger.warn("R2 storage not implemented, falling back to local")
    }

    // Fallback to base64 data URL if storage fails
    const base64 = buffer.toString('base64')
    return `data:image/jpeg;base64,${base64}`

  } catch (error: any) {
    logger.error({ error: error.message }, "Failed to save enhanced image")
    // Return base64 as last resort
    const base64 = buffer.toString('base64')
    return `data:image/jpeg;base64,${base64}`
  }
}

// ============================================
// UTILITY FUNCTIONS
// ============================================

function normalizeUrl(url: string): string {
  try {
    const parsed = new URL(url)
    return `${parsed.origin}${parsed.pathname}`.toLowerCase()
  } catch {
    return url.toLowerCase()
  }
}

function isSameImage(url1: string, url2: string): boolean {
  return normalizeUrl(url1) === normalizeUrl(url2)
}

function isExcludedImage(url: string): boolean {
  const urlLower = url.toLowerCase()
  const excludePatterns = [
    'logo', 'icon', 'favicon', 'avatar', 'gravatar', 'emoji',
    'badge', 'button', 'ad-', 'advertisement', 'sponsor',
    'tracking', 'pixel', '1x1.gif', 'spacer'
  ]
  return excludePatterns.some(pattern => urlLower.includes(pattern))
}

function makeAbsoluteUrl(url: string, baseUrl: string): string {
  try {
    return new URL(url, baseUrl).href
  } catch {
    return url
  }
}
