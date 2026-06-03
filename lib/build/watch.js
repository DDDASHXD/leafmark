import chokidar from 'chokidar';
import { buildOnce } from './build.js';
export async function watch(workspace, opts) {
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
        }
        catch (e) {
            console.error(e instanceof Error ? e.message : String(e));
        }
        finally {
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
//# sourceMappingURL=watch.js.map