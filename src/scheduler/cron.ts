import cron from "node-cron";
import { Api } from "grammy";
import { config } from "../config.js";
import { generateText, analyzeMultipleImages } from "../ai/client.js";
import {
  WEEKLY_REVIEW_PROMPT,
  COACH_SYSTEM_PROMPT,
  PHYSIQUE_COMPARISON_PROMPT,
} from "../ai/prompts.js";
import {
  getProfile,
  getWorkoutsForDateRange,
  getLastPhysiqueCheckin,
  logPhysiqueCheckin,
} from "../db/queries.js";
import { getTodayDate, getDateNDaysAgo } from "../utils/date.js";
import { mdToTelegramHtml } from "../utils/telegram-format.js";
import fs from "node:fs";

export function startScheduler(api: Api): void {
  // Weekly review: Sunday at 8 PM
  cron.schedule("0 20 * * 0", async () => {
    try {
      await sendWeeklyReview(api);
    } catch (err) {
      console.error("Weekly review failed:", err);
    }
  });

  // Monthly physique check-in: 1st of month at 8 PM
  cron.schedule("0 20 1 * *", async () => {
    try {
      await sendPhysiquePrompt(api);
    } catch (err) {
      console.error("Monthly check-in prompt failed:", err);
    }
  });

  // Monthly reminder: 3rd of month at 8 PM (if no check-in yet)
  cron.schedule("0 20 3 * *", async () => {
    try {
      await sendPhysiqueReminder(api);
    } catch (err) {
      console.error("Monthly reminder failed:", err);
    }
  });

  console.log("Scheduler started: weekly review (Sun 8PM), monthly check-in (1st 8PM)");
}

async function sendWeeklyReview(api: Api): Promise<void> {
  const profile = getProfile();
  if (!profile?.onboarded_at) return;

  const today = getTodayDate(profile.timezone);
  const weekAgo = getDateNDaysAgo(7, profile.timezone);
  const twoWeeksAgo = getDateNDaysAgo(14, profile.timezone);

  const thisWeek = getWorkoutsForDateRange(weekAgo, today);
  const lastWeek = getWorkoutsForDateRange(twoWeeksAgo, weekAgo);

  if (thisWeek.length === 0) {
    await api.sendMessage(
      config.ownerChatId,
      "📅 Weekly Review\n\nNo workouts logged this week. " +
        "Get back in the gym. No excuses.",
    );
    return;
  }

  let context = `This week's workouts (${thisWeek.length} sessions):\n`;
  for (const w of thisWeek) {
    context += `\n${w.date}:\n${w.exercises_json}\n`;
  }

  if (lastWeek.length > 0) {
    context += `\nLast week (${lastWeek.length} sessions):\n`;
    for (const w of lastWeek) {
      context += `\n${w.date}:\n${w.exercises_json}\n`;
    }
  }

  context += `\nUser stats: ${profile.weight_kg}kg, goal: ${profile.goal}`;

  const review = await generateText(
    WEEKLY_REVIEW_PROMPT + "\n\n" + context,
    COACH_SYSTEM_PROMPT,
  );

  await api.sendMessage(config.ownerChatId, mdToTelegramHtml(`📅 Weekly Review\n\n${review}`), {
    parse_mode: "HTML",
  });
}

async function sendPhysiquePrompt(api: Api): Promise<void> {
  const profile = getProfile();
  if (!profile?.onboarded_at) return;

  await api.sendMessage(
    config.ownerChatId,
    "📸 Monthly Physique Check-in\n\n" +
      "Time to track your progress. Send me your front, side, and back photos. " +
      "I'll compare them to last month and adjust your targets if needed.\n\n" +
      "Send the photos whenever you're ready (you have a couple days).",
  );
}

async function sendPhysiqueReminder(api: Api): Promise<void> {
  const profile = getProfile();
  if (!profile?.onboarded_at) return;

  const today = getTodayDate(profile.timezone);
  const lastCheckin = getLastPhysiqueCheckin();

  // If last check-in is this month, skip reminder
  if (lastCheckin && lastCheckin.date.startsWith(today.substring(0, 7))) {
    return;
  }

  await api.sendMessage(
    config.ownerChatId,
    "Reminder: still waiting on those physique photos. " +
      "Send them today or I'll skip this month's check-in.",
  );
}
