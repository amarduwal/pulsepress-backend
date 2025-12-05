import { Router } from "express"
import { z } from "zod"
import * as categoryHandlers from "../handlers/categories"
import { authenticate, requireAdmin } from "../middleware/auth"
import { validateBody, validateParams } from "../middleware/validation"
import { uuidSchema } from "../lib/validation"

const router = Router()

const createCategorySchema = z.object({
  name: z.string().min(1).max(100),
  slug: z.string().min(1).max(100),
  description: z.string().optional(),
  icon: z.string().max(50).optional(),
  color: z.string().max(20).optional(),
  is_active: z.boolean().optional(),
  sort_order: z.number().int().optional(),
})

const updateCategorySchema = createCategorySchema.partial()

// Public routes
router.get("/", categoryHandlers.getCategories)
router.get("/:slug", categoryHandlers.getCategoryBySlug)

// Protected routes
router.post("/", authenticate, requireAdmin, validateBody(createCategorySchema), categoryHandlers.createCategory)
router.put(
  "/:id",
  authenticate,
  requireAdmin,
  validateParams(z.object({ id: uuidSchema })),
  validateBody(updateCategorySchema),
  categoryHandlers.updateCategory,
)
router.delete(
  "/:id",
  authenticate,
  requireAdmin,
  validateParams(z.object({ id: uuidSchema })),
  categoryHandlers.deleteCategory,
)

export default router
