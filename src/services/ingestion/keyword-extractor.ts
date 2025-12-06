import natural from "natural"
import Compromise from "compromise"
import { logger } from "../../lib/logger"

const TfIdf = natural.TfIdf
const tokenizer = new natural.WordTokenizer()

export function extractKeywords(text: string, limit = 10): string[] {
  try {
    const tfidf = new TfIdf()
    tfidf.addDocument(text)

    const keywords: Array<{ term: string; score: number }> = []

    tfidf.listTerms(0).forEach((item) => {
      if (item.term.length > 3 && !/^\d+$/.test(item.term)) {
        keywords.push({ term: item.term, score: item.tfidf })
      }
    })

    return keywords
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map((k) => k.term)
  } catch (error) {
    logger.error({ error }, "Failed to extract keywords")
    return []
  }
}

export function extractEntities(text: string): Record<string, string[]> {
  try {
    const doc = Compromise(text)

    const entities = {
      people: doc.people().out("array") as string[],
      places: doc.places().out("array") as string[],
      organizations: doc.organizations().out("array") as string[],
    }

    // Deduplicate and limit
    Object.keys(entities).forEach((key) => {
      entities[key as keyof typeof entities] = [...new Set(entities[key as keyof typeof entities])].slice(0, 10)
    })

    return entities
  } catch (error) {
    logger.error({ error }, "Failed to extract entities")
    return { people: [], places: [], organizations: [], dates: [] }
  }
}

export function calculateReadingTime(text: string): number {
  const wordsPerMinute = 200
  const words = (tokenizer.tokenize(text) || []).length
  return Math.ceil(words / wordsPerMinute)
}
