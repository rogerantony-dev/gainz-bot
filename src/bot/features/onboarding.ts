import { Composer, InlineKeyboard } from "grammy";
import { BotContext } from "../context.js";
import { getProfile, upsertProfile } from "../../db/queries.js";
import { calculateTargets } from "../../utils/nutrition.js";
import { getNowISO } from "../../utils/date.js";

const composer = new Composer<BotContext>();

composer.command("start", async (ctx) => {
  const profile = getProfile();

  if (profile?.onboarded_at) {
    await ctx.reply(
      "Welcome back! Here's what I can do:\n\n" +
        "📸 Send a food photo → calorie estimate\n" +
        "💪 Send a workout screenshot → coaching feedback\n" +
        "📝 Type 'lunch 600cal' → manual log\n" +
        "📊 /today → daily summary\n" +
        "🎯 /targets → view nutrition targets\n" +
        "🍽️ /meals → saved food memories\n" +
        "📅 /week → weekly workout summary\n" +
        "❓ /help → all commands",
    );
    return;
  }

  await ctx.reply(
    "Let's set you up. I need some info to calculate your nutrition targets. " +
      "We'll go through this step by step.\n\nWhat's your biological sex?",
    {
      reply_markup: new InlineKeyboard()
        .text("Male", "onboard_sex_male")
        .text("Female", "onboard_sex_female"),
    },
  );
});

// Step 1: Sex
composer.callbackQuery(/^onboard_sex_(.+)$/, async (ctx) => {
  const sex = ctx.match![1] as "male" | "female";
  upsertProfile({ sex });
  await ctx.answerCallbackQuery();
  await ctx.editMessageText(`Sex: ${sex}. How old are you? (Type a number)`);
  ctx.session.onboarded = false;
});

// Step 2: Age (text input)
composer.on("message:text").filter(
  (ctx) => {
    const profile = getProfile();
    return !!profile?.sex && !profile.age && !profile.onboarded_at;
  },
  async (ctx) => {
    const profile = getProfile()!;
    const text = ctx.message.text.trim();

    // Age step
    if (!profile.age) {
      const age = parseInt(text);
      if (isNaN(age) || age < 10 || age > 100) {
        await ctx.reply("Please enter a valid age (10-100).");
        return;
      }
      upsertProfile({ age });
      await ctx.reply(`Age: ${age}. What's your height in cm? (e.g. 175)`);
      return;
    }
  },
);

// Step 3: Height
composer.on("message:text").filter(
  (ctx) => {
    const profile = getProfile();
    return !!profile?.age && !profile.height_cm && !profile.onboarded_at;
  },
  async (ctx) => {
    const height = parseFloat(ctx.message.text.trim());
    if (isNaN(height) || height < 100 || height > 250) {
      await ctx.reply("Please enter a valid height in cm (100-250).");
      return;
    }
    upsertProfile({ height_cm: height });
    await ctx.reply(
      `Height: ${height}cm. What's your weight in kg? (e.g. 75)`,
    );
  },
);

// Step 4: Weight
composer.on("message:text").filter(
  (ctx) => {
    const profile = getProfile();
    return !!profile?.height_cm && !profile.weight_kg && !profile.onboarded_at;
  },
  async (ctx) => {
    const weight = parseFloat(ctx.message.text.trim());
    if (isNaN(weight) || weight < 30 || weight > 300) {
      await ctx.reply("Please enter a valid weight in kg (30-300).");
      return;
    }
    upsertProfile({ weight_kg: weight });
    await ctx.reply("How active are you?", {
      reply_markup: new InlineKeyboard()
        .text("Sedentary", "onboard_activity_sedentary")
        .row()
        .text("Light (1-2x/week)", "onboard_activity_light")
        .row()
        .text("Moderate (3-5x/week)", "onboard_activity_moderate")
        .row()
        .text("Active (6-7x/week)", "onboard_activity_active")
        .row()
        .text("Very Active (2x/day)", "onboard_activity_very_active"),
    });
  },
);

// Step 5: Activity Level
composer.callbackQuery(/^onboard_activity_(.+)$/, async (ctx) => {
  const activity = ctx.match![1];
  upsertProfile({ activity_level: activity });
  await ctx.answerCallbackQuery();
  await ctx.editMessageText("What's your current goal?");
  await ctx.reply("Pick one:", {
    reply_markup: new InlineKeyboard()
      .text("Build Muscle (Bulk)", "onboard_goal_bulk")
      .row()
      .text("Lose Fat (Cut)", "onboard_goal_cut")
      .row()
      .text("Maintain", "onboard_goal_maintain"),
  });
});

// Step 6: Goal → Calculate and finish
composer.callbackQuery(/^onboard_goal_(.+)$/, async (ctx) => {
  const goal = ctx.match![1] as "bulk" | "cut" | "maintain";
  const profile = getProfile()!;

  const targets = calculateTargets({
    weight_kg: profile.weight_kg!,
    height_cm: profile.height_cm!,
    age: profile.age!,
    sex: profile.sex!,
    activity_level: profile.activity_level!,
    goal,
  });

  upsertProfile({
    goal,
    ...targets,
    onboarded_at: getNowISO(),
  });

  await ctx.answerCallbackQuery();
  await ctx.editMessageText(
    `Setup complete! Here are your daily targets:\n\n` +
      `🎯 Calories: ${targets.calorie_target} kcal\n` +
      `🥩 Protein: ${targets.protein_target}g\n` +
      `🧈 Fat: ${targets.fat_target}g\n` +
      `🍚 Carbs: ${targets.carb_target}g\n\n` +
      `Goal: ${goal.toUpperCase()}\n\n` +
      `You're all set. Send me a food photo or workout screenshot anytime. ` +
      `Type /help to see all commands.`,
  );
});

export default composer;
