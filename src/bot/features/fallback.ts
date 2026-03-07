import { Composer } from "grammy";
import { BotContext } from "../context.js";
import { getProfile } from "../../db/queries.js";
import { handleManualMeal } from "./food-manual.js";
import { looksLikeStatsUpdate, handleStatsUpdate } from "./stats.js";
import { generateText } from "../../ai/client.js";
import { COACH_SYSTEM_PROMPT } from "../../ai/prompts.js";

const composer = new Composer<BotContext>();

composer.on("message:text", async (ctx) => {
  const profile = getProfile();
  if (!profile?.onboarded_at) return; // onboarding handler will catch this

  const text = ctx.message.text;

  // Skip commands (already handled)
  if (text.startsWith("/")) return;

  // Try manual meal logging
  const handled = await handleManualMeal(ctx, text);
  if (handled) return;

  // Try stats update
  if (looksLikeStatsUpdate(text)) {
    const statsHandled = await handleStatsUpdate(ctx, text);
    if (statsHandled) return;
  }

  // General fitness question -- answer as the coach
  const context =
    `User profile: ${profile.weight_kg}kg, goal: ${profile.goal}, ` +
    `daily target: ${profile.calorie_target} kcal, ${profile.protein_target}g protein\n\n` +
    `User asks: ${text}`;

  const response = await generateText(context, COACH_SYSTEM_PROMPT);
  await ctx.reply(response);
});

// Handle unsupported message types
composer.on(["message:voice", "message:sticker", "message:video"], async (ctx) => {
  await ctx.reply(
    "I can only handle photos and text. Send me a food photo, workout screenshot, or type a message.",
  );
});

export default composer;
