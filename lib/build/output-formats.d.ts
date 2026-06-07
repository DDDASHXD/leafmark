export declare const DEFAULT_OUTPUT_FORMAT = "pdf";
export type OutputFormatId = 'pdf' | 'docx';
export type OutputFormatSpec = {
    id: OutputFormatId;
    pandocTo: string;
    outputFilename: string;
    progressLabel: string;
};
export declare const OUTPUT_FORMATS: Record<OutputFormatId, OutputFormatSpec>;
export declare function parseOutputFormat(value: string): OutputFormatId;
export declare function outputFormatSpec(id: OutputFormatId): OutputFormatSpec;
