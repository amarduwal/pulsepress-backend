import { Pool, type QueryResult } from "pg"
import { config } from "../config"
import { logger } from "../lib/logger"

export const pool = new Pool({
  connectionString: config.database.url,
  min: config.database.poolMin,
  max: config.database.poolMax,
})

pool.on("error", (err) => {
  logger.error({ err }, "Unexpected error on idle client")
  process.exit(-1)
})

export async function query<T = any>(text: string, params?: any[]): Promise<QueryResult<T>> {
  const start = Date.now()
  try {
    const result = await pool.query<T>(text, params)
    const duration = Date.now() - start
    logger.debug({ text, duration, rows: result.rowCount }, "Executed query")
    return result
  } catch (error) {
    logger.error({ error, text, params }, "Query error")
    throw error
  }
}

export async function transaction<T>(callback: (client: any) => Promise<T>): Promise<T> {
  const client = await pool.connect()
  try {
    await client.query("BEGIN")
    const result = await callback(client)
    await client.query("COMMIT")
    return result
  } catch (error) {
    await client.query("ROLLBACK")
    throw error
  } finally {
    client.release()
  }
}
