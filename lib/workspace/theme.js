import { spawnSync } from 'node:child_process';
import { appendFileSync, cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { die } from '../system/errors.js';
import { PACKAGE_ROOT } from '../system/paths.js';
import { LEAFMARK_DIR, configPath, legacyConfigPath, readProjectConfig, writeProjectConfig, } from './config.js';
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
    const baseThemeDir = join(BUILTIN_THEMES_DIR, 'default', LEAFMARK_DIR);
    mkdirSync(leafmarkDir, { recursive: true });
    if (existsSync(baseThemeDir))
        cpSync(baseThemeDir, leafmarkDir, { recursive: true });
    else {
        mkdirSync(join(leafmarkDir, 'templates'), { recursive: true });
        mkdirSync(join(leafmarkDir, 'includes'), { recursive: true });
        mkdirSync(join(leafmarkDir, 'css'), { recursive: true });
    }
    mkdirSync(join(leafmarkDir, 'fonts'), { recursive: true });
    mkdirSync(join(projectDir, LEAFMARK_DIR), { recursive: true });
    writeScaffoldFile(join(leafmarkDir, THEME_CONFIG_FILE), `${JSON.stringify(themeInitManifest(), null, 2)}\n`);
    ensureBaseThemeFile(join(leafmarkDir, 'templates', 'default.latex'), 'templates', 'default.latex', fallbackPandocTemplate());
    ensureBaseThemeFile(join(leafmarkDir, 'includes', 'default.tex'), 'includes', 'default.tex', themeInitLatexInclude());
    ensureBaseThemeFile(join(leafmarkDir, 'css', 'default.css'), 'css', 'default.css', themeInitCss());
    writeScaffoldFile(join(projectDir, LEAFMARK_DIR, 'config.json'), `${JSON.stringify(themeInitProjectConfig(), null, 2)}\n`);
    writeScaffoldFile(join(projectDir, '_frontmatter.md'), themeInitFrontmatter());
    writeScaffoldFile(join(projectDir, 'introduction.md'), themeInitIntroduction());
    writeScaffoldFile(join(projectDir, 'method.md'), themeInitMethod());
    writeScaffoldFile(join(projectDir, 'design-samples.md'), themeInitDesignSamples());
    writeScaffoldFile(join(projectDir, 'sources.bib'), '');
    writeScaffoldFile(join(root, 'INSTRUCTIONS.md'), themeInitInstructions());
    removeStarterProjectConfig(root);
    ensureGitignoreEntry(root, 'project/');
    console.log(`Initialized Leafmark theme in ${root}`);
}
function removeStarterProjectConfig(root) {
    for (const path of [configPath(root), legacyConfigPath(root)]) {
        if (!existsSync(path))
            continue;
        const raw = readFileSync(path, 'utf-8');
        let parsed;
        try {
            parsed = JSON.parse(raw);
        }
        catch {
            continue;
        }
        if (isStarterProjectConfig(parsed))
            rmSync(path, { force: true });
    }
}
function isStarterProjectConfig(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value))
        return false;
    const config = value;
    return Array.isArray(config.order)
        && config.order.length === 1
        && config.order[0] === 'introduction.md'
        && Boolean(config.metadata)
        && Array.isArray(config.plugins)
        && config.plugins.length === 0;
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
        themePlugins: theme.themePlugins ?? [],
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
function writeScaffoldFile(path, content) {
    writeFileSync(path, content, 'utf-8');
}
function ensureBaseThemeFile(target, section, fileName, fallback) {
    if (existsSync(target))
        return;
    const source = join(BUILTIN_THEMES_DIR, 'default', LEAFMARK_DIR, section, fileName);
    if (existsSync(source))
        cpSync(source, target);
    else
        writeFileSync(target, fallback, 'utf-8');
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
        description: 'A custom Leafmark theme based on the default theme.',
        config: {
            latexTemplate: '.leafmark/theme/templates/default.latex',
            fonts: {
                latexInclude: '.leafmark/theme/includes/default.tex',
                css: ['.leafmark/theme/css/default.css'],
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
        order: ['introduction.md', 'method.md', 'design-samples.md'],
        latexTemplate: '../.leafmark/templates/default.latex',
        fonts: {
            latexInclude: '../.leafmark/includes/default.tex',
            css: ['../.leafmark/css/default.css'],
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
        'Lorem ipsum dolor sit amet, consectetur adipiscing elit. Integer vitae lectus non orci posuere luctus. Suspendisse potenti. Curabitur vitae arcu sed justo facilisis laoreet, a gravida lectus. Aenean vehicula augue vel velit dictum, vitae finibus lorem tristique. Donec volutpat sem et nibh tincidunt, at dictum ipsum feugiat.',
        '',
        '## Typography Sample',
        '',
        'Praesent commodo, nisl at fermentum blandit, nibh lorem facilisis libero, sed consequat eros ipsum vel justo. Donec dignissim, lorem vel convallis pharetra, neque turpis interdum nibh, sed finibus lectus mi at lorem. Vestibulum in velit non mauris ultrices dignissim. Pellentesque habitant morbi tristique senectus et netus et malesuada fames ac turpis egestas.',
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
        'Morbi eget urna at libero facilisis bibendum. Aenean hendrerit risus a mauris gravida, vitae dictum ipsum luctus. Vestibulum ante ipsum primis in faucibus orci luctus et ultrices posuere cubilia curae. Integer ullamcorper magna sed leo convallis, ut interdum neque facilisis. Fusce suscipit luctus justo, id pulvinar magna venenatis at.',
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
        'Nam porttitor enim in arcu feugiat, eget posuere augue lacinia. Sed luctus, ligula non congue eleifend, metus justo vehicula lectus, vitae hendrerit augue augue vel lectus. Nullam at suscipit lectus. Duis in ante in neque ullamcorper volutpat.',
        '',
    ].join('\n');
}
function themeInitDesignSamples() {
    return [
        '# Design Samples',
        '',
        'This chapter contains denser lorem ipsum content for testing page breaks, heading rhythm, list spacing, table rules, and code panels. Aliquam erat volutpat. Integer mattis sem at magna interdum, vel luctus nisl vulputate. Sed porta libero at odio cursus, sit amet pretium arcu posuere.',
        '',
        '## Long Paragraphs',
        '',
        'Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed finibus, tellus a tincidunt rhoncus, turpis lectus tincidunt velit, vitae sollicitudin lorem lacus non arcu. Curabitur cursus tortor sit amet turpis feugiat, eget facilisis neque luctus. Integer quis eros id mauris pretium volutpat. Pellentesque euismod justo at diam vestibulum, nec congue sem vulputate. Vivamus at porta urna, vitae fermentum lacus. Integer interdum arcu lorem, in dignissim massa efficitur id.',
        '',
        'Praesent id purus et libero posuere sagittis. Etiam blandit sem ut luctus porttitor. Nulla sit amet arcu eu risus cursus tincidunt. Vestibulum in elit non lacus facilisis ultricies. Donec vitae augue molestie, aliquam massa id, bibendum lectus. Nunc sit amet mi vitae lacus sagittis dignissim.',
        '',
        '## Numbered List',
        '',
        '1. Lorem ipsum dolor sit amet, consectetur adipiscing elit.',
        '2. Donec sit amet ipsum vitae arcu luctus fringilla.',
        '3. Vestibulum vitae nibh sit amet odio iaculis consequat.',
        '4. Integer quis augue vitae sapien ultricies rhoncus.',
        '',
        '## Code Block',
        '',
        '```js',
        'const theme = {',
        '  name: "my-theme",',
        '  files: [".leafmark/templates/default.latex", ".leafmark/css/default.css"],',
        '};',
        '',
        'console.log(theme.name);',
        '```',
        '',
        '## Final Check',
        '',
        'Suspendisse potenti. Pellentesque aliquam ligula at ipsum pharetra, non fermentum massa vestibulum. Sed ac neque nec augue faucibus pretium. Donec dignissim mi et erat vulputate, sed consequat risus posuere.',
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
        '  templates/        # Base Pandoc .latex templates copied from the default theme',
        '  includes/         # Base LaTeX snippets copied from the default theme',
        '  css/              # Base HTML/print stylesheets copied from the default theme',
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
        '    "latexTemplate": ".leafmark/theme/templates/default.latex",',
        '    "fonts": {',
        '      "latexInclude": ".leafmark/theme/includes/default.tex",',
        '      "css": [".leafmark/theme/css/default.css"]',
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
        '## Starting Point',
        '',
        '`theme init` copies the packaged default theme into `.leafmark/`. Tune those files directly: edit `default.latex` for document structure, `default.tex` for PDF-specific LaTeX, and `default.css` for HTML and print CSS.',
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