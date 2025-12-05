import type { Response } from "express"
import type { AuthRequest } from "../middleware/auth"
import { query } from "../db/client"
import { successResponse, errorResponse } from "../lib/response"
import { logger } from "../lib/logger"

export async function searchArticles(req: AuthRequest, res: Response): Promise<void> {
  try {
    const { q, page = 1, limit = 20, category, from, to, sortBy = "relevance" } = req.query as any

    if (!q || q.trim().length === 0) {
      errorResponse(res, "INVALID_QUERY", "Search query is required", undefined, 400)
      return
    }

    const offset = (page - 1) * limit
    const whereConditions: string[] = ["a.status = 'published'"]
    const params: any[] = []
    let paramIndex = 1

    // Add full-text search
    const searchQuery = q
      .trim()
      .split(/\s+/)
      .map((term: string) => `${term}:*`)
      .join(" & ")

    whereConditions.push(`a.search_vector @@ to_tsquery('english', $${paramIndex++})`)
    params.push(searchQuery)

    if (category) {
      whereConditions.push(`c.slug = $${paramIndex++}`)
      params.push(category)
    }

    if (from) {
      whereConditions.push(`a.published_at >= $${paramIndex++}`)
      params.push(from)
    }

    if (to) {
      whereConditions.push(`a.published_at <= $${paramIndex++}`)
      params.push(to)
    }

    const whereClause = `WHERE ${whereConditions.join(" AND ")}`

    // Get total count
    const countResult = await query(
      `SELECT COUNT(*) FROM articles a
       LEFT JOIN categories c ON a.category_id = c.id
       ${whereClause}`,
      params,
    )
    const total = Number.parseInt(countResult.rows[0].count)

    // Determine sort order
    let orderBy = "ts_rank(a.search_vector, to_tsquery('english', $1)) DESC, a.published_at DESC"
    if (sortBy === "date") {
      orderBy = "a.published_at DESC"
    } else if (sortBy === "views") {
      orderBy = "a.views_count DESC"
    }

    // Get articles
    params.push(limit, offset)
    const result = await query(
      `SELECT 
        a.id, a.title, a.slug, a.summary, a.featured_image,
        a.published_at, a.views_count, a.shares_count,
        c.name as category_name, c.slug as category_slug, c.color as category_color,
        ts_rank(a.search_vector, to_tsquery('english', $1)) as relevance
       FROM articles a
       LEFT JOIN categories c ON a.category_id = c.id
       ${whereClause}
       ORDER BY ${orderBy}
       LIMIT $${paramIndex++} OFFSET $${paramIndex}`,
      params,
    )

    successResponse(
      res,
      {
        articles: result.rows,
        query: q,
      },
      {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    )
  } catch (error) {
    logger.error({ error }, "Search error")
    errorResponse(res, "SEARCH_FAILED", "Search failed", undefined, 500)
  }
}

export async function searchSuggestions(req: AuthRequest, res: Response): Promise<void> {
  try {
    const { q, limit = 5 } = req.query as any

    if (!q || q.trim().length < 2) {
      successResponse(res, { suggestions: [] })
      return
    }

    // Use trigram similarity for suggestions
    const result = await query(
      `SELECT DISTINCT title, slug
       FROM articles
       WHERE status = 'published'
         AND title ILIKE $1
       ORDER BY similarity(title, $2) DESC
       LIMIT $3`,
      [`%${q}%`, q, limit],
    )

    successResponse(res, { suggestions: result.rows })
  } catch (error) {
    logger.error({ error }, "Search suggestions error")
    errorResponse(res, "SEARCH_FAILED", "Failed to get suggestions", undefined, 500)
  }
}

export async function getTrendingSearches(req: AuthRequest, res: Response): Promise<void> {
  try {
    const { limit = 10 } = req.query as any

    // Get most viewed articles from last 7 days as trending
    const result = await query(
      `SELECT title, slug, views_count
       FROM articles
       WHERE status = 'published'
         AND published_at >= NOW() - INTERVAL '7 days'
       ORDER BY views_count DESC
       LIMIT $1`,
      [limit],
    )

    successResponse(res, { trending: result.rows })
  } catch (error) {
    logger.error({ error }, "Trending searches error")
    errorResponse(res, "FETCH_FAILED", "Failed to get trending searches", undefined, 500)
  }
}
