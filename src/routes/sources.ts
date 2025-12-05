import { Router } from "express"
import { z } from "zod"
import * as sourceHandlers from "../handlers/sources"
import { authenticate, requireAdmin } from "../middleware/auth"
import { validateBody, validateParams, validateQuery } from "../middleware/validation"
import { paginationSchema, uuidSchema } from "../lib/validation"

const router = Router()

const getSourcesQuerySchema = paginationSchema.extend({
  type: z.enum(['rss', 'rss-full', 'rss-scrape', 'api', 'scraper']).optional(),
  is_active: z.string().optional(),
})

const createSourceSchema = z.object({
  name: z.string().min(1).max(255),
  base_url: z.string().url(),
  type: z.enum(['rss', 'rss-full', 'rss-scrape', 'api', 'scraper']),
  config: z.record(z.any()).optional(),
  is_active: z.boolean().optional(),
  fetch_interval_minutes: z.number().int().positive().optional(),
})

const updateSourceSchema = createSourceSchema.partial()

router.get("/", authenticate, requireAdmin, validateQuery(getSourcesQuerySchema), sourceHandlers.getSources)
router.get(
  "/:id",
  authenticate,
  requireAdmin,
  validateParams(z.object({ id: uuidSchema })),
  sourceHandlers.getSourceById,
)
router.post("/", authenticate, requireAdmin, validateBody(createSourceSchema), sourceHandlers.createSource)
router.put(
  "/:id",
  authenticate,
  requireAdmin,
  validateParams(z.object({ id: uuidSchema })),
  validateBody(updateSourceSchema),
  sourceHandlers.updateSource,
)
router.delete(
  "/:id",
  authenticate,
  requireAdmin,
  validateParams(z.object({ id: uuidSchema })),
  sourceHandlers.deleteSource,
)
router.post(
  "/:id/test",
  authenticate,
  requireAdmin,
  validateParams(z.object({ id: uuidSchema })),
  sourceHandlers.testSource,
)
router.post(
  "/:id/refresh",
  authenticate,
  requireAdmin,
  validateParams(z.object({ id: uuidSchema })),
  sourceHandlers.refreshSource,
)

export default router
