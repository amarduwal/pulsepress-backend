import type { Request, Response, NextFunction } from "express"
import { verifyAccessToken } from "../lib/jwt"
import { unauthorizedResponse, forbiddenResponse } from "../lib/response"

export interface AuthRequest extends Request {
  user?: {
    userId: string
    email: string
    role: string
  }
}

export function authenticate(req: AuthRequest, res: Response, next: NextFunction): void {
  try {
    const authHeader = req.headers.authorization
    const token = authHeader?.startsWith("Bearer ") ? authHeader.substring(7) : req.cookies?.accessToken

    if (!token) {
      unauthorizedResponse(res, "No token provided")
      return
    }

    const payload = verifyAccessToken(token)
    req.user = payload
    next()
  } catch (error) {
    unauthorizedResponse(res, "Invalid or expired token")
  }
}

export function authorize(...roles: string[]) {
  return (req: AuthRequest, res: Response, next: NextFunction): void => {
    if (!req.user) {
      unauthorizedResponse(res, "Authentication required")
      return
    }

    if (!roles.includes(req.user.role)) {
      forbiddenResponse(res, "Insufficient permissions")
      return
    }

    next()
  }
}

export const requireAdmin = authorize("admin")
export const requireModerator = authorize("admin", "moderator")
export const requireEditor = authorize("admin", "moderator", "editor")
