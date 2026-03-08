import { Composer } from "grammy";
import { BotContext } from "../context.js";
import { generateStructured } from "../../ai/client.js";
import { manualMealJsonSchema, type ManualMeal } from "../../ai/schemas.js";
import { MANUAL_MEAL_PROMPT } from "../../ai/prompts.js";
import {
  logMeal,
  getDailyTotals,
  getProfile,
  upsertFoodMemory,
  getLastMealByDescription,
  updateMealCalories,
} from "../../db/queries.js";
import { getTodayDate, getNowISO } from "../../utils/date.js";
import { formatDailySummary } from "./food-photo.js";
import { mealEditKeyboard } from "./food-edit.js";

const CALORIE_PATTERN = /(\d+)\s*(?:cal|kcal|calories)/i;
const CORRECTION_PATTERN =
  /(?:actually|correct|change|update)\s+(.+?)(?:\s+(?:to|was|is)\s+)(\d+)\s*(?:cal|kcal)?/i;

const composer = new Composer<BotContext>();

export async function handleManualMeal(
  ctx: BotContext,
  text: string,
): Promise<boolean> {
  const profile = getProfile();
  if (!profile?.onboarded_at) return false;

  // Check for correction pattern first
  const correctionMatch = text.match(CORRECTION_PATTERN);
  if (correctionMatch) {
    return await handleCorrection(ctx, correctionMatch[1], parseInt(correctionMatch[2]));
  }

  // Check for simple calorie pattern
  if (!CALORIE_PATTERN.test(text)) return false;

  // Parse with AI for robust extraction
  const parsed = await generateStructured<ManualMeal>(
    `Parse this meal log: "${text}"`,
    manualMealJsonSchema,
    MANUAL_MEAL_PROMPT,
  );

  const today = getTodayDate(profile.timezone);

  const memoryId = upsertFoodMemory(
    parsed.description,
    parsed.calories,
    parsed.protein ?? undefined,
    parsed.fat ?? undefined,
    parsed.carbs ?? undefined,
  );

  const mealId = logMeal({
    logged_at: getNowISO(),
    date: today,
    description: parsed.description,
    calories: parsed.calories,
    protein: parsed.protein,
    fat: parsed.fat,
    carbs: parsed.carbs,
    photo_path: null,
    source: "manual",
    food_memory_id: memoryId,
  });

  const totals = getDailyTotals(today);

  let response = `Logged: ${parsed.description} -- ${parsed.calories} kcal`;
  if (parsed.protein != null) {
    response += ` | ${parsed.protein}g P`;
  }
  if (parsed.fat != null) {
    response += ` | ${parsed.fat}g F`;
  }
  if (parsed.carbs != null) {
    response += ` | ${parsed.carbs}g C`;
  }

  response += formatDailySummary(totals, profile);
  await ctx.reply(response, { reply_markup: mealEditKeyboard(mealId) });
  return true;
}

async function handleCorrection(
  ctx: BotContext,
  mealName: string,
  newCalories: number,
): Promise<boolean> {
  const profile = getProfile();
  if (!profile) return false;

  const today = getTodayDate(profile.timezone);
  const meal = getLastMealByDescription(today, mealName.trim());

  if (!meal) {
    await ctx.reply(
      `Couldn't find "${mealName}" in today's log. Check /today for your logged meals.`,
    );
    return true;
  }

  updateMealCalories(meal.id, newCalories);

  const totals = getDailyTotals(today);

  await ctx.reply(
    `Updated ${meal.description}: ${meal.calories} → ${newCalories} kcal` +
      formatDailySummary(totals, profile),
  );
  return true;
}

export default composer;
