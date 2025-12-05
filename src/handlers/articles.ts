import type { Response } from "express"
import type { AuthRequest } from "../middleware/auth"
import { query } from "../db/client"
import { successResponse, errorResponse, notFoundResponse } from "../lib/response"
import { logger } from "../lib/logger"
import { cacheGet, cacheSet, cacheDelete, cacheDeletePattern } from "../lib/redis"

function generateSlug(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^\w\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .trim()
}

export async function getArticles(req: AuthRequest, res: Response): Promise<void> {
  try {
    const {
      page = 1,
      limit = 20,
      category,
      status,
      tag,
      featured,
      trending,
      sortBy = "published_at",
      sortOrder = "desc",
    } = req.query as any

    const offset = (page - 1) * limit
    const cacheKey = `articles:${JSON.stringify(req.query)}`

    // Try cache first
    const cached = await cacheGet(cacheKey)
    if (cached) {
      successResponse(res, cached)
      return
    }

    const whereConditions: string[] = []
    const params: any[] = []
    let paramIndex = 1

    // Public users only see published articles
    if (!req.user || req.user.role === "user") {
      whereConditions.push("status = 'published'")
    } else if (status) {
      whereConditions.push(`status = $${paramIndex++}`)
      params.push(status)
    }

    if (category) {
      whereConditions.push(`c.slug = $${paramIndex++}`)
      params.push(category)
    }

    if (tag) {
      whereConditions.push(`$${paramIndex} = ANY(a.tags)`)
      params.push(tag)
      paramIndex++
    }

    if (featured !== undefined) {
      whereConditions.push(`a.is_featured = $${paramIndex++}`)
      params.push(featured === "true")
    }

    if (trending !== undefined) {
      whereConditions.push(`a.is_trending = $${paramIndex++}`)
      params.push(trending === "true")
    }

    const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(" AND ")}` : ""

    // Get total count
    const countResult = await query(
      `SELECT COUNT(*) FROM articles a
       LEFT JOIN categories c ON a.category_id = c.id
       ${whereClause}`,
      params,
    )
    const total = Number.parseInt(countResult.rows[0].count)

    // Get articles
    const validSortColumns = ["published_at", "created_at", "views_count", "trending_score", "title"]
    const sortColumn = validSortColumns.includes(sortBy) ? sortBy : "published_at"
    const sortDirection = sortOrder === "asc" ? "ASC" : "DESC"

    params.push(limit, offset)
    const result = await query(
      `SELECT
        a.id, a.title, a.slug, a.summary, a.source_name, a.source_url,
        a.author_name, a.featured_image, a.tags, a.status,
        a.is_trending, a.is_featured, a.views_count, a.shares_count,
        a.likes_count, a.comments_count, a.published_at, a.created_at,
        c.id as category_id, c.name as category_name, c.slug as category_slug,
        c.color as category_color
       FROM articles a
       LEFT JOIN categories c ON a.category_id = c.id
       ${whereClause}
       ORDER BY a.${sortColumn} ${sortDirection}
       LIMIT $${paramIndex++} OFFSET $${paramIndex}`,
      params,
    )

    const responseData = {
      articles: result.rows,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    }

    // Cache for 5 minutes
    await cacheSet(cacheKey, responseData, 300)

    successResponse(res, responseData)
  } catch (error) {
    logger.error({ error }, "Get articles error")
    errorResponse(res, "FETCH_FAILED", "Failed to fetch articles", undefined, 500)
  }
}

export async function getArticleBySlug(req: AuthRequest, res: Response): Promise<void> {
  try {
    const { slug } = req.params
    const cacheKey = `article:${slug}`

    // Try cache first
    const cached = await cacheGet(cacheKey)
    if (cached) {
      successResponse(res, cached)
      return
    }

    const result = await query(
      `SELECT
        a.id, a.title, a.slug, a.summary, a.content_rewritten, a.content_original,
        a.source_name, a.source_url, a.author_name, a.featured_image,
        a.media_gallery, a.tags, a.keywords, a.entities, a.status,
        a.is_trending, a.is_featured, a.views_count, a.shares_count,
        a.likes_count, a.comments_count, a.published_at, a.created_at,
        c.id as category_id, c.name as category_name, c.slug as category_slug,
        c.color as category_color, c.icon as category_icon
       FROM articles a
       LEFT JOIN categories c ON a.category_id = c.id
       WHERE a.slug = $1`,
      [slug],
    )

    if (result.rows.length === 0) {
      notFoundResponse(res, "Article")
      return
    }

    const article = result.rows[0]

    // Check if user can view unpublished articles
    if (article.status !== "published" && (!req.user || !["admin", "moderator", "editor"].includes(req.user.role))) {
      notFoundResponse(res, "Article")
      return
    }

    // Increment view count asynchronously
    query("UPDATE articles SET views_count = views_count + 1 WHERE id = $1", [article.id]).catch((err) =>
      logger.error({ err }, "Failed to increment view count"),
    )

    // Cache for 10 minutes
    await cacheSet(cacheKey, { article }, 600)

    successResponse(res, { article })
  } catch (error) {
    logger.error({ error }, "Get article error")
    errorResponse(res, "FETCH_FAILED", "Failed to fetch article", undefined, 500)
  }
}

export async function getRelatedArticles(req: AuthRequest, res: Response): Promise<void> {
  try {
    const { id } = req.params
    const limit = 6

    // Get article category and tags
    const articleResult = await query("SELECT category_id, tags FROM articles WHERE id = $1", [id])

    if (articleResult.rows.length === 0) {
      notFoundResponse(res, "Article")
      return
    }

    const { category_id, tags } = articleResult.rows[0]

    // Find related articles by category and tags
    const result = await query(
      `SELECT
        a.id, a.title, a.slug, a.summary, a.featured_image,
        a.published_at, c.name as category_name, c.slug as category_slug
       FROM articles a
       LEFT JOIN categories c ON a.category_id = c.id
       WHERE a.id != $1
         AND a.status = 'published'
         AND (a.category_id = $2 OR a.tags && $3)
       ORDER BY
         CASE WHEN a.category_id = $2 THEN 1 ELSE 2 END,
         a.published_at DESC
       LIMIT $4`,
      [id, category_id, tags || [], limit],
    )

    successResponse(res, { articles: result.rows })
  } catch (error) {
    logger.error({ error }, "Get related articles error")
    errorResponse(res, "FETCH_FAILED", "Failed to fetch related articles", undefined, 500)
  }
}

export async function createArticle(req: AuthRequest, res: Response): Promise<void> {
  try {
    const {
      title,
      summary,
      content_rewritten,
      content_original,
      source_url,
      source_name,
      author_name,
      category_id,
      featured_image,
      media_gallery,
      tags,
      keywords,
      entities,
      status = "draft",
      is_featured = false,
    } = req.body

    const slug = generateSlug(title)
    const published_at = status === "published" ? new Date() : null

    const result = await query(
      `INSERT INTO articles (
        title, slug, summary, content_rewritten, content_original,
        source_url, source_name, author_name, author_id, category_id,
        featured_image, media_gallery, tags, keywords, entities,
        status, is_featured, published_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
      RETURNING id, title, slug, status, created_at`,
      [
        title,
        slug,
        summary,
        content_rewritten,
        content_original,
        source_url,
        source_name,
        author_name,
        req.user!.userId,
        category_id,
        featured_image,
        JSON.stringify(media_gallery || []),
        tags || [],
        keywords || [],
        JSON.stringify(entities || {}),
        status,
        is_featured,
        published_at,
      ],
    )

    // Clear cache
    await cacheDeletePattern("articles:*")

    successResponse(res, { article: result.rows[0] }, undefined, 201)
  } catch (error) {
    logger.error({ error }, "Create article error")
    errorResponse(res, "CREATE_FAILED", "Failed to create article", undefined, 500)
  }
}

export async function updateArticle(req: AuthRequest, res: Response): Promise<void> {
  try {
    const { id } = req.params
    const {
      title,
      summary,
      content_rewritten,
      content_original,
      source_url,
      source_name,
      author_name,
      category_id,
      featured_image,
      media_gallery,
      tags,
      keywords,
      entities,
      status,
      is_featured,
      is_trending,
    } = req.body

    const updates: string[] = []
    const params: any[] = []
    let paramIndex = 1

    if (title !== undefined) {
      updates.push(`title = $${paramIndex++}`)
      params.push(title)
      updates.push(`slug = $${paramIndex++}`)
      params.push(generateSlug(title))
    }
    if (summary !== undefined) {
      updates.push(`summary = $${paramIndex++}`)
      params.push(summary)
    }
    if (content_rewritten !== undefined) {
      updates.push(`content_rewritten = $${paramIndex++}`)
      params.push(content_rewritten)
    }
    if (content_original !== undefined) {
      updates.push(`content_original = $${paramIndex++}`)
      params.push(content_original)
    }
    if (source_url !== undefined) {
      updates.push(`source_url = $${paramIndex++}`)
      params.push(source_url)
    }
    if (source_name !== undefined) {
      updates.push(`source_name = $${paramIndex++}`)
      params.push(source_name)
    }
    if (author_name !== undefined) {
      updates.push(`author_name = $${paramIndex++}`)
      params.push(author_name)
    }
    if (category_id !== undefined) {
      updates.push(`category_id = $${paramIndex++}`)
      params.push(category_id)
    }
    if (featured_image !== undefined) {
      updates.push(`featured_image = $${paramIndex++}`)
      params.push(featured_image)
    }
    if (media_gallery !== undefined) {
      updates.push(`media_gallery = $${paramIndex++}`)
      params.push(JSON.stringify(media_gallery))
    }
    if (tags !== undefined) {
      updates.push(`tags = $${paramIndex++}`)
      params.push(tags)
    }
    if (keywords !== undefined) {
      updates.push(`keywords = $${paramIndex++}`)
      params.push(keywords)
    }
    if (entities !== undefined) {
      updates.push(`entities = $${paramIndex++}`)
      params.push(JSON.stringify(entities))
    }
    if (status !== undefined) {
      updates.push(`status = $${paramIndex++}`)
      params.push(status)
      // Set published_at when publishing
      if (status === "published") {
        updates.push(`published_at = COALESCE(published_at, NOW())`)
      }
    }
    if (is_featured !== undefined) {
      updates.push(`is_featured = $${paramIndex++}`)
      params.push(is_featured)
    }
    if (is_trending !== undefined) {
      updates.push(`is_trending = $${paramIndex++}`)
      params.push(is_trending)
    }

    if (updates.length === 0) {
      errorResponse(res, "NO_UPDATES", "No fields to update", undefined, 400)
      return
    }

    params.push(id)
    const result = await query(
      `UPDATE articles
       SET ${updates.join(", ")}
       WHERE id = $${paramIndex}
       RETURNING id, title, slug, status, updated_at`,
      params,
    )

    if (result.rows.length === 0) {
      notFoundResponse(res, "Article")
      return
    }

    // Clear cache
    await cacheDeletePattern("articles:*")
    await cacheDelete(`article:${result.rows[0].slug}`)

    successResponse(res, { article: result.rows[0] })
  } catch (error) {
    logger.error({ error }, "Update article error")
    errorResponse(res, "UPDATE_FAILED", "Failed to update article", undefined, 500)
  }
}

export async function deleteArticle(req: AuthRequest, res: Response): Promise<void> {
  try {
    const { id } = req.params

    const result = await query("DELETE FROM articles WHERE id = $1 RETURNING slug", [id])

    if (result.rows.length === 0) {
      notFoundResponse(res, "Article")
      return
    }

    // Clear cache
    await cacheDeletePattern("articles:*")
    await cacheDelete(`article:${result.rows[0].slug}`)

    successResponse(res, { message: "Article deleted successfully" })
  } catch (error) {
    logger.error({ error }, "Delete article error")
    errorResponse(res, "DELETE_FAILED", "Failed to delete article", undefined, 500)
  }
}

export async function incrementShareCount(req: AuthRequest, res: Response): Promise<void> {
  try {
    const { id } = req.params

    await query("UPDATE articles SET shares_count = shares_count + 1 WHERE id = $1", [id])

    successResponse(res, { message: "Share count incremented" })
  } catch (error) {
    logger.error({ error }, "Increment share count error")
    errorResponse(res, "UPDATE_FAILED", "Failed to increment share count", undefined, 500)
  }
}

export async function getArticleById(req: AuthRequest, res: Response): Promise<void> {
  try {
    const { id } = req.params
    const cacheKey = `article:id:${id}`

    // Try cache first
    const cached = await cacheGet(cacheKey)
    if (cached) {
      successResponse(res, cached)
      return
    }

    const result = await query(
      `SELECT
        a.id, a.title, a.slug, a.summary, a.content_rewritten, a.content_original,
        a.source_name, a.source_url, a.author_name, a.featured_image,
        a.media_gallery, a.tags, a.keywords, a.entities, a.status,
        a.is_trending, a.is_featured, a.views_count, a.shares_count,
        a.likes_count, a.comments_count, a.published_at, a.created_at,
        c.id as category_id, c.name as category_name, c.slug as category_slug,
        c.color as category_color, c.icon as category_icon
       FROM articles a
       LEFT JOIN categories c ON a.category_id = c.id
       WHERE a.id = $1`,
      [id],
    )

    if (result.rows.length === 0) {
      notFoundResponse(res, "Article")
      return
    }

    const article = result.rows[0]

    // Check if user can view unpublished articles (only editors/admins can view drafts)
    if (article.status !== "published" && (!req.user || !["admin", "moderator", "editor"].includes(req.user.role))) {
      notFoundResponse(res, "Article")
      return
    }

    // Cache for 10 minutes
    await cacheSet(cacheKey, { article }, 600)

    successResponse(res, { article })
  } catch (error) {
    logger.error({ error }, "Get article by ID error")
    errorResponse(res, "FETCH_FAILED", "Failed to fetch article", undefined, 500)
  }
}
