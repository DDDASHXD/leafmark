export type Command = 'build' | 'watch' | 'doctor' | 'init' | 'order';
export type CliOptions = {
    command: Command;
    targetArg: string | null;
    positional: string[];
    wantHelp: boolean;
    wantHtml: boolean;
    htmlOnly: boolean;
    noMergeCover: boolean;
    yes: boolean;
    skipToolsCheck: boolean;
};
export declare function printHelp(): void;
export declare function parseCli(argv: string[]): CliOptions;
