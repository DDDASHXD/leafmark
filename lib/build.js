#!/usr/bin/env node
import { parseCli, printHelp } from './cli/options.js';
import { buildOnce } from './build/build.js';
import { watch } from './build/watch.js';
import { initFolder } from './workspace/init.js';
import { orderProject } from './workspace/order.js';
import { discoverWorkspace } from './workspace/workspace.js';
import { initThemeFolder, listBuiltinThemes, useTheme } from './workspace/theme.js';
import { die } from './system/errors.js';
import { ensureFirstRunTools, printDoctor } from './system/tools.js';
import { printProjectStatus } from './workspace/status.js';
async function main() {
    const opts = parseCli(process.argv.slice(2));
    if (opts.wantHelp) {
        printHelp();
        return;
    }
    if (opts.command === 'doctor') {
        printDoctor();
        return;
    }
    if (opts.command === 'status') {
        const workspace = discoverWorkspace(opts.targetArg, opts.outputDir);
        printProjectStatus(workspace, opts);
        return;
    }
    if (opts.command === 'init') {
        initFolder(opts.targetArg);
        return;
    }
    if (opts.command === 'theme') {
        if (opts.themeCommand === 'init') {
            initThemeFolder(opts.targetArg ?? opts.positional[0]);
            return;
        }
        if (opts.themeCommand === 'list') {
            listBuiltinThemes();
            return;
        }
        if (opts.themeCommand === 'use') {
            const workspace = discoverWorkspace(opts.targetArg, opts.outputDir);
            useTheme(workspace.projectBase, opts.positional[0]);
            return;
        }
        die('Usage: leafmark theme init [folder] | leafmark theme list | leafmark theme use <theme name | GitHub URL>', 1);
    }
    await ensureFirstRunTools(opts);
    const workspace = discoverWorkspace(opts.targetArg, opts.outputDir);
    if (opts.command === 'watch')
        await watch(workspace, opts);
    else if (opts.command === 'order')
        await orderProject(workspace);
    else
        await buildOnce(workspace, opts);
}
main().catch((e) => die(e instanceof Error ? e.message : String(e), 1));
//# sourceMappingURL=build.js.map