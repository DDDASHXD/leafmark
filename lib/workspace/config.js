import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, join } from 'node:path';
import { parse as parseYaml } from 'yaml';
export const LEAFMARK_DIR = '.leafmark';
export const PROJECT_CONFIG_FILE = join(LEAFMARK_DIR, 'config.json');
export const LEGACY_PROJECT_CONFIG_FILE = 'leafmark.json';
export const FRONTMATTER_FILE = '_frontmatter.md';
export function configPath(projectDir) {
    return join(projectDir, PROJECT_CONFIG_FILE);
}
export function legacyConfigPath(projectDir) {
    return join(projectDir, LEGACY_PROJECT_CONFIG_FILE);
}
export function readProjectConfig(projectDir) {
    const p = configPath(projectDir);
    const legacy = legacyConfigPath(projectDir);
    const readable = existsSync(p) ? p : existsSync(legacy) ? legacy : null;
    if (!readable)
        return {};
    const parsed = JSON.parse(readFileSync(readable, 'utf-8'));
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        throw new Error(`Invalid ${readable}: expected a JSON object`);
    }
    return parsed;
}
export function writeProjectConfig(projectDir, config) {
    mkdirSync(dirname(configPath(projectDir)), { recursive: true });
    writeFileSync(configPath(projectDir), `${JSON.stringify(config, null, 2)}\n`, 'utf-8');
}
export function updateProjectOrder(projectDir, order) {
    const config = readProjectConfig(projectDir);
    writeProjectConfig(projectDir, { ...config, order });
}
function frontmatterPathFromConfig(projectDir, config) {
    if (config.frontmatter === false)
        return null;
    const configured = typeof config.frontmatter === 'string' && config.frontmatter.trim()
        ? config.frontmatter.trim()
        : FRONTMATTER_FILE;
    return isAbsolute(configured) ? configured : join(projectDir, configured);
}
export function readProjectMetadata(projectDir, config) {
    const fromConfig = config.metadata && typeof config.metadata === 'object' && !Array.isArray(config.metadata)
        ? { ...config.metadata }
        : {};
    const frontmatterPath = frontmatterPathFromConfig(projectDir, config);
    if (!frontmatterPath || !existsSync(frontmatterPath))
        return fromConfig;
    const raw = readFileSync(frontmatterPath, 'utf-8').replace(/\r\n/g, '\n');
    const m = raw.match(/^---\s*\n([\s\S]*?)\n---/);
    if (!m) {
        throw new Error(`Expected YAML front matter (--- ... ---) in ${frontmatterPath}`);
    }
    const doc = parseYaml(m[1]);
    if (!doc || typeof doc !== 'object' || Array.isArray(doc)) {
        throw new Error(`Invalid YAML document in ${frontmatterPath}`);
    }
    return { ...fromConfig, ...doc };
}
export function resolveConfigPath(projectRoot, value) {
    if (!value || !value.trim())
        return null;
    return isAbsolute(value) ? value : join(projectRoot, value);
}
//# sourceMappingURL=config.js.map