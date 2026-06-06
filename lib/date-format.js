const ISO_DATE_RE = /^(\d{4})-(\d{1,2})-(\d{1,2})$/;
const DMY_DATE_RE = /^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/;
const YMD_DATE_RE = /^(\d{4})[./-](\d{1,2})[./-](\d{1,2})$/;
/** Parse common `date` frontmatter values into year/month/day. */
export function parseDateInput(raw) {
    const t = raw.trim();
    if (!t)
        return null;
    let m = t.match(ISO_DATE_RE);
    if (m)
        return { year: +m[1], month: +m[2], day: +m[3] };
    m = t.match(DMY_DATE_RE);
    if (m)
        return { year: +m[3], month: +m[2], day: +m[1] };
    m = t.match(YMD_DATE_RE);
    if (m)
        return { year: +m[1], month: +m[2], day: +m[3] };
    return null;
}
function pad2(n) {
    return String(n).padStart(2, '0');
}
function monthNames(parts, locale) {
    const date = new Date(parts.year, parts.month - 1, parts.day);
    return {
        long: new Intl.DateTimeFormat(locale, { month: 'long' }).format(date),
        short: new Intl.DateTimeFormat(locale, { month: 'short' }).format(date),
    };
}
const TOKEN_RE = /^(YYYY|yyyy|YY|yy|MMMM|MMM|MM|mm|DD|dd|D|d|M)/;
/**
 * Format a date using Unicode LDML-style patterns (same family as date-fns and Java).
 * Common tokens: `dd`, `MM` (or `mm`), `yyyy`, `yy`, `MMMM`, `MMM`, plus Moment-style `DD` / `YYYY`.
 * Literal text can be quoted with single quotes, e.g. `'de' MMMM yyyy`.
 */
export function formatDateParts(parts, pattern, locale = 'en') {
    const months = monthNames(parts, locale);
    const tokenValues = {
        yyyy: String(parts.year),
        YYYY: String(parts.year),
        yy: pad2(parts.year % 100),
        YY: pad2(parts.year % 100),
        MMMM: months.long,
        MMM: months.short,
        MM: pad2(parts.month),
        mm: pad2(parts.month),
        M: String(parts.month),
        dd: pad2(parts.day),
        DD: pad2(parts.day),
        d: String(parts.day),
        D: String(parts.day),
    };
    let result = '';
    let i = 0;
    while (i < pattern.length) {
        if (pattern[i] === "'") {
            i++;
            let lit = '';
            while (i < pattern.length) {
                if (pattern[i] === "'") {
                    if (pattern[i + 1] === "'") {
                        lit += "'";
                        i += 2;
                        continue;
                    }
                    i++;
                    break;
                }
                lit += pattern[i++];
            }
            result += lit;
            continue;
        }
        const rest = pattern.slice(i);
        const match = rest.match(TOKEN_RE);
        if (match) {
            const token = match[1];
            result += tokenValues[token] ?? token;
            i += token.length;
        }
        else {
            result += pattern[i++];
        }
    }
    return result;
}
/** Parse `date` and apply an optional LDML-style `date-format` pattern. */
export function formatDocumentDate(rawDate, formatPattern, locale = 'en') {
    const parts = parseDateInput(rawDate);
    if (!parts) {
        throw new Error(`Could not parse date "${rawDate}". Use ISO form (2026-02-16) or day/month/year (16/02/2026).`);
    }
    if (parts.month < 1 || parts.month > 12 || parts.day < 1 || parts.day > 31) {
        throw new Error(`Invalid date "${rawDate}".`);
    }
    return formatDateParts(parts, formatPattern, locale);
}
//# sourceMappingURL=date-format.js.map