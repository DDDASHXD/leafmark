/** ORCID iD line (icon + link in PDF/HTML, inline to the right of the name). */
export type AuthorOrcidLine = {
    orcid: string;
};
/** One line in an author block: Markdown text or ORCID. */
export type AuthorLine = string | AuthorOrcidLine;
/** One author: ordered lines (name, id, email, orcid, …). */
export type AuthorEntry = AuthorLine[];
/** Normalized document metadata from project config, optional front matter, and defaults. */
export type ThesisMeta = {
    title: string;
    subtitle: string;
    /** First line per author (Pandoc `author` fallback). */
    author: string[];
    /** Full per-author lines; supports Markdown in each line. */
    authorEntries: AuthorEntry[];
    date: string;
    keywords: string[];
    toc: boolean;
    tocDepth: number;
    tocOwnPage: boolean;
    tocTitle: string;
    referencesTitle: string;
    numberSections: boolean;
    headerLeft: string;
    headerCenter: string;
    headerRight: string;
    /** `undefined` = default document date, then `\\today`; `""` = empty */
    footerLeft?: string;
    footerCenter: string;
    /** `undefined` = default `\\thepage`; `""` = empty */
    footerRight?: string;
    /** When false, PDF/HTML omit the formatted title block (`\\maketitle` / HTML header). Default true. */
    titlePage: boolean;
    /** When false, disable inside-word hyphenation; lines break at spaces instead. Default true. */
    hyphens: boolean;
};
/** Normalize ORCID URL or bare iD to `0000-0002-1825-0097` form. */
export declare function normalizeOrcidId(raw: string): string | null;
export declare function authorEntryHasOrcid(entry: AuthorEntry): boolean;
export declare function authorEntriesHaveOrcid(entries: AuthorEntry[]): boolean;
/**
 * Parse `author` / `authors` from YAML.
 * Flat list: `["A", "B"]` → one line per author.
 * Nested list: `[["Name", "id", "**email**"], …]` → multiple lines per author.
 * ORCID: `orcid: 0009-0004-1352-0651` or `orcid: https://orcid.org/0009-0004-1352-0651`
 */
export declare function parseAuthorEntries(v: unknown): AuthorEntry[];
/** Inline Markdown → LaTeX fragment (bold, code, links, etc.). */
export declare function markdownLineToLatex(line: string): string;
/** LaTeX `\\author{…}` with `\\and` between authors and stacked lines per author. */
export declare function buildAuthorLatexCommand(entries: AuthorEntry[]): string;
/** Write `dist/_pandoc-authors.tex`; returns absolute path or null. */
export declare function writeAuthorLatexFile(meta: ThesisMeta, distDir: string): string | null;
/** Escape plain text for use inside LaTeX `\\fancyhead` / `\\fancyfoot` arguments. */
export declare function escapeLatex(text: string): string;
export declare function parseFrontmatterYaml(filePath: string): Record<string, unknown>;
export declare function normalizeConfig(raw: Record<string, unknown>): ThesisMeta;
/** Resolve bibliography paths; empty array means no citeproc. */
export declare function resolveBibliographyPaths(raw: Record<string, unknown>, projectRoot: string): string[];
/**
 * Optional cover PDF for `pdfunite` (path in YAML is relative to `project/`, or absolute).
 * Omitted / empty / false means no cover merge (Pandoc writes `dist/output.pdf` directly unless `pdfunite` merges a cover).
 */
export declare function resolveCoverPdfPath(raw: Record<string, unknown>, projectRoot: string): string | null;
/** Path to a custom Pandoc `.latex` template relative to the bundle folder, or absolute. */
export declare function resolveLatexTemplatePath(raw: Record<string, unknown>, projectRoot: string): string | null;
export type MergedYamlOptions = {
    /** Forward-slash path from repo root for `\\input` in custom templates, e.g. `dist/cv/_pandoc-fonts.tex`. */
    fontsIncludeRel?: string;
    /** Forward-slash path to generated `\\author{…}` (e.g. `dist/_pandoc-authors.tex`). */
    authorsIncludeRel?: string;
};
/** YAML block for the merged document (no LaTeX `header-includes`; citeproc paths are passed via CLI). */
export declare function mergedYamlDocument(meta: ThesisMeta, raw: Record<string, unknown>, options?: MergedYamlOptions): string;
export declare function writeBuildLatexIncludes(meta: ThesisMeta, distDir: string, srcDir: string, fontsRelToRoot: string, options?: {
    includeFonts?: boolean;
}): void;
