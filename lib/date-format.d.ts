/** Calendar parts parsed from a frontmatter `date` value. */
export type DateParts = {
    year: number;
    month: number;
    day: number;
};
/** Parse common `date` frontmatter values into year/month/day. */
export declare function parseDateInput(raw: string): DateParts | null;
/**
 * Format a date using Unicode LDML-style patterns (same family as date-fns and Java).
 * Common tokens: `dd`, `MM` (or `mm`), `yyyy`, `yy`, `MMMM`, `MMM`, plus Moment-style `DD` / `YYYY`.
 * Literal text can be quoted with single quotes, e.g. `'de' MMMM yyyy`.
 */
export declare function formatDateParts(parts: DateParts, pattern: string, locale?: string): string;
/** Parse `date` and apply an optional LDML-style `date-format` pattern. */
export declare function formatDocumentDate(rawDate: string, formatPattern: string, locale?: string): string;
