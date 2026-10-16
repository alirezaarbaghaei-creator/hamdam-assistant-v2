/**
 * Normalize user input for consistent handling of Persian/Arabic/English text.
 *
 * Only fixes known problematic Unicode substitutions. Does NOT:
 *  - Remove ZWNJ (نیم‌فاصله) — preserved as-is
 *  - Collapse internal spaces
 *  - Remove punctuation
 *  - Change RTL direction
 */
export function normalizeUserInput(value: string): string {
  if (!value) return '';
  return value
    // Arabic Yeh → Persian Yeh
    .replace(/\u064A/g, '\u06CC')
    // Arabic Kaf → Persian Kaf
    .replace(/\u0643/g, '\u06A9')
    // Arabic Tatweel (kashida) — invisible elongation character, remove
    .replace(/\u0640/g, '')
    // Remove standalone zero-width characters that can interfere with validation
    // ZWNJ (U+200C) is intentionally preserved
    .replace(/[\u200B\u200D\uFEFF]/g, '')
    // Normalize Arabic letter Hamza above on Alef to match Persian convention
    .replace(/\u0623/g, '\u0627')
    .replace(/\u0625/g, '\u0627');
}

/**
 * Check if a string has meaningful content after trimming whitespace.
 * Works for Persian, Arabic, English, and mixed text.
 */
export function hasTextValue(value: string): boolean {
  return value != null && value.trim().length > 0;
}
