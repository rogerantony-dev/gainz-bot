import { getDb, saveDb } from "./index.js";

// Helper to get one row as an object
function getOne<T>(sql: string, params: unknown[] = []): T | undefined {
  const db = getDb();
  const stmt = db.prepare(sql);
  stmt.bind(params);
  if (stmt.step()) {
    const cols = stmt.getColumnNames();
    const vals = stmt.get();
    stmt.free();
    const row: Record<string, unknown> = {};
    cols.forEach((col: string, i: number) => (row[col] = vals[i]));
    return row as T;
  }
  stmt.free();
  return undefined;
}

function getAll<T>(sql: string, params: unknown[] = []): T[] {
  const db = getDb();
  const stmt = db.prepare(sql);
  stmt.bind(params);
  const rows: T[] = [];
  const cols = stmt.getColumnNames();
  while (stmt.step()) {
    const vals = stmt.get();
    const row: Record<string, unknown> = {};
    cols.forEach((col: string, i: number) => (row[col] = vals[i]));
    rows.push(row as T);
  }
  stmt.free();
  return rows;
}

function run(sql: string, params: unknown[] = []): void {
  getDb().run(sql, params);
  saveDb();
}

// ── User Profile ──

export interface UserProfile {
  id: number;
  height_cm: number | null;
  weight_kg: number | null;
  age: number | null;
  sex: "male" | "female" | null;
  activity_level: string | null;
  goal: "bulk" | "cut" | "maintain" | null;
  calorie_target: number | null;
  protein_target: number | null;
  fat_target: number | null;
  carb_target: number | null;
  timezone: string;
  onboarded_at: string | null;
  updated_at: string | null;
}

export function getProfile(): UserProfile | undefined {
  return getOne<UserProfile>("SELECT * FROM user_profile WHERE id = 1");
}

export function upsertProfile(data: Partial<UserProfile>): void {
  const existing = getProfile();
  const now = new Date().toISOString();

  if (!existing) {
    run(
      `INSERT INTO user_profile (id, height_cm, weight_kg, age, sex, activity_level, goal,
       calorie_target, protein_target, fat_target, carb_target, timezone, onboarded_at, updated_at)
       VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        data.height_cm ?? null,
        data.weight_kg ?? null,
        data.age ?? null,
        data.sex ?? null,
        data.activity_level ?? null,
        data.goal ?? null,
        data.calorie_target ?? null,
        data.protein_target ?? null,
        data.fat_target ?? null,
        data.carb_target ?? null,
        data.timezone ?? "UTC",
        data.onboarded_at ?? null,
        now,
      ],
    );
  } else {
    const entries = Object.entries(data).filter(([k]) => k !== "id");
    if (entries.length === 0) return;

    const fields = entries.map(([k]) => `${k} = ?`);
    fields.push("updated_at = ?");
    const values = entries.map(([, v]) => v ?? null);
    values.push(now);

    run(`UPDATE user_profile SET ${fields.join(", ")} WHERE id = 1`, values);
  }
}

// ── Meals ──

export interface Meal {
  id: number;
  logged_at: string;
  date: string;
  description: string | null;
  calories: number | null;
  protein: number | null;
  fat: number | null;
  carbs: number | null;
  photo_path: string | null;
  source: "photo" | "manual" | "memory";
  food_memory_id: number | null;
}

export function logMeal(meal: Omit<Meal, "id">): void {
  run(
    `INSERT INTO meals (logged_at, date, description, calories, protein, fat, carbs, photo_path, source, food_memory_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      meal.logged_at,
      meal.date,
      meal.description,
      meal.calories,
      meal.protein,
      meal.fat,
      meal.carbs,
      meal.photo_path,
      meal.source,
      meal.food_memory_id,
    ],
  );
}

export function getMealsForDate(date: string): Meal[] {
  return getAll<Meal>(
    "SELECT * FROM meals WHERE date = ? ORDER BY logged_at",
    [date],
  );
}

export function getDailyTotals(date: string) {
  return (
    getOne<{
      total_calories: number;
      total_protein: number;
      total_fat: number;
      total_carbs: number;
      meal_count: number;
    }>(
      `SELECT
        COALESCE(SUM(calories), 0) as total_calories,
        COALESCE(SUM(protein), 0) as total_protein,
        COALESCE(SUM(fat), 0) as total_fat,
        COALESCE(SUM(carbs), 0) as total_carbs,
        COUNT(*) as meal_count
       FROM meals WHERE date = ?`,
      [date],
    ) ?? {
      total_calories: 0,
      total_protein: 0,
      total_fat: 0,
      total_carbs: 0,
      meal_count: 0,
    }
  );
}

export function updateMealCalories(
  mealId: number,
  calories: number,
  protein?: number,
  fat?: number,
  carbs?: number,
): void {
  run(
    `UPDATE meals SET calories = ?, protein = COALESCE(?, protein), fat = COALESCE(?, fat), carbs = COALESCE(?, carbs) WHERE id = ?`,
    [calories, protein ?? null, fat ?? null, carbs ?? null, mealId],
  );
}

export function getLastMealByDescription(
  date: string,
  description: string,
): Meal | undefined {
  return getOne<Meal>(
    "SELECT * FROM meals WHERE date = ? AND LOWER(description) LIKE '%' || LOWER(?) || '%' ORDER BY logged_at DESC LIMIT 1",
    [date, description],
  );
}

// ── Food Memory ──

export interface FoodMemory {
  id: number;
  name: string;
  calories: number;
  protein: number | null;
  fat: number | null;
  carbs: number | null;
  times_logged: number;
  last_used_at: string | null;
  created_at: string | null;
  updated_at: string | null;
}

export function findFoodMemory(name: string): FoodMemory | undefined {
  return getOne<FoodMemory>(
    "SELECT * FROM food_memory WHERE LOWER(name) = LOWER(?) LIMIT 1",
    [name],
  );
}

export function getAllFoodMemories(): FoodMemory[] {
  return getAll<FoodMemory>(
    "SELECT * FROM food_memory ORDER BY times_logged DESC",
  );
}

export function upsertFoodMemory(
  name: string,
  calories: number,
  protein?: number,
  fat?: number,
  carbs?: number,
): number {
  const now = new Date().toISOString();
  const existing = findFoodMemory(name);

  if (existing) {
    run(
      `UPDATE food_memory SET calories = ?, protein = ?, fat = ?, carbs = ?,
       times_logged = times_logged + 1, last_used_at = ?, updated_at = ? WHERE id = ?`,
      [calories, protein ?? null, fat ?? null, carbs ?? null, now, now, existing.id],
    );
    return existing.id;
  }

  run(
    `INSERT INTO food_memory (name, calories, protein, fat, carbs, times_logged, last_used_at, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?)`,
    [name, calories, protein ?? null, fat ?? null, carbs ?? null, now, now, now],
  );

  // Get the last inserted ID
  const row = getOne<{ id: number }>("SELECT last_insert_rowid() as id");
  return row?.id ?? 0;
}

export function deleteFoodMemory(name: string): boolean {
  const before = getOne<{ cnt: number }>(
    "SELECT COUNT(*) as cnt FROM food_memory WHERE LOWER(name) = LOWER(?)",
    [name],
  );
  if (!before || before.cnt === 0) return false;

  run("DELETE FROM food_memory WHERE LOWER(name) = LOWER(?)", [name]);
  return true;
}

// ── Workouts ──

export interface Workout {
  id: number;
  date: string;
  exercises_json: string;
  screenshot_path: string | null;
  ai_analysis: string | null;
  created_at: string | null;
}

export function logWorkout(
  date: string,
  exercisesJson: string,
  screenshotPath?: string,
  aiAnalysis?: string,
): void {
  const now = new Date().toISOString();
  run(
    `INSERT INTO workouts (date, exercises_json, screenshot_path, ai_analysis, created_at)
     VALUES (?, ?, ?, ?, ?)`,
    [date, exercisesJson, screenshotPath ?? null, aiAnalysis ?? null, now],
  );
}

export function getWorkoutsForDateRange(
  startDate: string,
  endDate: string,
): Workout[] {
  return getAll<Workout>(
    "SELECT * FROM workouts WHERE date >= ? AND date <= ? ORDER BY date DESC",
    [startDate, endDate],
  );
}

export function getRecentWorkoutsWithExercise(
  exerciseName: string,
  limit = 5,
): Workout[] {
  return getAll<Workout>(
    `SELECT * FROM workouts WHERE exercises_json LIKE '%' || ? || '%' ORDER BY date DESC LIMIT ?`,
    [exerciseName, limit],
  );
}

// ── Physique Check-ins ──

export function logPhysiqueCheckin(
  date: string,
  photoPaths: string[],
  aiAnalysis?: string,
  targetAdjustments?: string,
): void {
  const now = new Date().toISOString();
  run(
    `INSERT INTO physique_checkins (date, photo_paths, ai_analysis, target_adjustments, created_at)
     VALUES (?, ?, ?, ?, ?)`,
    [
      date,
      JSON.stringify(photoPaths),
      aiAnalysis ?? null,
      targetAdjustments ?? null,
      now,
    ],
  );
}

export function getLastPhysiqueCheckin() {
  return getOne<{
    id: number;
    date: string;
    photo_paths: string;
    ai_analysis: string | null;
    target_adjustments: string | null;
    created_at: string | null;
  }>("SELECT * FROM physique_checkins ORDER BY date DESC LIMIT 1");
}
