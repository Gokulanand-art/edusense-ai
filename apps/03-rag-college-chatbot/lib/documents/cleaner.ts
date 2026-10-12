/**
 * Text cleaner and normalizer for college documents.
 * Removes extra whitespace, line breaks, page header/footer artifacts,
 * and normalizes unicode characters.
 */
export function cleanDocumentText(text: string): string {
  if (!text) return "";

  return text
    // Replace non-breaking spaces and special unicode spaces
    .replace(/[\u00A0\u1680\u180E\u2000-\u200B\u202F\u205F\u3000\uFEFF]/g, " ")
    // Normalize Windows/Mac line endings to Unix
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    // Remove repeated page numbers / headers like "Page 1 of 12" or "-- 1 --"
    .replace(/(?:Page\s+\d+\s+(?:of\s+\d+)?|--\s*\d+\s*--)/gi, "")
    // Collapse multiple blank lines to at most two
    .replace(/\n{3,}/g, "\n\n")
    // Replace multiple spaces/tabs with single space within lines
    .replace(/[ \t]{2,}/g, " ")
    // Trim leading/trailing whitespace
    .trim();
}
