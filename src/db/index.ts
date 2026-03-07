import initSqlJs, { Database } from "sql.js";
import path from "node:path";
import fs from "node:fs";

const DB_DIR = path.resolve("data");
const DB_PATH = path.join(DB_DIR, "gainz.db");

let _db: Database | null = null;

export async function initDb(): Promise<void> {
  if (_db) return;

  const SQL = await initSqlJs();
  fs.mkdirSync(DB_DIR, { recursive: true });

  if (fs.existsSync(DB_PATH)) {
    const buffer = fs.readFileSync(DB_PATH);
    _db = new SQL.Database(buffer);
  } else {
    _db = new SQL.Database();
  }

  // Run migrations
  const { runMigrations } = await import("./migrations.js");
  runMigrations(_db);

  saveDb();
}

export function getDb(): Database {
  if (!_db) throw new Error("Database not initialized. Call initDb() first.");
  return _db;
}

export function saveDb(): void {
  if (!_db) return;
  const data = _db.export();
  fs.writeFileSync(DB_PATH, Buffer.from(data));
}
