import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { countPlainText, stripMarkdownToPlainText } from '../markdown-plain.js';
import { die } from '../system/errors.js';
import { normalizeConfig } from '../thesis-meta.js';
import { splitBundleAndChapters } from './bundles.js';
import { resolveChapterFiles } from './chapters.js';
import { readProjectConfig, readProjectMetadata } from './config.js';
function metadataPlainText(raw) {
    const meta = normalizeConfig(raw);
    const parts = [];
    if (meta.title)
        parts.push(stripMarkdownToPlainText(meta.title));
    if (meta.subtitle)
        parts.push(stripMarkdownToPlainText(meta.subtitle));
    const abstract = raw.abstract;
    if (typeof abstract === 'string' && abstract.trim()) {
        parts.push(stripMarkdownToPlainText(abstract));
    }
    for (const entry of meta.authorEntries) {
        for (const line of entry) {
            if (typeof line === 'string')
                parts.push(stripMarkdownToPlainText(line));
            else
                parts.push(line.orcid);
        }
    }
    return parts.filter(Boolean).join(' ');
}
function chapterPlainText(chapterFiles, projectDir) {
    const parts = [];
    for (const file of chapterFiles) {
        const raw = readFileSync(join(projectDir, file), 'utf-8').replace(/\r\n/g, '\n');
        parts.push(stripMarkdownToPlainText(raw));
    }
    return parts.filter(Boolean).join(' ');
}
export function printProjectStatus(workspace, opts) {
    const { bundleName, chapterArgs } = splitBundleAndChapters(opts.positional, workspace);
    const activeProjectDir = bundleName ? join(workspace.projectBase, bundleName) : workspace.projectBase;
    const config = readProjectConfig(activeProjectDir);
    let rawYaml;
    try {
        rawYaml = readProjectMetadata(activeProjectDir, config);
    }
    catch (e) {
        die(e instanceof Error ? e.message : String(e), 1);
    }
    const chapterFiles = resolveChapterFiles(chapterArgs, activeProjectDir, config);
    const plainText = [metadataPlainText(rawYaml), chapterPlainText(chapterFiles, activeProjectDir)]
        .filter(Boolean)
        .join(' ');
    const counts = countPlainText(plainText);
    const label = bundleName ? ` (${bundleName})` : '';
    console.log(`Leafmark${label} status`);
    console.log(`Input: ${activeProjectDir}`);
    console.log(`Chapters: ${chapterFiles.length}`);
    console.log(`Words: ${counts.words.toLocaleString()}`);
    console.log(`Characters (with spaces): ${counts.charsWithSpaces.toLocaleString()}`);
    console.log(`Characters (without spaces): ${counts.charsWithoutSpaces.toLocaleString()}`);
}
//# sourceMappingURL=status.js.map