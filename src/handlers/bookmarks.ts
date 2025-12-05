import type { Response } from "express"
import type { AuthRequest } from "../middleware/auth"
import { query } from "../db/client"
import { successResponse, errorResponse, notFoundResponse } from "../lib/response"
import { logger } from "../lib/logger"

export async function getBookmarks(req: AuthRequest, res: Response): Promise<void> {
  try {
    const { userId } = req.user!
    const { page = 1, limit = 20, category } = req.query as any
    const offset = (page - 1) * limit

    const whereConditions = ["b.user_id = $1"]
    const params: any[] = [userId]
    let paramIndex = 2

    if (category) {
      whereConditions.push(`c.slug = $${paramIndex++}`)
      params.push(category)
    }

    const whereClause = whereConditions.join(" AND ")

    // Get total count
    const countResult = await query(
      `SELECT COUNT(*) FROM bookmarks b
       JOIN articles a ON b.article_id = a.id
       LEFT JOIN categories c ON a.category_id = c.id
       WHERE ${whereClause}`,
      params,
    )
    const total = Number.parseInt(countResult.rows[0].count)

    // Get bookmarks
    params.push(limit, offset)
    const result = await query(
      `SELECT
        b.id, b.user_id, b.article_id, b.created_at,
        a.id as article_id, a.title, a.slug, a.summary, a.featured_image, a.published_at, a.created_at as article_created_at,
        a.author_name, a.tags, a.status,
        a.content_original, a.content_rewritten, a.category_id,
        c.id as category_id, c.name as category_name, c.slug as category_slug, c.color as category_color
       FROM bookmarks b
       JOIN articles a ON b.article_id = a.id
       LEFT JOIN categories c ON a.category_id = c.id
       WHERE ${whereClause}
       ORDER BY b.created_at DESC
       LIMIT $${paramIndex++} OFFSET $${paramIndex}`,
      params,
    )

    const bookmarks = result.rows.map((row: any) => ({
      id: row.id,
      user_id: row.user_id,
      article_id: row.article_id,
      created_at: row.created_at,
      article: {
        id: row.article_id,
        title: row.title,
        slug: row.slug,
        summary: row.summary,
        featured_image: row.featured_image,
        published_at: row.published_at,
        created_at: row.article_created_at,
        author_name: row.author_name,
        tags: row.tags,
        status: row.status,
        content_original: row.content_original,
        content_rewritten: row.content_rewritten,
        category_id: row.category_id,
        category_name: row.category_name,
        category_slug: row.category_slug,
        category_color: row.category_color,
      },
    }))

    const responseData = {
      bookmarks,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    }

    successResponse(res, responseData)
  } catch (error) {
    logger.error({ error }, "Get bookmarks error")
    errorResponse(res, "FETCH_FAILED", "Failed to fetch bookmarks", undefined, 500)
  }
}

export async function createBookmark(req: AuthRequest, res: Response): Promise<void> {
  try {
    const { articleId } = req.params
    const { userId } = req.user!

    // Check if article exists
    const articleResult = await query("SELECT id FROM articles WHERE id = $1 AND status = 'published'", [articleId])

    if (articleResult.rows.length === 0) {
      notFoundResponse(res, "Article")
      return
    }

    // Check if bookmark already exists
    const existingBookmark = await query("SELECT id FROM bookmarks WHERE user_id = $1 AND article_id = $2", [
      userId,
      articleId,
    ])

    if (existingBookmark.rows.length > 0) {
      errorResponse(res, "BOOKMARK_EXISTS", "Article already bookmarked", undefined, 409)
      return
    }

    const result = await query(
      `INSERT INTO bookmarks (user_id, article_id)
       VALUES ($1, $2)
       RETURNING id, article_id, created_at`,
      [userId, articleId],
    )

    successResponse(res, { bookmark: result.rows[0] }, undefined, 201)
  } catch (error) {
    logger.error({ error }, "Create bookmark error")
    errorResponse(res, "CREATE_FAILED", "Failed to create bookmark", undefined, 500)
  }
}

export async function deleteBookmark(req: AuthRequest, res: Response): Promise<void> {
  try {
    const { articleId } = req.params
    const { userId } = req.user!

    const result = await query("DELETE FROM bookmarks WHERE user_id = $1 AND article_id = $2 RETURNING id", [
      userId,
      articleId,
    ])

    if (result.rows.length === 0) {
      notFoundResponse(res, "Bookmark")
      return
    }

    successResponse(res, { message: "Bookmark deleted successfully" })
  } catch (error) {
    logger.error({ error }, "Delete bookmark error")
    errorResponse(res, "DELETE_FAILED", "Failed to delete bookmark", undefined, 500)
  }
}

export async function checkBookmark(req: AuthRequest, res: Response): Promise<void> {
  try {
    const { articleId } = req.params
    const { userId } = req.user!

    const result = await query("SELECT id FROM bookmarks WHERE user_id = $1 AND article_id = $2", [userId, articleId])

    successResponse(res, { bookmarked: result.rows.length > 0 })
  } catch (error) {
    logger.error({ error }, "Check bookmark error")
    errorResponse(res, "CHECK_FAILED", "Failed to check bookmark", undefined, 500)
  }
}
