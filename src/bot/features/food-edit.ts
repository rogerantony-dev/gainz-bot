import { Composer, InlineKeyboard } from "grammy";
import { BotContext } from "../context.js";
import { generateStructured } from "../../ai/client.js";
import { mealEditJsonSchema, type MealEdit } from "../../ai/schemas.js";
import { MEAL_EDIT_PROMPT } from "../../ai/prompts.js";
import {
  getMealById,
  updateMeal,
  deleteMeal,
  getDailyTotals,
  getProfile,
  upsertFoodMemory,
} from "../../db/queries.js";
import { getTodayDate } from "../../utils/date.js";
import { formatDailySummary } from "./food-photo.js";

const composer = new Composer<BotContext>();

export function mealEditKeyboard(mealId: number): InlineKeyboard {
  return new InlineKeyboard()
    .text("✏️ Edit", `edit_meal:${mealId}`)
    .text("🗑 Delete", `delete_meal:${mealId}`);
}

composer.callbackQuery(/^edit_meal:(\d+)$/, async (ctx) => {
  const mealId = parseInt(ctx.match![1]);
  const meal = getMealById(mealId);

  if (!meal) {
    await ctx.answerCallbackQuery({ text: "Meal not found." });
    return;
  }

  ctx.session.editingMealId = mealId;
  await ctx.answerCallbackQuery();
  await ctx.reply(
    `Editing: ${meal.description} (${meal.calories} kcal)\n\n` +
      `Send the corrected info. Examples:\n` +
      `• "450cal" to fix calories\n` +
      `• "chicken rice 500cal 35p 12f 55c" to fix everything\n` +
      `• "it was actually pasta" to fix the name\n\n` +
      `Or send /cancel to cancel.`,
  );
});

composer.callbackQuery(/^delete_meal:(\d+)$/, async (ctx) => {
  const mealId = parseInt(ctx.match![1]);
  const meal = getMealById(mealId);

  if (!meal) {
    await ctx.answerCallbackQuery({ text: "Meal not found." });
    return;
  }

  const profile = getProfile();
  deleteMeal(mealId);

  const today = getTodayDate(profile?.timezone ?? "UTC");
  const totals = getDailyTotals(today);

  await ctx.answerCallbackQuery({ text: "Deleted!" });
  await ctx.editMessageText(
    `🗑 Deleted: ${meal.description} (${meal.calories} kcal)`,
  );

  if (profile) {
    await ctx.reply(`Updated totals:${formatDailySummary(totals, profile)}`);
  }
});

export async function handleMealEdit(
  ctx: BotContext,
  text: string,
): Promise<boolean> {
  const mealId = ctx.session.editingMealId;
  if (!mealId) return false;

  if (text.toLowerCase() === "/cancel") {
    ctx.session.editingMealId = null;
    await ctx.reply("Edit cancelled.");
    return true;
  }

  const meal = getMealById(mealId);
  if (!meal) {
    ctx.session.editingMealId = null;
    await ctx.reply("That meal no longer exists.");
    return true;
  }

  const prompt = MEAL_EDIT_PROMPT.replace(
    "{original}",
    `${meal.description} - ${meal.calories} kcal, ${meal.protein ?? "?"}g P, ${meal.fat ?? "?"}g F, ${meal.carbs ?? "?"}g C`,
  );

  const parsed = await generateStructured<MealEdit>(
    `User correction: "${text}"`,
    mealEditJsonSchema,
    prompt,
  );

  const updates: Record<string, string | number> = {};
  if (parsed.description != null) updates.description = parsed.description;
  if (parsed.calories != null) updates.calories = parsed.calories;
  if (parsed.protein != null) updates.protein = parsed.protein;
  if (parsed.fat != null) updates.fat = parsed.fat;
  if (parsed.carbs != null) updates.carbs = parsed.carbs;

  if (Object.keys(updates).length === 0) {
    await ctx.reply("Couldn't figure out what to change. Try again or /cancel.");
    return true;
  }

  updateMeal(mealId, updates);
  ctx.session.editingMealId = null;

  const updated = getMealById(mealId)!;
  const profile = getProfile();
  const today = getTodayDate(profile?.timezone ?? "UTC");

  // Update food memory too
  upsertFoodMemory(
    updated.description ?? "",
    updated.calories ?? 0,
    updated.protein ?? undefined,
    updated.fat ?? undefined,
    updated.carbs ?? undefined,
  );

  const totals = getDailyTotals(today);

  let response = `Updated: ${updated.description} -- ${updated.calories} kcal`;
  if (updated.protein != null) response += ` | ${updated.protein}g P`;
  if (updated.fat != null) response += ` | ${updated.fat}g F`;
  if (updated.carbs != null) response += ` | ${updated.carbs}g C`;

  if (profile) {
    response += formatDailySummary(totals, profile);
  }

  await ctx.reply(response);
  return true;
}

export default composer;
