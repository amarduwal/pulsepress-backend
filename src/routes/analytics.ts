import { Router } from "express"
import { z } from "zod"
import * as analyticsHandlers from "../handlers/analytics"
import { authenticate, requireModerator } from "../middleware/auth"
import { validateQuery, validateParams } from "../middleware/validation"
import { uuidSchema } from "../lib/validation"

const router = Router()

const periodQuerySchema = z.object({
  period: z.enum(["24h", "7d", "30d", "90d", "1y"]).default("7d"),
})

const topArticlesQuerySchema = periodQuerySchema.extend({
  limit: z.coerce.number().int().positive().max(50).default(10),
  metric: z.enum(["views", "shares", "comments"]).default("views"),
})

router.get("/overview", authenticate, requireModerator, analyticsHandlers.getOverview)
router.get(
  "/top-articles",
  authenticate,
  requireModerator,
  validateQuery(topArticlesQuerySchema),
  analyticsHandlers.getTopArticles,
)
router.get(
  "/traffic",
  authenticate,
  requireModerator,
  validateQuery(periodQuerySchema),
  analyticsHandlers.getTrafficStats,
)
router.get("/users", authenticate, requireModerator, validateQuery(periodQuerySchema), analyticsHandlers.getUserStats)
router.get(
  "/content",
  authenticate,
  requireModerator,
  validateQuery(periodQuerySchema),
  analyticsHandlers.getContentStats,
)
router.post("/track/:id", validateParams(z.object({ id: uuidSchema })), analyticsHandlers.trackArticleView)

export default router
