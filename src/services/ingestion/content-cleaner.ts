import DOMPurify from "isomorphic-dompurify"
import { logger } from "../../lib/logger"

export function cleanHTML(html: string): string {
  try {
    // Configure DOMPurify
    const clean = DOMPurify.sanitize(html, {
      ALLOWED_TAGS: [
        "p",
        "br",
        "strong",
        "em",
        "u",
        "h1",
        "h2",
        "h3",
        "h4",
        "h5",
        "h6",
        "ul",
        "ol",
        "li",
        "a",
        "blockquote",
        "code",
        "pre",
        "img",
      ],
      ALLOWED_ATTR: ["href", "src", "alt", "title", "class"],
      ALLOW_DATA_ATTR: false,
    })

    return clean
  } catch (error) {
    logger.error({ error }, "Failed to clean HTML")
    return html
  }
}

export function extractPlainText(html: string): string {
  try {
    // Remove HTML tags
    let text = html.replace(/<[^>]*>/g, " ")

    // Decode HTML entities
    text = text
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")

    // Normalize whitespace
    text = text.replace(/\s+/g, " ").trim()

    return text
  } catch (error) {
    logger.error({ error }, "Failed to extract plain text")
    return html
  }
}

export function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) {
    return text
  }

  // Try to truncate at sentence boundary
  const truncated = text.substring(0, maxLength)
  const lastPeriod = truncated.lastIndexOf(".")
  const lastQuestion = truncated.lastIndexOf("?")
  const lastExclamation = truncated.lastIndexOf("!")

  const lastSentence = Math.max(lastPeriod, lastQuestion, lastExclamation)

  if (lastSentence > maxLength * 0.8) {
    return truncated.substring(0, lastSentence + 1)
  }

  // Truncate at word boundary
  const lastSpace = truncated.lastIndexOf(" ")
  return truncated.substring(0, lastSpace) + "..."
}
