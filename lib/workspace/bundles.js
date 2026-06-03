import { existsSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { isLeafmarkProject } from './workspace.js';
export function splitBundleAndChapters(positional, workspace) {
    if (positional.length === 0)
        return { bundleName: null, chapterArgs: [] };
    const first = positional[0].trim();
    const possibleBundle = join(workspace.projectBase, first);
    if (existsSync(possibleBundle) && statSync(possibleBundle).isDirectory() && isLeafmarkProject(possibleBundle)) {
        return { bundleName: first, chapterArgs: positional.slice(1) };
    }
    return { bundleName: null, chapterArgs: [...positional] };
}
//# sourceMappingURL=bundles.js.map