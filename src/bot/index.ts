import { Bot, session } from "grammy";
import { BotContext, initialSessionData } from "./context.js";
import { config } from "../config.js";
import { authMiddleware } from "./middlewares/auth.js";
import onboarding from "./features/onboarding.js";
import foodPhoto from "./features/food-photo.js";
import foodManual from "./features/food-manual.js";
import query from "./features/query.js";
import fallback from "./features/fallback.js";

export function createBot(): Bot<BotContext> {
  const bot = new Bot<BotContext>(config.telegramToken);

  // Session middleware
  bot.use(
    session({
      initial: initialSessionData,
    }),
  );

  // Auth: only respond to the owner
  bot.use(authMiddleware);

  // Feature handlers (order matters -- more specific first)
  bot.use(onboarding);
  bot.use(query);       // /today, /targets, /meals, /forget, /week, /help
  bot.use(foodPhoto);   // photo messages (classifies and routes)
  bot.use(foodManual);  // (handled via fallback)
  bot.use(fallback);    // text messages, unsupported types

  // Error handler
  bot.catch((err) => {
    console.error("Bot error:", err);
  });

  return bot;
}
