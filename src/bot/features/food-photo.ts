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
import { handleWorkoutScreenshots } from "./workout.js";
import fs from "node:fs";
import path from "node:path";

const composer = new Composer<BotContext>();

export interface DownloadedPhoto {
  buffer: Buffer;
  mimeType: string;
  filePath: string;
}

export async function downloadPhoto(
  ctx: BotContext,
): Promise<DownloadedPhoto | null> {
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
  const fileName = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}${ext}`;
  const savePath = path.join(photoDir, fileName);
  fs.writeFileSync(savePath, buffer);

  return { buffer, mimeType, filePath: savePath };
}

export function formatDailySummary(
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

// ── Media group batching ──
// Telegram sends each photo in a media group as a separate update.
// We collect them by media_group_id and process once all arrive.

interface PendingGroup {
  photos: DownloadedPhoto[];
  chatId: number;
  timer: ReturnType<typeof setTimeout>;
}

const pendingGroups = new Map<string, PendingGroup>();
const MEDIA_GROUP_WAIT_MS = 1500; // wait 1.5s for all photos to arrive

function processPendingGroup(mediaGroupId: string, ctx: BotContext): void {
  const group = pendingGroups.get(mediaGroupId);
  if (!group) return;
  pendingGroups.delete(mediaGroupId);

  // Process the group asynchronously
  handleMediaGroup(ctx, group.photos).catch((err) => {
    console.error("Media group processing error:", err);
    ctx.api
      .sendMessage(group.chatId, "Something went wrong processing your photos. Try again.")
      .catch(() => {});
  });
}

async function handleMediaGroup(
  ctx: BotContext,
  photos: DownloadedPhoto[],
): Promise<void> {
  const profile = getProfile();
  if (!profile?.onboarded_at) return;

  // Classify the first image to determine the type
  const imageType = await classifyImage(photos[0].buffer, photos[0].mimeType);

  if (imageType === "workout") {
    // All photos in the group are workout screenshots -- process as one workout
    await handleWorkoutScreenshots(ctx, photos);
    return;
  }

  if (imageType === "food") {
    // Multiple food photos -- process each individually
    for (const photo of photos) {
      await handleSingleFoodPhoto(ctx, photo, profile);
    }
    return;
  }

  if (imageType === "physique") {
    await ctx.reply(
      "Looks like physique photos! I'll save these for your monthly check-in.",
    );
    return;
  }

  await ctx.reply(
    "I'm not sure what these are. Send me food photos for calorie tracking, or workout screenshots for training feedback.",
  );
}

async function handleSingleFoodPhoto(
  ctx: BotContext,
  photo: DownloadedPhoto,
  profile: NonNullable<ReturnType<typeof getProfile>>,
): Promise<void> {
  const analysis = await analyzeImageStructured<FoodAnalysis>(
    photo.buffer,
    photo.mimeType,
    FOOD_ANALYSIS_PROMPT,
    foodAnalysisJsonSchema,
    COACH_SYSTEM_PROMPT,
  );

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

  const mediaGroupId = ctx.message?.media_group_id;

  if (mediaGroupId) {
    // Part of a media group -- buffer it
    const existing = pendingGroups.get(mediaGroupId);
    if (existing) {
      existing.photos.push(photo);
      // Reset the timer -- wait for more photos
      clearTimeout(existing.timer);
      existing.timer = setTimeout(
        () => processPendingGroup(mediaGroupId, ctx),
        MEDIA_GROUP_WAIT_MS,
      );
    } else {
      // First photo in this group
      const timer = setTimeout(
        () => processPendingGroup(mediaGroupId, ctx),
        MEDIA_GROUP_WAIT_MS,
      );
      pendingGroups.set(mediaGroupId, {
        photos: [photo],
        chatId: ctx.chat.id,
        timer,
      });
      await ctx.reply("Got it, processing your photos...");
    }
    return;
  }

  // Single photo -- process immediately
  await ctx.reply("Analyzing...");

  const imageType = await classifyImage(photo.buffer, photo.mimeType);

  if (imageType === "workout") {
    await handleWorkoutScreenshots(ctx, [photo]);
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
      "Looks like a physique photo! I'll save this for your monthly check-in.",
    );
    return;
  }

  await handleSingleFoodPhoto(ctx, photo, profile);
});

export default composer;
