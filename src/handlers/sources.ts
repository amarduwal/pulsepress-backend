import type { Response } from "express"
import type { AuthRequest } from "../middleware/auth"
import { query } from "../db/client"
import { successResponse, errorResponse, notFoundResponse } from "../lib/response"
import { logger } from "../lib/logger"

export async function getSources(req: AuthRequest, res: Response): Promise<void> {
  try {
    const { page = 1, limit = 20, type, is_active } = req.query as any
    const offset = (page - 1) * limit

    const whereConditions: string[] = []
    const params: any[] = []
    let paramIndex = 1

    if (type) {
      whereConditions.push(`type = $${paramIndex++}`)
      params.push(type)
    }

    if (is_active !== undefined) {
      whereConditions.push(`is_active = $${paramIndex++}`)
      params.push(is_active === "true")
    }

    const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(" AND ")}` : ""

    // Get total count
    const countResult = await query(`SELECT COUNT(*) FROM news_sources ${whereClause}`, params)
    const total = Number.parseInt(countResult.rows[0].count)

    // Get sources
    params.push(limit, offset)
    const result = await query(
      `SELECT
        id, name, base_url, type, config, is_active,
        fetch_interval_minutes, last_fetched_at, last_error,
        success_count, error_count, created_at, updated_at
       FROM news_sources
       ${whereClause}
       ORDER BY name ASC
       LIMIT $${paramIndex++} OFFSET $${paramIndex}`,
      params,
    )

    const responseData = {
      sources: result.rows,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    }

    successResponse(
      res,
      responseData
    )
  } catch (error) {
    logger.error({ error }, "Get sources error")
    errorResponse(res, "FETCH_FAILED", "Failed to fetch sources", undefined, 500)
  }
}

export async function getSourceById(req: AuthRequest, res: Response): Promise<void> {
  try {
    const { id } = req.params

    const result = await query(
      `SELECT
        id, name, base_url, type, config, is_active,
        fetch_interval_minutes, last_fetched_at, last_error,
        success_count, error_count, created_at, updated_at
       FROM news_sources
       WHERE id = $1`,
      [id],
    )

    if (result.rows.length === 0) {
      notFoundResponse(res, "Source")
      return
    }

    successResponse(res, { source: result.rows[0] })
  } catch (error) {
    logger.error({ error }, "Get source error")
    errorResponse(res, "FETCH_FAILED", "Failed to fetch source", undefined, 500)
  }
}

export async function createSource(req: AuthRequest, res: Response): Promise<void> {
  try {
    const { name, base_url, type, config, is_active = true, fetch_interval_minutes = 30 } = req.body

    const result = await query(
      `INSERT INTO news_sources (name, base_url, type, config, is_active, fetch_interval_minutes)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, name, base_url, type, is_active, created_at`,
      [name, base_url, type, JSON.stringify(config || {}), is_active, fetch_interval_minutes],
    )

    successResponse(res, { source: result.rows[0] }, undefined, 201)
  } catch (error) {
    logger.error({ error }, "Create source error")
    errorResponse(res, "CREATE_FAILED", "Failed to create source", undefined, 500)
  }
}

export async function updateSource(req: AuthRequest, res: Response): Promise<void> {
  try {
    const { id } = req.params
    const { name, base_url, type, config, is_active, fetch_interval_minutes } = req.body

    const updates: string[] = []
    const params: any[] = []
    let paramIndex = 1

    if (name !== undefined) {
      updates.push(`name = $${paramIndex++}`)
      params.push(name)
    }
    if (base_url !== undefined) {
      updates.push(`base_url = $${paramIndex++}`)
      params.push(base_url)
    }
    if (type !== undefined) {
      updates.push(`type = $${paramIndex++}`)
      params.push(type)
    }
    if (config !== undefined) {
      updates.push(`config = $${paramIndex++}`)
      params.push(JSON.stringify(config))
    }
    if (is_active !== undefined) {
      updates.push(`is_active = $${paramIndex++}`)
      params.push(is_active)
    }
    if (fetch_interval_minutes !== undefined) {
      updates.push(`fetch_interval_minutes = $${paramIndex++}`)
      params.push(fetch_interval_minutes)
    }

    if (updates.length === 0) {
      errorResponse(res, "NO_UPDATES", "No fields to update", undefined, 400)
      return
    }

    params.push(id)
    const result = await query(
      `UPDATE news_sources
       SET ${updates.join(", ")}
       WHERE id = $${paramIndex}
       RETURNING id, name, base_url, type, is_active, updated_at`,
      params,
    )

    if (result.rows.length === 0) {
      notFoundResponse(res, "Source")
      return
    }

    successResponse(res, { source: result.rows[0] })
  } catch (error) {
    logger.error({ error }, "Update source error")
    errorResponse(res, "UPDATE_FAILED", "Failed to update source", undefined, 500)
  }
}

export async function deleteSource(req: AuthRequest, res: Response): Promise<void> {
  try {
    const { id } = req.params

    const result = await query("DELETE FROM news_sources WHERE id = $1 RETURNING id", [id])

    if (result.rows.length === 0) {
      notFoundResponse(res, "Source")
      return
    }

    successResponse(res, { message: "Source deleted successfully" })
  } catch (error) {
    logger.error({ error }, "Delete source error")
    errorResponse(res, "DELETE_FAILED", "Failed to delete source", undefined, 500)
  }
}

export async function testSource(req: AuthRequest, res: Response): Promise<void> {
  try {
    const { id } = req.params

    const sourceResult = await query("SELECT base_url, type FROM news_sources WHERE id = $1", [id])

    if (sourceResult.rows.length === 0) {
      notFoundResponse(res, "Source")
      return
    }

    const { base_url, type } = sourceResult.rows[0]

    // Test the source based on type
    if (type === "rss") {
      const { parseRSSFeed } = await import("../services/ingestion/rss-parser")
      const articles = await parseRSSFeed(base_url)
      successResponse(res, {
        success: true,
        articlesFound: articles.length,
        sample: articles.slice(0, 3),
      })
    } else {
      errorResponse(res, "UNSUPPORTED_TYPE", "Source type not yet supported for testing", undefined, 400)
    }
  } catch (error) {
    logger.error({ error }, "Test source error")
    errorResponse(res, "TEST_FAILED", "Failed to test source", undefined, 500)
  }
}

export async function refreshSource(req: AuthRequest, res: Response): Promise<void> {
  try {
    const { id } = req.params

    const sourceResult = await query("SELECT id, name FROM news_sources WHERE id = $1", [id])

    if (sourceResult.rows.length === 0) {
      notFoundResponse(res, "Source")
      return
    }

    // Queue a background job to fetch from this source
    const { fetchQueue } = await import("../jobs/queues")
    await fetchQueue.add(
      "fetch-source",
      { sourceId: id },
      { attempts: 3, backoff: { type: "exponential", delay: 2000 } },
    )

    logger.info({ sourceId: id }, "Queued source refresh")
    successResponse(res, { queued: true, message: "Source refresh queued successfully" })
  } catch (error) {
    logger.error({ error }, "Refresh source error")
    errorResponse(res, "REFRESH_FAILED", "Failed to queue source refresh", undefined, 500)
  }
}
