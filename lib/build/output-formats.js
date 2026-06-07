import { die } from '../system/errors.js';
export const DEFAULT_OUTPUT_FORMAT = 'pdf';
export const OUTPUT_FORMATS = {
    pdf: {
        id: 'pdf',
        pandocTo: 'pdf',
        outputFilename: 'output.pdf',
        progressLabel: 'Generating PDF',
    },
    docx: {
        id: 'docx',
        pandocTo: 'docx',
        outputFilename: 'output.docx',
        progressLabel: 'Generating DOCX',
    },
};
export function parseOutputFormat(value) {
    const normalized = value.trim().toLowerCase();
    if (normalized in OUTPUT_FORMATS)
        return normalized;
    die(`Unknown output format: ${value} (supported: ${Object.keys(OUTPUT_FORMATS).join(', ')})`, 1);
}
export function outputFormatSpec(id) {
    return OUTPUT_FORMATS[id];
}
//# sourceMappingURL=output-formats.js.map