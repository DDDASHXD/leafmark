import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { isAbsolute, join } from 'node:path';
import { parse as parseYaml } from 'yaml';

export const PROJECT_CONFIG_FILE = 'leafmark.json';
export const FRONTMATTER_FILE = '_frontmatter.md';

export type LeafmarkPluginConfig =
  | string
  | {
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

export function configPath(projectDir: string): string {
  return join(projectDir, PROJECT_CONFIG_FILE);
}

export function readProjectConfig(projectDir: string): LeafmarkConfig {
  const p = configPath(projectDir);
  if (!existsSync(p)) return {};
  const parsed = JSON.parse(readFileSync(p, 'utf-8')) as unknown;
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(`Invalid ${PROJECT_CONFIG_FILE}: expected a JSON object`);
  }
  return parsed as LeafmarkConfig;
}

export function writeProjectConfig(projectDir: string, config: LeafmarkConfig): void {
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
