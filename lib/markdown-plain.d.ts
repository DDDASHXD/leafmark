/** Strip common Markdown syntax and return plain text for counting. */
export declare function stripMarkdownToPlainText(source: string): string;
export type PlainTextCounts = {
    charsWithSpaces: number;
    charsWithoutSpaces: number;
    words: number;
};
export declare function countPlainText(text: string): PlainTextCounts;
