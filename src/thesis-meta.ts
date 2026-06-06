import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { isAbsolute, join } from 'node:path';
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';
import { formatDocumentDate } from './date-format.js';

/** ORCID iD line (icon + link in PDF/HTML, inline to the right of the name). */
export type AuthorOrcidLine = { orcid: string };

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
};

const DEFAULT_META: ThesisMeta = {
  title: '',
  subtitle: '',
  author: [],
  authorEntries: [],
  date: '',
  keywords: [],
  toc: true,
  tocDepth: 3,
  tocOwnPage: false,
  tocTitle: 'Table of Contents',
  referencesTitle: 'References',
  numberSections: true,
  headerLeft: '',
  headerCenter: '',
  headerRight: '',
  footerCenter: '',
  titlePage: true,
};

function str(v: unknown): string {
  return typeof v === 'string' ? v : '';
}

function strOpt(v: unknown): string | undefined {
  if (v === undefined) return undefined;
  if (v === null) return '';
  return typeof v === 'string' ? v : String(v);
}

function bool(v: unknown, fallback: boolean): boolean {
  if (typeof v === 'boolean') return v;
  if (v === 'true' || v === 'yes') return true;
  if (v === 'false' || v === 'no') return false;
  return fallback;
}

function num(v: unknown, fallback: number): number {
  if (typeof v === 'number' && Number.isFinite(v)) return Math.trunc(v);
  if (typeof v === 'string' && /^\d+$/.test(v)) return Number.parseInt(v, 10);
  return fallback;
}

function strArray(v: unknown): string[] {
  if (v === undefined || v === null) return [];
  if (Array.isArray(v)) return v.map((x) => String(x));
  if (typeof v === 'string') return [v];
  return [];
}

const ORCID_ID_RE = /^\d{4}-\d{4}-\d{4}-\d{3}[\dX]$/i;
const ORCID_URL_RE = /orcid\.org\/(\d{4}-\d{4}-\d{4}-\d{3}[\dX])/i;
const ORCID_STRING_RE = /^orcid:\s*(.+)$/i;

/** Normalize ORCID URL or bare iD to `0000-0002-1825-0097` form. */
export function normalizeOrcidId(raw: string): string | null {
  const t = raw.trim();
  if (!t) return null;
  const fromUrl = t.match(ORCID_URL_RE);
  if (fromUrl) return fromUrl[1].toUpperCase();
  if (ORCID_ID_RE.test(t)) return t.toUpperCase();
  return null;
}

function parseAuthorLine(x: unknown): AuthorLine | null {
  if (typeof x === 'string') {
    const t = x.trim();
    if (!t) return null;
    const orcidMatch = t.match(ORCID_STRING_RE);
    if (orcidMatch) {
      const id = normalizeOrcidId(orcidMatch[1]);
      return id ? { orcid: id } : null;
    }
    return t;
  }
  if (x && typeof x === 'object' && !Array.isArray(x)) {
    const rec = x as Record<string, unknown>;
    if (rec.orcid !== undefined) {
      const id = normalizeOrcidId(str(rec.orcid));
      if (id) return { orcid: id };
    }
  }
  return null;
}

export function authorEntryHasOrcid(entry: AuthorEntry): boolean {
  return entry.some((line) => typeof line !== 'string');
}

export function authorEntriesHaveOrcid(entries: AuthorEntry[]): boolean {
  return entries.some(authorEntryHasOrcid);
}

function firstAuthorNameLine(entry: AuthorEntry): string {
  for (const line of entry) {
    if (typeof line === 'string') return line;
  }
  return '';
}

/**
 * Parse `author` / `authors` from YAML.
 * Flat list: `["A", "B"]` → one line per author.
 * Nested list: `[["Name", "id", "**email**"], …]` → multiple lines per author.
 * ORCID: `orcid: 0009-0004-1352-0651` or `orcid: https://orcid.org/0009-0004-1352-0651`
 */
export function parseAuthorEntries(v: unknown): AuthorEntry[] {
  if (v === undefined || v === null) return [];
  if (typeof v === 'string') {
    const t = v.trim();
    return t ? [[t]] : [];
  }
  if (!Array.isArray(v)) return [];

  const out: AuthorEntry[] = [];
  for (const item of v) {
    if (typeof item === 'string') {
      const parsed = parseAuthorLine(item);
      if (parsed) out.push([parsed]);
    } else if (Array.isArray(item)) {
      const lines: AuthorLine[] = [];
      for (const x of item) {
        const parsed = parseAuthorLine(x);
        if (parsed) lines.push(parsed);
      }
      if (lines.length) out.push(lines);
    }
  }
  return out;
}

/** Inline Markdown → LaTeX fragment (bold, code, links, etc.). */
export function markdownLineToLatex(line: string): string {
  const trimmed = line.trim();
  if (!trimmed) return '';
  try {
    return execFileSync('pandoc', ['-f', 'markdown', '-t', 'latex', '--wrap=none'], {
      input: trimmed,
      encoding: 'utf-8',
      maxBuffer: 512_000,
    }).trim();
  } catch {
    return escapeLatex(trimmed);
  }
}

function splitAuthorEntryLines(lines: AuthorEntry): {
  textLines: string[];
  orcidId: string | null;
} {
  const textLines: string[] = [];
  let orcidId: string | null = null;
  for (const line of lines) {
    if (typeof line === 'string') textLines.push(line);
    else orcidId = line.orcid;
  }
  return { textLines, orcidId };
}

function formatAuthorLatexBlock(lines: AuthorEntry): string {
  const { textLines, orcidId } = splitAuthorEntryLines(lines);
  const latexText = textLines.map(markdownLineToLatex).filter(Boolean);
  if (!latexText.length) {
    return orcidId ? `\\orcidlink{${orcidId}}` : '';
  }

  const parts: string[] = [];
  let first = latexText[0];
  if (orcidId) first = `${first}\\hspace{0.35em}\\orcidlink{${orcidId}}`;
  parts.push(first);
  for (let i = 1; i < latexText.length; i++) parts.push(latexText[i]);
  return parts.join('\\\\[0.4em]\n');
}

/** LaTeX `\\author{…}` with `\\and` between authors and stacked lines per author. */
export function buildAuthorLatexCommand(entries: AuthorEntry[]): string {
  const blocks = entries.map(formatAuthorLatexBlock).filter(Boolean);
  if (!blocks.length) return '\\author{}';
  return `\\author{%\n${blocks.join('\n\\and\n')}%\n}`;
}

/** Write `dist/_pandoc-authors.tex`; returns absolute path or null. */
export function writeAuthorLatexFile(meta: ThesisMeta, distDir: string): string | null {
  if (!meta.authorEntries.length) return null;
  const body = buildAuthorLatexCommand(meta.authorEntries);
  const abs = join(distDir, '_pandoc-authors.tex');
  writeFileSync(
    abs,
    [
      '% Auto-generated by leafmark - do not edit',
      '\\IfFileExists{orcidlink.sty}{\\usepackage{orcidlink}}{\\providecommand{\\orcidlink}[1]{}}',
      body,
      '',
    ].join('\n'),
    'utf-8'
  );
  return abs;
}

/** Escape plain text for use inside LaTeX `\\fancyhead` / `\\fancyfoot` arguments. */
export function escapeLatex(text: string): string {
  let out = '';
  for (const c of text) {
    switch (c) {
      case '\\':
        out += '\\textbackslash{}';
        break;
      case '{':
        out += '\\{';
        break;
      case '}':
        out += '\\}';
        break;
      case '$':
        out += '\\$';
        break;
      case '&':
        out += '\\&';
        break;
      case '#':
        out += '\\#';
        break;
      case '^':
        out += '\\textasciicircum{}';
        break;
      case '_':
        out += '\\_';
        break;
      case '%':
        out += '\\%';
        break;
      case '~':
        out += '\\textasciitilde{}';
        break;
      default:
        out += c;
    }
  }
  return out;
}

function headCell(kind: 'L' | 'C' | 'R', raw: string): string {
  if (!raw) return `\\fancyhead[${kind}]{}`;
  if (kind === 'C') {
    return `\\fancyhead[${kind}]{\\footnotesize\\parbox[c]{0.38\\textwidth}{\\centering ${escapeLatex(raw)}}}`;
  }
  return `\\fancyhead[${kind}]{\\footnotesize ${escapeLatex(raw)}}`;
}

function footCell(kind: 'L' | 'C' | 'R', inner: string): string {
  return `\\fancyfoot[${kind}]{${inner}}`;
}

function footerLeftLine(meta: ThesisMeta): string {
  if (meta.footerLeft === undefined) {
    const date = meta.date ? escapeLatex(meta.date) : '\\today';
    return footCell('L', `\\footnotesize ${date}`);
  }
  if (meta.footerLeft === '') return footCell('L', '');
  return footCell('L', `\\footnotesize ${escapeLatex(meta.footerLeft)}`);
}

function footerCenterLine(meta: ThesisMeta): string {
  if (!meta.footerCenter) return footCell('C', '');
  return footCell('C', `\\footnotesize ${escapeLatex(meta.footerCenter)}`);
}

function footerRightLine(meta: ThesisMeta): string {
  if (meta.footerRight === undefined) return footCell('R', '\\footnotesize \\thepage');
  if (meta.footerRight === '') return footCell('R', '');
  return footCell('R', `\\footnotesize ${escapeLatex(meta.footerRight)}`);
}

/** `fancyhf`, heads, footers, rules (for `\\pagestyle{fancy}` and `\\fancypagestyle{plain}`). */
function innerFancy(meta: ThesisMeta, indent: string): string {
  return [
    `${indent}\\fancyhf{}`,
    `${indent}${headCell('L', meta.headerLeft)}`,
    `${indent}${headCell('C', meta.headerCenter)}`,
    `${indent}${headCell('R', meta.headerRight)}`,
    `${indent}${footerLeftLine(meta)}`,
    `${indent}${footerCenterLine(meta)}`,
    `${indent}${footerRightLine(meta)}`,
    `${indent}\\renewcommand{\\headrulewidth}{0.4pt}`,
    `${indent}\\renewcommand{\\footrulewidth}{0pt}`,
  ].join('\n');
}

function fancyHeadersBlock(meta: ThesisMeta): string {
  return [
    '\\pagestyle{fancy}',
    innerFancy(meta, ''),
    '\\fancypagestyle{plain}{%',
    innerFancy(meta, '  '),
    '}',
  ].join('\n');
}

export function parseFrontmatterYaml(filePath: string): Record<string, unknown> {
  const raw = readFileSync(filePath, 'utf-8').replace(/\r\n/g, '\n');
  const m = raw.match(/^---\s*\n([\s\S]*?)\n---/);
  if (!m) {
    throw new Error(`Expected YAML front matter (--- ... ---) in ${filePath}`);
  }
  const doc = parseYaml(m[1]);
  if (!doc || typeof doc !== 'object' || Array.isArray(doc)) {
    throw new Error(`Invalid YAML document in ${filePath}`);
  }
  return doc as Record<string, unknown>;
}

export function normalizeConfig(raw: Record<string, unknown>): ThesisMeta {
  const o = { ...DEFAULT_META };
  if (str(raw.title)) o.title = str(raw.title);
  if (str(raw.subtitle)) o.subtitle = str(raw.subtitle);
  const authorRaw = raw.author ?? raw.authors;
  const entries = parseAuthorEntries(authorRaw);
  if (entries.length) {
    o.authorEntries = entries;
    o.author = entries.map(firstAuthorNameLine).filter(Boolean);
  }
  if (str(raw.date)) {
    const dateStr = str(raw.date);
    const dateFormat = str(raw['date-format']);
    o.date = dateFormat
      ? formatDocumentDate(dateStr, dateFormat, str(raw.lang) || 'en')
      : dateStr;
  }
  if (strArray(raw.keywords).length) o.keywords = strArray(raw.keywords);

  if (raw.toc !== undefined) o.toc = bool(raw.toc, DEFAULT_META.toc);
  if (raw['toc-depth'] !== undefined)
    o.tocDepth = num(raw['toc-depth'], DEFAULT_META.tocDepth);
  if (raw['toc-own-page'] !== undefined) {
    o.tocOwnPage = bool(raw['toc-own-page'], DEFAULT_META.tocOwnPage);
  }
  if (str(raw['toc-title'])) o.tocTitle = str(raw['toc-title']);

  if (str(raw['references-title'])) o.referencesTitle = str(raw['references-title']);

  if (raw['number-sections'] !== undefined) {
    o.numberSections = bool(raw['number-sections'], DEFAULT_META.numberSections);
  }

  if (str(raw['header-left'])) o.headerLeft = str(raw['header-left']);
  if (str(raw['header-center'])) o.headerCenter = str(raw['header-center']);
  if (str(raw['header-right'])) o.headerRight = str(raw['header-right']);

  if ('footer-left' in raw) o.footerLeft = strOpt(raw['footer-left']);
  if (str(raw['footer-center'])) o.footerCenter = str(raw['footer-center']);
  if ('footer-right' in raw) o.footerRight = strOpt(raw['footer-right']);

  if (raw['title-page'] !== undefined) {
    o.titlePage = bool(raw['title-page'], DEFAULT_META.titlePage);
  }

  return o;
}

/** Resolve bibliography paths; empty array means no citeproc. */
export function resolveBibliographyPaths(
  raw: Record<string, unknown>,
  projectRoot: string
): string[] {
  const b = raw.bibliography;
  if (b === false) return [];
  if (Array.isArray(b) && b.length === 0) return [];
  const defaultBib = join(projectRoot, 'sources.bib');
  if (b === undefined || b === null) {
    return existsSync(defaultBib) ? [defaultBib] : [];
  }
  if (typeof b === 'string' && b.trim()) {
    return [isAbsolute(b) ? b : join(projectRoot, b)];
  }
  if (!Array.isArray(b)) return existsSync(defaultBib) ? [defaultBib] : [];
  const out: string[] = [];
  for (const item of b) {
    if (typeof item !== 'string' || !item.trim()) continue;
    const p = isAbsolute(item) ? item : join(projectRoot, item);
    out.push(p);
  }
  return out;
}

/**
 * Optional cover PDF for `pdfunite` (path in YAML is relative to `project/`, or absolute).
 * Omitted / empty / false means no cover merge (Pandoc writes `dist/output.pdf` directly unless `pdfunite` merges a cover).
 */
export function resolveCoverPdfPath(
  raw: Record<string, unknown>,
  projectRoot: string
): string | null {
  const c = raw.coverpage;
  if (c === undefined || c === null || c === false) return null;
  const s = typeof c === 'string' ? c.trim() : String(c).trim();
  if (!s) return null;
  return isAbsolute(s) ? s : join(projectRoot, s);
}

/** Path to a custom Pandoc `.latex` template relative to the bundle folder, or absolute. */
export function resolveLatexTemplatePath(
  raw: Record<string, unknown>,
  projectRoot: string
): string | null {
  const t = raw['latex-template'];
  if (t === undefined || t === null || t === false) return null;
  const s = typeof t === 'string' ? t.trim() : String(t).trim();
  if (!s) return null;
  return isAbsolute(s) ? s : join(projectRoot, s);
}

const MERGED_YAML_BLOCKED = new Set([
  'coverpage',
  'bibliography',
  'latex-template',
  'header-includes',
  'fonts-include',
  'date-format',
]);

/** Keys written from `normalizeConfig` / `ThesisMeta` (raw cannot override these). */
const MERGED_YAML_FROM_META = new Set([
  'title',
  'subtitle',
  'author',
  'authors',
  'author-entries',
  'author-entries-tex',
  'date',
  'title-page',
  'toc',
  'toc-depth',
  'toc-own-page',
  'toc-title',
  'reference-section-title',
  'number-sections',
  'keywords',
]);

export type MergedYamlOptions = {
  /** Forward-slash path from repo root for `\\input` in custom templates, e.g. `dist/cv/_pandoc-fonts.tex`. */
  fontsIncludeRel?: string;
  /** Forward-slash path to generated `\\author{…}` (e.g. `dist/_pandoc-authors.tex`). */
  authorsIncludeRel?: string;
};

/** YAML block for the merged document (no LaTeX `header-includes`; citeproc paths are passed via CLI). */
export function mergedYamlDocument(
  meta: ThesisMeta,
  raw: Record<string, unknown>,
  options?: MergedYamlOptions
): string {
  const doc: Record<string, unknown> = {
    title: meta.title,
    subtitle: meta.subtitle,
    author: meta.author,
    date: meta.date,
    'title-page': meta.titlePage,
    toc: meta.toc,
    'toc-depth': meta.tocDepth,
    'toc-own-page': meta.tocOwnPage,
    'toc-title': meta.tocTitle,
    'reference-section-title': meta.referencesTitle,
    'number-sections': meta.numberSections,
  };
  if (meta.keywords.length) doc.keywords = meta.keywords;
  if (meta.authorEntries.length) doc['author-entries'] = meta.authorEntries;
  if (options?.authorsIncludeRel) {
    doc['author-entries-tex'] = options.authorsIncludeRel.replace(/\\/g, '/');
  }
  if (raw.lang) doc.lang = raw.lang;
  if (raw.abstract) doc.abstract = raw.abstract;

  for (const [k, v] of Object.entries(raw)) {
    if (MERGED_YAML_BLOCKED.has(k)) continue;
    if (MERGED_YAML_FROM_META.has(k)) continue;
    if (k in doc) continue;
    doc[k] = v;
  }

  if (options?.fontsIncludeRel) {
    doc['fonts-include'] = options.fontsIncludeRel.replace(/\\/g, '/');
  }

  return stringifyYaml(doc, { lineWidth: 0 }).trimEnd();
}

export function writeBuildLatexIncludes(
  meta: ThesisMeta,
  distDir: string,
  srcDir: string,
  fontsRelToRoot: string,
  options: { includeFonts?: boolean } = {}
): void {
  const latexStyle = join(srcDir, 'latex-style.tex').replace(/\\/g, '/');
  const fonts = fontsRelToRoot.replace(/\\/g, '/');
  const fancy = [
    '% Auto-generated by leafmark - do not edit',
    '\\usepackage{fancyhdr}',
    '\\setlength{\\headheight}{16pt}',
    fancyHeadersBlock(meta),
    '',
  ].join('\n');

  const orcidPkg = authorEntriesHaveOrcid(meta.authorEntries)
    ? ['\\usepackage{orcidlink}', '']
    : [];

  const body = [
    '% Auto-generated by leafmark - do not edit',
    '\\usepackage{tikz}',
    '\\usepackage{graphicx}',
    '\\usepackage{pdfpages}',
    ...orcidPkg,
    ...(options.includeFonts === false ? [] : [`\\input{${fonts}}`]),
    fancy,
    `\\input{${latexStyle}}`,
    '',
  ].join('\n');

  writeFileSync(join(distDir, '_pandoc-build-includes.tex'), body, 'utf-8');
}
