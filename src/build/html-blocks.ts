import { existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { homedir, platform } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium, type Browser } from 'playwright-core';
import { die } from '../system/errors.js';
import { resolveConfigPath } from '../workspace/config.js';
import type { BuildContext } from './pandoc.js';

const BLOCK_START = /^\s*<([a-z][\w-]*)(?:\s[^>]*)?>/i;
const NON_VISUAL_TAGS = new Set(['html', 'head', 'body', 'script', 'style', 'link', 'meta', 'title']);
const VOID_TAGS = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'source', 'track', 'wbr']);

export function resolveStylePaths(raw: unknown, ctx: BuildContext): string[] {
  if (raw === undefined || raw === null || raw === false) return [];
  if (!Array.isArray(raw) || raw.some((item) => typeof item !== 'string' || !item.trim())) {
    die('`styles` must be a list of CSS file paths.', 1);
  }
  return (raw as string[]).map((value) => {
    const resolved = resolveConfigPath(ctx.activeProjectDir, value);
    if (!resolved || !existsSync(resolved)) die(`CSS style file not found: ${value}`, 1);
    return resolved;
  });
}

export async function renderHtmlBlocks(
  markdown: string,
  stylePaths: string[],
  ctx: BuildContext
): Promise<string> {
  const blocks = findHtmlBlocks(markdown);
  if (blocks.length === 0) return markdown;

  const executablePath = browserExecutable();
  if (!executablePath) {
    die('HTML blocks require Chrome, Chromium, Edge, or Brave to generate image output.', 1);
  }

  const imageDir = join(ctx.distDir, '_html-blocks');
  rmSync(imageDir, { recursive: true, force: true });
  mkdirSync(imageDir, { recursive: true });
  let browser: Browser | undefined;
  try {
    browser = await chromium.launch({ executablePath, headless: true });
    const page = await browser.newPage({
      viewport: { width: 1200, height: 900 },
      deviceScaleFactor: 2,
      javaScriptEnabled: false,
    });
    const links = stylePaths
      .map((style) => `<link rel="stylesheet" href="${escapeAttribute(pathToFileURL(style).href)}">`)
      .join('\n');
    const replacements: string[] = [];
    for (let index = 0; index < blocks.length; index++) {
      const block = blocks[index]!;
      const hash = createHash('sha1').update(block.html).digest('hex').slice(0, 10);
      const filename = `block-${index + 1}-${hash}.png`;
      const output = join(imageDir, filename);
      await page.setContent(htmlDocument(block.html, links), { waitUntil: 'load' });
      await page.evaluate(() => document.fonts.ready);
      const element = page.locator('#leafmark-html-block');
      await element.screenshot({ path: output, animations: 'disabled' });
      const imagePath = output.replace(/\\/g, '/');
      replacements.push(`![Rendered HTML block](<${imagePath}>){.leafmark-html-block}`);
    }

    let rendered = '';
    let cursor = 0;
    for (let index = 0; index < blocks.length; index++) {
      const block = blocks[index]!;
      rendered += markdown.slice(cursor, block.start) + replacements[index];
      cursor = block.end;
    }
    return rendered + markdown.slice(cursor);
  } catch (error) {
    die(`Could not render HTML block: ${error instanceof Error ? error.message : String(error)}`, 1);
    throw error;
  } finally {
    await browser?.close();
  }
}

function htmlDocument(fragment: string, links: string): string {
  return [
    '<!doctype html>',
    '<html><head><meta charset="utf-8">',
    links,
    '<style>',
    'html, body { margin: 0; padding: 0; background: transparent; }',
    'body { width: 1120px; padding: 40px; }',
    '#leafmark-html-block { display: flow-root; width: 100%; }',
    '</style></head><body>',
    `<div id="leafmark-html-block">${fragment}</div>`,
    '</body></html>',
  ].join('\n');
}

function findHtmlBlocks(markdown: string): Array<{ start: number; end: number; html: string }> {
  const lines = markdown.match(/.*(?:\n|$)/g) ?? [];
  const blocks: Array<{ start: number; end: number; html: string }> = [];
  let offset = 0;
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index]!;
    const trimmed = line.trim();
    const match = trimmed.match(BLOCK_START);
    const tag = match?.[1]?.toLowerCase();
    if (!tag || NON_VISUAL_TAGS.has(tag) || trimmed.startsWith('<!--')) {
      offset += line.length;
      continue;
    }

    const start = offset;
    let html = line;
    let depth = tagDepth(line, tag);
    if (VOID_TAGS.has(tag) || /\/\>\s*$/.test(trimmed)) depth = 0;
    while (depth > 0 && index + 1 < lines.length) {
      index++;
      const next = lines[index]!;
      html += next;
      depth += tagDepth(next, tag);
    }
    if (depth > 0) {
      offset += html.length;
      continue;
    }
    blocks.push({ start, end: start + html.length, html: html.trimEnd() });
    offset += html.length;
  }
  return blocks;
}

function tagDepth(value: string, tag: string): number {
  const escaped = tag.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const opens = value.match(new RegExp(`<${escaped}(?:\\s[^>]*)?>`, 'gi'))?.filter((item) => !/\/>$/.test(item)).length ?? 0;
  const closes = value.match(new RegExp(`</${escaped}\\s*>`, 'gi'))?.length ?? 0;
  return opens - closes;
}

function escapeAttribute(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
}

function browserExecutable(): string | null {
  const candidates = platform() === 'darwin'
    ? [
        '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
        '/Applications/Chromium.app/Contents/MacOS/Chromium',
        '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
        '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser',
      ]
    : platform() === 'win32'
      ? [
          join(process.env.PROGRAMFILES ?? '', 'Google/Chrome/Application/chrome.exe'),
          join(process.env['PROGRAMFILES(X86)'] ?? '', 'Microsoft/Edge/Application/msedge.exe'),
          join(process.env.LOCALAPPDATA ?? '', 'Google/Chrome/Application/chrome.exe'),
        ]
      : [
          '/usr/bin/google-chrome',
          '/usr/bin/google-chrome-stable',
          '/usr/bin/chromium',
          '/usr/bin/chromium-browser',
          '/usr/bin/microsoft-edge',
          '/usr/bin/brave-browser',
          join(homedir(), '.local/bin/chromium'),
        ];
  return candidates.find((candidate) => candidate && existsSync(candidate)) ?? null;
}
