import type { CliOptions } from '../cli/options.js';
export declare function which(cmd: string): string | null;
export declare function kpsewhich(fname: string): string | null;
export declare function pandocHighlightArg(): string;
export declare function ensureFirstRunTools(opts: CliOptions): Promise<void>;
export declare function requiredToolStatus(): Array<{
    name: string;
    command: string;
    available: boolean;
}>;
export declare function printDoctor(): void;
