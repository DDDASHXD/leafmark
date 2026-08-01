import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, join } from 'node:path';
import { parse as parseYaml } from 'yaml';
import type { BasicTheme } from '../theme/engine.js';

export const LEAFMARK_DIR = '.leafmark';
export const PROJECT_CONFIG_FILE = join(LEAFMARK_DIR, 'config.json');
export const LEGACY_PROJECT_CONFIG_FILE = 'leafmark.json';
export const FRONTMATTER_FILE = '_frontmatter.md';

export type LeafmarkPluginConfig =
  | string
  | {
      path?: string;
      luaFilter?: string;
      args?: string[];
      pdfArgs?: string[];
      htmlArgs?: string[];
      docxArgs?: string[];
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
  themePlugins?: LeafmarkPluginConfig[];
  pandoc?: {
    args?: string[];
    pdfArgs?: string[];
    htmlArgs?: string[];
    docxArgs?: string[];
  };
  metadata?: Record<string, unknown>;
  /** Portable, JSON-native styling shared by PDF and HTML output. */
  theme?: BasicTheme;
};

export type LeafmarkFontFiles = {
  path?: string;
  upright: string;
  bold?: string;
  italic?: string;
  boldItalic?: string;
  scale?: number;
};

export function configPath(projectDir: string): string {
  return join(projectDir, PROJECT_CONFIG_FILE);
}

export function legacyConfigPath(projectDir: string): string {
  return join(projectDir, LEGACY_PROJECT_CONFIG_FILE);
}

export function readProjectConfig(projectDir: string, overlayPath: string | null = null): LeafmarkConfig {
  const p = configPath(projectDir);
  const legacy = legacyConfigPath(projectDir);
  const readable = existsSync(p) ? p : existsSync(legacy) ? legacy : null;
  const base = readable ? parseConfigFile(readable) : {};
  if (!overlayPath) return base;
  const overlay = parseConfigFile(overlayPath);
  return {
    ...base,
    ...overlay,
    metadata: { ...(base.metadata ?? {}), ...(overlay.metadata ?? {}) },
    fonts: { ...(base.fonts ?? {}), ...(overlay.fonts ?? {}) },
    pandoc: { ...(base.pandoc ?? {}), ...(overlay.pandoc ?? {}) },
    theme: mergeBasicTheme(base.theme, overlay.theme),
  };
}

function mergeBasicTheme(base: BasicTheme | undefined, overlay: BasicTheme | undefined): BasicTheme | undefined {
  if (!base && !overlay) return undefined;
  return {
    ...base,
    ...overlay,
    page: base?.page || overlay?.page ? {
      ...base?.page,
      ...overlay?.page,
      margins: { ...base?.page?.margins, ...overlay?.page?.margins },
    } : undefined,
    typography: { ...base?.typography, ...overlay?.typography },
    colors: { ...base?.colors, ...overlay?.colors },
    spacing: { ...base?.spacing, ...overlay?.spacing },
    headings: { ...base?.headings, ...overlay?.headings },
    tables: { ...base?.tables, ...overlay?.tables },
    blocks: { ...base?.blocks, ...overlay?.blocks },
  };
}

function parseConfigFile(path: string): LeafmarkConfig {
  if (!existsSync(path)) throw new Error(`Config file not found: ${path}`);
  const parsed = JSON.parse(readFileSync(path, 'utf-8')) as unknown;
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(`Invalid ${path}: expected a JSON object`);
  }
  return parsed as LeafmarkConfig;
}

export function writeProjectConfig(projectDir: string, config: LeafmarkConfig): void {
  mkdirSync(dirname(configPath(projectDir)), { recursive: true });
  writeFileSync(configPath(projectDir), `${JSON.stringify(config, null, 2)}\n`, 'utf-8');
}

export function updateProjectOrder(projectDir: string, order: string[]): void {
  const config = readProjectConfig(projectDir);
  writeProjectConfig(projectDir, { ...config, order });
}

function frontmatterPathFromConfig(projectDir: string, config: LeafmarkConfig): string | null {
  if (config.frontmatter === false) return null;
  const configured = typeof config.frontmatter === 'string' && config.frontmatter.trim()
    ? config.frontmatter.trim()
    : FRONTMATTER_FILE;
  return isAbsolute(configured) ? configured : join(projectDir, configured);
}

export function readProjectMetadata(projectDir: string, config: LeafmarkConfig): Record<string, unknown> {
  const fromConfig = config.metadata && typeof config.metadata === 'object' && !Array.isArray(config.metadata)
    ? { ...config.metadata }
    : {};
  const frontmatterPath = frontmatterPathFromConfig(projectDir, config);
  if (!frontmatterPath || !existsSync(frontmatterPath)) return fromConfig;

  const raw = readFileSync(frontmatterPath, 'utf-8').replace(/\r\n/g, '\n');
  const m = raw.match(/^---\s*\n([\s\S]*?)\n---/);
  if (!m) {
    throw new Error(`Expected YAML front matter (--- ... ---) in ${frontmatterPath}`);
  }
  const doc = parseYaml(m[1]);
  if (!doc || typeof doc !== 'object' || Array.isArray(doc)) {
    throw new Error(`Invalid YAML document in ${frontmatterPath}`);
  }
  return { ...fromConfig, ...(doc as Record<string, unknown>) };
}

export function resolveConfigPath(projectRoot: string, value: string | undefined): string | null {
  if (!value || !value.trim()) return null;
  return isAbsolute(value) ? value : join(projectRoot, value);
}
