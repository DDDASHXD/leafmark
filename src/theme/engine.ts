import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export type ThemeLength = `${number}${'mm' | 'cm' | 'in' | 'pt'}`;
export type BasicTheme = {
  page?: {
    size?: 'a4' | 'letter';
    margins?: Partial<Record<'top' | 'right' | 'bottom' | 'left', ThemeLength>>;
  };
  typography?: {
    bodyFont?: string;
    headingFont?: string;
    monoFont?: string;
    fontSize?: ThemeLength;
    lineHeight?: number;
    justify?: 'left' | 'justify';
    googleFonts?: Partial<Record<'body' | 'heading' | 'mono', string>>;
  };
  colors?: Partial<Record<'text' | 'heading' | 'link' | 'muted' | 'accent' | 'surface' | 'border', string>>;
  spacing?: {
    paragraph?: ThemeLength;
    headingTop?: ThemeLength;
    headingBottom?: ThemeLength;
    listIndent?: ThemeLength;
  };
  headings?: {
    weight?: 'normal' | 'bold';
    h1Size?: ThemeLength;
    h2Size?: ThemeLength;
    h3Size?: ThemeLength;
  };
  tables?: {
    cellPadding?: ThemeLength;
    borderWidth?: ThemeLength;
    striped?: boolean;
    headerBackground?: string;
  };
  blocks?: {
    padding?: ThemeLength;
    radius?: ThemeLength;
    quoteBorderWidth?: ThemeLength;
  };
};

type NormalizedTheme = {
  page: { size: 'a4' | 'letter'; margins: Record<'top' | 'right' | 'bottom' | 'left', ThemeLength> };
  typography: Required<Omit<NonNullable<BasicTheme['typography']>, 'googleFonts'>> & { googleFonts: Partial<Record<'body' | 'heading' | 'mono', string>> };
  colors: Required<NonNullable<BasicTheme['colors']>>;
  spacing: Required<NonNullable<BasicTheme['spacing']>>;
  headings: Required<NonNullable<BasicTheme['headings']>>;
  tables: Required<NonNullable<BasicTheme['tables']>>;
  blocks: Required<NonNullable<BasicTheme['blocks']>>;
};

const DEFAULTS: NormalizedTheme = {
  page: { size: 'a4', margins: { top: '20mm', right: '30mm', bottom: '20mm', left: '30mm' } },
  typography: { bodyFont: 'inherit', headingFont: 'inherit', monoFont: 'inherit', fontSize: '11pt', lineHeight: 1.5, justify: 'left', googleFonts: {} },
  colors: { text: '#1a1a1a', heading: '#111111', link: '#0b57d0', muted: '#666666', accent: '#0b57d0', surface: '#f8f8f8', border: '#d8d8d8' },
  spacing: { paragraph: '7pt', headingTop: '18pt', headingBottom: '7pt', listIndent: '18pt' },
  headings: { weight: 'bold', h1Size: '18pt', h2Size: '15pt', h3Size: '13pt' },
  tables: { cellPadding: '5pt', borderWidth: '0.5pt', striped: true, headerBackground: '#eeeeee' },
  blocks: { padding: '9pt', radius: '3pt', quoteBorderWidth: '3pt' },
};

export function normalizeTheme(theme: BasicTheme = {}): NormalizedTheme {
  return {
    page: { ...DEFAULTS.page, ...theme.page, margins: { ...DEFAULTS.page.margins, ...theme.page?.margins } },
    typography: { ...DEFAULTS.typography, ...theme.typography },
    colors: { ...DEFAULTS.colors, ...theme.colors },
    spacing: { ...DEFAULTS.spacing, ...theme.spacing },
    headings: { ...DEFAULTS.headings, ...theme.headings },
    tables: { ...DEFAULTS.tables, ...theme.tables },
    blocks: { ...DEFAULTS.blocks, ...theme.blocks },
  } as NormalizedTheme;
}

export function writeCompiledTheme(theme: BasicTheme | undefined, outputDir: string): { latex: string | null; css: string | null } {
  if (!theme) return { latex: null, css: null };
  mkdirSync(outputDir, { recursive: true });
  const latex = join(outputDir, '_leafmark-theme.tex');
  const css = join(outputDir, '_leafmark-theme.css');
  writeFileSync(latex, compileThemeLatex(theme), 'utf-8');
  writeFileSync(css, compileThemeCss(theme), 'utf-8');
  return { latex, css };
}

export function compileThemeLatex(input: BasicTheme): string {
  const t = normalizeTheme(input);
  const c = Object.fromEntries(Object.entries(t.colors).map(([key, value]) => [key, hex(value)]));
  const m = t.page.margins;
  const headingWeight = t.headings.weight === 'bold' ? 'bfseries' : 'mdseries';
  return [
    '% Auto-generated from .leafmark/config.json theme',
    '\\usepackage{geometry}', '\\usepackage{ragged2e}', '\\usepackage{enumitem}', '\\usepackage{titlesec}', '\\usepackage{colortbl}',
    `\\geometry{${t.page.size}paper,top=${length(m.top)},right=${length(m.right)},bottom=${length(m.bottom)},left=${length(m.left)}}`,
    ...(t.typography.bodyFont === 'inherit' || t.typography.googleFonts.body ? [] : [`\\setmainfont{${texText(t.typography.bodyFont)}}`]),
    ...(t.typography.headingFont === 'inherit' || t.typography.googleFonts.heading ? [] : [`\\setsansfont{${texText(t.typography.headingFont)}}`]),
    ...(t.typography.monoFont === 'inherit' || t.typography.googleFonts.mono ? [] : [`\\setmonofont{${texText(t.typography.monoFont)}}`]),
    `\\fontsize{${length(t.typography.fontSize)}}{${fontLeading(t.typography.fontSize, t.typography.lineHeight)}}\\selectfont`,
    `\\definecolor{LeafText}{HTML}{${c.text}}`, `\\definecolor{LeafHeading}{HTML}{${c.heading}}`,
    `\\definecolor{LeafLink}{HTML}{${c.link}}`, `\\definecolor{LeafAccent}{HTML}{${c.accent}}`,
    `\\definecolor{LeafSurface}{HTML}{${c.surface}}`, `\\definecolor{LeafBorder}{HTML}{${c.border}}`,
    `\\definecolor{LeafTableHeader}{HTML}{${hex(t.tables.headerBackground)}}`,
    '\\color{LeafText}',
    '\\AtBeginDocument{\\ifdefined\\hypersetup\\hypersetup{colorlinks=true,linkcolor=LeafLink,urlcolor=LeafLink,citecolor=LeafLink}\\fi}',
    t.typography.justify === 'justify' ? '\\justifying' : '\\RaggedRight',
    `\\setlength{\\parskip}{${length(t.spacing.paragraph)}}`, `\\setlength{\\parindent}{0pt}`,
    `\\setlist{leftmargin=${length(t.spacing.listIndent)}}`,
    `\\titleformat{\\section}{\\sffamily\\${headingWeight}\\color{LeafHeading}\\fontsize{${length(t.headings.h1Size)}}{${fontLeading(t.headings.h1Size, 1.2)}}\\selectfont}{\\thesection}{1em}{}`,
    `\\titleformat{\\subsection}{\\sffamily\\${headingWeight}\\color{LeafHeading}\\fontsize{${length(t.headings.h2Size)}}{${fontLeading(t.headings.h2Size, 1.2)}}\\selectfont}{\\thesubsection}{1em}{}`,
    `\\titlespacing*{\\section}{0pt}{${length(t.spacing.headingTop)}}{${length(t.spacing.headingBottom)}}`,
    `\\titlespacing*{\\subsection}{0pt}{${length(t.spacing.headingTop)}}{${length(t.spacing.headingBottom)}}`,
    `\\setlength{\\tabcolsep}{${length(t.tables.cellPadding)}}`, `\\setlength{\\arrayrulewidth}{${length(t.tables.borderWidth)}}`, `\\arrayrulecolor{LeafBorder}`,
    `\\setlength{\\fboxsep}{${length(t.blocks.padding)}}`,
    '',
  ].join('\n');
}

export function compileThemeCss(input: BasicTheme): string {
  const t = normalizeTheme(input); const m = t.page.margins;
  return `/* Auto-generated from .leafmark/config.json theme */
${googleCssImport(t.typography.googleFonts)}
@page { size: ${t.page.size}; margin: ${m.top} ${m.right} ${m.bottom} ${m.left}; }
:root { --leaf-text: ${t.colors.text}; --leaf-heading: ${t.colors.heading}; --leaf-link: ${t.colors.link}; --leaf-muted: ${t.colors.muted}; --leaf-accent: ${t.colors.accent}; --leaf-surface: ${t.colors.surface}; --leaf-border: ${t.colors.border}; }
html { font-family: ${cssFont(t.typography.bodyFont)}; font-size: ${t.typography.fontSize}; line-height: ${t.typography.lineHeight}; color: var(--leaf-text); text-align: ${t.typography.justify}; }
h1,h2,h3,h4,h5,h6 { font-family: ${cssFont(t.typography.headingFont)}; color: var(--leaf-heading); font-weight: ${t.headings.weight === 'bold' ? 700 : 400}; margin-top: ${t.spacing.headingTop}; margin-bottom: ${t.spacing.headingBottom}; }
h1 { font-size: ${t.headings.h1Size}; } h2 { font-size: ${t.headings.h2Size}; } h3 { font-size: ${t.headings.h3Size}; }
p { margin: ${t.spacing.paragraph} 0; } ul,ol { padding-left: ${t.spacing.listIndent}; }
a { color: var(--leaf-link); } code,pre { font-family: ${cssFont(t.typography.monoFont)}; }
pre,blockquote { background: var(--leaf-surface); padding: ${t.blocks.padding}; border-radius: ${t.blocks.radius}; }
blockquote { border-left: ${t.blocks.quoteBorderWidth} solid var(--leaf-accent); }
table { width: 100%; border-collapse: collapse; } th,td { padding: ${t.tables.cellPadding}; border-bottom: ${t.tables.borderWidth} solid var(--leaf-border); } th { background: ${t.tables.headerBackground}; }
${t.tables.striped ? 'tbody tr:nth-child(even) { background: var(--leaf-surface); }' : ''}
`;
}

export async function writeGoogleFontInclude(theme: BasicTheme | undefined, outputDir: string): Promise<string | null> {
  const fonts = theme?.typography?.googleFonts;
  if (!fonts || !Object.values(fonts).some(Boolean)) return null;
  const lines = ['% Auto-generated Google Fonts for Leafmark'];
  for (const [role, family] of Object.entries(fonts) as Array<['body' | 'heading' | 'mono', string]>) {
    if (!family) continue;
    const safe = family.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '');
    const regular = await downloadGoogleFont(family, 400, join(outputDir, `_leafmark-google-${safe}-400.ttf`));
    const bold = await downloadGoogleFont(family, 700, join(outputDir, `_leafmark-google-${safe}-700.ttf`));
    const command = role === 'body' ? 'setmainfont' : role === 'heading' ? 'setsansfont' : 'setmonofont';
    lines.push(`\\${command}{${regular.file}}[Path=${regular.dir}/,BoldFont=${bold.file}]`);
  }
  const out = join(outputDir, '_leafmark-google-fonts.tex');
  writeFileSync(out, `${lines.join('\n')}\n`, 'utf-8');
  return out;
}

function googleCssImport(fonts: Partial<Record<'body' | 'heading' | 'mono', string>>): string {
  const families = [...new Set(Object.values(fonts).filter(Boolean))] as string[];
  return families.length ? `@import url('https://fonts.googleapis.com/css2?${families.map(f => `family=${encodeURIComponent(f)}:wght@400;700`).join('&')}&display=swap');` : '';
}

async function downloadGoogleFont(family: string, weight: number, output: string): Promise<{ dir: string; file: string }> {
  const cssUrl = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(family)}:wght@${weight}`;
  const cssResponse = await fetch(cssUrl, { headers: { 'user-agent': 'Mozilla/5.0 (Linux; U; Android 2.2)' } });
  if (!cssResponse.ok) throw new Error(`Could not load Google Font ${family} (${cssResponse.status}).`);
  const css = await cssResponse.text(); const url = css.match(/url\((https:\/\/[^)]+)\)/)?.[1];
  if (!url) throw new Error(`Google Fonts returned no font file for ${family}.`);
  const fontResponse = await fetch(url); if (!fontResponse.ok) throw new Error(`Could not download Google Font ${family}.`);
  writeFileSync(output, Buffer.from(await fontResponse.arrayBuffer()));
  return { dir: dirnamePath(output).replace(/\\/g, '/'), file: output.split(/[\\/]/).pop()! };
}

function dirnamePath(value: string): string { return value.slice(0, Math.max(value.lastIndexOf('/'), value.lastIndexOf('\\'))); }

function length(value: unknown): string { const s = String(value); if (!/^(?:0|\d+(?:\.\d+)?)(?:mm|cm|in|pt)$/.test(s)) throw new Error(`Invalid theme length: ${s}`); return s; }
function hex(value: unknown): string { const s = String(value); if (!/^#[0-9a-f]{6}$/i.test(s)) throw new Error(`Invalid theme color: ${s}`); return s.slice(1).toUpperCase(); }
function texText(value: string): string { if (!/^[\w .-]+$/.test(value)) throw new Error(`Invalid theme font name: ${value}`); return value; }
function cssFont(value: string): string { return value === 'inherit' ? 'inherit' : `'${value.replace(/'/g, "\\'")}'`; }
function fontLeading(size: ThemeLength, ratio: number): string { const match = /^(\d+(?:\.\d+)?)pt$/.exec(length(size)); return match ? `${(Number(match[1]) * ratio).toFixed(2)}pt` : `${ratio}em`; }
