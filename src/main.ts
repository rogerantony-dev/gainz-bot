import { initDb } from "./db/index.js";
import { createBot } from "./bot/index.js";
import { startScheduler } from "./scheduler/cron.js";

async function main() {
  console.log("Initializing gainz-bot...");

  // Initialize database
  await initDb();
  console.log("Database ready.");

  // Create and start bot
  const bot = createBot();

  // Start scheduler
  startScheduler(bot.api);

  // Start long polling
  bot.start({
    onStart: () => {
      console.log("Bot is running! Send /start to begin.");
    },
  });

  // Graceful shutdown
  process.once("SIGINT", () => bot.stop());
  process.once("SIGTERM", () => bot.stop());
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
