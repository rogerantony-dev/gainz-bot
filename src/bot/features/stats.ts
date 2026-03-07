import { BotContext } from "../context.js";
import { generateStructured } from "../../ai/client.js";
import { statsUpdateJsonSchema, type StatsUpdate } from "../../ai/schemas.js";
import { STATS_UPDATE_PROMPT } from "../../ai/prompts.js";
import { getProfile, upsertProfile } from "../../db/queries.js";
import { calculateTargets } from "../../utils/nutrition.js";

const STATS_KEYWORDS = [
  "my weight",
  "i weigh",
  "update my",
  "change my",
  "i'm now",
  "im now",
  "my height",
  "my age",
  "i want to bulk",
  "i want to cut",
  "start cutting",
  "start bulking",
  "switch to",
];

export function looksLikeStatsUpdate(text: string): boolean {
  const lower = text.toLowerCase();
  return STATS_KEYWORDS.some((kw) => lower.includes(kw));
}

export async function handleStatsUpdate(
  ctx: BotContext,
  text: string,
): Promise<boolean> {
  const profile = getProfile();
  if (!profile?.onboarded_at) return false;

  const parsed = await generateStructured<StatsUpdate>(
    `User message: "${text}"`,
    statsUpdateJsonSchema,
    STATS_UPDATE_PROMPT,
  );

  const update: Record<string, unknown> = {};
  update[parsed.field] = parsed.value;

  upsertProfile(update as Parameters<typeof upsertProfile>[0]);

  // Recalculate targets if weight or goal changed
  const needsRecalc = ["weight_kg", "goal", "activity_level"].includes(
    parsed.field,
  );

  let response = `Updated ${parsed.field.replace("_", " ")}: ${parsed.value}`;

  if (needsRecalc) {
    const updated = getProfile()!;
    if (
      updated.weight_kg &&
      updated.height_cm &&
      updated.age &&
      updated.sex &&
      updated.activity_level &&
      updated.goal
    ) {
      const targets = calculateTargets({
        weight_kg: updated.weight_kg,
        height_cm: updated.height_cm,
        age: updated.age,
        sex: updated.sex,
        activity_level: updated.activity_level,
        goal: updated.goal,
      });
      upsertProfile(targets);
      response +=
        `\n\nRecalculated targets:\n` +
        `🎯 Calories: ${targets.calorie_target} kcal\n` +
        `🥩 Protein: ${targets.protein_target}g\n` +
        `🧈 Fat: ${targets.fat_target}g\n` +
        `🍚 Carbs: ${targets.carb_target}g`;
    }
  }

  await ctx.reply(response);
  return true;
}
