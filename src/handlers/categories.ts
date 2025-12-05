import type { Response } from "express"
import type { AuthRequest } from "../middleware/auth"
import { query } from "../db/client"
import { successResponse, errorResponse, notFoundResponse } from "../lib/response"
import { logger } from "../lib/logger"
import { cacheGet, cacheSet, cacheDeletePattern } from "../lib/redis"

export async function getCategories(req: AuthRequest, res: Response): Promise<void> {
  try {
    const cacheKey = "categories:all"

    // Try cache first
    const cached = await cacheGet(cacheKey)
    if (cached) {
      successResponse(res, cached)
      return
    }

    const result = await query(
      `SELECT 
        c.id, c.name, c.slug, c.description, c.icon, c.color,
        c.is_active, c.sort_order,
        COUNT(a.id) as article_count
       FROM categories c
       LEFT JOIN articles a ON c.id = a.category_id AND a.status = 'published'
       GROUP BY c.id
       ORDER BY c.sort_order ASC, c.name ASC`,
    )

    const responseData = { categories: result.rows }

    // Cache for 1 hour
    await cacheSet(cacheKey, responseData, 3600)

    successResponse(res, responseData)
  } catch (error) {
    logger.error({ error }, "Get categories error")
    errorResponse(res, "FETCH_FAILED", "Failed to fetch categories", undefined, 500)
  }
}

export async function getCategoryBySlug(req: AuthRequest, res: Response): Promise<void> {
  try {
    const { slug } = req.params

    const result = await query(
      `SELECT 
        c.id, c.name, c.slug, c.description, c.icon, c.color,
        c.is_active, c.sort_order,
        COUNT(a.id) as article_count
       FROM categories c
       LEFT JOIN articles a ON c.id = a.category_id AND a.status = 'published'
       WHERE c.slug = $1
       GROUP BY c.id`,
      [slug],
    )

    if (result.rows.length === 0) {
      notFoundResponse(res, "Category")
      return
    }

    successResponse(res, { category: result.rows[0] })
  } catch (error) {
    logger.error({ error }, "Get category error")
    errorResponse(res, "FETCH_FAILED", "Failed to fetch category", undefined, 500)
  }
}

export async function createCategory(req: AuthRequest, res: Response): Promise<void> {
  try {
    const { name, slug, description, icon, color, is_active = true, sort_order = 0 } = req.body

    const result = await query(
      `INSERT INTO categories (name, slug, description, icon, color, is_active, sort_order)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id, name, slug, description, icon, color, is_active, sort_order, created_at`,
      [name, slug, description, icon, color, is_active, sort_order],
    )

    // Clear cache
    await cacheDeletePattern("categories:*")

    successResponse(res, { category: result.rows[0] }, undefined, 201)
  } catch (error) {
    logger.error({ error }, "Create category error")
    errorResponse(res, "CREATE_FAILED", "Failed to create category", undefined, 500)
  }
}

export async function updateCategory(req: AuthRequest, res: Response): Promise<void> {
  try {
    const { id } = req.params
    const { name, slug, description, icon, color, is_active, sort_order } = req.body

    const updates: string[] = []
    const params: any[] = []
    let paramIndex = 1

    if (name !== undefined) {
      updates.push(`name = $${paramIndex++}`)
      params.push(name)
    }
    if (slug !== undefined) {
      updates.push(`slug = $${paramIndex++}`)
      params.push(slug)
    }
    if (description !== undefined) {
      updates.push(`description = $${paramIndex++}`)
      params.push(description)
    }
    if (icon !== undefined) {
      updates.push(`icon = $${paramIndex++}`)
      params.push(icon)
    }
    if (color !== undefined) {
      updates.push(`color = $${paramIndex++}`)
      params.push(color)
    }
    if (is_active !== undefined) {
      updates.push(`is_active = $${paramIndex++}`)
      params.push(is_active)
    }
    if (sort_order !== undefined) {
      updates.push(`sort_order = $${paramIndex++}`)
      params.push(sort_order)
    }

    if (updates.length === 0) {
      errorResponse(res, "NO_UPDATES", "No fields to update", undefined, 400)
      return
    }

    params.push(id)
    const result = await query(
      `UPDATE categories
       SET ${updates.join(", ")}
       WHERE id = $${paramIndex}
       RETURNING id, name, slug, description, icon, color, is_active, sort_order, updated_at`,
      params,
    )

    if (result.rows.length === 0) {
      notFoundResponse(res, "Category")
      return
    }

    // Clear cache
    await cacheDeletePattern("categories:*")

    successResponse(res, { category: result.rows[0] })
  } catch (error) {
    logger.error({ error }, "Update category error")
    errorResponse(res, "UPDATE_FAILED", "Failed to update category", undefined, 500)
  }
}

export async function deleteCategory(req: AuthRequest, res: Response): Promise<void> {
  try {
    const { id } = req.params

    // Check if category has articles
    const articleCount = await query("SELECT COUNT(*) FROM articles WHERE category_id = $1", [id])

    if (Number.parseInt(articleCount.rows[0].count) > 0) {
      errorResponse(res, "CATEGORY_HAS_ARTICLES", "Cannot delete category with articles", undefined, 400)
      return
    }

    const result = await query("DELETE FROM categories WHERE id = $1 RETURNING id", [id])

    if (result.rows.length === 0) {
      notFoundResponse(res, "Category")
      return
    }

    // Clear cache
    await cacheDeletePattern("categories:*")

    successResponse(res, { message: "Category deleted successfully" })
  } catch (error) {
    logger.error({ error }, "Delete category error")
    errorResponse(res, "DELETE_FAILED", "Failed to delete category", undefined, 500)
  }
}
