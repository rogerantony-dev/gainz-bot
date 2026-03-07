import { Composer } from "grammy";
import { BotContext } from "../context.js";
import { classifyImage } from "../../ai/classify.js";
import { analyzeImageStructured } from "../../ai/client.js";
import {
  foodAnalysisJsonSchema,
  type FoodAnalysis,
} from "../../ai/schemas.js";
import { FOOD_ANALYSIS_PROMPT, COACH_SYSTEM_PROMPT } from "../../ai/prompts.js";
import {
  logMeal,
  getDailyTotals,
  getProfile,
  findFoodMemory,
  upsertFoodMemory,
} from "../../db/queries.js";
import { getTodayDate, getNowISO } from "../../utils/date.js";
import { handleWorkoutScreenshot } from "./workout.js";
import fs from "node:fs";
import path from "node:path";

const composer = new Composer<BotContext>();

async function downloadPhoto(
  ctx: BotContext,
): Promise<{ buffer: Buffer; mimeType: string; filePath: string } | null> {
  const photo = ctx.message?.photo;
  if (!photo || photo.length === 0) return null;

  const fileId = photo[photo.length - 1].file_id; // highest resolution
  const file = await ctx.api.getFile(fileId);
  if (!file.file_path) return null;

  const url = `https://api.telegram.org/file/bot${ctx.api.token}/${file.file_path}`;
  const response = await fetch(url);
  const buffer = Buffer.from(await response.arrayBuffer());

  const ext = path.extname(file.file_path) || ".jpg";
  const mimeType =
    ext === ".png" ? "image/png" : ext === ".webp" ? "image/webp" : "image/jpeg";

  // Save to data/photos/
  const photoDir = path.resolve("data", "photos", "meals");
  fs.mkdirSync(photoDir, { recursive: true });
  const fileName = `${Date.now()}${ext}`;
  const savePath = path.join(photoDir, fileName);
  fs.writeFileSync(savePath, buffer);

  return { buffer, mimeType, filePath: savePath };
}

function formatDailySummary(
  totals: ReturnType<typeof getDailyTotals>,
  profile: ReturnType<typeof getProfile>,
): string {
  if (!profile) return "";
  const remaining = {
    calories: (profile.calorie_target ?? 0) - totals.total_calories,
    protein: (profile.protein_target ?? 0) - totals.total_protein,
    fat: (profile.fat_target ?? 0) - totals.total_fat,
    carbs: (profile.carb_target ?? 0) - totals.total_carbs,
  };

  return (
    `\n\n📊 Daily Totals: ${totals.total_calories}/${profile.calorie_target} kcal\n` +
    `🥩 Protein: ${totals.total_protein}/${profile.protein_target}g\n` +
    `🧈 Fat: ${totals.total_fat}/${profile.fat_target}g\n` +
    `🍚 Carbs: ${totals.total_carbs}/${profile.carb_target}g\n\n` +
    `Remaining: ${remaining.calories} kcal | ${remaining.protein}g P | ${remaining.fat}g F | ${remaining.carbs}g C`
  );
}

composer.on("message:photo", async (ctx) => {
  const profile = getProfile();
  if (!profile?.onboarded_at) {
    await ctx.reply("Please complete setup first. Type /start");
    return;
  }

  const photo = await downloadPhoto(ctx);
  if (!photo) {
    await ctx.reply("Couldn't download the photo. Try again.");
    return;
  }

  await ctx.reply("Analyzing...");

  // Classify the image
  const imageType = await classifyImage(photo.buffer, photo.mimeType);

  if (imageType === "workout") {
    await handleWorkoutScreenshot(ctx, photo.buffer, photo.mimeType, photo.filePath);
    return;
  }

  if (imageType === "unknown") {
    await ctx.reply(
      "I'm not sure what this is. Send me a food photo for calorie tracking, or a workout screenshot for training feedback.",
    );
    return;
  }

  if (imageType === "physique") {
    await ctx.reply(
      "Looks like a physique photo! I'll save this for your monthly check-in. " +
        "If you want a full comparison, wait for the monthly prompt or send front, side, and back photos.",
    );
    return;
  }

  // It's food -- analyze it
  const analysis = await analyzeImageStructured<FoodAnalysis>(
    photo.buffer,
    photo.mimeType,
    FOOD_ANALYSIS_PROMPT,
    foodAnalysisJsonSchema,
    COACH_SYSTEM_PROMPT,
  );

  // Check food memory
  const memory = findFoodMemory(analysis.meal_name);
  const today = getTodayDate(profile.timezone);

  let usedMemory = false;
  let finalAnalysis = analysis;

  if (memory && memory.times_logged >= 2) {
    finalAnalysis = {
      ...analysis,
      calories: memory.calories,
      protein: memory.protein ?? analysis.protein,
      fat: memory.fat ?? analysis.fat,
      carbs: memory.carbs ?? analysis.carbs,
    };
    usedMemory = true;
  }

  // Log the meal
  const memoryId = upsertFoodMemory(
    finalAnalysis.meal_name,
    finalAnalysis.calories,
    finalAnalysis.protein,
    finalAnalysis.fat,
    finalAnalysis.carbs,
  );

  logMeal({
    logged_at: getNowISO(),
    date: today,
    description: finalAnalysis.meal_name,
    calories: finalAnalysis.calories,
    protein: finalAnalysis.protein,
    fat: finalAnalysis.fat,
    carbs: finalAnalysis.carbs,
    photo_path: photo.filePath,
    source: usedMemory ? "memory" : "photo",
    food_memory_id: memoryId,
  });

  const totals = getDailyTotals(today);

  let response = usedMemory
    ? `Looks like your usual ${finalAnalysis.meal_name}.\n`
    : `${finalAnalysis.meal_name}\n`;

  response +=
    `${finalAnalysis.calories} kcal | ${finalAnalysis.protein}g P | ${finalAnalysis.fat}g F | ${finalAnalysis.carbs}g C`;

  if (finalAnalysis.confidence === "low") {
    response += "\n⚠️ Low confidence -- reply with the correct calories if this is off.";
  }

  response += formatDailySummary(totals, profile);

  await ctx.reply(response);
});

export { formatDailySummary };
export default composer;
