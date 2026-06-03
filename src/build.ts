#!/usr/bin/env node
/**
 * Leafmark CLI.
 *
 * Builds a folder of Markdown files into PDF and/or HTML using Pandoc. The input
 * folder can be either:
 * - a standalone Leafmark folder containing `_frontmatter.md`
 * - an older wrapper folder containing `project/_frontmatter.md`
 */

import { execFileSync, spawn, spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { homedir, platform } from 'node:os';
import {
  basename,
  dirname,
  isAbsolute,
  join,
  relative,
  resolve,
} from 'node:path';
import { fileURLToPath } from 'node:url';
import { createInterface } from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import chokidar from 'chokidar';
import {
  mergedYamlDocument,
  normalizeConfig,
  parseFrontmatterYaml,
  resolveBibliographyPaths,
  resolveCoverPdfPath,
  resolveLatexTemplatePath,
  writeAuthorLatexFile,
  writeBuildLatexIncludes,
  type MergedYamlOptions,
  type ThesisMeta,
} from './thesis-meta.js';

const PACKAGE_ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const RESOURCE_DIR = join(PACKAGE_ROOT, 'src');
const CSL_PATH = join(RESOURCE_DIR, 'csl', 'apa.csl');
const LUA_FILTER_PATH = join(RESOURCE_DIR, 'pagebreak-before-refs.lua');
const AUTHOR_ENTRIES_LUA = join(RESOURCE_DIR, 'author-entries.lua');
const PANDOC_LATEX_TEMPLATE = join(RESOURCE_DIR, 'pandoc-default.latex');
const PRINT_CSS = join(RESOURCE_DIR, 'print.css');
const CONFIG_DIR = join(homedir(), '.leafmark');
const FIRST_RUN_MARKER = join(CONFIG_DIR, 'first-run.json');
const CHAPTER_FILE_RE = /^\d+-.*\.md$/;

const KNOWN_FLAGS = new Set([
  '--help',
  '-h',
  '--html',
  '--html-only',
  '--no-merge-cover',
  '--yes',
  '-y',
  '--skip-tools-check',
]);

type Command = 'build' | 'watch' | 'doctor' | 'init';

type CliOptions = {
  command: Command;
  targetArg: string | null;
  positional: string[];
  wantHelp: boolean;
  wantHtml: boolean;
  htmlOnly: boolean;
  noMergeCover: boolean;
  yes: boolean;
  skipToolsCheck: boolean;
};

type Workspace = {
  cwd: string;
  inputRoot: string;
  projectBase: string;
  outputRoot: string;
  legacyProjectLayout: boolean;
};

type BuildContext = {
  workspace: Workspace;
  bundleName: string | null;
  activeProjectDir: string;
  distDir: string;
  rootForRelativePaths: string;
};

function die(msg: string, code = 1): never {
  console.error(msg);
  process.exit(code);
}

function printHelp(): void {
  console.log(`Usage:
  leafmark [folder] [options] [chapter.md ...]
  leafmark watch [folder] [options] [chapter.md ...]
  leafmark [folder] watch [options] [chapter.md ...]
  leafmark doctor
  leafmark init [folder]

Builds Markdown to PDF from a folder containing _frontmatter.md and numbered
chapter files such as 1-introduction.md. The older project/_frontmatter.md
layout is also supported.

Examples:
  pnpx @skxv/leafmark
  pnpx @skxv/leafmark ./folder/with/markdown
  pnpx @skxv/leafmark watch
  pnpx @skxv/leafmark ./folder/with/markdown watch --html
  pnpx @skxv/leafmark analysis
  pnpx @skxv/leafmark 1-intro.md 2-method.md

Options:
  --html            Also write thesis.html
  --html-only       Only build HTML
  --no-merge-cover  Do not merge coverpage with pdfunite
  --yes, -y         Assume yes for first-run tool installation prompts
  --skip-tools-check
                    Skip first-run external tool prompt
  --help, -h        Show this help

Requires: pandoc. PDF output also needs xelatex or pdflatex. Cover merging uses
pdfunite when front matter contains coverpage.
`);
}

function parseCli(argv: string[]): CliOptions {
  let command: Command = 'build';
  const args = [...argv];
  if (args[0] === 'build' || args[0] === 'watch' || args[0] === 'doctor' || args[0] === 'init') {
    command = args.shift() as Command;
  }

  const wantHelp = args.includes('--help') || args.includes('-h');
  const wantHtml = args.includes('--html') || args.includes('--html-only');
  const htmlOnly = args.includes('--html-only');
  const noMergeCover = args.includes('--no-merge-cover');
  const yes = args.includes('--yes') || args.includes('-y');
  const skipToolsCheck = args.includes('--skip-tools-check');
  const positional: string[] = [];

  for (const a of args) {
    if (KNOWN_FLAGS.has(a)) continue;
    if (a === '--') continue;
    if (a === 'watch' && command === 'build') {
      command = 'watch';
      continue;
    }
    if (a.startsWith('-')) die(`Unknown option: ${a} (try --help)`, 1);
    positional.push(a);
  }

  let targetArg: string | null = null;
  if (positional.length > 0 && looksLikeTargetFolder(positional[0]!)) {
    targetArg = positional.shift()!;
  }

  return {
    command,
    targetArg,
    positional,
    wantHelp,
    wantHtml,
    htmlOnly,
    noMergeCover,
    yes,
    skipToolsCheck,
  };
}

function looksLikeTargetFolder(value: string): boolean {
  if (CHAPTER_FILE_RE.test(basename(value))) return false;
  if (value === '.' || value === '..') return true;
  if (value.includes('/') || value.includes('\\')) return true;
  const abs = resolve(process.cwd(), value);
  return existsSync(abs) && statSync(abs).isDirectory();
}

function discoverWorkspace(targetArg: string | null): Workspace {
  const inputRoot = resolve(process.cwd(), targetArg ?? '.');
  if (!existsSync(inputRoot)) die(`Folder not found: ${inputRoot}`, 1);
  if (!statSync(inputRoot).isDirectory()) die(`Not a folder: ${inputRoot}`, 1);

  const directFrontmatter = join(inputRoot, '_frontmatter.md');
  if (existsSync(directFrontmatter)) {
    return {
      cwd: process.cwd(),
      inputRoot,
      projectBase: inputRoot,
      outputRoot: join(inputRoot, 'dist'),
      legacyProjectLayout: false,
    };
  }

  const legacyProject = join(inputRoot, 'project');
  if (existsSync(join(legacyProject, '_frontmatter.md'))) {
    return {
      cwd: process.cwd(),
      inputRoot,
      projectBase: legacyProject,
      outputRoot: join(inputRoot, 'dist'),
      legacyProjectLayout: true,
    };
  }

  die(
    `Missing _frontmatter.md. Expected ${directFrontmatter} or ${join(legacyProject, '_frontmatter.md')}.`,
    1
  );
}

function relFrom(root: string, p: string): string {
  const r = relative(root, p);
  return r || p;
}

function texPath(p: string): string {
  return p.replace(/\\/g, '/');
}

function which(cmd: string): string | null {
  const checker = platform() === 'win32' ? 'where' : 'which';
  try {
    const pathOut = execFileSync(checker, [cmd], { encoding: 'utf-8' }).trim();
    return pathOut.split(/\r?\n/)[0] || null;
  } catch {
    return null;
  }
}

function kpsewhich(fname: string): string | null {
  try {
    const p = execFileSync('kpsewhich', [fname], { encoding: 'utf-8' }).trim();
    return p || null;
  } catch {
    return null;
  }
}

function pandocHighlightArg(): string {
  try {
    const help = execFileSync('pandoc', ['--help'], {
      encoding: 'utf-8',
      maxBuffer: 2_000_000,
    });
    return help.includes('--syntax-highlighting')
      ? '--syntax-highlighting=kate'
      : '--highlight-style=kate';
  } catch {
    return '--highlight-style=kate';
  }
}

async function ensureFirstRunTools(opts: CliOptions): Promise<void> {
  if (opts.skipToolsCheck || opts.command === 'init') return;
  if (existsSync(FIRST_RUN_MARKER)) return;

  const missing = requiredToolStatus().filter((t) => !t.available);
  if (missing.length === 0) {
    mkdirSync(CONFIG_DIR, { recursive: true });
    writeFileSync(FIRST_RUN_MARKER, JSON.stringify({ checkedAt: new Date().toISOString() }, null, 2));
    return;
  }

  if (!process.stdin.isTTY && !opts.yes) {
    console.warn(
      `Leafmark needs external tools: ${missing.map((t) => t.name).join(', ')}. Run \`leafmark doctor\` for install commands.`
    );
    return;
  }

  if (opts.yes) {
    installMissingTools(missing.map((t) => t.name));
    mkdirSync(CONFIG_DIR, { recursive: true });
    writeFileSync(FIRST_RUN_MARKER, JSON.stringify({ checkedAt: new Date().toISOString() }, null, 2));
    return;
  }

  const rl = createInterface({ input, output });
  try {
    const answer = await rl.question(
      `Leafmark needs external tools (${missing.map((t) => t.name).join(', ')}). Download/install them now? [y/N] `
    );
    if (/^y(es)?$/i.test(answer.trim())) {
      installMissingTools(missing.map((t) => t.name));
    }
    mkdirSync(CONFIG_DIR, { recursive: true });
    writeFileSync(FIRST_RUN_MARKER, JSON.stringify({ checkedAt: new Date().toISOString() }, null, 2));
  } finally {
    rl.close();
  }
}

function requiredToolStatus(): Array<{ name: string; command: string; available: boolean }> {
  return [
    { name: 'pandoc', command: 'pandoc', available: Boolean(which('pandoc')) },
    {
      name: 'latex',
      command: 'xelatex or pdflatex',
      available: Boolean(which('xelatex') || which('pdflatex')),
    },
    { name: 'pdfunite', command: 'pdfunite', available: Boolean(which('pdfunite')) },
  ];
}

function installMissingTools(names: string[]): void {
  const plan = installPlan(names);
  if (!plan) {
    console.warn('Automatic installation is not available for this platform. Run `leafmark doctor` for guidance.');
    return;
  }
  console.log(`Running: ${plan.command} ${plan.args.join(' ')}`);
  const result = spawnSync(plan.command, plan.args, { stdio: 'inherit' });
  if (result.status !== 0) {
    console.warn('Tool installation did not finish successfully. Run `leafmark doctor` for manual commands.');
  }
}

function installPlan(names: string[]): { command: string; args: string[] } | null {
  const os = platform();
  if (os === 'darwin' && which('brew')) {
    const packages = new Set<string>();
    if (names.includes('pandoc')) packages.add('pandoc');
    if (names.includes('latex')) packages.add('basictex');
    if (names.includes('pdfunite')) packages.add('poppler');
    return { command: 'brew', args: ['install', ...packages] };
  }
  if (os === 'win32') {
    if (which('winget')) {
      const args = ['install'];
      if (names.includes('pandoc')) args.push('--id', 'JohnMacFarlane.Pandoc');
      if (names.includes('latex')) args.push('--id', 'MiKTeX.MiKTeX');
      if (names.includes('pdfunite')) args.push('--id', 'oschwartz10612.Poppler');
      return { command: 'winget', args };
    }
    if (which('choco')) {
      const packages = [];
      if (names.includes('pandoc')) packages.push('pandoc');
      if (names.includes('latex')) packages.push('miktex');
      if (names.includes('pdfunite')) packages.push('poppler');
      return { command: 'choco', args: ['install', '-y', ...packages] };
    }
  }
  if (os === 'linux') {
    if (which('apt-get')) {
      const packages = [];
      if (names.includes('pandoc')) packages.push('pandoc');
      if (names.includes('latex')) packages.push('texlive-xetex');
      if (names.includes('pdfunite')) packages.push('poppler-utils');
      return { command: 'sudo', args: ['apt-get', 'install', '-y', ...packages] };
    }
    if (which('dnf')) {
      const packages = [];
      if (names.includes('pandoc')) packages.push('pandoc');
      if (names.includes('latex')) packages.push('texlive-xetex');
      if (names.includes('pdfunite')) packages.push('poppler-utils');
      return { command: 'sudo', args: ['dnf', 'install', '-y', ...packages] };
    }
    if (which('pacman')) {
      const packages = [];
      if (names.includes('pandoc')) packages.push('pandoc');
      if (names.includes('latex')) packages.push('texlive-bin');
      if (names.includes('pdfunite')) packages.push('poppler');
      return { command: 'sudo', args: ['pacman', '-S', '--needed', ...packages] };
    }
  }
  return null;
}

function printDoctor(): void {
  console.log('Leafmark external tools:');
  for (const tool of requiredToolStatus()) {
    console.log(`  ${tool.available ? 'ok' : 'missing'} ${tool.name} (${tool.command})`);
  }
  console.log('');
  console.log('Install guidance:');
  console.log('  macOS:   brew install pandoc basictex poppler');
  console.log('  Windows: winget install JohnMacFarlane.Pandoc MiKTeX.MiKTeX oschwartz10612.Poppler');
  console.log('  Debian:  sudo apt-get install pandoc texlive-xetex poppler-utils');
  console.log('  Fedora:  sudo dnf install pandoc texlive-xetex poppler-utils');
  console.log('  Arch:    sudo pacman -S pandoc texlive-bin poppler');
}

function writePdfFontSnippet(distDir: string): void {
  mkdirSync(distDir, { recursive: true });
  const out = join(distDir, '_pandoc-fonts.tex');
  const heros = kpsewhich('texgyreheros-regular.otf');
  if (!heros) {
    writeFileSync(
      out,
      [
        '% Fallback: sans body when texgyreheros-regular.otf is not in texmf',
        '\\usepackage[scaled=0.95]{helvet}',
        '\\renewcommand{\\familydefault}{\\sfdefault}',
        '',
      ].join('\n'),
      'utf-8'
    );
    return;
  }
  const dir = dirname(heros).replace(/\\/g, '/');
  writeFileSync(
    out,
    [
      '% Auto-generated by leafmark',
      '\\setmainfont{texgyreheros}[',
      `  Path = ${dir}/,`,
      '  Extension = .otf,',
      '  UprightFont = texgyreheros-regular,',
      '  BoldFont = texgyreheros-bold,',
      '  ItalicFont = texgyreheros-italic,',
      '  BoldItalicFont = texgyreheros-bolditalic,',
      '  Scale = 0.96,',
      ']',
      '\\setmonofont{texgyrecursor}[',
      `  Path = ${dir}/,`,
      '  Extension = .otf,',
      '  UprightFont = texgyrecursor-regular,',
      '  BoldFont = texgyrecursor-bold,',
      '  ItalicFont = texgyrecursor-italic,',
      '  BoldItalicFont = texgyrecursor-bolditalic,',
      '  Scale = 0.88,',
      ']',
      '',
    ].join('\n'),
    'utf-8'
  );
}

function pickPdfEngine(): 'xelatex' | 'pdflatex' {
  if (which('xelatex')) return 'xelatex';
  if (which('pdflatex')) return 'pdflatex';
  die('No LaTeX engine found. Run `leafmark doctor` for install guidance, or use --html-only.', 1);
}

function splitBundleAndChapters(positional: string[], workspace: Workspace): {
  bundleName: string | null;
  chapterArgs: string[];
} {
  if (positional.length === 0) return { bundleName: null, chapterArgs: [] };
  const first = positional[0]!.trim();
  if (CHAPTER_FILE_RE.test(first)) return { bundleName: null, chapterArgs: [...positional] };

  const bundleFrontmatter = join(workspace.projectBase, first, '_frontmatter.md');
  if (existsSync(bundleFrontmatter)) {
    return { bundleName: first, chapterArgs: positional.slice(1) };
  }
  die(
    `Unknown first argument "${first}". Expected a bundle folder with _frontmatter.md or an N-*.md chapter file.`,
    1
  );
}

function listChapters(projectDir: string): string[] {
  const files = readdirSync(projectDir).filter((f) => CHAPTER_FILE_RE.test(f));
  return files.sort((a, b) => {
    const na = Number.parseInt(a.replace(/^(\d+).*/, '$1'), 10);
    const nb = Number.parseInt(b.replace(/^(\d+).*/, '$1'), 10);
    return na - nb;
  });
}

function resolveChapterFiles(requested: string[], projectDir: string): string[] {
  if (requested.length === 0) {
    const all = listChapters(projectDir);
    if (all.length === 0) die(`No chapter files matching N-*.md in ${projectDir}`, 1);
    return all;
  }

  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of requested) {
    const name = basename(raw.trim());
    if (!name || name === '.' || name === '..') die(`Invalid chapter path: ${raw}`, 1);
    if (!CHAPTER_FILE_RE.test(name)) die(`Not a chapter file (expected N-name.md): ${name}`, 1);
    const abs = join(projectDir, name);
    if (!existsSync(abs)) die(`Chapter file not found: ${name} (${abs})`, 1);
    if (seen.has(name)) continue;
    seen.add(name);
    out.push(name);
  }
  if (out.length === 0) die(`No chapter files matching N-*.md in ${projectDir}`, 1);
  return out;
}

function readUtf8(p: string): string {
  return readFileSync(p, 'utf-8');
}

function countMergedBody(merged: string): { words: number; chars: number } {
  const withoutFm = merged.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n\s*/, '');
  const text = withoutFm.trim();
  return {
    chars: text.length,
    words: text.length === 0 ? 0 : text.split(/\s+/).length,
  };
}

function buildMergedMarkdown(
  meta: ThesisMeta,
  rawYaml: Record<string, unknown>,
  chapterFiles: string[],
  projectDir: string,
  mergedYamlOptions?: MergedYamlOptions
): string {
  const yamlBlock = mergedYamlDocument(meta, rawYaml, mergedYamlOptions);
  const parts: string[] = [`---\n${yamlBlock}\n---\n\n`];
  for (const f of chapterFiles) {
    parts.push(readUtf8(join(projectDir, f)).replace(/\r\n/g, '\n').trimEnd(), '\n\n');
  }
  return parts.join('');
}

function fontsTexRelFromDist(ctx: BuildContext): string {
  return relative(ctx.rootForRelativePaths, join(ctx.distDir, '_pandoc-fonts.tex')).replace(/\\/g, '/');
}

function pandocResourcePath(ctx: BuildContext): string {
  const resourceRoots = [ctx.activeProjectDir, ctx.workspace.projectBase, ctx.workspace.inputRoot, RESOURCE_DIR];
  return resourceRoots.map(texPath).join(platform() === 'win32' ? ';' : ':');
}

const WAVE_FRAMES = [
  '⠉⠙⠢⣄',
  '⠊⠉⠙⠢',
  '⠜⠊⠉⠙',
  '⡤⠜⠊⠉',
  '⣀⡤⠜⠊',
  '⢤⣀⡤⠜',
  '⠣⢤⣀⡤',
  '⠑⠣⢤⣀',
] as const;

function shouldShowWave(): boolean {
  return Boolean(process.stdout.isTTY && !process.env.CI && process.env.VS_WRITER_NO_ANIM !== '1');
}

async function withWaveLine<T>(label: string, work: () => Promise<T>): Promise<T> {
  if (!shouldShowWave()) {
    process.stdout.write(`${label} ...\n`);
    return work();
  }
  let frame = 0;
  const tick = setInterval(() => {
    const f = WAVE_FRAMES[frame % WAVE_FRAMES.length];
    process.stdout.write(`\r\x1b[2K${f}  ${label}`);
    frame++;
  }, 90);
  try {
    return await work();
  } finally {
    clearInterval(tick);
    process.stdout.write('\r\x1b[2K');
  }
}

function spawnComplete(
  cmd: string,
  args: string[],
  options: { cwd: string }
): Promise<{ status: number | null; stderr: string; stdout: string }> {
  return new Promise((resolveResult, reject) => {
    const child = spawn(cmd, args, {
      cwd: options.cwd,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const out: Buffer[] = [];
    const err: Buffer[] = [];
    child.stdout?.on('data', (c: Buffer | string) => out.push(Buffer.isBuffer(c) ? c : Buffer.from(c)));
    child.stderr?.on('data', (c: Buffer | string) => err.push(Buffer.isBuffer(c) ? c : Buffer.from(c)));
    child.on('error', reject);
    child.on('close', (status) => {
      resolveResult({
        status,
        stdout: Buffer.concat(out).toString('utf-8'),
        stderr: Buffer.concat(err).toString('utf-8'),
      });
    });
  });
}

async function runPandocPdf(
  merged: string,
  meta: ThesisMeta,
  bibPaths: string[],
  extraMeta: string[],
  outputPdfAbs: string,
  ctx: BuildContext,
  mergedFile: string,
  latexTemplate: string,
  useThesisHeaderIncludes: boolean,
  useDefaultGeometry: boolean
): Promise<void> {
  const fontsRel = fontsTexRelFromDist(ctx);
  writePdfFontSnippet(ctx.distDir);
  if (useThesisHeaderIncludes) {
    writeBuildLatexIncludes(meta, ctx.distDir, RESOURCE_DIR, fontsRel);
  }

  const engine = pickPdfEngine();
  if (!existsSync(latexTemplate)) die(`Missing LaTeX template: ${latexTemplate}`, 1);

  const pandocArgs: string[] = [
    texPath(mergedFile),
    '--from=markdown+smart+raw_tex',
    '--to=pdf',
    '--output=' + texPath(outputPdfAbs),
    '--template=' + texPath(latexTemplate),
    '--resource-path=' + pandocResourcePath(ctx),
    pandocHighlightArg(),
    '--pdf-engine=' + engine,
    ...extraMeta,
  ];

  if (meta.numberSections) pandocArgs.push('--number-sections');
  if (useThesisHeaderIncludes) {
    pandocArgs.push('--include-in-header=' + texPath(join(ctx.distDir, '_pandoc-build-includes.tex')));
  }
  if (useDefaultGeometry) pandocArgs.push('-V', 'geometry=left=3cm,right=3cm,top=2cm,bottom=2cm');

  if (bibPaths.length > 0) {
    for (const b of bibPaths) pandocArgs.push('--bibliography=' + texPath(b));
    pandocArgs.push('--citeproc', '-M', 'csl=' + texPath(CSL_PATH), '--lua-filter=' + texPath(LUA_FILTER_PATH));
  }

  writeFileSync(mergedFile, merged, 'utf-8');
  await withWaveLine('Generating PDF', async () => {
    const r = await spawnComplete('pandoc', pandocArgs, { cwd: ctx.rootForRelativePaths });
    if (r.status !== 0) die(`pandoc failed (pdf):\n${r.stderr || r.stdout || '(no output)'}`, r.status ?? 1);
  });
}

async function runPandocHtml(
  merged: string,
  meta: ThesisMeta,
  bibPaths: string[],
  ctx: BuildContext,
  mergedFile: string,
  htmlOutAbs: string
): Promise<void> {
  mkdirSync(ctx.distDir, { recursive: true });
  const pandocArgs: string[] = [
    texPath(mergedFile),
    '--from=markdown+smart+raw_tex',
    '--to=html5',
    '--output=' + texPath(htmlOutAbs),
    '--resource-path=' + pandocResourcePath(ctx),
    '--standalone',
    pandocHighlightArg(),
    '--embed-resources',
  ];

  if (meta.numberSections) pandocArgs.push('--number-sections');
  if (!meta.titlePage) {
    const suppressPath = join(ctx.distDir, '_suppress-title-page-header.html');
    writeFileSync(
      suppressPath,
      [
        '<style type="text/css">',
        'header#title-block-header .title,',
        'header#title-block-header .subtitle,',
        'header#title-block-header .author,',
        'header#title-block-header .date { display: none !important; }',
        '</style>',
        '',
      ].join('\n'),
      'utf-8'
    );
    pandocArgs.push('--include-in-header=' + texPath(suppressPath));
  }
  if (existsSync(AUTHOR_ENTRIES_LUA)) pandocArgs.push('--lua-filter=' + texPath(AUTHOR_ENTRIES_LUA));
  if (bibPaths.length > 0) {
    for (const b of bibPaths) pandocArgs.push('--bibliography=' + texPath(b));
    pandocArgs.push('--citeproc', '-M', 'csl=' + texPath(CSL_PATH), '--lua-filter=' + texPath(LUA_FILTER_PATH));
  }
  if (existsSync(PRINT_CSS)) pandocArgs.push('--css=' + texPath(PRINT_CSS));

  writeFileSync(mergedFile, merged, 'utf-8');
  await withWaveLine('Generating HTML', async () => {
    const r = await spawnComplete('pandoc', pandocArgs, { cwd: ctx.rootForRelativePaths });
    if (r.status !== 0) die(`pandoc failed (html):\n${r.stderr || r.stdout || '(no output)'}`, r.status ?? 1);
  });
}

async function buildOnce(workspace: Workspace, opts: CliOptions): Promise<void> {
  if (!which('pandoc')) die('pandoc not found. Run `leafmark doctor` for install guidance.', 1);

  const { bundleName, chapterArgs } = splitBundleAndChapters(opts.positional, workspace);
  const activeProjectDir = bundleName ? join(workspace.projectBase, bundleName) : workspace.projectBase;
  const distDir = bundleName ? join(workspace.outputRoot, bundleName) : workspace.outputRoot;
  const rootForRelativePaths = workspace.legacyProjectLayout ? workspace.inputRoot : activeProjectDir;
  const ctx: BuildContext = {
    workspace,
    bundleName,
    activeProjectDir,
    distDir,
    rootForRelativePaths,
  };
  const frontmatterPath = join(activeProjectDir, '_frontmatter.md');
  const mergedFile = join(distDir, '_merged.md');
  const pdfOut = join(distDir, 'output.pdf');
  const htmlOutAbs = join(distDir, 'thesis.html');

  if (!existsSync(frontmatterPath)) die(`Missing ${frontmatterPath}`, 1);
  mkdirSync(distDir, { recursive: true });

  let rawYaml: Record<string, unknown>;
  try {
    rawYaml = parseFrontmatterYaml(frontmatterPath);
  } catch (e) {
    die(e instanceof Error ? e.message : String(e), 1);
  }

  if (rawYaml['header-includes'] !== undefined) {
    die('Remove `header-includes` from front matter. Leafmark generates the LaTeX preamble under dist/.', 1);
  }

  const meta = normalizeConfig(rawYaml);
  const bibPaths = resolveBibliographyPaths(rawYaml, activeProjectDir);
  if (bibPaths.length > 0) {
    if (!existsSync(CSL_PATH)) die(`Missing APA CSL for citeproc: ${CSL_PATH}`, 1);
    if (!existsSync(LUA_FILTER_PATH)) die(`Missing Pandoc Lua filter: ${LUA_FILTER_PATH}`, 1);
    for (const b of bibPaths) if (!existsSync(b)) die(`Bibliography file not found: ${b}`, 1);
  }

  const customLatex = resolveLatexTemplatePath(rawYaml, activeProjectDir);
  const authorTexAbs = writeAuthorLatexFile(meta, distDir);
  const mergedYamlOpts: MergedYamlOptions = {
    ...(customLatex ? { fontsIncludeRel: fontsTexRelFromDist(ctx) } : {}),
    ...(authorTexAbs ? { authorsIncludeRel: relative(rootForRelativePaths, authorTexAbs).replace(/\\/g, '/') } : {}),
  };

  const chapterFiles = resolveChapterFiles(chapterArgs, activeProjectDir);
  const merged = buildMergedMarkdown(meta, rawYaml, chapterFiles, activeProjectDir, mergedYamlOpts);
  const counts = countMergedBody(merged);

  console.log(`Leafmark ${bundleName ? `(${bundleName}) ` : ''}building ${chapterFiles.length} chapter(s)`);
  console.log(`Input: ${activeProjectDir}`);
  console.log(`Output: ${distDir}`);
  console.log(`Words: ${counts.words.toLocaleString()} | characters: ${counts.chars.toLocaleString()}`);

  const extraMeta: string[] = [];
  const coverPdf = resolveCoverPdfPath(rawYaml, activeProjectDir);
  const shouldMergeCover = Boolean(coverPdf && !opts.noMergeCover && !opts.htmlOnly);
  let pandocPdfOut = pdfOut;
  if (shouldMergeCover) {
    if (!coverPdf || !existsSync(coverPdf)) die(`coverpage not found: ${coverPdf ?? ''}`, 1);
    if (!which('pdfunite')) die('coverpage requires pdfunite. Run `leafmark doctor`, or use --no-merge-cover.', 1);
    pandocPdfOut = join(distDir, '_body.pdf');
    extraMeta.push('-M', 'title-page=false');
  }

  const latexTemplate = customLatex ?? PANDOC_LATEX_TEMPLATE;
  const useThesisHeaderIncludes = !customLatex;
  const useDefaultGeometry = !customLatex;

  if (opts.wantHtml) {
    await runPandocHtml(merged, meta, bibPaths, ctx, mergedFile, htmlOutAbs);
    console.log(`Wrote ${relFrom(workspace.inputRoot, htmlOutAbs)}`);
  }

  if (!opts.htmlOnly) {
    await runPandocPdf(
      merged,
      meta,
      bibPaths,
      extraMeta,
      pandocPdfOut,
      ctx,
      mergedFile,
      latexTemplate,
      useThesisHeaderIncludes,
      useDefaultGeometry
    );

    if (shouldMergeCover && coverPdf) {
      await withWaveLine('Merging cover', async () => {
        const r = await spawnComplete('pdfunite', [coverPdf, pandocPdfOut, pdfOut], { cwd: rootForRelativePaths });
        if (r.status !== 0) die(`pdfunite failed:\n${r.stderr || r.stdout || '(no output)'}`, r.status ?? 1);
      });
    }
    console.log(`Wrote ${relFrom(workspace.inputRoot, pdfOut)}`);
  }

}

async function watch(workspace: Workspace, opts: CliOptions): Promise<void> {
  let running = false;
  let pending = false;

  const run = async () => {
    if (running) {
      pending = true;
      return;
    }
    running = true;
    try {
      await buildOnce(workspace, opts);
    } catch (e) {
      console.error(e instanceof Error ? e.message : String(e));
    } finally {
      running = false;
      if (pending) {
        pending = false;
        await run();
      }
    }
  };

  await run();
  console.log('Watching for changes. Press Ctrl+C to stop.');
  const watcher = chokidar.watch(workspace.projectBase, {
    ignoreInitial: true,
    ignored: [workspace.outputRoot, /(^|[/\\])\../],
  });
  watcher.on('all', () => {
    pending = true;
    setTimeout(() => void run(), 100);
  });
}

function initFolder(targetArg: string | null): void {
  const root = resolve(process.cwd(), targetArg ?? '.');
  mkdirSync(root, { recursive: true });
  const frontmatter = join(root, '_frontmatter.md');
  const chapter = join(root, '1-introduction.md');
  const bib = join(root, 'sources.bib');
  if (!existsSync(frontmatter)) {
    writeFileSync(
      frontmatter,
      [
        '---',
        "title: 'My Leafmark Project'",
        'author:',
        "  - 'Your Name'",
        "date: ''",
        "bibliography: 'sources.bib'",
        'toc: true',
        'toc-depth: 3',
        'toc-own-page: true',
        'number-sections: true',
        '---',
        '',
      ].join('\n'),
      'utf-8'
    );
  }
  if (!existsSync(chapter)) {
    writeFileSync(chapter, ['# Introduction', '', 'Write your first chapter here.', ''].join('\n'), 'utf-8');
  }
  if (!existsSync(bib)) writeFileSync(bib, '', 'utf-8');
  console.log(`Initialized ${root}`);
}

async function main(): Promise<void> {
  const opts = parseCli(process.argv.slice(2));
  if (opts.wantHelp) {
    printHelp();
    return;
  }
  if (opts.command === 'doctor') {
    printDoctor();
    return;
  }
  if (opts.command === 'init') {
    initFolder(opts.targetArg);
    return;
  }

  await ensureFirstRunTools(opts);
  const workspace = discoverWorkspace(opts.targetArg);
  if (opts.command === 'watch') await watch(workspace, opts);
  else await buildOnce(workspace, opts);
}

main().catch((e) => die(e instanceof Error ? e.message : String(e), 1));
