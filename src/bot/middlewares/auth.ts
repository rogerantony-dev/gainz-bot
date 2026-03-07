import { NextFunction } from "grammy";
import { BotContext } from "../context.js";
import { config } from "../../config.js";

export async function authMiddleware(
  ctx: BotContext,
  next: NextFunction,
): Promise<void> {
  if (ctx.from?.id !== config.ownerChatId) {
    return; // silently ignore other users
  }
  await next();
}
