import fs from "fs"
import path from "path"
import { pool } from "./client"
import { logger } from "../lib/logger"

interface Migration {
  name: string
  sql: string
  path: string
}

async function ensureMigrationsTable() {
  const createTableSQL = `
    CREATE TABLE IF NOT EXISTS migrations (
      id SERIAL PRIMARY KEY,
      name VARCHAR(255) NOT NULL UNIQUE,
      executed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_migrations_name ON migrations(name);
  `
  await pool.query(createTableSQL)
}

async function getExecutedMigrations(): Promise<string[]> {
  const result = await pool.query<{ name: string }>(
    "SELECT name FROM migrations ORDER BY id"
  )
  return result.rows.map((row) => row.name)
}

// async function markMigrationAsExecuted(name: string) {
//   await pool.query("INSERT INTO migrations (name) VALUES ($1)", [name])
// }

async function removeMigrationRecord(name: string) {
  await pool.query("DELETE FROM migrations WHERE name = $1", [name])
}

function getAllMigrationFiles(migrationsDir: string): Migration[] {
  if (!fs.existsSync(migrationsDir)) {
    logger.warn(`Migrations directory not found: ${migrationsDir}`)
    return []
  }

  return fs
    .readdirSync(migrationsDir)
    .filter((f) => f.endsWith(".sql"))
    .sort()
    .map((file) => ({
      name: file,
      path: path.join(migrationsDir, file),
      sql: fs.readFileSync(path.join(migrationsDir, file), "utf-8"),
    }))
}

async function migrate() {
  const migrationsDir = path.join(__dirname, "migrations")

  await ensureMigrationsTable()

  const allMigrations = getAllMigrationFiles(migrationsDir)
  const executedMigrations = await getExecutedMigrations()

  const pendingMigrations = allMigrations.filter(
    (m) => !executedMigrations.includes(m.name)
  )

  if (pendingMigrations.length === 0) {
    logger.info("No pending migrations to run")
    return
  }

  logger.info(`Found ${pendingMigrations.length} pending migration(s)`)

  for (const migration of pendingMigrations) {
    const client = await pool.connect()
    try {
      logger.info(`Running migration: ${migration.name}`)
      await client.query("BEGIN")
      await client.query(migration.sql)
      await client.query("INSERT INTO migrations (name) VALUES ($1)", [migration.name])
      await client.query("COMMIT")
      logger.info(`✓ Completed migration: ${migration.name}`)
    } catch (error: any) {
      await client.query("ROLLBACK")
      logger.error({
        error: {
          message: error.message,
          code: error.code,
          detail: error.detail
        },
        file: migration.name
      }, `Failed to run migration: ${migration.name}`)

      if (error.code === "42P07") {
        logger.error(`Table already exists. You may need to:`)
        logger.error(`1. Run 'npm run migrate:reset' to rollback all migrations`)
        logger.error(`2. Or manually mark this migration as executed if tables exist`)
        logger.error(`3. Or use 'CREATE TABLE IF NOT EXISTS' in your migration`)
      }

      throw error
    } finally {
      client.release()
    }
  }

  logger.info("All migrations completed successfully")
}

async function rollback(steps: number = 1) {
  await ensureMigrationsTable()

  const executedMigrations = await getExecutedMigrations()

  if (executedMigrations.length === 0) {
    logger.info("No migrations to rollback")
    return
  }

  const migrationsToRollback = executedMigrations.slice(-steps).reverse()

  logger.info(`Rolling back ${migrationsToRollback.length} migration(s)`)

  for (const migrationName of migrationsToRollback) {
    const rollbackFile = migrationName.replace(".sql", ".down.sql")
    const rollbackPath = path.join(__dirname, "migrations", rollbackFile)

    if (!fs.existsSync(rollbackPath)) {
      logger.warn(`Rollback file not found for ${migrationName}, skipping`)
      continue
    }

    try {
      logger.info(`Rolling back: ${migrationName}`)
      const sql = fs.readFileSync(rollbackPath, "utf-8")
      await pool.query("BEGIN")
      await pool.query(sql)
      await removeMigrationRecord(migrationName)
      await pool.query("COMMIT")
      logger.info(`✓ Rolled back: ${migrationName}`)
    } catch (error) {
      await pool.query("ROLLBACK")
      logger.error({ error, file: migrationName }, `Failed to rollback: ${migrationName}`)
      throw error
    }
  }

  logger.info("Rollback completed successfully")
}

async function reset() {
  logger.info("Resetting database...")

  await ensureMigrationsTable()

  const executedMigrations = await getExecutedMigrations()

  if (executedMigrations.length === 0) {
    logger.info("No migrations to reset")
    return
  }

  // Rollback all migrations
  await rollback(executedMigrations.length)

  logger.info("Database reset completed")
}

async function seed() {
  const seedsDir = path.join(__dirname, "seeds")

  if (!fs.existsSync(seedsDir)) {
    logger.warn(`Seeds directory not found: ${seedsDir}`)
    return
  }

  const seedFiles = fs
    .readdirSync(seedsDir)
    .filter((f) => f.endsWith(".sql") || f.endsWith(".ts"))
    .sort()

  if (seedFiles.length === 0) {
    logger.info("No seed files found")
    return
  }

  logger.info(`Found ${seedFiles.length} seed file(s)`)

  for (const file of seedFiles) {
    const filePath = path.join(seedsDir, file)

    try {
      logger.info(`Running seed: ${file}`)

      if (file.endsWith(".sql")) {
        const sql = fs.readFileSync(filePath, "utf-8")
        await pool.query(sql)
      } else if (file.endsWith(".ts")) {
        const seedModule = await import(filePath)
        if (typeof seedModule.default === "function") {
          await seedModule.default(pool)
        } else if (typeof seedModule.seed === "function") {
          await seedModule.seed(pool)
        }
      }

      logger.info(`✓ Completed seed: ${file}`)
    } catch (error) {
      logger.error({ error, file }, `Failed to run seed: ${file}`)
      throw error
    }
  }

  logger.info("All seeds completed successfully")
}

async function status() {
  await ensureMigrationsTable()

  const migrationsDir = path.join(__dirname, "migrations")
  const allMigrations = getAllMigrationFiles(migrationsDir)
  const executedMigrations = await getExecutedMigrations()

  logger.info("\n=== Migration Status ===\n")

  if (allMigrations.length === 0) {
    logger.info("No migration files found")
    return
  }

  for (const migration of allMigrations) {
    const status = executedMigrations.includes(migration.name) ? "✓" : "✗"
    const label = executedMigrations.includes(migration.name) ? "executed" : "pending"
    logger.info(`${status} ${migration.name} (${label})`)
  }

  logger.info(`\nTotal: ${allMigrations.length} | Executed: ${executedMigrations.length} | Pending: ${allMigrations.length - executedMigrations.length}`)
}

// async function markAsExecuted(migrationName: string) {
//   await ensureMigrationsTable()

//   const executedMigrations = await getExecutedMigrations()

//   if (executedMigrations.includes(migrationName)) {
//     logger.warn(`Migration '${migrationName}' is already marked as executed`)
//     return
//   }

//   try {
//     await markMigrationAsExecuted(migrationName)
//     logger.info(`✓ Marked '${migrationName}' as executed`)
//   } catch (error) {
//     logger.error({ error }, `Failed to mark migration as executed`)
//     throw error
//   }
// }

async function fresh() {
  logger.info("Performing fresh migration (drop all tables and re-migrate)...")

  try {
    // Drop all tables in the public schema
    await pool.query(`
      DO $ DECLARE
        r RECORD;
      BEGIN
        FOR r IN (SELECT tablename FROM pg_tables WHERE schemaname = 'public') LOOP
          EXECUTE 'DROP TABLE IF EXISTS ' || quote_ident(r.tablename) || ' CASCADE';
        END LOOP;
      END $;
    `)

    logger.info("All tables dropped")

    // Now run all migrations
    await migrate()

    logger.info("Fresh migration completed successfully")
  } catch (error) {
    logger.error({ error }, "Fresh migration failed")
    throw error
  }
}

async function main() {
  const command = process.argv[2] || "migrate"
  const arg = process.argv[3]

  try {
    switch (command) {
      case "migrate":
        await migrate()
        break
      case "rollback":
        await rollback(arg ? parseInt(arg, 10) : 1)
        break
      case "reset":
        await reset()
        break
      case "seed":
        await seed()
        break
      case "status":
        await status()
        break
      case "fresh":
        await fresh()
        break
      default:
        logger.error(`Unknown command: ${command}`)
        logger.info("Available commands: migrate, rollback [steps], reset, seed, status")
        process.exit(1)
    }
  } catch (error) {
    logger.error({ error }, `Command '${command}' failed`)
    process.exit(1)
  } finally {
    await pool.end()
  }
}

main()
