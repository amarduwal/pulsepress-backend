import type { Response } from "express"

export interface ApiResponse<T = any> {
  ok: boolean
  data?: T
  error?: {
    code: string
    message: string
    details?: any
  }
  meta?: {
    page?: number
    limit?: number
    total?: number
    totalPages?: number
  }
}

export function successResponse<T>(res: Response, data: T, meta?: ApiResponse["meta"], statusCode = 200): Response {
  const response: ApiResponse<T> = {
    ok: true,
    data,
    ...(meta && { meta }),
  }
  return res.status(statusCode).json(response)
}

export function errorResponse(res: Response, code: string, message: string, details?: any, statusCode = 400): Response {
  const response: ApiResponse = {
    ok: false,
    error: {
      code,
      message,
      ...(details && { details }),
    },
  }
  return res.status(statusCode).json(response)
}

export function notFoundResponse(res: Response, resource = "Resource"): Response {
  return errorResponse(res, "NOT_FOUND", `${resource} not found`, undefined, 404)
}

export function unauthorizedResponse(res: Response, message = "Unauthorized"): Response {
  return errorResponse(res, "UNAUTHORIZED", message, undefined, 401)
}

export function forbiddenResponse(res: Response, message = "Forbidden"): Response {
  return errorResponse(res, "FORBIDDEN", message, undefined, 403)
}

export function validationErrorResponse(res: Response, errors: any): Response {
  return errorResponse(res, "VALIDATION_ERROR", "Validation failed", errors, 422)
}

export function serverErrorResponse(res: Response, message = "Internal server error"): Response {
  return errorResponse(res, "SERVER_ERROR", message, undefined, 500)
}
