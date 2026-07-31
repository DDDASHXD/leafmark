import { die } from '../system/errors.js';

export const DEFAULT_OUTPUT_FORMAT = 'pdf';

export type OutputFormatId = 'pdf' | 'docx';

export type OutputFormatSpec = {
  id: OutputFormatId;
  pandocTo: string;
  outputExtension: string;
  progressLabel: string;
};

export const OUTPUT_FORMATS: Record<OutputFormatId, OutputFormatSpec> = {
  pdf: {
    id: 'pdf',
    pandocTo: 'pdf',
    outputExtension: 'pdf',
    progressLabel: 'Generating PDF',
  },
  docx: {
    id: 'docx',
    pandocTo: 'docx',
    outputExtension: 'docx',
    progressLabel: 'Generating DOCX',
  },
};

export function parseOutputFormat(value: string): OutputFormatId {
  const normalized = value.trim().toLowerCase();
  if (normalized in OUTPUT_FORMATS) return normalized as OutputFormatId;
  die(`Unknown output format: ${value} (supported: ${Object.keys(OUTPUT_FORMATS).join(', ')})`, 1);
}

export function outputFormatSpec(id: OutputFormatId): OutputFormatSpec {
  return OUTPUT_FORMATS[id];
}
