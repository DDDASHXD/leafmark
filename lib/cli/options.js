import { existsSync, statSync } from 'node:fs';
import { basename, resolve } from 'node:path';
import { die } from '../system/errors.js';
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
const COMMAND_ALIASES = {
    build: 'build',
    watch: 'watch',
    doctor: 'doctor',
    init: 'init',
    order: 'order',
    organize: 'order',
    organise: 'order',
    o: 'order',
    theme: 'theme',
};
export function printHelp() {
    console.log(`Usage:
  leafmark [folder] [options] [chapter.md ...]
  leafmark watch [folder] [options] [chapter.md ...]
  leafmark order [folder]
  leafmark o [folder]
  leafmark doctor
  leafmark init [folder]
  leafmark theme init [folder]
  leafmark theme list
  leafmark theme use <theme name | GitHub URL>

Builds Markdown to PDF from a folder of .md files. Metadata can live in
.leafmark/config.json, _frontmatter.md, or both. Chapter files no longer need
numeric prefixes; saved order comes from .leafmark/config.json.

Options:
  --html            Also write thesis.html
  --html-only       Only build HTML
  --no-merge-cover  Do not merge coverpage with pdfunite
  --yes, -y         Assume yes for first-run tool installation prompts
  --skip-tools-check
                    Skip first-run external tool prompt
  --help, -h        Show this help
`);
}
export function parseCli(argv) {
    let command = 'build';
    let themeCommand = null;
    const args = [...argv];
    const first = args[0] ? COMMAND_ALIASES[args[0]] : undefined;
    if (first) {
        command = first;
        args.shift();
    }
    if (command === 'theme') {
        const subcommand = args.shift();
        if (subcommand === 'init' || subcommand === 'list' || subcommand === 'use')
            themeCommand = subcommand;
        else if (subcommand && !subcommand.startsWith('-'))
            die(`Unknown theme command: ${subcommand}`, 1);
    }
    const wantHelp = args.includes('--help') || args.includes('-h');
    const wantHtml = args.includes('--html') || args.includes('--html-only');
    const htmlOnly = args.includes('--html-only');
    const noMergeCover = args.includes('--no-merge-cover');
    const yes = args.includes('--yes') || args.includes('-y');
    const skipToolsCheck = args.includes('--skip-tools-check');
    const positional = [];
    for (const a of args) {
        if (KNOWN_FLAGS.has(a))
            continue;
        if (a === '--')
            continue;
        const alias = COMMAND_ALIASES[a];
        if (alias && command === 'build') {
            command = alias;
            continue;
        }
        if (a.startsWith('-'))
            die(`Unknown option: ${a} (try --help)`, 1);
        positional.push(a);
    }
    let targetArg = null;
    if (positional.length > 0 && looksLikeTargetFolder(positional[0])) {
        targetArg = positional.shift();
    }
    return {
        command,
        themeCommand,
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
function looksLikeTargetFolder(value) {
    if (/\.md$/i.test(basename(value)))
        return false;
    if (value === '.' || value === '..')
        return true;
    if (value.includes('/') || value.includes('\\'))
        return true;
    const abs = resolve(process.cwd(), value);
    return existsSync(abs) && statSync(abs).isDirectory();
}
//# sourceMappingURL=options.js.map