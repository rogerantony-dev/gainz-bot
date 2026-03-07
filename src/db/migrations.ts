import type { Database } from "sql.js";

export function runMigrations(db: Database): void {
  db.run(`
    CREATE TABLE IF NOT EXISTS user_profile (
      id INTEGER PRIMARY KEY DEFAULT 1,
      height_cm REAL,
      weight_kg REAL,
      age INTEGER,
      sex TEXT CHECK(sex IN ('male', 'female')),
      activity_level TEXT CHECK(activity_level IN ('sedentary', 'light', 'moderate', 'active', 'very_active')),
      goal TEXT CHECK(goal IN ('bulk', 'cut', 'maintain')),
      calorie_target INTEGER,
      protein_target INTEGER,
      fat_target INTEGER,
      carb_target INTEGER,
      timezone TEXT DEFAULT 'UTC',
      onboarded_at TEXT,
      updated_at TEXT
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS food_memory (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      calories INTEGER NOT NULL,
      protein INTEGER,
      fat INTEGER,
      carbs INTEGER,
      times_logged INTEGER DEFAULT 1,
      last_used_at TEXT,
      created_at TEXT,
      updated_at TEXT
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS meals (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      logged_at TEXT NOT NULL,
      date TEXT NOT NULL,
      description TEXT,
      calories INTEGER,
      protein INTEGER,
      fat INTEGER,
      carbs INTEGER,
      photo_path TEXT,
      source TEXT CHECK(source IN ('photo', 'manual', 'memory')) DEFAULT 'manual',
      food_memory_id INTEGER REFERENCES food_memory(id)
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS workouts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date TEXT NOT NULL,
      exercises_json TEXT NOT NULL,
      screenshot_path TEXT,
      ai_analysis TEXT,
      created_at TEXT
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS physique_checkins (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date TEXT NOT NULL,
      photo_paths TEXT NOT NULL,
      ai_analysis TEXT,
      target_adjustments TEXT,
      created_at TEXT
    )
  `);
}
