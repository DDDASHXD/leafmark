import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import type { LeafmarkConfig } from './config.js';
import { die } from '../system/errors.js';

const RESERVED_MARKDOWN = new Set(['_frontmatter.md', '_merged.md']);

export function listMarkdownFiles(projectDir: string): string[] {
  return readdirSync(projectDir)
    .filter((f) => f.toLowerCase().endsWith('.md'))
    .filter((f) => !RESERVED_MARKDOWN.has(f))
    .filter((f) => !f.startsWith('.'))
    .filter((f) => existsSync(join(projectDir, f)))
    .sort(naturalChapterSort);
}

export function resolveChapterFiles(
  requested: string[],
  projectDir: string,
  config: LeafmarkConfig
): string[] {
  if (requested.length > 0) return resolveRequestedChapters(requested, projectDir);

  const all = listMarkdownFiles(projectDir);
  if (all.length === 0) die(`No Markdown chapter files found in ${projectDir}`, 1);

  const ordered = applySavedOrder(all, config.order ?? []);
  if (ordered.length === 0) die(`No Markdown chapter files found in ${projectDir}`, 1);
  return ordered;
}

function resolveRequestedChapters(requested: string[], projectDir: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of requested) {
    const name = basename(raw.trim());
    if (!name || name === '.' || name === '..') die(`Invalid chapter path: ${raw}`, 1);
    if (!name.toLowerCase().endsWith('.md')) die(`Not a Markdown chapter file: ${name}`, 1);
    const abs = join(projectDir, name);
    if (!existsSync(abs)) die(`Chapter file not found: ${name} (${abs})`, 1);
    if (RESERVED_MARKDOWN.has(name)) die(`Reserved Markdown file cannot be used as a chapter: ${name}`, 1);
    if (seen.has(name)) continue;
    seen.add(name);
    out.push(name);
  }
  if (out.length === 0) die(`No Markdown chapter files found in ${projectDir}`, 1);
  return out;
}

function applySavedOrder(files: string[], order: string[]): string[] {
  const remaining = new Set(files);
  const out: string[] = [];
  for (const item of order) {
    if (!remaining.has(item)) continue;
    out.push(item);
    remaining.delete(item);
  }
  return [...out, ...Array.from(remaining).sort(naturalChapterSort)];
}

function naturalChapterSort(a: string, b: string): number {
  const na = numericPrefix(a);
  const nb = numericPrefix(b);
  if (na !== null && nb !== null && na !== nb) return na - nb;
  if (na !== null && nb === null) return -1;
  if (na === null && nb !== null) return 1;
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
}

function numericPrefix(name: string): number | null {
  const match = name.match(/^(\d+)[-_.\s]/);
  return match ? Number.parseInt(match[1], 10) : null;
}

export function buildMergedMarkdown(
  yamlBlock: string,
  chapterFiles: string[],
  projectDir: string
): string {
  const parts: string[] = [`---\n${yamlBlock}\n---\n\n`];
  for (const f of chapterFiles) {
    parts.push(readFileSync(join(projectDir, f), 'utf-8').replace(/\r\n/g, '\n').trimEnd(), '\n\n');
  }
  return parts.join('');
}

export function countMergedBody(merged: string): { words: number; chars: number } {
  const withoutFm = merged.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n\s*/, '');
  const text = withoutFm.trim();
  return {
    chars: text.length,
    words: text.length === 0 ? 0 : text.split(/\s+/).length,
  };
}
