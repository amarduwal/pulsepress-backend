import Parser from "rss-parser"
import { logger } from "../../lib/logger"

const parser = new Parser({
  customFields: {
    item: [
      ["media:content", "mediaContent"],
      ["media:thumbnail", "mediaThumbnail"],
      ["content:encoded", "contentEncoded"],
      ["description", "description"],
      ["summary", "summary"],
    ],
  },
})

export interface ParsedArticle {
  title: string
  link: string
  content?: string
  contentSnippet?: string
  pubDate?: string
  author?: string
  categories?: string[]
  enclosure?: {
    url: string
    type: string
  }
  mediaContent?: any
  mediaThumbnail?: any
}

export async function parseRSSFeed(url: string): Promise<ParsedArticle[]> {
  try {
    logger.info({ url }, "Parsing RSS feed")
    const feed = await parser.parseURL(url)

    const articles: ParsedArticle[] = feed.items.map((item) => {
      // Try to get full content from multiple sources
      let fullContent =
        item.contentEncoded ||  // content:encoded (full content)
        item.content ||          // content field
        item.description ||      // description (might have full content)
        item.summary ||          // summary
        item.contentSnippet ||   // contentSnippet (fallback)
        ""

      return {
        title: item.title || "",
        link: item.link || "",
        content: fullContent,
        contentSnippet: item.contentSnippet || "",
        pubDate: item.pubDate || item.isoDate,
        author: item.creator || item.author,
        categories: item.categories || [],
        enclosure: item.enclosure,
        mediaContent: item.mediaContent,
        mediaThumbnail: item.mediaThumbnail,
      }
    })

    logger.info({
      url,
      count: articles.length,
      hasFullContent: articles.some(a => a.content && a.content.length > 500)
    }, "Parsed RSS feed")

    return articles
  } catch (error) {
    logger.error({ error, url }, "Failed to parse RSS feed")
    throw error
  }
}
