import { Composer } from "grammy";
import { BotContext } from "../context.js";
import {
  getMealsForDate,
  getDailyTotals,
  getProfile,
  getAllFoodMemories,
  deleteFoodMemory,
  getWorkoutsForDateRange,
} from "../../db/queries.js";
import { getTodayDate, getDateNDaysAgo } from "../../utils/date.js";

const composer = new Composer<BotContext>();

composer.command("today", async (ctx) => {
  const profile = getProfile();
  if (!profile?.onboarded_at) {
    await ctx.reply("Please complete setup first. Type /start");
    return;
  }

  const today = getTodayDate(profile.timezone);
  const meals = getMealsForDate(today);
  const totals = getDailyTotals(today);

  if (meals.length === 0) {
    await ctx.reply(
      `No meals logged today (${today}). Send a food photo or type something like 'lunch 600cal'.`,
    );
    return;
  }

  let response = `📊 Today (${today})\n\n`;
  for (const meal of meals) {
    const time = new Date(meal.logged_at).toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
      timeZone: profile.timezone,
    });
    response += `${time} - ${meal.description}: ${meal.calories} kcal`;
    if (meal.protein != null) response += ` | ${meal.protein}g P`;
    response += `\n`;
  }

  response += `\n---\n`;
  response += `Total: ${totals.total_calories}/${profile.calorie_target} kcal\n`;
  response += `Protein: ${totals.total_protein}/${profile.protein_target}g\n`;
  response += `Fat: ${totals.total_fat}/${profile.fat_target}g\n`;
  response += `Carbs: ${totals.total_carbs}/${profile.carb_target}g\n`;

  const remaining = (profile.calorie_target ?? 0) - totals.total_calories;
  response += `\nRemaining: ${remaining} kcal`;

  await ctx.reply(response);
});

composer.command("targets", async (ctx) => {
  const profile = getProfile();
  if (!profile?.onboarded_at) {
    await ctx.reply("Please complete setup first. Type /start");
    return;
  }

  await ctx.reply(
    `🎯 Current Targets\n\n` +
      `Goal: ${profile.goal?.toUpperCase()}\n` +
      `Weight: ${profile.weight_kg}kg\n\n` +
      `Calories: ${profile.calorie_target} kcal\n` +
      `Protein: ${profile.protein_target}g\n` +
      `Fat: ${profile.fat_target}g\n` +
      `Carbs: ${profile.carb_target}g\n\n` +
      `To update: just tell me (e.g. "my weight is now 82kg" or "I want to start cutting")`,
  );
});

composer.command("meals", async (ctx) => {
  const memories = getAllFoodMemories();

  if (memories.length === 0) {
    await ctx.reply(
      "No saved food memories yet. I'll learn your regular meals as you log them!",
    );
    return;
  }

  let response = `🍽️ Saved Food Memories (${memories.length})\n\n`;
  for (const mem of memories.slice(0, 20)) {
    response += `${mem.name}: ${mem.calories} kcal`;
    if (mem.protein != null) response += ` | ${mem.protein}g P`;
    response += ` (logged ${mem.times_logged}x)\n`;
  }

  if (memories.length > 20) {
    response += `\n...and ${memories.length - 20} more`;
  }

  response += `\nTo forget a meal: /forget meal name`;

  await ctx.reply(response);
});

composer.command("forget", async (ctx) => {
  const name = ctx.match?.trim();
  if (!name) {
    await ctx.reply("Usage: /forget chicken rice");
    return;
  }

  const deleted = deleteFoodMemory(name);
  if (deleted) {
    await ctx.reply(`Forgot "${name}" from food memories.`);
  } else {
    await ctx.reply(
      `Couldn't find "${name}" in food memories. Check /meals for the list.`,
    );
  }
});

composer.command("week", async (ctx) => {
  const profile = getProfile();
  if (!profile?.onboarded_at) {
    await ctx.reply("Please complete setup first. Type /start");
    return;
  }

  const today = getTodayDate(profile.timezone);
  const weekAgo = getDateNDaysAgo(7, profile.timezone);
  const workouts = getWorkoutsForDateRange(weekAgo, today);

  if (workouts.length === 0) {
    await ctx.reply(
      `No workouts logged in the past 7 days. Send a workout screenshot after your next session!`,
    );
    return;
  }

  let response = `📅 This Week's Workouts (${workouts.length} sessions)\n\n`;
  for (const w of workouts) {
    const exercises = JSON.parse(w.exercises_json) as Array<{
      name: string;
      sets: Array<{ reps: number; weight_kg: number }>;
    }>;
    const exerciseNames = exercises.map((e) => e.name).join(", ");
    response += `${w.date}: ${exerciseNames}\n`;
  }

  await ctx.reply(response);
});

composer.command("help", async (ctx) => {
  await ctx.reply(
    "Here's what I can do:\n\n" +
      "📸 Send a food photo → calorie estimate + tracking\n" +
      "💪 Send a workout screenshot → coaching feedback\n" +
      '📝 Type "lunch 600cal" → manual calorie log\n' +
      '✏️ Type "actually lunch was 400cal" → correct a log\n' +
      '⚖️ Type "my weight is 82kg" → update stats\n\n' +
      "Commands:\n" +
      "/today - daily meal summary\n" +
      "/targets - view nutrition targets\n" +
      "/meals - saved food memories\n" +
      "/forget [name] - delete a food memory\n" +
      "/week - this week's workouts\n" +
      "/help - this message",
  );
});

export default composer;
