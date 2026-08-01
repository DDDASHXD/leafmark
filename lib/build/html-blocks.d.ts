import type { BuildContext } from './pandoc.js';
export declare function resolveStylePaths(raw: unknown, ctx: BuildContext): string[];
export declare function renderHtmlBlocks(markdown: string, stylePaths: string[], ctx: BuildContext): Promise<string>;
