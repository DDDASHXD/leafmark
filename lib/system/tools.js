import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { homedir, platform } from 'node:os';
import { join } from 'node:path';
import { createInterface } from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
const CONFIG_DIR = join(homedir(), '.leafmark');
const FIRST_RUN_MARKER = join(CONFIG_DIR, 'first-run.json');
export function which(cmd) {
    const checker = platform() === 'win32' ? 'where' : 'which';
    try {
        const pathOut = execFileSync(checker, [cmd], { encoding: 'utf-8' }).trim();
        return pathOut.split(/\r?\n/)[0] || null;
    }
    catch {
        return null;
    }
}
export function kpsewhich(fname) {
    try {
        const p = execFileSync('kpsewhich', [fname], { encoding: 'utf-8' }).trim();
        return p || null;
    }
    catch {
        return null;
    }
}
export function pandocHighlightArg() {
    try {
        const help = execFileSync('pandoc', ['--help'], {
            encoding: 'utf-8',
            maxBuffer: 2_000_000,
        });
        return help.includes('--syntax-highlighting')
            ? '--syntax-highlighting=kate'
            : '--highlight-style=kate';
    }
    catch {
        return '--highlight-style=kate';
    }
}
export async function ensureFirstRunTools(opts) {
    if (opts.skipToolsCheck || opts.command === 'init' || opts.command === 'order')
        return;
    if (existsSync(FIRST_RUN_MARKER))
        return;
    const missing = requiredToolStatus().filter((t) => !t.available);
    if (missing.length === 0) {
        markChecked();
        return;
    }
    if (!process.stdin.isTTY && !opts.yes) {
        console.warn(`Leafmark needs external tools: ${missing.map((t) => t.name).join(', ')}. Run \`leafmark doctor\` for install commands.`);
        return;
    }
    if (opts.yes) {
        installMissingTools(missing.map((t) => t.name));
        markChecked();
        return;
    }
    const rl = createInterface({ input, output });
    try {
        const answer = await rl.question(`Leafmark needs external tools (${missing.map((t) => t.name).join(', ')}). Download/install them now? [y/N] `);
        if (/^y(es)?$/i.test(answer.trim())) {
            installMissingTools(missing.map((t) => t.name));
        }
        markChecked();
    }
    finally {
        rl.close();
    }
}
function markChecked() {
    mkdirSync(CONFIG_DIR, { recursive: true });
    writeFileSync(FIRST_RUN_MARKER, JSON.stringify({ checkedAt: new Date().toISOString() }, null, 2));
}
export function requiredToolStatus() {
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
function installMissingTools(names) {
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
function installPlan(names) {
    const os = platform();
    if (os === 'darwin' && which('brew')) {
        const packages = new Set();
        if (names.includes('pandoc'))
            packages.add('pandoc');
        if (names.includes('latex'))
            packages.add('basictex');
        if (names.includes('pdfunite'))
            packages.add('poppler');
        return { command: 'brew', args: ['install', ...packages] };
    }
    if (os === 'win32') {
        if (which('winget')) {
            const args = ['install'];
            if (names.includes('pandoc'))
                args.push('--id', 'JohnMacFarlane.Pandoc');
            if (names.includes('latex'))
                args.push('--id', 'MiKTeX.MiKTeX');
            if (names.includes('pdfunite'))
                args.push('--id', 'oschwartz10612.Poppler');
            return { command: 'winget', args };
        }
        if (which('choco')) {
            const packages = [];
            if (names.includes('pandoc'))
                packages.push('pandoc');
            if (names.includes('latex'))
                packages.push('miktex');
            if (names.includes('pdfunite'))
                packages.push('poppler');
            return { command: 'choco', args: ['install', '-y', ...packages] };
        }
    }
    if (os === 'linux') {
        if (which('apt-get'))
            return linuxPlan('apt-get', ['install', '-y'], names);
        if (which('dnf'))
            return linuxPlan('dnf', ['install', '-y'], names);
        if (which('pacman')) {
            const packages = [];
            if (names.includes('pandoc'))
                packages.push('pandoc');
            if (names.includes('latex'))
                packages.push('texlive-bin');
            if (names.includes('pdfunite'))
                packages.push('poppler');
            return { command: 'sudo', args: ['pacman', '-S', '--needed', ...packages] };
        }
    }
    return null;
}
function linuxPlan(manager, installArgs, names) {
    const packages = [];
    if (names.includes('pandoc'))
        packages.push('pandoc');
    if (names.includes('latex'))
        packages.push('texlive-xetex');
    if (names.includes('pdfunite'))
        packages.push(manager === 'apt-get' ? 'poppler-utils' : 'poppler-utils');
    return { command: 'sudo', args: [manager, ...installArgs, ...packages] };
}
export function printDoctor() {
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
//# sourceMappingURL=tools.js.map