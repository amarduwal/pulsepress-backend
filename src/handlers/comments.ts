import type { Response } from "express"
import type { AuthRequest } from "../middleware/auth"
import { query, transaction } from "../db/client"
import { successResponse, errorResponse, notFoundResponse, forbiddenResponse } from "../lib/response"
import { logger } from "../lib/logger"

interface CommentRow {
  id: string
  article_id: string
  user_id: string
  parent_id: string | null
  content: string
  is_approved: boolean
  is_flagged: boolean
  flag_reason: string | null
  likes_count: number
  created_at: Date
  updated_at: Date
  user_username: string
  user_avatar_url: string | null
}

function buildCommentTree(comments: CommentRow[]): any[] {
  const commentMap = new Map()
  const rootComments: any[] = []

  // First pass: create comment objects
  comments.forEach((comment) => {
    commentMap.set(comment.id, {
      id: comment.id,
      article_id: comment.article_id,
      user_id: comment.user_id,
      parent_id: comment.parent_id,
      content: comment.content,
      is_approved: comment.is_approved,
      is_flagged: comment.is_flagged,
      flag_reason: comment.flag_reason,
      likes_count: comment.likes_count,
      created_at: comment.created_at,
      updated_at: comment.updated_at,
      user: {
        username: comment.user_username,
        avatar_url: comment.user_avatar_url,
      },
      replies: [],
    })
  })

  // Second pass: build tree structure
  commentMap.forEach((comment) => {
    if (comment.parent_id) {
      const parent = commentMap.get(comment.parent_id)
      if (parent) {
        parent.replies.push(comment)
      }
    } else {
      rootComments.push(comment)
    }
  })

  return rootComments
}

export async function getComments(req: AuthRequest, res: Response): Promise<void> {
  try {
    const { id: articleId } = req.params
    const { page = 1, limit = 50 } = req.query as any
    const offset = (page - 1) * limit

    // Check if user is moderator/admin to see unapproved comments
    const isModerator = req.user && ["admin", "moderator"].includes(req.user.role)
    const approvalFilter = isModerator ? "" : "AND c.is_approved = true"

    const result = await query(
      `SELECT
        c.id, c.article_id, c.user_id, c.parent_id, c.content,
        c.is_approved, c.is_flagged, c.flag_reason, c.likes_count,
        c.created_at, c.updated_at,
        u.username as user_username, u.avatar_url as user_avatar_url
       FROM comments c
       JOIN users u ON c.user_id = u.id
       WHERE c.article_id = $1 ${approvalFilter}
       ORDER BY c.created_at ASC
       LIMIT $2 OFFSET $3`,
      [articleId, limit, offset],
    )

    const comments = buildCommentTree(result.rows)

    successResponse(res, {
      comments,
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total: comments.length,
        totalPages: Math.ceil(comments.length / limit),
      },
    })
  } catch (error) {
    logger.error({ error }, "Get comments error")
    errorResponse(res, "FETCH_FAILED", "Failed to fetch comments", undefined, 500)
  }
}

export async function createComment(req: AuthRequest, res: Response): Promise<void> {
  try {
    const { id: articleId } = req.params
    const { content, parent_id } = req.body
    const { userId } = req.user!

    // Check if article exists
    const articleResult = await query("SELECT id FROM articles WHERE id = $1 AND status = 'published'", [articleId])

    if (articleResult.rows.length === 0) {
      notFoundResponse(res, "Article")
      return
    }

    // If parent_id is provided, check if parent comment exists
    if (parent_id) {
      const parentResult = await query("SELECT id FROM comments WHERE id = $1 AND article_id = $2", [
        parent_id,
        articleId,
      ])

      if (parentResult.rows.length === 0) {
        errorResponse(res, "PARENT_NOT_FOUND", "Parent comment not found", undefined, 404)
        return
      }
    }

    // Auto-approve for moderators/admins
    const isAutoApproved = req.user && ["admin", "moderator"].includes(req.user.role)

    const result = await transaction(async (client) => {
      // Insert comment
      const commentResult = await client.query(
        `INSERT INTO comments (article_id, user_id, parent_id, content, is_approved)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id, article_id, user_id, parent_id, content, is_approved,
                   likes_count, created_at, updated_at`,
        [articleId, userId, parent_id || null, content, isAutoApproved],
      )

      // Increment article comment count
      await client.query("UPDATE articles SET comments_count = comments_count + 1 WHERE id = $1", [articleId])

      return commentResult.rows[0]
    })

    // Get user info
    const userResult = await query("SELECT username, avatar_url FROM users WHERE id = $1", [userId])

    successResponse(
      res,
      {
        comment: {
          ...result,
          user: userResult.rows[0],
          replies: [],
        },
      },
      undefined,
      201,
    )
  } catch (error) {
    logger.error({ error }, "Create comment error")
    errorResponse(res, "CREATE_FAILED", "Failed to create comment", undefined, 500)
  }
}

export async function updateComment(req: AuthRequest, res: Response): Promise<void> {
  try {
    const { id } = req.params
    const { content } = req.body
    const { userId, role } = req.user!

    // Get comment
    const commentResult = await query("SELECT user_id FROM comments WHERE id = $1", [id])

    if (commentResult.rows.length === 0) {
      notFoundResponse(res, "Comment")
      return
    }

    // Check ownership or moderator
    if (commentResult.rows[0].user_id !== userId && !["admin", "moderator"].includes(role)) {
      forbiddenResponse(res, "You can only edit your own comments")
      return
    }

    const result = await query(
      `UPDATE comments
       SET content = $1
       WHERE id = $2
       RETURNING id, content, updated_at`,
      [content, id],
    )

    successResponse(res, { comment: result.rows[0] })
  } catch (error) {
    logger.error({ error }, "Update comment error")
    errorResponse(res, "UPDATE_FAILED", "Failed to update comment", undefined, 500)
  }
}

export async function deleteComment(req: AuthRequest, res: Response): Promise<void> {
  try {
    const { id } = req.params
    const { userId, role } = req.user!

    // Get comment
    const commentResult = await query("SELECT user_id, article_id FROM comments WHERE id = $1", [id])

    if (commentResult.rows.length === 0) {
      notFoundResponse(res, "Comment")
      return
    }

    // Check ownership or moderator
    if (commentResult.rows[0].user_id !== userId && !["admin", "moderator"].includes(role)) {
      forbiddenResponse(res, "You can only delete your own comments")
      return
    }

    await transaction(async (client) => {
      // Delete comment (cascade will delete replies)
      await client.query("DELETE FROM comments WHERE id = $1", [id])

      // Decrement article comment count
      await client.query("UPDATE articles SET comments_count = comments_count - 1 WHERE id = $1", [
        commentResult.rows[0].article_id,
      ])
    })

    successResponse(res, { message: "Comment deleted successfully" })
  } catch (error) {
    logger.error({ error }, "Delete comment error")
    errorResponse(res, "DELETE_FAILED", "Failed to delete comment", undefined, 500)
  }
}

export async function likeComment(req: AuthRequest, res: Response): Promise<void> {
  try {
    const { id } = req.params

    await query("UPDATE comments SET likes_count = likes_count + 1 WHERE id = $1", [id])

    successResponse(res, { message: "Comment liked" })
  } catch (error) {
    logger.error({ error }, "Like comment error")
    errorResponse(res, "UPDATE_FAILED", "Failed to like comment", undefined, 500)
  }
}

export async function approveComment(req: AuthRequest, res: Response): Promise<void> {
  try {
    const { id } = req.params

    const result = await query(
      `UPDATE comments
       SET is_approved = true
       WHERE id = $1
       RETURNING id, is_approved`,
      [id],
    )

    if (result.rows.length === 0) {
      notFoundResponse(res, "Comment")
      return
    }

    successResponse(res, { comment: result.rows[0] })
  } catch (error) {
    logger.error({ error }, "Approve comment error")
    errorResponse(res, "UPDATE_FAILED", "Failed to approve comment", undefined, 500)
  }
}

export async function flagComment(req: AuthRequest, res: Response): Promise<void> {
  try {
    const { id } = req.params
    const { reason } = req.body

    const result = await query(
      `UPDATE comments
       SET is_flagged = true, flag_reason = $1
       WHERE id = $2
       RETURNING id, is_flagged, flag_reason`,
      [reason, id],
    )

    if (result.rows.length === 0) {
      notFoundResponse(res, "Comment")
      return
    }

    successResponse(res, { comment: result.rows[0] })
  } catch (error) {
    logger.error({ error }, "Flag comment error")
    errorResponse(res, "UPDATE_FAILED", "Failed to flag comment", undefined, 500)
  }
}

export async function getPendingComments(req: AuthRequest, res: Response): Promise<void> {
  try {
    const { page = 1, limit = 20 } = req.query as any
    const offset = (page - 1) * limit

    const countResult = await query("SELECT COUNT(*) FROM comments WHERE is_approved = false")
    const total = Number.parseInt(countResult.rows[0].count)

    const result = await query(
      `SELECT
        c.id, c.article_id, c.user_id, c.content, c.is_flagged, c.flag_reason,
        c.is_approved, c.likes_count, c.created_at, c.updated_at,
        u.username as user_username, u.avatar_url as user_avatar_url,
        a.title as article_title, a.slug as article_slug
       FROM comments c
       JOIN users u ON c.user_id = u.id
       JOIN articles a ON c.article_id = a.id
       WHERE c.is_approved = false
       ORDER BY c.created_at DESC
       LIMIT $1 OFFSET $2`,
      [limit, offset],
    )

    const transformedComments = result.rows.map((c) => ({
      id: c.id,
      articleId: c.article_id,
      userId: c.user_id,
      userName: c.user_username,
      userAvatar: c.user_avatar_url,
      content: c.content,
      status: "pending",
      flagged: c.is_flagged,
      flagReason: c.flag_reason,
      likesCount: c.likes_count,
      createdAt: c.created_at,
      updatedAt: c.updated_at,
      articleTitle: c.article_title,
      articleSlug: c.article_slug,
    }))

    successResponse(
      res,
      { comments: transformedComments },
      {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    )
  } catch (error) {
    logger.error({ error }, "Get pending comments error")
    errorResponse(res, "FETCH_FAILED", "Failed to fetch pending comments", undefined, 500)
  }
}

export async function getFlaggedComments(req: AuthRequest, res: Response): Promise<void> {
  try {
    const { page = 1, limit = 20 } = req.query as any
    const offset = (page - 1) * limit

    const countResult = await query("SELECT COUNT(*) FROM comments WHERE is_flagged = true")
    const total = Number.parseInt(countResult.rows[0].count)

    const result = await query(
      `SELECT
        c.id, c.article_id, c.user_id, c.content, c.flag_reason,
        c.is_approved, c.likes_count, c.created_at, c.updated_at,
        u.username as user_username, u.avatar_url as user_avatar_url,
        a.title as article_title, a.slug as article_slug
       FROM comments c
       JOIN users u ON c.user_id = u.id
       JOIN articles a ON c.article_id = a.id
       WHERE c.is_flagged = true
       ORDER BY c.created_at DESC
       LIMIT $1 OFFSET $2`,
      [limit, offset],
    )

    const transformedComments = result.rows.map((c) => ({
      id: c.id,
      articleId: c.article_id,
      userId: c.user_id,
      userName: c.user_username,
      userAvatar: c.user_avatar_url,
      content: c.content,
      status: c.is_approved ? "approved" : "rejected",
      flagged: true,
      flagReason: c.flag_reason,
      likesCount: c.likes_count,
      createdAt: c.created_at,
      updatedAt: c.updated_at,
      articleTitle: c.article_title,
      articleSlug: c.article_slug,
    }))

    successResponse(
      res,
      { comments: transformedComments },
      {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    )
  } catch (error) {
    logger.error({ error }, "Get flagged comments error")
    errorResponse(res, "FETCH_FAILED", "Failed to fetch flagged comments", undefined, 500)
  }
}
