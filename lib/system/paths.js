import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
export const PACKAGE_ROOT = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
export const RESOURCE_DIR = join(PACKAGE_ROOT, 'src');
export const CSL_PATH = join(RESOURCE_DIR, 'csl', 'apa.csl');
export const LUA_FILTER_PATH = join(RESOURCE_DIR, 'pagebreak-before-refs.lua');
export const AUTHOR_ENTRIES_LUA = join(RESOURCE_DIR, 'author-entries.lua');
export const PANDOC_LATEX_TEMPLATE = join(RESOURCE_DIR, 'pandoc-default.latex');
export const PRINT_CSS = join(RESOURCE_DIR, 'print.css');
//# sourceMappingURL=paths.js.map