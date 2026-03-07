import "dotenv/config";

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var: ${name}`);
  return value;
}

export const config = {
  telegramToken: required("TELEGRAM_BOT_TOKEN"),
  geminiApiKey: required("GEMINI_API_KEY"),
  ownerChatId: Number(required("OWNER_CHAT_ID")),
  timezone: process.env.TIMEZONE || "UTC",
} as const;
