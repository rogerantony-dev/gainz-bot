/**
 * Convert Markdown-style text from Gemini to Telegram HTML.
 * Telegram supports: <b>, <i>, <u>, <s>, <code>, <pre>, <a href="">.
 */
export function mdToTelegramHtml(text: string): string {
  let result = text;

  // Escape HTML entities first (but not the ones we'll add)
  result = result
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

  // Convert markdown bullet lists: "* item" or "- item" to "• item"
  result = result.replace(/^(\s*)\*\s+/gm, "$1• ");
  result = result.replace(/^(\s*)-\s+/gm, "$1• ");

  // Bold: **text** (can span content with colons, parens, etc.)
  result = result.replace(/\*\*(.+?)\*\*/gs, "<b>$1</b>");

  // Italic: *text* (single asterisks that aren't bullet points)
  // Only match when not preceded/followed by space-then-nothing (avoids stray *)
  result = result.replace(/(?<!\w|\*)\*([^*\n]+?)\*(?!\w|\*)/g, "<i>$1</i>");

  // Inline code: `text`
  result = result.replace(/`([^`\n]+?)`/g, "<code>$1</code>");

  // Strikethrough: ~~text~~
  result = result.replace(/~~(.+?)~~/g, "<s>$1</s>");

  // Headers: ### text, ## text, # text -> bold
  result = result.replace(/^#{1,3}\s+(.+)$/gm, "<b>$1</b>");

  return result;
}
