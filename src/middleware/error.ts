import type { Request, Response, NextFunction } from "express"
import { logger } from "../lib/logger"
import { serverErrorResponse } from "../lib/response"

export function errorHandler(error: Error, req: Request, res: Response, _next: NextFunction): void {
  logger.error(
    {
      error: {
        message: error.message,
        stack: error.stack,
      },
      request: {
        method: req.method,
        url: req.url,
        body: req.body,
      },
    },
    "Unhandled error",
  )

  serverErrorResponse(res)
}

export function notFoundHandler(req: Request, res: Response, _next: NextFunction): void {
  res.status(404).json({
    ok: false,
    error: {
      code: "NOT_FOUND",
      message: `Route ${req.method} ${req.path} not found`,
    },
  })
}
