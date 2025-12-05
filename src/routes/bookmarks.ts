import { Router } from "express"
import { z } from "zod"
import * as bookmarkHandlers from "../handlers/bookmarks"
import { authenticate } from "../middleware/auth"
import { validateParams, validateQuery } from "../middleware/validation"
import { paginationSchema, uuidSchema } from "../lib/validation"

const router = Router()

const getBookmarksQuerySchema = paginationSchema.extend({
  category: z.string().optional(),
})

router.get("/", authenticate, validateQuery(getBookmarksQuerySchema), bookmarkHandlers.getBookmarks)
router.post(
  "/:articleId",
  authenticate,
  validateParams(z.object({ articleId: uuidSchema })),
  bookmarkHandlers.createBookmark,
)
router.delete(
  "/:articleId",
  authenticate,
  validateParams(z.object({ articleId: uuidSchema })),
  bookmarkHandlers.deleteBookmark,
)
router.get(
  "/:articleId/check",
  authenticate,
  validateParams(z.object({ articleId: uuidSchema })),
  bookmarkHandlers.checkBookmark,
)

export default router
