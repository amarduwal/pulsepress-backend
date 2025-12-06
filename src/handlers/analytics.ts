import type { Response } from "express"
import type { AuthRequest } from "../middleware/auth"
import { query } from "../db/client"
import { successResponse, errorResponse } from "../lib/response"
import { logger } from "../lib/logger"
import { cacheGet, cacheSet } from "../lib/redis"

export async function getOverview(_req: AuthRequest, res: Response): Promise<void> {
  try {
    const cacheKey = "analytics:overview"

    // Try cache first (5 minutes)
    const cached = await cacheGet(cacheKey)
    if (cached) {
      successResponse(res, cached)
      return
    }

    // Get total articles
    const articlesResult = await query(`
      SELECT
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE status = 'published') as published,
        COUNT(*) FILTER (WHERE status = 'draft') as draft,
        COUNT(*) FILTER (WHERE status = 'pending') as pending
      FROM articles
    `)

    // Get total users
    const usersResult = await query(`
      SELECT
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE role = 'admin') as admins,
        COUNT(*) FILTER (WHERE role = 'moderator') as moderators,
        COUNT(*) FILTER (WHERE role = 'editor') as editors,
        COUNT(*) FILTER (WHERE role = 'user') as users
      FROM users
    `)

    // Get total comments
    const commentsResult = await query(`
      SELECT
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE is_approved = true) as approved,
        COUNT(*) FILTER (WHERE is_approved = false) as pending,
        COUNT(*) FILTER (WHERE is_flagged = true) as flagged
      FROM comments
    `)

    // Get total views
    const viewsResult = await query("SELECT SUM(views_count) as total FROM articles")

    // Get views today
    const viewsTodayResult = await query(`
      SELECT COUNT(*) as total
      FROM article_views
      WHERE viewed_at >= CURRENT_DATE
    `)

    // Get new users today
    const newUsersTodayResult = await query(`
      SELECT COUNT(*) as total
      FROM users
      WHERE created_at >= CURRENT_DATE
    `)

    // Get new articles today
    const newArticlesTodayResult = await query(`
      SELECT COUNT(*) as total
      FROM articles
      WHERE created_at >= CURRENT_DATE
    `)

    const responseData = {
      articles: articlesResult.rows[0],
      users: usersResult.rows[0],
      comments: commentsResult.rows[0],
      views: {
        total: Number.parseInt(viewsResult.rows[0].total || "0"),
        today: Number.parseInt(viewsTodayResult.rows[0].total || "0"),
      },
      today: {
        users: Number.parseInt(newUsersTodayResult.rows[0].total || "0"),
        articles: Number.parseInt(newArticlesTodayResult.rows[0].total || "0"),
      },
    }

    // Cache for 5 minutes
    await cacheSet(cacheKey, responseData, 300)

    successResponse(res, responseData)
  } catch (error) {
    logger.error({ error }, "Get overview error")
    errorResponse(res, "FETCH_FAILED", "Failed to fetch overview", undefined, 500)
  }
}

export async function getTopArticles(req: AuthRequest, res: Response): Promise<void> {
  try {
    const { period = "7d", limit = 10, metric = "views" } = req.query as any

    const periodMap: Record<string, string> = {
      "24h": "1 day",
      "7d": "7 days",
      "30d": "30 days",
      "90d": "90 days",
    }

    const interval = periodMap[period] || "7 days"
    const orderBy = metric === "shares" ? "shares_count" : metric === "comments" ? "comments_count" : "views_count"

    const result = await query(
      `SELECT
        id, title, slug, views_count, shares_count, comments_count,
        published_at, c.name as category_name
       FROM articles a
       LEFT JOIN categories c ON a.category_id = c.id
       WHERE status = 'published'
         AND published_at >= NOW() - INTERVAL '${interval}'
       ORDER BY ${orderBy} DESC
       LIMIT $1`,
      [limit],
    )

    successResponse(res, { articles: result.rows })
  } catch (error) {
    logger.error({ error }, "Get top articles error")
    errorResponse(res, "FETCH_FAILED", "Failed to fetch top articles", undefined, 500)
  }
}

export async function getTrafficStats(req: AuthRequest, res: Response): Promise<void> {
  try {
    const { period = "7d" } = req.query as any

    const periodMap: Record<string, string> = {
      "24h": "1 day",
      "7d": "7 days",
      "30d": "30 days",
      "90d": "90 days",
    }

    const interval = periodMap[period] || "7 days"

    // Get daily views
    const viewsResult = await query(
      `SELECT
        DATE(viewed_at) as date,
        COUNT(*) as views
       FROM article_views
       WHERE viewed_at >= NOW() - INTERVAL '${interval}'
       GROUP BY DATE(viewed_at)
       ORDER BY date ASC`,
    )

    // Get views by category
    const categoryResult = await query(
      `SELECT
        c.name as category,
        SUM(a.views_count) as views
       FROM articles a
       JOIN categories c ON a.category_id = c.id
       WHERE a.published_at >= NOW() - INTERVAL '${interval}'
       GROUP BY c.name
       ORDER BY views DESC`,
    )

    successResponse(res, {
      daily: viewsResult.rows,
      byCategory: categoryResult.rows,
    })
  } catch (error) {
    logger.error({ error }, "Get traffic stats error")
    errorResponse(res, "FETCH_FAILED", "Failed to fetch traffic stats", undefined, 500)
  }
}

export async function getUserStats(req: AuthRequest, res: Response): Promise<void> {
  try {
    const { period = "30d" } = req.query as any

    const periodMap: Record<string, string> = {
      "7d": "7 days",
      "30d": "30 days",
      "90d": "90 days",
      "1y": "1 year",
    }

    const interval = periodMap[period] || "30 days"

    // Get new users over time
    const newUsersResult = await query(
      `SELECT
        DATE(created_at) as date,
        COUNT(*) as users
       FROM users
       WHERE created_at >= NOW() - INTERVAL '${interval}'
       GROUP BY DATE(created_at)
       ORDER BY date ASC`,
    )

    // Get active users (users who commented or bookmarked)
    const activeUsersResult = await query(
      `SELECT COUNT(DISTINCT user_id) as active
       FROM (
         SELECT user_id FROM comments WHERE created_at >= NOW() - INTERVAL '${interval}'
         UNION
         SELECT user_id FROM bookmarks WHERE created_at >= NOW() - INTERVAL '${interval}'
       ) as active_users`,
    )

    // Get users by role
    const roleResult = await query(`
      SELECT role, COUNT(*) as count
      FROM users
      GROUP BY role
      ORDER BY count DESC
    `)

    successResponse(res, {
      newUsers: newUsersResult.rows,
      activeUsers: Number.parseInt(activeUsersResult.rows[0].active || "0"),
      byRole: roleResult.rows,
    })
  } catch (error) {
    logger.error({ error }, "Get user stats error")
    errorResponse(res, "FETCH_FAILED", "Failed to fetch user stats", undefined, 500)
  }
}

export async function getContentStats(req: AuthRequest, res: Response): Promise<void> {
  try {
    const { period = "30d" } = req.query as any

    const periodMap: Record<string, string> = {
      "7d": "7 days",
      "30d": "30 days",
      "90d": "90 days",
      "1y": "1 year",
    }

    const interval = periodMap[period] || "30 days"

    // Get articles published over time
    const articlesResult = await query(
      `SELECT
        DATE(published_at) as date,
        COUNT(*) as articles
       FROM articles
       WHERE published_at >= NOW() - INTERVAL '${interval}'
         AND status = 'published'
       GROUP BY DATE(published_at)
       ORDER BY date ASC`,
    )

    // Get articles by category
    const categoryResult = await query(
      `SELECT
        c.name as category,
        COUNT(a.id) as count
       FROM articles a
       JOIN categories c ON a.category_id = c.id
       WHERE a.published_at >= NOW() - INTERVAL '${interval}'
         AND a.status = 'published'
       GROUP BY c.name
       ORDER BY count DESC`,
    )

    // Get articles by source
    const sourceResult = await query(
      `SELECT
        source_name,
        COUNT(*) as count
       FROM articles
       WHERE published_at >= NOW() - INTERVAL '${interval}'
         AND status = 'published'
       GROUP BY source_name
       ORDER BY count DESC
       LIMIT 10`,
    )

    successResponse(res, {
      published: articlesResult.rows,
      byCategory: categoryResult.rows,
      bySource: sourceResult.rows,
    })
  } catch (error) {
    logger.error({ error }, "Get content stats error")
    errorResponse(res, "FETCH_FAILED", "Failed to fetch content stats", undefined, 500)
  }
}

export async function trackArticleView(req: AuthRequest, res: Response): Promise<void> {
  try {
    const { id } = req.params
    const userId = req.user?.userId || null
    const ipAddress = req.ip
    const userAgent = req.headers["user-agent"]

    await query(
      `INSERT INTO article_views (article_id, user_id, ip_address, user_agent)
       VALUES ($1, $2, $3, $4)`,
      [id, userId, ipAddress, userAgent],
    )

    successResponse(res, { message: "View tracked" })
  } catch (error) {
    logger.error({ error }, "Track view error")
    // Don't fail the request if tracking fails
    successResponse(res, { message: "View tracked" })
  }
}
