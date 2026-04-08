import "dotenv/config";
import { readdirSync, readFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import db from "./connection.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const MIGRATIONS_DIR = join(__dirname, "migrations");

async function ensureMigrationsTable() {
  await db.execute(`
    CREATE TABLE IF NOT EXISTS migrations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      executed_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
}

async function getExecutedMigrations() {
  const result = await db.execute("SELECT name FROM migrations ORDER BY name");
  return new Set(result.rows.map((row) => row.name));
}

async function runMigration(name, sql) {
  console.log(`Running migration: ${name}`);
  // Delegate statement splitting to libsql. Handles comments, string literals,
  // and trigger bodies correctly — unlike a naive sql.split(";").
  await db.executeMultiple(sql);

  await db.execute({
    sql: "INSERT INTO migrations (name) VALUES (?)",
    args: [name],
  });
  console.log(`Completed migration: ${name}`);
}

export async function migrate() {
  console.log("Starting EA database migrations...");
  await ensureMigrationsTable();
  const executed = await getExecutedMigrations();

  let migrationFiles;
  try {
    migrationFiles = readdirSync(MIGRATIONS_DIR)
      .filter((f) => f.endsWith(".sql"))
      .sort();
  } catch (err) {
    if (err.code === "ENOENT") {
      console.log("No migrations directory found, skipping.");
      return;
    }
    throw err;
  }

  let ranCount = 0;
  for (const file of migrationFiles) {
    if (!executed.has(file)) {
      const sql = readFileSync(join(MIGRATIONS_DIR, file), "utf-8");
      await runMigration(file, sql);
      ranCount++;
    }
  }

  console.log(ranCount === 0 ? "No new migrations." : `Ran ${ranCount} migration(s).`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  migrate()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error("Migration failed:", err);
      process.exit(1);
    });
}
