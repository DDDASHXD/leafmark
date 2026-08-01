export type ThemeLength = `${number}${'mm' | 'cm' | 'in' | 'pt'}`;
export type BasicTheme = {
    page?: {
        size?: 'a4' | 'letter';
        margins?: Partial<Record<'top' | 'right' | 'bottom' | 'left', ThemeLength>>;
    };
    typography?: {
        bodyFont?: string;
        headingFont?: string;
        monoFont?: string;
        fontSize?: ThemeLength;
        lineHeight?: number;
        justify?: 'left' | 'justify';
        googleFonts?: Partial<Record<'body' | 'heading' | 'mono', string>>;
    };
    colors?: Partial<Record<'text' | 'heading' | 'link' | 'muted' | 'accent' | 'surface' | 'border', string>>;
    spacing?: {
        paragraph?: ThemeLength;
        headingTop?: ThemeLength;
        headingBottom?: ThemeLength;
        listIndent?: ThemeLength;
    };
    headings?: {
        weight?: 'normal' | 'bold';
        h1Size?: ThemeLength;
        h2Size?: ThemeLength;
        h3Size?: ThemeLength;
    };
    tables?: {
        cellPadding?: ThemeLength;
        borderWidth?: ThemeLength;
        striped?: boolean;
        headerBackground?: string;
    };
    blocks?: {
        padding?: ThemeLength;
        radius?: ThemeLength;
        quoteBorderWidth?: ThemeLength;
    };
};
type NormalizedTheme = {
    page: {
        size: 'a4' | 'letter';
        margins: Record<'top' | 'right' | 'bottom' | 'left', ThemeLength>;
    };
    typography: Required<Omit<NonNullable<BasicTheme['typography']>, 'googleFonts'>> & {
        googleFonts: Partial<Record<'body' | 'heading' | 'mono', string>>;
    };
    colors: Required<NonNullable<BasicTheme['colors']>>;
    spacing: Required<NonNullable<BasicTheme['spacing']>>;
    headings: Required<NonNullable<BasicTheme['headings']>>;
    tables: Required<NonNullable<BasicTheme['tables']>>;
    blocks: Required<NonNullable<BasicTheme['blocks']>>;
};
export declare function normalizeTheme(theme?: BasicTheme): NormalizedTheme;
export declare function writeCompiledTheme(theme: BasicTheme | undefined, outputDir: string): {
    latex: string | null;
    css: string | null;
};
export declare function compileThemeLatex(input: BasicTheme): string;
export declare function compileThemeCss(input: BasicTheme): string;
export declare function writeGoogleFontInclude(theme: BasicTheme | undefined, outputDir: string): Promise<string | null>;
export {};
