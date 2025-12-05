import axios from "axios"
import * as cheerio from "cheerio"
import { logger } from "../../lib/logger"

/**
 * Search the web for additional information about the news topic
 */
export async function researchNewsOnline(
  title: string,
  originalContent: string,
  keywords: string[]
): Promise<{
  additionalSources: Array<{ title: string; content: string; url: string }>;
  relatedFacts: string[];
  context: string;
}> {
  try {
    logger.info({ title: title.substring(0, 50) }, "🔍 Starting web research for article")

    // Extract main topic and entities for better search
    const searchQuery = buildSearchQuery(title, keywords)
    logger.info({ searchQuery }, "🔎 Constructed search query")

    // Search for related articles
    const searchResults = await searchWeb(searchQuery)
    logger.info({ resultsCount: searchResults.length }, "✅ Found related articles")

    // Scrape additional content from top results
    const additionalSources = await scrapeTopResults(searchResults.slice(0, 5))
    logger.info({ sourcesCount: additionalSources.length }, "✅ Scraped additional sources")

    // Extract key facts and context
    const relatedFacts = extractKeyFacts(additionalSources, originalContent)
    const context = buildContextualBackground(additionalSources, originalContent)

    logger.info({
      sources: additionalSources.length,
      facts: relatedFacts.length,
      contextLength: context.length
    }, "✅ Research completed")

    return {
      additionalSources,
      relatedFacts,
      context
    }
  } catch (error: any) {
    logger.error({ error: error.message }, "❌ Web research failed")
    return {
      additionalSources: [],
      relatedFacts: [],
      context: ""
    }
  }
}

/**
 * Build optimized search query from title and keywords
 */
function buildSearchQuery(title: string, keywords: string[]): string {
  // Remove common words and clean title
  const cleanTitle = title
    .replace(/^(breaking|update|exclusive|just in):/i, '')
    .replace(/[?!]/g, '')
    .trim()

  // Take top 3 keywords
  const topKeywords = keywords.slice(0, 3).join(' ')

  // Combine for comprehensive search
  return `${cleanTitle} ${topKeywords}`.substring(0, 200)
}

/**
 * Search the web using Google or alternative search
 */
async function searchWeb(query: string): Promise<Array<{ title: string; url: string; snippet: string }>> {
  try {
    // Using DuckDuckGo HTML search (no API key needed)
    const searchUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`

    const response = await axios.get(searchUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      },
      timeout: 10000
    })

    const $ = cheerio.load(response.data)
    const results: Array<{ title: string; url: string; snippet: string }> = []

    $('.result').each((i, elem) => {
      if (i >= 10) return // Limit to top 10

      const $elem = $(elem)
      const title = $elem.find('.result__title').text().trim()
      const url = $elem.find('.result__url').attr('href') || ''
      const snippet = $elem.find('.result__snippet').text().trim()

      if (title && url && !isExcludedDomain(url)) {
        results.push({
          title,
          url: cleanUrl(url),
          snippet
        })
      }
    })

    return results
  } catch (error) {
    logger.warn({ error }, "DuckDuckGo search failed, trying alternative")
    return await searchWebAlternative(query)
  }
}

/**
 * Alternative search method using Bing
 */
async function searchWebAlternative(query: string): Promise<Array<{ title: string; url: string; snippet: string }>> {
  try {
    // Simple Bing search scraping
    const searchUrl = `https://www.bing.com/search?q=${encodeURIComponent(query)}`

    const response = await axios.get(searchUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      },
      timeout: 10000
    })

    const $ = cheerio.load(response.data)
    const results: Array<{ title: string; url: string; snippet: string }> = []

    $('.b_algo').each((i, elem) => {
      if (i >= 10) return

      const $elem = $(elem)
      const title = $elem.find('h2').text().trim()
      const url = $elem.find('a').attr('href') || ''
      const snippet = $elem.find('.b_caption p').text().trim()

      if (title && url && !isExcludedDomain(url)) {
        results.push({ title, url, snippet })
      }
    })

    return results
  } catch (error) {
    logger.error({ error }, "Alternative search failed")
    return []
  }
}

/**
 * Check if domain should be excluded from research
 */
function isExcludedDomain(url: string): boolean {
  const excludedDomains = [
    'youtube.com',
    'facebook.com',
    'twitter.com',
    'instagram.com',
    'pinterest.com',
    'reddit.com', // Can be noisy
    'quora.com',
    'wikipedia.org', // Could be included but often too general
  ]

  return excludedDomains.some(domain => url.toLowerCase().includes(domain))
}

/**
 * Clean and normalize URL
 */
function cleanUrl(url: string): string {
  // Remove tracking parameters
  try {
    const parsed = new URL(url)
    parsed.searchParams.delete('utm_source')
    parsed.searchParams.delete('utm_medium')
    parsed.searchParams.delete('utm_campaign')
    return parsed.href
  } catch {
    return url
  }
}

/**
 * Scrape content from top search results
 */
async function scrapeTopResults(
  results: Array<{ title: string; url: string; snippet: string }>
): Promise<Array<{ title: string; content: string; url: string }>> {
  const scrapedContent: Array<{ title: string; content: string; url: string }> = []

  for (const result of results) {
    try {
      logger.info({ url: result.url }, "🕷️ Scraping additional source")

      const response = await axios.get(result.url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
        },
        timeout: 8000,
        maxRedirects: 3
      })

      const $ = cheerio.load(response.data)

      // Remove unwanted elements
      $('script, style, nav, header, footer, .advertisement, .ad').remove()

      // Try to find main content
      let content = ''
      const contentSelectors = [
        'article',
        '[role="main"]',
        '.article-body',
        '.entry-content',
        '.post-content',
        'main'
      ]

      for (const selector of contentSelectors) {
        const element = $(selector).first()
        if (element.length > 0) {
          content = element.text().trim()
          break
        }
      }

      // Fallback to body if no content found
      if (!content || content.length < 200) {
        content = $('body').text().trim()
      }

      // Clean up content
      content = content
        .replace(/\s+/g, ' ')
        .replace(/\n+/g, ' ')
        .trim()
        .substring(0, 3000) // Limit per source

      if (content.length >= 200) {
        scrapedContent.push({
          title: result.title,
          content,
          url: result.url
        })
        logger.info({ url: result.url, length: content.length }, "✅ Source scraped")
      }

      // Rate limiting
      await new Promise(resolve => setTimeout(resolve, 1000))

    } catch (error: any) {
      logger.warn({ url: result.url, error: error.message }, "Failed to scrape source")
    }
  }

  return scrapedContent
}

/**
 * Extract key facts from additional sources
 */
function extractKeyFacts(
  sources: Array<{ title: string; content: string; url: string }>,
  originalContent: string
): string[] {
  const facts: Set<string> = new Set()

  for (const source of sources) {
    // Look for sentences with numbers, dates, or specific facts
    const sentences = source.content.match(/[^.!?]+[.!?]+/g) || []

    for (const sentence of sentences) {
      const cleanSentence = sentence.trim()

      // Skip if too similar to original
      if (originalContent.toLowerCase().includes(cleanSentence.toLowerCase().substring(0, 50))) {
        continue
      }

      // Identify fact sentences (contain numbers, dates, percentages, etc.)
      const hasFacts = /\d+|percent|million|billion|according to|reported|confirmed|announced|stated/i.test(cleanSentence)

      if (hasFacts && cleanSentence.length >= 50 && cleanSentence.length <= 200) {
        facts.add(cleanSentence)
        if (facts.size >= 10) break // Limit facts
      }
    }

    if (facts.size >= 10) break
  }

  return Array.from(facts).slice(0, 10)
}

/**
 * Build contextual background from sources
 */
function buildContextualBackground(
  sources: Array<{ title: string; content: string; url: string }>,
  originalContent: string
): string {
  if (sources.length === 0) return ""

  // Combine all source content
  const combinedContent = sources.map(s => s.content).join(' ')

  // Extract background/context sentences
  const sentences = combinedContent.match(/[^.!?]+[.!?]+/g) || []
  const contextSentences: string[] = []

  for (const sentence of sentences) {
    const cleanSentence = sentence.trim()

    // Skip if in original
    if (originalContent.toLowerCase().includes(cleanSentence.toLowerCase().substring(0, 30))) {
      continue
    }

    // Look for contextual keywords
    const hasContext = /background|history|previously|earlier|past|before|context|originally|initially/i.test(cleanSentence)

    if (hasContext && cleanSentence.length >= 50 && cleanSentence.length <= 250) {
      contextSentences.push(cleanSentence)
      if (contextSentences.length >= 5) break
    }
  }

  return contextSentences.join(' ')
}
