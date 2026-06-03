import type { LeafmarkConfig } from './config.js';
export declare function listMarkdownFiles(projectDir: string): string[];
export declare function resolveChapterFiles(requested: string[], projectDir: string, config: LeafmarkConfig): string[];
export declare function buildMergedMarkdown(yamlBlock: string, chapterFiles: string[], projectDir: string): string;
export declare function countMergedBody(merged: string): {
    words: number;
    chars: number;
};
