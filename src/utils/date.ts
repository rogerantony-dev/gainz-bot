import { config } from "../config.js";

export function getTodayDate(timezone?: string): string {
  const tz = timezone || config.timezone;
  const now = new Date();
  return now.toLocaleDateString("en-CA", { timeZone: tz }); // YYYY-MM-DD format
}

export function getNowISO(): string {
  return new Date().toISOString();
}

export function getDateNDaysAgo(n: number, timezone?: string): string {
  const tz = timezone || config.timezone;
  const date = new Date();
  date.setDate(date.getDate() - n);
  return date.toLocaleDateString("en-CA", { timeZone: tz });
}
