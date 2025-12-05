import type { Response } from "express"
import type { AuthRequest } from "../middleware/auth"
import { query } from "../db/client"
import { hashPassword } from "../lib/password"
import { successResponse, errorResponse, notFoundResponse } from "../lib/response"
import { logger } from "../lib/logger"

export async function getUsers(req: AuthRequest, res: Response): Promise<void> {
  try {
    const { page = 1, limit = 20, role, status, search } = req.query as any
    const offset = (page - 1) * limit

    const whereConditions: string[] = []
    const params: any[] = []
    let paramIndex = 1

    if (role) {
      whereConditions.push(`role = $${paramIndex++}`)
      params.push(role)
    }

    if (status) {
      whereConditions.push(`status = $${paramIndex++}`)
      params.push(status)
    }

    if (search) {
      whereConditions.push(`(username ILIKE $${paramIndex} OR email ILIKE $${paramIndex})`)
      params.push(`%${search}%`)
      paramIndex++
    }

    const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(" AND ")}` : ""

    // Get total count
    const countResult = await query(`SELECT COUNT(*) FROM users ${whereClause}`, params)
    const total = Number.parseInt(countResult.rows[0].count)

    // Get users
    params.push(limit, offset)
    const result = await query(
      `SELECT id, username, email, role, avatar_url, status,
              email_verified, last_login_at, created_at
       FROM users
       ${whereClause}
       ORDER BY created_at DESC
       LIMIT $${paramIndex++} OFFSET $${paramIndex}`,
      params,
    )

    successResponse(
      res,
      {
        users: result.rows,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
      },
    )
  } catch (error) {
    logger.error({ error }, "Get users error")
    errorResponse(res, "FETCH_FAILED", "Failed to fetch users", undefined, 500)
  }
}

export async function getUserById(req: AuthRequest, res: Response): Promise<void> {
  try {
    const { id } = req.params

    const result = await query(
      `SELECT id, username, email, role, avatar_url, bio, status,
              email_verified, last_login_at, created_at, updated_at
       FROM users WHERE id = $1`,
      [id],
    )

    if (result.rows.length === 0) {
      notFoundResponse(res, "User")
      return
    }

    successResponse(res, { user: result.rows[0] })
  } catch (error) {
    logger.error({ error }, "Get user error")
    errorResponse(res, "FETCH_FAILED", "Failed to fetch user", undefined, 500)
  }
}

export async function updateUser(req: AuthRequest, res: Response): Promise<void> {
  try {
    const { id } = req.params
    const { username, email, role, status, bio, avatar_url } = req.body

    const updates: string[] = []
    const params: any[] = []
    let paramIndex = 1

    if (username !== undefined) {
      updates.push(`username = $${paramIndex++}`)
      params.push(username)
    }
    if (email !== undefined) {
      updates.push(`email = $${paramIndex++}`)
      params.push(email)
    }
    if (role !== undefined) {
      updates.push(`role = $${paramIndex++}`)
      params.push(role)
    }
    if (status !== undefined) {
      updates.push(`status = $${paramIndex++}`)
      params.push(status)
    }
    if (bio !== undefined) {
      updates.push(`bio = $${paramIndex++}`)
      params.push(bio)
    }
    if (avatar_url !== undefined) {
      updates.push(`avatar_url = $${paramIndex++}`)
      params.push(avatar_url)
    }

    if (updates.length === 0) {
      errorResponse(res, "NO_UPDATES", "No fields to update", undefined, 400)
      return
    }

    params.push(id)
    const result = await query(
      `UPDATE users
       SET ${updates.join(", ")}
       WHERE id = $${paramIndex}
       RETURNING id, username, email, role, avatar_url, bio, status, updated_at`,
      params,
    )

    if (result.rows.length === 0) {
      notFoundResponse(res, "User")
      return
    }

    successResponse(res, { user: result.rows[0] })
  } catch (error) {
    logger.error({ error }, "Update user error")
    errorResponse(res, "UPDATE_FAILED", "Failed to update user", undefined, 500)
  }
}

export async function deleteUser(req: AuthRequest, res: Response): Promise<void> {
  try {
    const { id } = req.params

    const result = await query("DELETE FROM users WHERE id = $1 RETURNING id", [id])

    if (result.rows.length === 0) {
      notFoundResponse(res, "User")
      return
    }

    successResponse(res, { message: "User deleted successfully" })
  } catch (error) {
    logger.error({ error }, "Delete user error")
    errorResponse(res, "DELETE_FAILED", "Failed to delete user", undefined, 500)
  }
}

export async function updateProfile(req: AuthRequest, res: Response): Promise<void> {
  try {
    const { userId } = req.user!
    const { username, bio, avatar_url, preferences } = req.body

    const updates: string[] = []
    const params: any[] = []
    let paramIndex = 1

    if (username !== undefined) {
      updates.push(`username = $${paramIndex++}`)
      params.push(username)
    }
    if (bio !== undefined) {
      updates.push(`bio = $${paramIndex++}`)
      params.push(bio)
    }
    if (avatar_url !== undefined) {
      updates.push(`avatar_url = $${paramIndex++}`)
      params.push(avatar_url)
    }
    if (preferences !== undefined) {
      updates.push(`preferences = $${paramIndex++}`)
      params.push(JSON.stringify(preferences))
    }

    if (updates.length === 0) {
      errorResponse(res, "NO_UPDATES", "No fields to update", undefined, 400)
      return
    }

    params.push(userId)
    const result = await query(
      `UPDATE users
       SET ${updates.join(", ")}
       WHERE id = $${paramIndex}
       RETURNING id, username, email, role, avatar_url, bio, preferences, updated_at`,
      params,
    )

    successResponse(res, { user: result.rows[0] })
  } catch (error) {
    logger.error({ error }, "Update profile error")
    errorResponse(res, "UPDATE_FAILED", "Failed to update profile", undefined, 500)
  }
}

export async function changePassword(req: AuthRequest, res: Response): Promise<void> {
  try {
    const { userId } = req.user!
    const { currentPassword, newPassword } = req.body

    // Get current password hash
    const userResult = await query("SELECT password_hash FROM users WHERE id = $1", [userId])

    if (userResult.rows.length === 0) {
      notFoundResponse(res, "User")
      return
    }

    // Verify current password
    const { comparePassword } = await import("../lib/password")
    const isValid = await comparePassword(currentPassword, userResult.rows[0].password_hash)

    if (!isValid) {
      errorResponse(res, "INVALID_PASSWORD", "Current password is incorrect", undefined, 400)
      return
    }

    // Hash new password
    const newPasswordHash = await hashPassword(newPassword)

    // Update password
    await query("UPDATE users SET password_hash = $1 WHERE id = $2", [newPasswordHash, userId])

    // Invalidate all refresh tokens
    await query("DELETE FROM refresh_tokens WHERE user_id = $1", [userId])

    successResponse(res, { message: "Password changed successfully" })
  } catch (error) {
    logger.error({ error }, "Change password error")
    errorResponse(res, "PASSWORD_CHANGE_FAILED", "Failed to change password", undefined, 500)
  }
}
