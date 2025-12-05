import { z } from "zod"

// Common validation schemas
export const uuidSchema = z.string().uuid()

export const paginationSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
})

export const sortSchema = z.object({
  sortBy: z.string().optional(),
  sortOrder: z.enum(["asc", "desc"]).default("desc"),
})

export const searchSchema = z.object({
  q: z.string().min(1).max(200),
})

export const dateRangeSchema = z.object({
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
})

// Helper to validate request data
export function validateData<T>(schema: z.ZodSchema<T>, data: unknown): T {
  return schema.parse(data)
}
