import * as path from 'node:path';

export type SourceKind = 'project' | 'bundle' | 'single';

export type LeafmarkSource = {
  id: string;
  kind: SourceKind;
  path: string;
  label: string;
  workspace: string;
};

export type Counts = { words: number; charsWithSpaces: number; charsWithoutSpaces: number };
export type Chapter = { name: string; path: string; counts: Counts };

export function isInside(candidate: string, root: string): boolean {
  const relative = path.relative(path.resolve(root), path.resolve(candidate));
  return relative === '' || (!relative.startsWith('..' + path.sep) && relative !== '..' && !path.isAbsolute(relative));
}

export function naturalSort(a: string, b: string): number {
  const prefix = (value: string) => value.match(/^(\d+)[-_.\s]/)?.[1];
  const pa = prefix(a);
  const pb = prefix(b);
  if (pa && pb && Number(pa) !== Number(pb)) return Number(pa) - Number(pb);
  if (pa && !pb) return -1;
  if (!pa && pb) return 1;
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
}

export function stripMarkdown(source: string): string {
  return source.replace(/^---\s*\n[\s\S]*?\n---\s*\n?/, '').replace(/```[\s\S]*?```|~~~[\s\S]*?~~~/g, ' ')
    .replace(/<!--[\s\S]*?-->|<[^>]+>/g, ' ').replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1').replace(/[`*_>#]/g, '').replace(/^\s*(?:[-+] |\d+\. )/gm, '')
    .replace(/\s+/g, ' ').trim();
}

export function countText(source: string): Counts {
  const text = stripMarkdown(source);
  return {
    words: text ? text.split(/\s+/).length : 0,
    charsWithSpaces: text.length,
    charsWithoutSpaces: text.replace(/\s/g, '').length,
  };
}
