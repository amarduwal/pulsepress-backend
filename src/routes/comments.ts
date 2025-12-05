import { Router } from "express"
import { z } from "zod"
import * as commentHandlers from "../handlers/comments"
import { authenticate, requireModerator } from "../middleware/auth"
import { validateBody, validateParams, validateQuery } from "../middleware/validation"
import { paginationSchema, uuidSchema } from "../lib/validation"

const router = Router()

const createCommentSchema = z.object({
  content: z.string().min(1).max(2000),
  parent_id: z.string().uuid().optional(),
})

const updateCommentSchema = z.object({
  content: z.string().min(1).max(2000),
})

const flagCommentSchema = z.object({
  reason: z.string().min(1).max(500),
})

// Public/authenticated routes
router.get("/article/:id", validateParams(z.object({ id: uuidSchema })), commentHandlers.getComments)
router.post(
  "/articles/:id/comments",
  authenticate,
  validateParams(z.object({ id: uuidSchema })),
  validateBody(createCommentSchema),
  commentHandlers.createComment,
)
router.put(
  "/:id",
  authenticate,
  validateParams(z.object({ id: uuidSchema })),
  validateBody(updateCommentSchema),
  commentHandlers.updateComment,
)
router.delete("/:id", authenticate, validateParams(z.object({ id: uuidSchema })), commentHandlers.deleteComment)
router.post("/:id/like", validateParams(z.object({ id: uuidSchema })), commentHandlers.likeComment)

// Moderation routes
router.get(
  "/pending",
  authenticate,
  requireModerator,
  validateQuery(paginationSchema),
  commentHandlers.getPendingComments,
)
router.get(
  "/flagged",
  authenticate,
  requireModerator,
  validateQuery(paginationSchema),
  commentHandlers.getFlaggedComments,
)
router.post(
  "/:id/approve",
  authenticate,
  requireModerator,
  validateParams(z.object({ id: uuidSchema })),
  commentHandlers.approveComment,
)
router.post(
  "/:id/flag",
  authenticate,
  validateParams(z.object({ id: uuidSchema })),
  validateBody(flagCommentSchema),
  commentHandlers.flagComment,
)

export default router
