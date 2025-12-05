import { Router } from "express"
import { z } from "zod"
import * as searchHandlers from "../handlers/search"
import { validateQuery } from "../middleware/validation"
import { paginationSchema, dateRangeSchema } from "../lib/validation"

const router = Router()

const searchQuerySchema = paginationSchema.merge(dateRangeSchema).extend({
  q: z.string().min(1).max(200),
  category: z.string().optional(),
  sortBy: z.enum(["relevance", "date", "views"]).default("relevance"),
})

const suggestionsQuerySchema = z.object({
  q: z.string().min(1).max(100),
  limit: z.coerce.number().int().positive().max(10).default(5),
})

const trendingQuerySchema = z.object({
  limit: z.coerce.number().int().positive().max(20).default(10),
})

router.get("/", validateQuery(searchQuerySchema), searchHandlers.searchArticles)
router.get("/suggestions", validateQuery(suggestionsQuerySchema), searchHandlers.searchSuggestions)
router.get("/trending", validateQuery(trendingQuerySchema), searchHandlers.getTrendingSearches)

export default router
