import type { Request, Response, NextFunction } from "express"
import { type z, ZodError } from "zod"
import { validationErrorResponse } from "../lib/response"

export function validateBody(schema: z.ZodSchema) {
  return (req: Request, res: Response, next: NextFunction): void => {
    try {
      req.body = schema.parse(req.body)
      next()
    } catch (error) {
      if (error instanceof ZodError) {
        validationErrorResponse(res, error.errors)
      } else {
        next(error)
      }
    }
  }
}

export function validateQuery(schema: z.ZodSchema) {
  return (req: Request, res: Response, next: NextFunction): void => {
    try {
      req.query = schema.parse(req.query)
      next()
    } catch (error) {
      if (error instanceof ZodError) {
        validationErrorResponse(res, error.errors)
      } else {
        next(error)
      }
    }
  }
}

export function validateParams(schema: z.ZodSchema) {
  return (req: Request, res: Response, next: NextFunction): void => {
    try {
      req.params = schema.parse(req.params)
      next()
    } catch (error) {
      if (error instanceof ZodError) {
        validationErrorResponse(res, error.errors)
      } else {
        next(error)
      }
    }
  }
}
