import type { Workspace } from './workspace.js';
export type BundleSelection = {
    bundleName: string | null;
    chapterArgs: string[];
};
export declare function splitBundleAndChapters(positional: string[], workspace: Workspace): BundleSelection;
