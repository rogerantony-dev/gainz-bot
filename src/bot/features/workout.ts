import { BotContext } from "../context.js";
import { analyzeMultipleImages, generateText } from "../../ai/client.js";
import { COACH_SYSTEM_PROMPT } from "../../ai/prompts.js";
import {
  logWorkout,
  getProfile,
  getWorkoutsForDateRange,
} from "../../db/queries.js";
import { getTodayDate, getDateNDaysAgo } from "../../utils/date.js";
import type { DownloadedPhoto } from "./food-photo.js";
import fs from "node:fs";
import path from "node:path";

const WORKOUT_MULTI_PROMPT = `You are analyzing multiple screenshots from a workout tracking app (like Hevy). These screenshots together represent ONE complete workout session.

Extract ALL exercises across ALL screenshots. For each exercise, list the sets with reps and weight (in kg -- if lbs, divide by 2.2).

Then give a strict coaching review:
- Name the workout type (Push Day, Leg Day, etc.)
- List every exercise with sets
- Total volume (sum of sets x reps x weight)
- Progressive overload assessment (if history provided)
- What was good, what was lacking
- 1-2 specific actionable tips

Be direct, reference specific numbers. No fluff.`;

export async function handleWorkoutScreenshots(
  ctx: BotContext,
  photos: DownloadedPhoto[],
): Promise<void> {
  const profile = getProfile();
  if (!profile) return;

  // Save screenshots to workout dir
  const workoutDir = path.resolve("data", "photos", "workouts");
  fs.mkdirSync(workoutDir, { recursive: true });
  const savedPaths: string[] = [];

  for (const photo of photos) {
    const ext = path.extname(photo.filePath) || ".jpg";
    const fileName = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}${ext}`;
    const savePath = path.join(workoutDir, fileName);
    fs.copyFileSync(photo.filePath, savePath);
    savedPaths.push(savePath);
  }

  // Build history context
  const today = getTodayDate(profile.timezone);
  const twoWeeksAgo = getDateNDaysAgo(14, profile.timezone);
  const recentWorkouts = getWorkoutsForDateRange(twoWeeksAgo, today);

  let historyContext = "";
  if (recentWorkouts.length > 0) {
    historyContext = "\n\nRecent workout history:\n";
    for (const w of recentWorkouts.slice(0, 5)) {
      historyContext += `${w.date}: ${w.exercises_json}\n`;
    }
  }

  const prompt =
    WORKOUT_MULTI_PROMPT +
    (photos.length > 1
      ? `\n\nThere are ${photos.length} screenshots -- combine them into one workout.`
      : "") +
    historyContext +
    `\n\nUser stats: ${profile.weight_kg}kg, goal: ${profile.goal}`;

  // Send all images to Gemini in one request
  const images = photos.map((p) => ({
    buffer: p.buffer,
    mimeType: p.mimeType,
  }));

  const analysis = await analyzeMultipleImages(
    images,
    prompt,
    COACH_SYSTEM_PROMPT,
  );

  // Store workout -- we store the AI analysis as the exercises data too
  // since it's already parsed from screenshots
  logWorkout(today, analysis, savedPaths.join(","), analysis);

  const photoCount = photos.length > 1 ? ` (${photos.length} screenshots)` : "";
  await ctx.reply(`💪 Workout Review${photoCount}\n\n${analysis}`);
}
