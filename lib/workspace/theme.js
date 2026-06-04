import { spawnSync } from 'node:child_process';
import { appendFileSync, cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { die } from '../system/errors.js';
import { PACKAGE_ROOT } from '../system/paths.js';
import { LEAFMARK_DIR, configPath, readProjectConfig, writeProjectConfig, } from './config.js';
const BUILTIN_THEMES_DIR = join(PACKAGE_ROOT, 'src', 'themes');
const THEME_CONFIG_FILE = 'theme.json';
const PROJECT_THEME_DIR = 'theme';
export function listBuiltinThemes() {
    const themes = builtinThemes();
    if (themes.length === 0) {
        console.log('No builtin themes found.');
        return;
    }
    for (const theme of themes) {
        const description = theme.manifest.description ? ` - ${theme.manifest.description}` : '';
        console.log(`${theme.name}${description}`);
    }
}
export function initThemeFolder(targetArg) {
    const root = resolve(process.cwd(), targetArg ?? '.');
    const leafmarkDir = join(root, LEAFMARK_DIR);
    const projectDir = join(root, 'project');
    mkdirSync(join(leafmarkDir, 'templates'), { recursive: true });
    mkdirSync(join(leafmarkDir, 'includes'), { recursive: true });
    mkdirSync(join(leafmarkDir, 'css'), { recursive: true });
    mkdirSync(join(leafmarkDir, 'fonts'), { recursive: true });
    mkdirSync(join(projectDir, LEAFMARK_DIR), { recursive: true });
    writeNewFile(join(leafmarkDir, THEME_CONFIG_FILE), `${JSON.stringify(themeInitManifest(), null, 2)}\n`);
    copyDefaultTemplate(join(leafmarkDir, 'templates', 'theme.latex'));
    writeNewFile(join(leafmarkDir, 'includes', 'theme.tex'), themeInitLatexInclude());
    writeNewFile(join(leafmarkDir, 'css', 'theme.css'), themeInitCss());
    writeNewFile(join(projectDir, LEAFMARK_DIR, 'config.json'), `${JSON.stringify(themeInitProjectConfig(), null, 2)}\n`);
    writeNewFile(join(projectDir, '_frontmatter.md'), themeInitFrontmatter());
    writeNewFile(join(projectDir, 'introduction.md'), themeInitIntroduction());
    writeNewFile(join(projectDir, 'method.md'), themeInitMethod());
    writeNewFile(join(projectDir, 'sources.bib'), '');
    writeNewFile(join(root, 'INSTRUCTIONS.md'), themeInitInstructions());
    ensureGitignoreEntry(root, 'project/');
    console.log(`Initialized Leafmark theme in ${root}`);
}
export function useTheme(projectDir, themeArg) {
    if (!themeArg || !themeArg.trim())
        die('Usage: leafmark theme use <theme name | GitHub URL>', 1);
    const theme = isGithubUrl(themeArg) ? githubTheme(themeArg) : builtinTheme(themeArg);
    try {
        if (!theme) {
            const names = builtinThemes().map((t) => t.name).join(', ');
            die(`Unknown builtin theme: ${themeArg}${names ? ` (available: ${names})` : ''}`, 1);
        }
        const projectLeafmarkDir = join(projectDir, LEAFMARK_DIR);
        const projectThemeDir = join(projectLeafmarkDir, PROJECT_THEME_DIR);
        mkdirSync(projectLeafmarkDir, { recursive: true });
        rmSync(projectThemeDir, { recursive: true, force: true });
        mkdirSync(projectThemeDir, { recursive: true });
        copyThemeFiles(theme.leafmarkDir, projectThemeDir);
        const current = readProjectConfig(projectDir);
        const themeConfig = theme.manifest.config ?? {};
        writeProjectConfig(projectDir, mergeThemeConfig(current, themeConfig));
        console.log(`Applied theme ${theme.name}`);
        console.log(`Theme files: ${projectThemeDir}`);
        console.log(`Config: ${configPath(projectDir)}`);
    }
    finally {
        theme?.cleanup?.();
    }
}
function builtinThemes() {
    if (!existsSync(BUILTIN_THEMES_DIR))
        return [];
    return readdirSync(BUILTIN_THEMES_DIR)
        .map((name) => builtinTheme(name))
        .filter((theme) => Boolean(theme))
        .sort((a, b) => a.name.localeCompare(b.name));
}
function builtinTheme(name) {
    const root = join(BUILTIN_THEMES_DIR, name);
    const leafmarkDir = join(root, LEAFMARK_DIR);
    if (!existsSync(leafmarkDir) || !statSync(leafmarkDir).isDirectory())
        return null;
    return { name, leafmarkDir, manifest: readThemeManifest(leafmarkDir, name) };
}
function githubTheme(url) {
    const tempRoot = mkdtempSync(join(tmpdir(), 'leafmark-theme-'));
    const result = spawnSync('git', ['clone', '--depth', '1', url, tempRoot], {
        encoding: 'utf-8',
        stdio: ['ignore', 'pipe', 'pipe'],
    });
    if (result.status !== 0) {
        rmSync(tempRoot, { recursive: true, force: true });
        die(`Unable to clone theme:\n${result.stderr || result.stdout || '(no output)'}`, result.status ?? 1);
    }
    const leafmarkDir = join(tempRoot, LEAFMARK_DIR);
    if (!existsSync(leafmarkDir) || !statSync(leafmarkDir).isDirectory()) {
        rmSync(tempRoot, { recursive: true, force: true });
        die(`Theme repository must contain a ${LEAFMARK_DIR} folder`, 1);
    }
    const fallbackName = basename(url).replace(/\.git$/i, '');
    const manifest = readThemeManifest(leafmarkDir, fallbackName);
    return {
        name: manifest.name ?? fallbackName,
        leafmarkDir,
        manifest,
        cleanup: () => rmSync(tempRoot, { recursive: true, force: true }),
    };
}
function readThemeManifest(leafmarkDir, fallbackName) {
    const p = join(leafmarkDir, THEME_CONFIG_FILE);
    if (!existsSync(p))
        return { name: fallbackName };
    const parsed = JSON.parse(readFileSync(p, 'utf-8'));
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        throw new Error(`Invalid theme manifest: ${p}`);
    }
    return { name: fallbackName, ...parsed };
}
function copyThemeFiles(sourceLeafmarkDir, targetThemeDir) {
    for (const entry of readdirSync(sourceLeafmarkDir)) {
        if (entry === THEME_CONFIG_FILE || entry === 'config.json')
            continue;
        cpSync(join(sourceLeafmarkDir, entry), join(targetThemeDir, entry), { recursive: true });
    }
}
function mergeThemeConfig(current, theme) {
    const out = {
        ...current,
        ...theme,
        metadata: current.metadata,
        order: current.order,
        frontmatter: current.frontmatter,
        plugins: current.plugins,
        pandoc: theme.pandoc ?? {},
        fonts: theme.fonts ?? {},
    };
    return pruneUndefined(out);
}
function pruneUndefined(value) {
    return Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined));
}
function isGithubUrl(value) {
    return /^https:\/\/github\.com\/[^/]+\/[^/]+\/?(\.git)?$/i.test(value.trim());
}
function writeNewFile(path, content) {
    if (existsSync(path))
        return;
    writeFileSync(path, content, 'utf-8');
}
function copyDefaultTemplate(target) {
    if (existsSync(target))
        return;
    const source = join(BUILTIN_THEMES_DIR, 'default', LEAFMARK_DIR, 'templates', 'default.latex');
    if (existsSync(source))
        cpSync(source, target);
    else
        writeFileSync(target, fallbackPandocTemplate(), 'utf-8');
}
function ensureGitignoreEntry(root, entry) {
    const path = join(root, '.gitignore');
    if (!existsSync(path)) {
        writeFileSync(path, `${entry}\n`, 'utf-8');
        return;
    }
    const current = readFileSync(path, 'utf-8').replace(/\r\n/g, '\n');
    const lines = current.split('\n').map((line) => line.trim());
    if (lines.includes(entry))
        return;
    appendFileSync(path, `${current.endsWith('\n') ? '' : '\n'}${entry}\n`, 'utf-8');
}
function themeInitManifest() {
    return {
        name: 'my-theme',
        description: 'A custom Leafmark theme.',
        config: {
            latexTemplate: '.leafmark/theme/templates/theme.latex',
            fonts: {
                latexInclude: '.leafmark/theme/includes/theme.tex',
                css: ['.leafmark/theme/css/theme.css'],
            },
            pandoc: {
                pdfArgs: ['-V', 'geometry=left=2.5cm,right=2.5cm,top=2cm,bottom=2cm'],
            },
        },
    };
}
function themeInitProjectConfig() {
    return {
        frontmatter: '_frontmatter.md',
        order: ['introduction.md', 'method.md'],
        latexTemplate: '../.leafmark/templates/theme.latex',
        fonts: {
            latexInclude: '../.leafmark/includes/theme.tex',
            css: ['../.leafmark/css/theme.css'],
        },
        pandoc: {
            pdfArgs: ['-V', 'geometry=left=2.5cm,right=2.5cm,top=2cm,bottom=2cm'],
        },
    };
}
function themeInitLatexInclude() {
    return [
        '% Custom Leafmark PDF theme include.',
        '% Put LaTeX packages, fontspec settings, colors, and spacing here.',
        '\\usepackage{etoolbox}',
        '\\usepackage{xcolor}',
        '\\IfFileExists{orcidlink.sty}{\\usepackage{orcidlink}}{\\providecommand{\\orcidlink}[1]{}}',
        '\\AtEndPreamble{%',
        '  \\definecolor{shadecolor}{RGB}{248,248,248}%',
        '}',
        '',
        '% Example local font setup if you add files to .leafmark/fonts/:',
        '% \\setmainfont{YourFont-Regular.ttf}[',
        '%   Path = ../.leafmark/fonts/,',
        '%   BoldFont = YourFont-Bold.ttf,',
        '%   ItalicFont = YourFont-Italic.ttf,',
        '% ]',
        '',
    ].join('\n');
}
function themeInitCss() {
    return [
        '/* Custom Leafmark HTML/print theme. */',
        '',
        '/* Example local font setup if you add files to .leafmark/fonts/:',
        '@font-face {',
        '  font-family: "Theme Font";',
        '  src: url("../fonts/YourFont-Regular.ttf") format("truetype");',
        '}',
        '*/',
        '',
        '@page {',
        '  size: a4;',
        '  margin: 2cm 2.5cm;',
        '}',
        '',
        'html {',
        '  font-family: system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;',
        '  font-size: 11pt;',
        '  line-height: 1.5;',
        '  color: #1a1a1a;',
        '}',
        '',
        'h1,',
        'h2,',
        'h3 {',
        '  line-height: 1.2;',
        '}',
        '',
        'pre,',
        'code {',
        '  font-family: ui-monospace, "Cascadia Code", Menlo, Consolas, monospace;',
        '}',
        '',
    ].join('\n');
}
function themeInitFrontmatter() {
    return [
        '---',
        'title: Example Leafmark Theme Project',
        'subtitle: A local document for testing theme spacing, typography, and layout',
        'author:',
        '  - Theme Author',
        'date: 2026-06-04',
        'toc: true',
        'toc-depth: 2',
        'toc-own-page: true',
        'number-sections: true',
        'abstract: |',
        '  This example project exists so theme authors can test PDF and HTML output without committing generated documents. It includes headings, paragraphs, quotes, lists, code, and citations-style prose.',
        '---',
        '',
    ].join('\n');
}
function themeInitIntroduction() {
    return [
        '# Introduction',
        '',
        'Lorem ipsum dolor sit amet, consectetur adipiscing elit. Integer vitae lectus non orci posuere luctus. Suspendisse potenti. Curabitur vitae arcu sed justo facilisis laoreet, a gravida lectus.',
        '',
        '## Typography Sample',
        '',
        'Praesent commodo, nisl at fermentum blandit, nibh lorem facilisis libero, sed consequat eros ipsum vel justo. Donec dignissim, lorem vel convallis pharetra, neque turpis interdum nibh, sed finibus lectus mi at lorem.',
        '',
        '> This block quote is included to test indentation, color, spacing, and line length across PDF and HTML outputs.',
        '',
        '## Lists and Code',
        '',
        '- First example item with a short phrase.',
        '- Second example item with a longer sentence that wraps onto another line in narrow layouts.',
        '- Third example item for spacing checks.',
        '',
        '```ts',
        'export const themeName = "my-theme";',
        'console.log(`Testing ${themeName}`);',
        '```',
        '',
    ].join('\n');
}
function themeInitMethod() {
    return [
        '# Method',
        '',
        'Morbi eget urna at libero facilisis bibendum. Aenean hendrerit risus a mauris gravida, vitae dictum ipsum luctus. Vestibulum ante ipsum primis in faucibus orci luctus et ultrices posuere cubilia curae.',
        '',
        '## Tables',
        '',
        '| Element | Purpose |',
        '| --- | --- |',
        '| Heading | Checks hierarchy and spacing |',
        '| Paragraph | Checks measure and leading |',
        '| Code | Checks monospace rendering |',
        '',
        '## Closing Sample',
        '',
        'Nam porttitor enim in arcu feugiat, eget posuere augue lacinia. Sed luctus, ligula non congue eleifend, metus justo vehicula lectus, vitae hendrerit augue augue vel lectus.',
        '',
    ].join('\n');
}
function themeInitInstructions() {
    return [
        '# Leafmark Theme Instructions',
        '',
        'This repository is structured as a Leafmark theme. Keep all theme assets inside `.leafmark/` so the theme can be installed from GitHub with:',
        '',
        '```sh',
        'pnpx @skxv/leafmark theme use https://github.com/USER/REPO',
        '```',
        '',
        '## Structure',
        '',
        '```text',
        '.leafmark/',
        '  theme.json        # Theme manifest used by leafmark theme use',
        '  templates/        # Pandoc .latex templates',
        '  includes/         # LaTeX snippets loaded during PDF builds',
        '  css/              # HTML/print stylesheets',
        '  fonts/            # Optional local .ttf/.otf font files',
        'project/            # Local ignored test document',
        '```',
        '',
        '## Manifest',
        '',
        '`theme.json` describes the files Leafmark should copy into a project and the config it should write. Paths in `theme.json` should use install-time paths under `.leafmark/theme/`, for example:',
        '',
        '```json',
        '{',
        '  "config": {',
        '    "latexTemplate": ".leafmark/theme/templates/theme.latex",',
        '    "fonts": {',
        '      "latexInclude": ".leafmark/theme/includes/theme.tex",',
        '      "css": [".leafmark/theme/css/theme.css"]',
        '    }',
        '  }',
        '}',
        '```',
        '',
        '## Local Font Files',
        '',
        'Place physical font files in `.leafmark/fonts/`. PDF builds can reference them with `fonts.pdfFiles`:',
        '',
        '```json',
        '{',
        '  "fonts": {',
        '    "pdfFiles": {',
        '      "path": ".leafmark/theme/fonts",',
        '      "upright": "YourFont-Regular.ttf",',
        '      "bold": "YourFont-Bold.ttf",',
        '      "italic": "YourFont-Italic.ttf",',
        '      "boldItalic": "YourFont-BoldItalic.ttf",',
        '      "scale": 1',
        '    }',
        '  }',
        '}',
        '```',
        '',
        'HTML styles can use the same files with `@font-face` in `.leafmark/css/theme.css`.',
        '',
        '## Testing Locally',
        '',
        'The `project/` folder is ignored by git and configured to use the theme source files directly. Test with:',
        '',
        '```sh',
        'pnpx @skxv/leafmark ./project --html',
        '```',
        '',
        'Regenerate the sample project whenever needed, but avoid committing generated `project/` output.',
        '',
    ].join('\n');
}
function fallbackPandocTemplate() {
    return [
        '\\documentclass{article}',
        '$if(fonts-include)$',
        '\\input{$fonts-include$}',
        '$endif$',
        '\\begin{document}',
        '$if(title)$\\title{$title$}\\maketitle$endif$',
        '$body$',
        '\\end{document}',
        '',
    ].join('\n');
}
//# sourceMappingURL=theme.js.map