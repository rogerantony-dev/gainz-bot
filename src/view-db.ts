import { initDb, getDb } from "./db/index.js";

async function main() {
  await initDb();
  const db = getDb();

  console.log("=== USER PROFILE ===");
  const profile = db.prepare("SELECT * FROM user_profile");
  if (profile.step()) {
    const cols = profile.getColumnNames();
    const vals = profile.get();
    cols.forEach((c: string, i: number) => console.log(`  ${c}: ${vals[i]}`));
  } else {
    console.log("  (empty)");
  }
  profile.free();

  console.log("\n=== MEALS (last 10) ===");
  const meals = db.prepare("SELECT id, date, description, calories, protein, fat, carbs, source FROM meals ORDER BY logged_at DESC LIMIT 10");
  while (meals.step()) {
    const v = meals.get();
    console.log(`  [${v[0]}] ${v[1]} | ${v[2]} | ${v[3]} kcal | ${v[4]}P ${v[5]}F ${v[6]}C | ${v[7]}`);
  }
  meals.free();

  console.log("\n=== FOOD MEMORY ===");
  const mem = db.prepare("SELECT name, calories, protein, fat, carbs, times_logged FROM food_memory ORDER BY times_logged DESC");
  while (mem.step()) {
    const v = mem.get();
    console.log(`  ${v[0]}: ${v[1]} kcal | ${v[2]}P ${v[3]}F ${v[4]}C | logged ${v[5]}x`);
  }
  mem.free();

  console.log("\n=== WORKOUTS (last 5) ===");
  const w = db.prepare("SELECT date, exercises_json FROM workouts ORDER BY date DESC LIMIT 5");
  while (w.step()) {
    const v = w.get();
    console.log(`  ${v[0]}: ${v[1]}`);
  }
  w.free();

  console.log("\n=== PHYSIQUE CHECK-INS ===");
  const p = db.prepare("SELECT date, ai_analysis FROM physique_checkins ORDER BY date DESC LIMIT 3");
  while (p.step()) {
    const v = p.get();
    console.log(`  ${v[0]}: ${String(v[1]).substring(0, 100)}...`);
  }
  p.free();
}

main();
