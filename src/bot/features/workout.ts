import { BotContext } from "../context.js";
import { analyzeImageStructured, analyzeImage } from "../../ai/client.js";
import {
  workoutExtractionJsonSchema,
  type WorkoutExtraction,
} from "../../ai/schemas.js";
import {
  WORKOUT_EXTRACTION_PROMPT,
  COACH_SYSTEM_PROMPT,
} from "../../ai/prompts.js";
import {
  logWorkout,
  getProfile,
  getRecentWorkoutsWithExercise,
} from "../../db/queries.js";
import { getTodayDate } from "../../utils/date.js";
import fs from "node:fs";
import path from "node:path";

export async function handleWorkoutScreenshot(
  ctx: BotContext,
  imageBuffer: Buffer,
  mimeType: string,
  originalPath: string,
): Promise<void> {
  const profile = getProfile();
  if (!profile) return;

  // Move screenshot to workout photos dir
  const workoutDir = path.resolve("data", "photos", "workouts");
  fs.mkdirSync(workoutDir, { recursive: true });
  const ext = path.extname(originalPath) || ".jpg";
  const fileName = `${Date.now()}${ext}`;
  const savePath = path.join(workoutDir, fileName);
  fs.copyFileSync(originalPath, savePath);

  // Extract workout data
  const workout = await analyzeImageStructured<WorkoutExtraction>(
    imageBuffer,
    mimeType,
    WORKOUT_EXTRACTION_PROMPT,
    workoutExtractionJsonSchema,
  );

  // Get history for comparison
  const historyContext: string[] = [];
  for (const exercise of workout.exercises) {
    const previous = getRecentWorkoutsWithExercise(exercise.name, 3);
    if (previous.length > 0) {
      historyContext.push(
        `Previous ${exercise.name} sessions:\n` +
          previous
            .map((w) => {
              const data = JSON.parse(w.exercises_json);
              const match = data.find(
                (e: { name: string }) =>
                  e.name.toLowerCase() === exercise.name.toLowerCase(),
              );
              if (!match) return `  ${w.date}: no data`;
              const setsStr = match.sets
                .map(
                  (s: { reps: number; weight_kg: number }) =>
                    `${s.reps}x${s.weight_kg}kg`,
                )
                .join(", ");
              return `  ${w.date}: ${setsStr}`;
            })
            .join("\n"),
      );
    }
  }

  // Calculate total volume
  let totalVolume = 0;
  for (const ex of workout.exercises) {
    for (const set of ex.sets) {
      totalVolume += set.reps * set.weight_kg;
    }
  }

  // Generate coaching feedback
  const today = getTodayDate(profile.timezone);
  const workoutSummary = workout.exercises
    .map(
      (ex) =>
        `${ex.name}: ${ex.sets.map((s) => `${s.reps}x${s.weight_kg}kg`).join(", ")}`,
    )
    .join("\n");

  const coachPrompt =
    `Today's ${workout.workout_name} (${today}):\n${workoutSummary}\n` +
    `Total volume: ${totalVolume}kg across ${workout.total_sets} sets\n` +
    (workout.duration_minutes
      ? `Duration: ${workout.duration_minutes} min\n`
      : "") +
    (historyContext.length > 0
      ? `\nHistory:\n${historyContext.join("\n\n")}`
      : "\nNo previous history for these exercises.") +
    `\n\nGive your strict coaching review. Be specific about the numbers.`;

  const analysis = await analyzeImage(
    imageBuffer,
    mimeType,
    coachPrompt,
    COACH_SYSTEM_PROMPT,
  );

  // Store workout
  const exercisesForDb = workout.exercises.map((ex) => ({
    name: ex.name,
    sets: ex.sets,
  }));

  logWorkout(today, JSON.stringify(exercisesForDb), savePath, analysis);

  await ctx.reply(`💪 ${workout.workout_name}\n\n${analysis}`);
}
