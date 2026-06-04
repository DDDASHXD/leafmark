export declare const LEAFMARK_DIR = ".leafmark";
export declare const PROJECT_CONFIG_FILE: string;
export declare const LEGACY_PROJECT_CONFIG_FILE = "leafmark.json";
export declare const FRONTMATTER_FILE = "_frontmatter.md";
export type LeafmarkPluginConfig = string | {
    path?: string;
    luaFilter?: string;
    args?: string[];
    pdfArgs?: string[];
    htmlArgs?: string[];
};
export type LeafmarkConfig = {
    order?: string[];
    frontmatter?: string | false;
    template?: string;
    latexTemplate?: string;
    htmlTemplate?: string;
    fonts?: {
        pdf?: string;
        mono?: string;
        pdfFiles?: LeafmarkFontFiles;
        monoFiles?: LeafmarkFontFiles;
        css?: string[];
        latexInclude?: string;
    };
    plugins?: LeafmarkPluginConfig[];
    pandoc?: {
        args?: string[];
        pdfArgs?: string[];
        htmlArgs?: string[];
    };
    metadata?: Record<string, unknown>;
};
export type LeafmarkFontFiles = {
    path?: string;
    upright: string;
    bold?: string;
    italic?: string;
    boldItalic?: string;
    scale?: number;
};
export declare function configPath(projectDir: string): string;
export declare function legacyConfigPath(projectDir: string): string;
export declare function readProjectConfig(projectDir: string): LeafmarkConfig;
export declare function writeProjectConfig(projectDir: string, config: LeafmarkConfig): void;
export declare function updateProjectOrder(projectDir: string, order: string[]): void;
export declare function readProjectMetadata(projectDir: string, config: LeafmarkConfig): Record<string, unknown>;
export declare function resolveConfigPath(projectRoot: string, value: string | undefined): string | null;
