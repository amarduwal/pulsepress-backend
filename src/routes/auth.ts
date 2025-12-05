import { Router } from "express"
import { z } from "zod"
import * as authHandlers from "../handlers/auth"
import { authenticate } from "../middleware/auth"
import { validateBody } from "../middleware/validation"
import { authLimiter } from "../middleware/rate-limit"

const router = Router()

const registerSchema = z.object({
  username: z.string().min(3).max(50),
  email: z.string().email(),
  password: z.string().min(8).max(100),
})

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string(),
})

const refreshSchema = z.object({
  refreshToken: z.string(),
})

router.post("/register", authLimiter, validateBody(registerSchema), authHandlers.register)
router.post("/login", authLimiter, validateBody(loginSchema), authHandlers.login)
router.post("/logout", authenticate, authHandlers.logout)
router.get("/me", authenticate, authHandlers.getMe)
router.post("/refresh", validateBody(refreshSchema), authHandlers.refreshAccessToken)

export default router
