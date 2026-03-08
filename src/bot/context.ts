import { Context, SessionFlavor } from "grammy";
import { ConversationFlavor } from "@grammyjs/conversations";

export interface SessionData {
  onboarded: boolean;
  awaitingPhysiquePhotos: boolean;
  physiquePhotosReceived: string[];
  editingMealId: number | null;
}

export type BotContext = Context &
  SessionFlavor<SessionData> &
  ConversationFlavor<Context>;

export const initialSessionData = (): SessionData => ({
  onboarded: false,
  awaitingPhysiquePhotos: false,
  physiquePhotosReceived: [],
  editingMealId: null,
});
