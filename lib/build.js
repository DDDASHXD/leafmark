#!/usr/bin/env node
import { parseCli, printHelp } from './cli/options.js';
import { buildOnce } from './build/build.js';
import { watch } from './build/watch.js';
import { initFolder } from './workspace/init.js';
import { orderProject } from './workspace/order.js';
import { discoverWorkspace } from './workspace/workspace.js';
import { die } from './system/errors.js';
import { ensureFirstRunTools, printDoctor } from './system/tools.js';
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
    if (opts.command === 'init') {
        initFolder(opts.targetArg);
        return;
    }
    await ensureFirstRunTools(opts);
    const workspace = discoverWorkspace(opts.targetArg);
    if (opts.command === 'watch')
        await watch(workspace, opts);
    else if (opts.command === 'order')
        await orderProject(workspace);
    else
        await buildOnce(workspace, opts);
}
main().catch((e) => die(e instanceof Error ? e.message : String(e), 1));
//# sourceMappingURL=build.js.map