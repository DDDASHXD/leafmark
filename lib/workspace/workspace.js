import { existsSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { die } from '../system/errors.js';
import { FRONTMATTER_FILE, LEGACY_PROJECT_CONFIG_FILE, PROJECT_CONFIG_FILE } from './config.js';
export function discoverWorkspace(targetArg, outputArg = null) {
    const cwd = process.cwd();
    const inputRoot = resolve(cwd, targetArg ?? '.');
    const outputRoot = outputArg ? resolve(cwd, outputArg) : join(cwd, 'dist');
    if (!existsSync(inputRoot))
        die(`Folder not found: ${inputRoot}`, 1);
    if (!statSync(inputRoot).isDirectory())
        die(`Not a folder: ${inputRoot}`, 1);
    if (isLeafmarkProject(inputRoot)) {
        return {
            cwd,
            inputRoot,
            projectBase: inputRoot,
            outputRoot,
            legacyProjectLayout: false,
        };
    }
    const legacyProject = join(inputRoot, 'project');
    if (isLeafmarkProject(legacyProject)) {
        return {
            cwd,
            inputRoot,
            projectBase: legacyProject,
            outputRoot,
            legacyProjectLayout: true,
        };
    }
    return {
        cwd,
        inputRoot,
        projectBase: inputRoot,
        outputRoot,
        legacyProjectLayout: false,
    };
}
export function isLeafmarkProject(dir) {
    return existsSync(join(dir, PROJECT_CONFIG_FILE))
        || existsSync(join(dir, LEGACY_PROJECT_CONFIG_FILE))
        || existsSync(join(dir, FRONTMATTER_FILE));
}
//# sourceMappingURL=workspace.js.map