import { Router } from "express"
import { z } from "zod"
import * as userHandlers from "../handlers/users"
import { authenticate, requireAdmin } from "../middleware/auth"
import { validateBody, validateParams, validateQuery } from "../middleware/validation"
import { paginationSchema, uuidSchema } from "../lib/validation"

const router = Router()

const getUsersQuerySchema = paginationSchema.extend({
  role: z.enum(["admin", "moderator", "editor", "author", "user"]).optional(),
  status: z.enum(["active", "suspended", "banned"]).optional(),
  search: z.string().optional(),
})

const updateUserSchema = z.object({
  username: z.string().min(3).max(50).optional(),
  email: z.string().email().optional(),
  role: z.enum(["admin", "moderator", "editor", "author", "user"]).optional(),
  status: z.enum(["active", "suspended", "banned"]).optional(),
  bio: z.string().max(500).optional(),
  avatar_url: z.string().url().optional(),
})

const updateProfileSchema = z.object({
  username: z.string().min(3).max(50).optional(),
  bio: z.string().max(500).optional(),
  avatar_url: z.string().url().optional(),
  preferences: z.record(z.any()).optional(),
})

const changePasswordSchema = z.object({
  currentPassword: z.string(),
  newPassword: z.string().min(8).max(100),
})

// Admin routes
router.get("/", authenticate, requireAdmin, validateQuery(getUsersQuerySchema), userHandlers.getUsers)
router.get("/:id", authenticate, requireAdmin, validateParams(z.object({ id: uuidSchema })), userHandlers.getUserById)
router.put(
  "/:id",
  authenticate,
  requireAdmin,
  validateParams(z.object({ id: uuidSchema })),
  validateBody(updateUserSchema),
  userHandlers.updateUser,
)
router.delete("/:id", authenticate, requireAdmin, validateParams(z.object({ id: uuidSchema })), userHandlers.deleteUser)

// User profile routes
router.put("/me/profile", authenticate, validateBody(updateProfileSchema), userHandlers.updateProfile)
router.put("/me/password", authenticate, validateBody(changePasswordSchema), userHandlers.changePassword)

export default router
