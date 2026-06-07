import { type OutputFormatId } from '../build/output-formats.js';
export type Command = 'build' | 'watch' | 'doctor' | 'init' | 'order' | 'status' | 'theme';
export type CliOptions = {
    command: Command;
    themeCommand: 'init' | 'list' | 'use' | null;
    targetArg: string | null;
    positional: string[];
    wantHelp: boolean;
    outputFormat: OutputFormatId;
    outputDir: string | null;
    wantHtml: boolean;
    htmlOnly: boolean;
    noMergeCover: boolean;
    yes: boolean;
    skipToolsCheck: boolean;
};
export declare function printHelp(): void;
export declare function parseCli(argv: string[]): CliOptions;
