import { Router } from "express"
import { z } from "zod"
import * as articleHandlers from "../handlers/articles"
import { authenticate, requireEditor } from "../middleware/auth"
import { validateBody, validateParams, validateQuery } from "../middleware/validation"
import { paginationSchema, sortSchema, uuidSchema } from "../lib/validation"

const router = Router()

const getArticlesQuerySchema = paginationSchema.merge(sortSchema).extend({
  category: z.string().optional(),
  status: z.enum(["draft", "pending", "published", "archived"]).optional(),
  tag: z.string().optional(),
  featured: z.string().optional(),
  trending: z.string().optional(),
})

const createArticleSchema = z.object({
  title: z.string().min(1).max(500),
  summary: z.string().optional(),
  content_rewritten: z.string().optional(),
  content_original: z.string().optional(),
  source_url: z.string().url(),
  source_name: z.string().min(1).max(255),
  author_name: z.string().max(255).optional(),
  category_id: z.string().uuid().optional(),
  featured_image: z.string().url().optional(),
  media_gallery: z.array(z.string().url()).optional(),
  tags: z.array(z.string()).optional(),
  keywords: z.array(z.string()).optional(),
  entities: z.record(z.any()).optional(),
  status: z.enum(["draft", "pending", "published", "archived"]).optional(),
  is_featured: z.boolean().optional(),
})

const updateArticleSchema = createArticleSchema.partial().extend({
  is_trending: z.boolean().optional(),
})

// Public routes
router.get("/", validateQuery(getArticlesQuerySchema), articleHandlers.getArticles)
router.get("/:id", validateParams(z.object({ id: uuidSchema })), articleHandlers.getArticleById)
router.get("/slug/:slug", articleHandlers.getArticleBySlug)
router.get("/:id/related", validateParams(z.object({ id: uuidSchema })), articleHandlers.getRelatedArticles)
router.post("/:id/share", validateParams(z.object({ id: uuidSchema })), articleHandlers.incrementShareCount)

// Protected routes
router.post("/", authenticate, requireEditor, validateBody(createArticleSchema), articleHandlers.createArticle)
router.put(
  "/:id",
  authenticate,
  requireEditor,
  validateParams(z.object({ id: uuidSchema })),
  validateBody(updateArticleSchema),
  articleHandlers.updateArticle,
)
router.delete(
  "/:id",
  authenticate,
  requireEditor,
  validateParams(z.object({ id: uuidSchema })),
  articleHandlers.deleteArticle,
)

export default router
