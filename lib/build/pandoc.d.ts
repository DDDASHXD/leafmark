import type { LeafmarkConfig } from '../workspace/config.js';
import type { Workspace } from '../workspace/workspace.js';
import type { ThesisMeta } from '../thesis-meta.js';
export type BuildContext = {
    workspace: Workspace;
    bundleName: string | null;
    activeProjectDir: string;
    distDir: string;
    rootForRelativePaths: string;
    config: LeafmarkConfig;
};
export declare function texPath(p: string): string;
export declare function relFrom(root: string, p: string): string;
export declare function fontsTexRelFromDist(ctx: BuildContext): string;
export declare function pandocResourcePath(ctx: BuildContext): string;
export declare function writePdfFontSnippet(ctx: BuildContext): void;
export declare function spawnComplete(cmd: string, args: string[], options: {
    cwd: string;
}): Promise<{
    status: number | null;
    stderr: string;
    stdout: string;
}>;
export declare function runPandocPdf(params: {
    merged: string;
    meta: ThesisMeta;
    bibPaths: string[];
    extraMeta: string[];
    outputPdfAbs: string;
    ctx: BuildContext;
    mergedFile: string;
    latexTemplate: string;
    useThesisHeaderIncludes: boolean;
    useDefaultGeometry: boolean;
}): Promise<void>;
export declare function runPandocHtml(params: {
    merged: string;
    meta: ThesisMeta;
    bibPaths: string[];
    ctx: BuildContext;
    mergedFile: string;
    htmlOutAbs: string;
}): Promise<void>;
export declare function defaultLatexTemplate(ctx: BuildContext): string;
