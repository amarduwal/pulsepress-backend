import axios from "axios"
import { config } from "../../config"
import { logger } from "../../lib/logger"

const HF_API_URL = config.ai.huggingfaceApiUrl

/**
 * Generate intelligent AI summary of the entire article
 * Summary length is proportional to article (1/4 of original)
 */
export async function summarizeText(text: string, minLength?: number): Promise<string> {
  try {
    // Calculate target length (1/4 of original, minimum 200 chars)
    const targetLength = Math.max(Math.floor(text.length * 0.25), minLength || 200)
    const maxLength = Math.min(targetLength + 100, 500) // Cap at 500 chars

    logger.info({
      inputLength: text.length,
      targetLength,
      maxLength,
      ratio: '25%'
    }, "🤖 Generating proportional AI summary")

    // Clean and prepare text for summarization
    const cleanedText = prepareTextForSummarization(text)

    // Try AI summarization first
    if (config.ai.huggingfaceApiKey) {
      const aiSummary = await generateAISummary(cleanedText, targetLength, maxLength)
      if (aiSummary && aiSummary.length >= targetLength * 0.8) {
        logger.info({
          summaryLength: aiSummary.length,
          ratio: `${Math.round((aiSummary.length / text.length) * 100)}%`,
          sentences: aiSummary.split(/[.!?]+/).length
        }, "✅ AI summary generated successfully")
        return aiSummary
      }
    }

    // Fallback: Enhanced extractive summarization
    logger.warn("⚠️ AI summarization unavailable, using enhanced extractive method")
    return generateEnhancedSummary(cleanedText, targetLength)
  } catch (error: any) {
    logger.error({ error: error.message }, "❌ AI summarization failed, using fallback")
    return generateEnhancedSummary(text, Math.max(Math.floor(text.length * 0.25), 200))
  }
}

/**
 * Clean and prepare text for better summarization
 */
function prepareTextForSummarization(text: string): string {
  // Remove extra whitespace
  let cleaned = text.replace(/\s+/g, ' ').trim()

  // Remove common noise patterns
  cleaned = cleaned.replace(/Click here|Read more|Continue reading|Subscribe now|Sign up/gi, '')
  cleaned = cleaned.replace(/\[.*?\]/g, '') // Remove [brackets]
  cleaned = cleaned.replace(/Advertisement|Sponsored/gi, '')

  // Limit to reasonable length for API (first 4000 chars covers most articles)
  if (cleaned.length > 4000) {
    // Take first 2000 and last 2000 characters to get intro and conclusion
    cleaned = cleaned.substring(0, 2000) + ' ' + cleaned.substring(cleaned.length - 2000)
  }

  return cleaned.trim()
}

/**
 * Generate AI summary using Hugging Face models
 */
async function generateAISummary(text: string, minLength: number, maxLength: number): Promise<string> {
  try {
    // Use Facebook's BART model - excellent for summarization
    const response = await axios.post(
      `${HF_API_URL}/facebook/bart-large-cnn`,
      {
        inputs: text,
        parameters: {
          max_length: maxLength,
          min_length: minLength,
          do_sample: false,
          early_stopping: true,
          num_beams: 4,
          length_penalty: 2.0,
          no_repeat_ngram_size: 3,
        },
      },
      {
        headers: {
          Authorization: `Bearer ${config.ai.huggingfaceApiKey}`,
          "Content-Type": "application/json",
        },
        timeout: 30000,
      }
    )

    const summary =
      response.data[0]?.summary_text ||
      response.data[0]?.generated_text ||
      response.data.summary_text ||
      response.data.generated_text

    if (summary && summary.length >= minLength * 0.8) {
      return cleanSummary(summary)
    }

    throw new Error("Summary too short")
  } catch (error: any) {
    if (error.response?.status === 503 || error.code === 'ECONNABORTED') {
      logger.warn("BART model unavailable, trying alternative")
      return await generateAlternativeSummary(text, minLength, maxLength)
    }
    throw error
  }
}

/**
 * Alternative AI summarization using different model
 */
async function generateAlternativeSummary(text: string, minLength: number, maxLength: number): Promise<string> {
  try {
    const response = await axios.post(
      `${HF_API_URL}/sshleifer/distilbart-cnn-12-6`,
      {
        inputs: text,
        parameters: {
          max_length: maxLength,
          min_length: minLength,
        },
      },
      {
        headers: {
          Authorization: `Bearer ${config.ai.huggingfaceApiKey}`,
          "Content-Type": "application/json",
        },
        timeout: 25000,
      }
    )

    const summary = response.data[0]?.summary_text || response.data[0]?.generated_text

    if (summary && summary.length >= minLength * 0.8) {
      return cleanSummary(summary)
    }

    throw new Error("Alternative model failed")
  } catch (error) {
    throw error
  }
}

/**
 * Enhanced extractive summarization
 * Creates intelligent summary from key sentences (1/4 of original length)
 */
function generateEnhancedSummary(text: string, targetLength: number): string {
  const sentences = text.match(/[^.!?]+[.!?]+/g) || [text]

  if (sentences.length === 0) {
    return text.substring(0, targetLength)
  }

  // Score sentences based on importance
  const scoredSentences = sentences.map((sentence, index) => {
    let score = 0
    const lowerSentence = sentence.toLowerCase()

    // First sentences are usually important (inverted pyramid)
    if (index < 3) score += 10 - index * 2

    // Important keywords
    const importantWords = [
      'announce', 'revealed', 'discovered', 'found', 'reported',
      'confirmed', 'stated', 'according', 'official', 'breaking',
      'new', 'first', 'major', 'significant', 'important'
    ]
    score += importantWords.filter(word => lowerSentence.includes(word)).length * 2

    // Named entities (capitalized words)
    const capitalizedWords = sentence.match(/\b[A-Z][a-z]+/g) || []
    score += Math.min(capitalizedWords.length, 5)

    // Numbers and statistics (often important)
    const numbers = sentence.match(/\d+/g) || []
    score += Math.min(numbers.length * 1.5, 5)

    // Sentence length (not too short, not too long)
    const wordCount = sentence.split(/\s+/).length
    if (wordCount >= 10 && wordCount <= 30) score += 3

    // Contains quotations (often important)
    if (/"[^"]*"/.test(sentence) || /'[^']*'/.test(sentence)) score += 3

    return { sentence: sentence.trim(), score, index }
  })

  // Sort by score
  scoredSentences.sort((a, b) => b.score - a.score)

  // Select sentences until we reach target length
  const selectedSentences: Array<{ sentence: string; index: number }> = []
  let currentLength = 0

  for (const item of scoredSentences) {
    if (currentLength >= targetLength) break

    selectedSentences.push(item)
    currentLength += item.sentence.length

    // Don't include too many sentences
    if (selectedSentences.length >= 10) break
  }

  // Sort selected sentences back to original order
  selectedSentences.sort((a, b) => a.index - b.index)

  // Join sentences
  const summary = selectedSentences.map(s => s.sentence).join(' ')

  return cleanSummary(summary)
}

/**
 * Clean up summary text
 */
function cleanSummary(summary: string): string {
  // Remove incomplete sentences at the end
  let cleaned = summary.trim()

  // Ensure it ends with proper punctuation
  if (!/[.!?]$/.test(cleaned)) {
    const lastPeriod = cleaned.lastIndexOf('.')
    const lastQuestion = cleaned.lastIndexOf('?')
    const lastExclamation = cleaned.lastIndexOf('!')
    const lastPunctuation = Math.max(lastPeriod, lastQuestion, lastExclamation)

    if (lastPunctuation > 0) {
      cleaned = cleaned.substring(0, lastPunctuation + 1)
    } else {
      cleaned += '.'
    }
  }

  // Remove extra spaces
  cleaned = cleaned.replace(/\s+/g, ' ').trim()

  // Capitalize first letter
  if (cleaned.length > 0) {
    cleaned = cleaned.charAt(0).toUpperCase() + cleaned.slice(1)
  }

  return cleaned
}

/**
 * Generate multiple summary lengths
 * Useful for different display contexts
 */
export async function generateMultipleSummaries(text: string): Promise<{
  short: string;
  medium: string;
  long: string;
}> {
  const [short, medium, long] = await Promise.all([
    summarizeText(text, 100),  // Short: ~100 chars (1-2 sentences)
    summarizeText(text, 200),  // Medium: ~200 chars (2-3 sentences)
    summarizeText(text, 300),  // Long: ~300 chars (3-5 sentences)
  ])

  return { short, medium, long }
}

/**
 * Get summary quality score
 * Returns score 0-100 indicating summary quality
 */
export function getSummaryQuality(summary: string, originalText: string): number {
  let score = 0

  // Check length (good summaries are 10-20% of original)
  const ratio = summary.length / originalText.length
  if (ratio >= 0.05 && ratio <= 0.25) score += 30

  // Check sentence count (2-5 sentences is ideal)
  const sentences = summary.match(/[.!?]+/g)?.length || 0
  if (sentences >= 2 && sentences <= 5) score += 25

  // Check for key terms from original
  const originalWords = new Set(
    originalText.toLowerCase().match(/\b[a-z]{4,}\b/g) || []
  )
  const summaryWords = new Set(
    summary.toLowerCase().match(/\b[a-z]{4,}\b/g) || []
  )
  const overlap = [...summaryWords].filter(w => originalWords.has(w)).length
  const overlapRatio = overlap / summaryWords.size
  if (overlapRatio >= 0.5) score += 25

  // Check grammar (ends properly, has capitals)
  if (/[.!?]$/.test(summary)) score += 10
  if (/^[A-Z]/.test(summary)) score += 10

  return Math.min(score, 100)
}
