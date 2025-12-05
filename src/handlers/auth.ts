import type { Response } from "express"
import type { AuthRequest } from "../middleware/auth"
import { query } from "../db/client"
import { hashPassword, comparePassword } from "../lib/password"
import { generateAccessToken, generateRefreshToken } from "../lib/jwt"
import { successResponse, errorResponse, unauthorizedResponse } from "../lib/response"
import { logger } from "../lib/logger"

interface RegisterBody {
  username: string
  email: string
  password: string
}

interface LoginBody {
  email: string
  password: string
}

export async function register(req: AuthRequest, res: Response): Promise<void> {
  try {
    const { username, email, password } = req.body as RegisterBody

    // Check if user exists
    const existingUser = await query("SELECT id FROM users WHERE email = $1 OR username = $2", [email, username])

    if (existingUser.rows.length > 0) {
      errorResponse(res, "USER_EXISTS", "User already exists", undefined, 409)
      return
    }

    // Hash password
    const passwordHash = await hashPassword(password)

    // Create user
    const result = await query(
      `INSERT INTO users (username, email, password_hash, role)
       VALUES ($1, $2, $3, 'user')
       RETURNING id, username, email, role, created_at`,
      [username, email, passwordHash],
    )

    const user = result.rows[0]

    // Generate tokens
    const accessToken = generateAccessToken({
      userId: user.id,
      email: user.email,
      role: user.role,
    })

    const refreshToken = generateRefreshToken({
      userId: user.id,
      email: user.email,
      role: user.role,
    })

    // Store refresh token
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) // 30 days
    await query("INSERT INTO refresh_tokens (user_id, token, expires_at) VALUES ($1, $2, $3)", [
      user.id,
      refreshToken,
      expiresAt,
    ])

    // Set cookie
    res.cookie("accessToken", accessToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    })

    successResponse(
      res,
      {
        user: {
          id: user.id,
          username: user.username,
          email: user.email,
          role: user.role,
        },
        accessToken,
        refreshToken,
      },
      undefined,
      201,
    )
  } catch (error) {
    logger.error({ error }, "Registration error")
    errorResponse(res, "REGISTRATION_FAILED", "Registration failed", undefined, 500)
  }
}

export async function login(req: AuthRequest, res: Response): Promise<void> {
  try {
    const { email, password } = req.body as LoginBody

    // Find user
    const result = await query(
      `SELECT id, username, email, password_hash, role, status
       FROM users WHERE email = $1`,
      [email],
    )

    if (result.rows.length === 0) {
      unauthorizedResponse(res, "Invalid credentials")
      return
    }

    const user = result.rows[0]

    // Check status
    if (user.status !== "active") {
      errorResponse(res, "ACCOUNT_SUSPENDED", "Account is suspended or banned", undefined, 403)
      return
    }

    // Verify password
    const isValid = await comparePassword(password, user.password_hash)
    if (!isValid) {
      unauthorizedResponse(res, "Invalid credentials")
      return
    }

    // Update last login
    await query("UPDATE users SET last_login_at = NOW() WHERE id = $1", [user.id])

    // Generate tokens
    const accessToken = generateAccessToken({
      userId: user.id,
      email: user.email,
      role: user.role,
    })

    const refreshToken = generateRefreshToken({
      userId: user.id,
      email: user.email,
      role: user.role,
    })

    // Store refresh token
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
    await query("INSERT INTO refresh_tokens (user_id, token, expires_at) VALUES ($1, $2, $3)", [
      user.id,
      refreshToken,
      expiresAt,
    ])

    // Set cookie
    res.cookie("accessToken", accessToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      maxAge: 7 * 24 * 60 * 60 * 1000,
    })

    successResponse(res, {
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        role: user.role,
      },
      accessToken,
      refreshToken,
    })
  } catch (error) {
    logger.error({ error }, "Login error")
    errorResponse(res, "LOGIN_FAILED", "Login failed", undefined, 500)
  }
}

export async function logout(req: AuthRequest, res: Response): Promise<void> {
  try {
    const { userId } = req.user!

    // Delete refresh tokens
    await query("DELETE FROM refresh_tokens WHERE user_id = $1", [userId])

    // Clear cookie
    res.clearCookie("accessToken")

    successResponse(res, { message: "Logged out successfully" })
  } catch (error) {
    logger.error({ error }, "Logout error")
    errorResponse(res, "LOGOUT_FAILED", "Logout failed", undefined, 500)
  }
}

export async function getMe(req: AuthRequest, res: Response): Promise<void> {
  try {
    const { userId } = req.user!

    const result = await query(
      `SELECT id, username, email, role, avatar_url, bio, preferences, 
              email_verified, created_at, updated_at
       FROM users WHERE id = $1`,
      [userId],
    )

    if (result.rows.length === 0) {
      errorResponse(res, "USER_NOT_FOUND", "User not found", undefined, 404)
      return
    }

    successResponse(res, { user: result.rows[0] })
  } catch (error) {
    logger.error({ error }, "Get me error")
    errorResponse(res, "FETCH_FAILED", "Failed to fetch user", undefined, 500)
  }
}

export async function refreshAccessToken(req: AuthRequest, res: Response): Promise<void> {
  try {
    const { refreshToken } = req.body

    if (!refreshToken) {
      errorResponse(res, "NO_REFRESH_TOKEN", "Refresh token required", undefined, 400)
      return
    }

    // Verify refresh token exists in database
    const tokenResult = await query(
      `SELECT rt.user_id, rt.expires_at, u.email, u.role
       FROM refresh_tokens rt
       JOIN users u ON u.id = rt.user_id
       WHERE rt.token = $1 AND rt.expires_at > NOW()`,
      [refreshToken],
    )

    if (tokenResult.rows.length === 0) {
      unauthorizedResponse(res, "Invalid or expired refresh token")
      return
    }

    const { user_id, email, role } = tokenResult.rows[0]

    // Generate new access token
    const accessToken = generateAccessToken({
      userId: user_id,
      email,
      role,
    })

    // Set cookie
    res.cookie("accessToken", accessToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      maxAge: 7 * 24 * 60 * 60 * 1000,
    })

    successResponse(res, { accessToken })
  } catch (error) {
    logger.error({ error }, "Refresh token error")
    errorResponse(res, "REFRESH_FAILED", "Token refresh failed", undefined, 500)
  }
}
