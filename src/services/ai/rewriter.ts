import axios from "axios"
import * as cheerio from "cheerio"
import { config } from "../../config"
import { logger } from "../../lib/logger"
import { researchNewsOnline } from "./web-researcher"

const HF_API_URL = config.ai.huggingfaceApiUrl

/**
 * Rewrite article with comprehensive research from the internet
 * Creates in-depth, well-researched article with no length limits
 */
export async function rewriteArticleWithHTML(
  title: string,
  originalText: string,
  originalHTML: string,
  featuredImageUrl: string | null,
  keywords: string[]
): Promise<string> {
  try {
    logger.info({
      title: title.substring(0, 50),
      inputLength: originalText.length
    }, "🤖 Starting comprehensive article rewrite with web research")

    // Step 1: Research the topic online
    const research = await researchNewsOnline(title, originalText, keywords)
    logger.info({
      additionalSources: research.additionalSources.length,
      facts: research.relatedFacts.length,
      hasContext: research.context.length > 0
    }, "✅ Web research completed")

    // Step 2: Extract images from original HTML
    const images = extractImagesFromHTML(originalHTML, featuredImageUrl)
    logger.info({ imageCount: images.length }, "🖼️ Images extracted")

    // Step 3: Combine all information
    const comprehensiveContent = buildComprehensiveContent(
      originalText,
      research.additionalSources,
      research.relatedFacts,
      research.context
    )

    logger.info({
      comprehensiveLength: comprehensiveContent.length,
      expansion: `${Math.round((comprehensiveContent.length / originalText.length) * 100)}%`
    }, "📚 Comprehensive content built")

    // Step 4: Create final article with all information
    const htmlContent = formatComprehensiveArticle(
      title,
      comprehensiveContent,
      images,
      research.additionalSources
    )

    logger.info({
      finalLength: htmlContent.length,
      sections: (htmlContent.match(/<h2/g) || []).length,
      paragraphs: (htmlContent.match(/<p>/g) || []).length
    }, "✅ Comprehensive article created successfully")

    return htmlContent

  } catch (error: any) {
    logger.error({ error: error.message }, "❌ Article creation failed")
    // Fallback to basic rewrite
    return createBasicArticle(title, originalText, extractImagesFromHTML(originalHTML, featuredImageUrl))
  }
}

/**
 * Build comprehensive content by combining original + research
 */
function buildComprehensiveContent(
  originalText: string,
  additionalSources: Array<{ title: string; content: string; url: string }>,
  relatedFacts: string[],
  context: string
): string {
  const sections: string[] = []

  // Section 1: Original content (rewritten)
  sections.push(originalText)

  // Section 2: Background/Context (if available)
  if (context && context.length > 100) {
    sections.push(`\n\nBACKGROUND: ${context}`)
  }

  // Section 3: Additional facts and details
  if (relatedFacts.length > 0) {
    sections.push(`\n\nADDITIONAL DETAILS: ${relatedFacts.slice(0, 5).join(' ')}`)
  }

  // Section 4: Related information from sources
  for (const source of additionalSources.slice(0, 3)) {
    // Extract unique information not in original
    const sentences = source.content.match(/[^.!?]+[.!?]+/g) || []
    const uniqueSentences = sentences.filter(sentence => {
      const cleanSentence = sentence.trim().substring(0, 50)
      return !originalText.toLowerCase().includes(cleanSentence.toLowerCase())
    })

    if (uniqueSentences.length > 0) {
      sections.push(`\n\nFROM ${source.title.toUpperCase()}: ${uniqueSentences.slice(0, 3).join(' ')}`)
    }
  }

  // Section 5: More facts
  if (relatedFacts.length > 5) {
    sections.push(`\n\nFURTHER INFORMATION: ${relatedFacts.slice(5, 10).join(' ')}`)
  }

  return sections.join('\n\n')
}

/**
 * Format comprehensive article with proper HTML structure
 * NO LENGTH LIMITS - create full, detailed articles
 */
function formatComprehensiveArticle(
  title: string,
  content: string,
  images: Array<{ url: string; alt: string; caption?: string }>,
  sources: Array<{ title: string; content: string; url: string }>
): string {
  // Define proper type for paragraph items
  type ParagraphItem = {
    type: 'header' | 'paragraph';
    text: string;
  }

  // Split content by sections
  const sections = content.split(/\n\n+/)
  const paragraphs: ParagraphItem[] = []

  for (const section of sections) {
    if (section.trim().length === 0) continue

    // Check if this is a section header
    if (section.startsWith('BACKGROUND:') || section.startsWith('ADDITIONAL DETAILS:') ||
      section.startsWith('FROM ') || section.startsWith('FURTHER INFORMATION:')) {
      // Extract header and content
      const parts = section.split(':')
      const header = parts[0].trim()
      const sectionContent = parts.slice(1).join(':').trim()

      paragraphs.push({
        type: 'header',
        text: formatSectionHeader(header)
      })

      // Split section content into sentences
      const sentences = sectionContent.match(/[^.!?]+[.!?]+/g) || [sectionContent]
      for (let i = 0; i < sentences.length; i += 2) {
        const para = sentences.slice(i, i + 2).join(' ').trim()
        if (para.length > 50) {
          paragraphs.push({
            type: 'paragraph',
            text: para
          })
        }
      }
    } else {
      // Regular content - split into paragraphs
      const sentences = section.match(/[^.!?]+[.!?]+/g) || [section]
      for (let i = 0; i < sentences.length; i += 3) {
        const para = sentences.slice(i, i + 3).join(' ').trim()
        if (para.length > 50) {
          paragraphs.push({
            type: 'paragraph',
            text: para
          })
        }
      }
    }
  }

  // Build HTML
  let html = `<article class="news-article comprehensive">\n\n`

  // Title
  html += `  <header>\n`
  html += `    <h1 class="article-title">${escapeHtml(title)}</h1>\n`
  html += `  </header>\n\n`
  html += `  <br/>\n\n`

  // First paragraph as lede
  if (paragraphs.length > 0 && paragraphs[0].type === 'paragraph') {
    html += `  <p class="lede">\n`
    html += `    <strong>${escapeHtml(paragraphs[0].text)}</strong>\n`
    html += `  </p>\n\n`
    html += `  <br/>\n\n`
    paragraphs.shift()
  }

  // Add first image after lede
  let imageIndex = 0
  if (images.length > 0) {
    html += formatImage(images[imageIndex], false)
    html += `  <br/>\n\n`
    imageIndex++
  }

  // Add remaining content with images strategically placed
  let paragraphCount = 0
  for (const item of paragraphs) {
    if (item.type === 'header') {
      html += `  <h2 class="section-heading">${escapeHtml(item.text)}</h2>\n\n`
      html += `  <br/>\n\n`
    } else {
      html += `  <p>${escapeHtml(item.text)}</p>\n\n`
      html += `  <br/>\n\n`
      paragraphCount++

      // Add image every 4-5 paragraphs
      if (paragraphCount % 5 === 0 && imageIndex < images.length) {
        html += formatImage(images[imageIndex], false)
        html += `  <br/>\n\n`
        imageIndex++
      }
    }
  }

  // Add sources section if available
  if (sources.length > 0) {
    html += `  <h2 class="section-heading">Sources and References</h2>\n\n`
    html += `  <br/>\n\n`
    html += `  <div class="sources-list">\n`
    html += `    <ul>\n`
    for (const source of sources.slice(0, 5)) {
      html += `      <li>\n`
      html += `        <a href="${escapeHtml(source.url)}" target="_blank" rel="noopener">\n`
      html += `          ${escapeHtml(source.title)}\n`
      html += `        </a>\n`
      html += `      </li>\n`
    }
    html += `    </ul>\n`
    html += `  </div>\n\n`
  }

  html += `</article>`

  return html
}

/**
 * Format section header for display
 */
function formatSectionHeader(header: string): string {
  const headerMap: Record<string, string> = {
    'BACKGROUND': 'Background and Context',
    'ADDITIONAL DETAILS': 'Key Details',
    'FURTHER INFORMATION': 'Further Analysis',
    'FROM': 'Additional Reporting'
  }

  for (const [key, value] of Object.entries(headerMap)) {
    if (header.startsWith(key)) {
      return header.replace(key, value)
    }
  }

  return header.replace('FROM ', 'According to ')
}

/**
 * Create basic article (fallback)
 */
function createBasicArticle(
  title: string,
  content: string,
  images: Array<{ url: string; alt: string; caption?: string }>
): string {
  const sentences = content.match(/[^.!?]+[.!?]+/g) || [content]
  const paragraphs: string[] = []

  for (let i = 0; i < sentences.length; i += 2) {
    const para = sentences.slice(i, i + 2).join(' ').trim()
    if (para.length > 50) {
      paragraphs.push(para)
    }
  }

  let html = `<article class="news-article">\n\n`
  html += `  <header>\n`
  html += `    <h1 class="article-title">${escapeHtml(title)}</h1>\n`
  html += `  </header>\n\n`
  html += `  <br/>\n\n`

  let imageIndex = 0

  paragraphs.forEach((para, index) => {
    if (index === 0) {
      html += `  <p class="lede"><strong>${escapeHtml(para)}</strong></p>\n\n`
      html += `  <br/>\n\n`

      if (imageIndex < images.length) {
        html += formatImage(images[imageIndex], false)
        html += `  <br/>\n\n`
        imageIndex++
      }
    } else {
      html += `  <p>${escapeHtml(para)}</p>\n\n`
      html += `  <br/>\n\n`

      if (index % 3 === 0 && imageIndex < images.length) {
        html += formatImage(images[imageIndex], false)
        html += `  <br/>\n\n`
        imageIndex++
      }
    }
  })

  html += `</article>`
  return html
}

/**
 * Extract valid images from HTML content (excluding ads and featured image)
 */
function extractImagesFromHTML(
  html: string,
  featuredImageUrl: string | null
): Array<{ url: string; alt: string; caption?: string }> {
  try {
    const $ = cheerio.load(html)
    const images: Array<{ url: string; alt: string; caption?: string }> = []

    // Normalize featured image URL for comparison
    const normalizedFeaturedUrl = featuredImageUrl ? normalizeImageUrl(featuredImageUrl) : null

    $('img').each((i, elem) => {
      const $img = $(elem)
      const src = $img.attr('src') || $img.attr('data-src') || $img.attr('data-lazy-src')
      const alt = $img.attr('alt') || ''
      const width = parseInt($img.attr('width') || '0')
      const height = parseInt($img.attr('height') || '0')

      if (!src) return

      // Normalize current image URL for comparison
      const normalizedSrc = normalizeImageUrl(src)

      // Skip if this is the featured image
      if (normalizedFeaturedUrl && normalizedSrc === normalizedFeaturedUrl) {
        logger.debug({ src }, "⏭️ Skipping featured image from content")
        return
      }

      // Filter out unwanted images
      const isAd = /ad[_-]|advertisement|sponsor|banner|promo/i.test(src) ||
        /ad[_-]|advertisement|sponsor/i.test(alt) ||
        $img.closest('.ad, .advertisement, .sponsored').length > 0

      const isSmall = (width > 0 && width < 200) || (height > 0 && height < 200)

      const isIcon = /icon|logo|favicon|sprite|avatar|emoji/i.test(src) ||
        /icon|logo/i.test(alt)

      const isTracking = /pixel|tracking|analytics|1x1/i.test(src)

      // Skip unwanted images
      if (isAd || isSmall || isIcon || isTracking) {
        return
      }

      // Try to find caption (common patterns)
      let caption = ''
      const $parent = $img.parent()
      const $figure = $img.closest('figure')

      if ($figure.length > 0) {
        caption = $figure.find('figcaption').text().trim()
      } else if ($parent.prop('tagName') === 'P') {
        // Sometimes caption is in next element
        caption = $parent.next().text().trim()
        if (caption.length > 100) caption = '' // Too long, probably not a caption
      }

      images.push({
        url: src,
        alt: alt || 'Article image',
        caption: caption || undefined
      })
    })

    // Limit to reasonable number of images (max 5)
    return images.slice(0, 5)
  } catch (error) {
    logger.error({ error }, "Failed to extract images from HTML")
    return []
  }
}

/**
 * Normalize image URL for comparison
 * Removes query parameters and standardizes format
 */
function normalizeImageUrl(url: string): string {
  try {
    const parsed = new URL(url)
    // Remove query parameters and hash
    return `${parsed.origin}${parsed.pathname}`.toLowerCase()
  } catch {
    // If URL parsing fails, just lowercase and remove query params manually
    return url.split('?')[0].split('#')[0].toLowerCase().trim()
  }
}

/**
 * Format rewritten text as a professional news article with HTML, proper spacing, and images
 * Images are different from featured image
 */
function formatAsNewsArticleWithImages(
  text: string,
  title: string,
  images: Array<{ url: string; alt: string; caption?: string }>
): string {
  // Split into meaningful paragraphs
  const paragraphs = text
    .split(/\n\n+/)
    .map(p => p.trim())
    .filter(p => p.length > 50)

  if (paragraphs.length === 0) {
    return createDescriptiveArticleWithImages(text, title, images)
  }

  let html = `<article class="news-article">\n\n`

  // Add title
  html += `  <header>\n`
  html += `    <h1 class="article-title">${escapeHtml(title)}</h1>\n`
  html += `  </header>\n\n`
  html += `  <br/>\n\n`

  // NOTE: We don't add the first image here because it's the featured image
  // which is already displayed separately

  // Lede paragraph (first paragraph - most important)
  if (paragraphs.length > 0) {
    html += `  <p class="lede">\n`
    html += `    <strong>${escapeHtml(paragraphs[0])}</strong>\n`
    html += `  </p>\n\n`
    html += `  <br/>\n\n`
  }

  // Add first content image after lede if available
  if (images.length > 0) {
    html += formatImage(images[0], false)
    html += `  <br/>\n\n`
  }

  // Main content with sections and strategically placed images
  const remainingParagraphs = paragraphs.slice(1)
  const sectionsCount = Math.ceil(remainingParagraphs.length / 3)
  let imageIndex = 1 // Start from second image (first already used after lede)

  for (let section = 0; section < sectionsCount; section++) {
    const startIdx = section * 3
    const endIdx = Math.min(startIdx + 3, remainingParagraphs.length)
    const sectionParagraphs = remainingParagraphs.slice(startIdx, endIdx)

    // Add section heading (except for first section)
    if (section > 0 && section < sectionsCount - 1) {
      const headings = ['Details', 'Background', 'Analysis', 'Impact', 'Development', 'Response']
      html += `  <h2 class="section-heading">${headings[section % headings.length]}</h2>\n\n`
      html += `  <br/>\n\n`
    }

    // Add paragraphs with proper spacing
    sectionParagraphs.forEach((para, idx) => {
      html += `  <p>${escapeHtml(para)}</p>\n\n`

      // Add image after every 2 paragraphs if available
      if (idx === 1 && imageIndex < images.length) {
        html += `  <br/>\n\n`
        html += formatImage(images[imageIndex], false)
        html += `  <br/>\n\n`
        imageIndex++
      } else if (idx < sectionParagraphs.length - 1) {
        html += `  <br/>\n\n`
      }
    })

    // Add spacing between sections
    if (section < sectionsCount - 1) {
      html += `  <br/>\n\n`
    }
  }

  html += `</article>`

  return html
}

/**
 * Format image with figure and caption
 */
function formatImage(
  image: { url: string; alt: string; caption?: string },
  isFeatured: boolean = false
): string {
  const className = isFeatured ? 'article-image featured' : 'article-image'

  let html = `  <figure class="${className}">\n`
  html += `    <img src="${escapeHtml(image.url)}" alt="${escapeHtml(image.alt)}" loading="lazy" />\n`

  if (image.caption) {
    html += `    <figcaption>${escapeHtml(image.caption)}</figcaption>\n`
  }

  html += `  </figure>\n\n`

  return html
}

/**
 * Create descriptive article from original text (fallback) with images
 * Expands and enhances the content with proper spacing
 * Images are different from featured image
 */
function createDescriptiveArticleWithImages(
  text: string,
  title: string,
  images: Array<{ url: string; alt: string; caption?: string }>
): string {
  const sentences = text.match(/[^.!?]+[.!?]+/g) || [text]

  // Extract key information
  const introduction = sentences.slice(0, 2).join(' ')
  const bodyContent = sentences.slice(2, -2)
  const conclusion = sentences.slice(-2).join(' ')

  // Build structured paragraphs
  const paragraphs: string[] = []

  // Opening paragraph (expanded)
  if (introduction) {
    paragraphs.push(introduction)
  }

  // Main body (group sentences into paragraphs of 2-3 sentences)
  for (let i = 0; i < bodyContent.length; i += 2) {
    const paragraph = bodyContent.slice(i, i + 2).join(' ')
    if (paragraph.length > 50) {
      paragraphs.push(paragraph)
    }
  }

  // Closing paragraph
  if (conclusion) {
    paragraphs.push(conclusion)
  }

  // Format as HTML with proper spacing and images
  let html = `<article class="news-article">\n\n`
  html += `  <header>\n`
  html += `    <h1 class="article-title">${escapeHtml(title)}</h1>\n`
  html += `  </header>\n\n`
  html += `  <br/>\n\n`

  // Don't add first image here - it's the featured image displayed separately

  let imageIndex = 0

  paragraphs.forEach((para, index) => {
    // First paragraph is lede
    if (index === 0) {
      html += `  <p class="lede">\n`
      html += `    <strong>${escapeHtml(para)}</strong>\n`
      html += `  </p>\n\n`
      html += `  <br/>\n\n`

      // Add first content image after lede
      if (imageIndex < images.length) {
        html += formatImage(images[imageIndex], false)
        html += `  <br/>\n\n`
        imageIndex++
      }
    } else {
      // Add section headings
      if (index === Math.floor(paragraphs.length / 3)) {
        html += `  <h2 class="section-heading">Background</h2>\n\n`
        html += `  <br/>\n\n`
      } else if (index === Math.floor(paragraphs.length * 2 / 3)) {
        html += `  <h2 class="section-heading">Details</h2>\n\n`
        html += `  <br/>\n\n`
      }

      html += `  <p>${escapeHtml(para)}</p>\n\n`

      // Add image after every 2-3 paragraphs
      if (index % 3 === 0 && imageIndex < images.length) {
        html += `  <br/>\n\n`
        html += formatImage(images[imageIndex], false)
        imageIndex++
      }

      html += `  <br/>\n\n`
    }
  })

  html += `</article>`

  return html
}

/**
 * Escape HTML special characters
 */
function escapeHtml(text: string): string {
  const map: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;',
  }
  return text.replace(/[&<>"']/g, (char) => map[char])
}
