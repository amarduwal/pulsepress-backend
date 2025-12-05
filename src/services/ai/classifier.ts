import axios from "axios"
import { config } from "../../config"
import { logger } from "../../lib/logger"
import { query } from "../../db/client"

const HF_API_URL = config.ai.huggingfaceApiUrl

const CATEGORY_LABELS = [
  "politics",
  "world news",
  "business",
  "technology",
  "sports",
  "entertainment",
  "science",
  "health",
  "lifestyle",
  "opinion",
]

export async function classifyArticle(title: string, content: string): Promise<string | null> {
  try {
    const text = `${title}. ${content.substring(0, 500)}`

    const response = await axios.post(
      `${HF_API_URL}/facebook/bart-large-mnli`,
      {
        inputs: text,
        parameters: {
          candidate_labels: CATEGORY_LABELS,
        },
      },
      {
        headers: {
          Authorization: `Bearer ${config.ai.huggingfaceApiKey}`,
          "Content-Type": "application/json",
        },
        timeout: 30000,
      },
    )

    const labels = response.data.labels
    const scores = response.data.scores

    if (!labels || labels.length === 0) {
      logger.warn("No classification result")
      return null
    }

    const topLabel = labels[0]
    const topScore = scores[0]

    logger.info({ label: topLabel, score: topScore }, "Classified article")

    // Map to category slug
    const categoryMap: Record<string, string> = {
      politics: "politics",
      "world news": "world",
      business: "business",
      technology: "technology",
      sports: "sports",
      entertainment: "entertainment",
      science: "science",
      health: "health",
      lifestyle: "lifestyle",
      opinion: "opinion",
    }

    const categorySlug = categoryMap[topLabel]

    if (!categorySlug) {
      return null
    }

    // Get category ID
    const result = await query("SELECT id FROM categories WHERE slug = $1", [categorySlug])

    return result.rows.length > 0 ? result.rows[0].id : null
  } catch (error: any) {
    logger.error({ error: error.message }, "AI classification failed")
    return null
  }
}
