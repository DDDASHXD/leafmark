import { existsSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import { basename, extname, join, relative } from 'node:path';
import { splitBundleAndChapters } from '../workspace/bundles.js';
import { buildMergedMarkdown, countMergedBody, resolveChapterFiles } from '../workspace/chapters.js';
import { readProjectConfig, readProjectMetadata, resolveConfigPath } from '../workspace/config.js';
import { CSL_PATH, LUA_FILTER_PATH } from '../system/paths.js';
import { die } from '../system/errors.js';
import { which } from '../system/tools.js';
import { outputFormatSpec } from './output-formats.js';
import { defaultLatexTemplate, fontsTexRelFromDist, relFrom, runPandocDocx, runPandocHtml, runPandocPdf, spawnComplete, } from './pandoc.js';
import { mergedYamlDocument, normalizeConfig, resolveBibliographyPaths, resolveCoverPdfPath, resolveLatexTemplatePath, writeAuthorLatexFile, } from '../thesis-meta.js';
import { emitEvent } from '../system/events.js';
import { renderHtmlBlocks, resolveStylePaths } from './html-blocks.js';
export async function buildOnce(workspace, opts) {
    if (!which('pandoc'))
        die('pandoc not found. Run `leafmark doctor` for install guidance.', 1);
    const { bundleName, chapterArgs } = splitBundleAndChapters(opts.positional, workspace);
    const activeProjectDir = bundleName ? join(workspace.projectBase, bundleName) : workspace.projectBase;
    const distDir = bundleName ? join(workspace.outputRoot, bundleName) : workspace.outputRoot;
    const rootForRelativePaths = workspace.legacyProjectLayout ? workspace.inputRoot : activeProjectDir;
    const config = readProjectConfig(activeProjectDir, opts.configFile);
    const ctx = {
        workspace,
        bundleName,
        activeProjectDir,
        distDir,
        rootForRelativePaths,
        config,
    };
    const mergedFile = join(distDir, '_merged.md');
    const formatSpec = outputFormatSpec(opts.outputFormat);
    const outputBasename = outputName(chapterArgs, activeProjectDir);
    const primaryOut = join(distDir, `${outputBasename}.${formatSpec.outputExtension}`);
    const htmlOutAbs = join(distDir, `${outputBasename}.html`);
    mkdirSync(distDir, { recursive: true });
    let rawYaml;
    try {
        rawYaml = readProjectMetadata(activeProjectDir, config);
    }
    catch (e) {
        die(e instanceof Error ? e.message : String(e), 1);
    }
    if (rawYaml['header-includes'] !== undefined) {
        die('Remove `header-includes` from metadata. Leafmark generates the LaTeX preamble under dist/.', 1);
    }
    const meta = normalizeConfig(rawYaml);
    const bibPaths = resolveBibliographyPaths(rawYaml, activeProjectDir);
    if (bibPaths.length > 0) {
        if (!existsSync(CSL_PATH))
            die(`Missing APA CSL for citeproc: ${CSL_PATH}`, 1);
        if (!existsSync(LUA_FILTER_PATH))
            die(`Missing Pandoc Lua filter: ${LUA_FILTER_PATH}`, 1);
        for (const b of bibPaths)
            if (!existsSync(b))
                die(`Bibliography file not found: ${b}`, 1);
    }
    const customLatex = resolveLatexTemplatePath(rawYaml, activeProjectDir)
        ?? resolveConfigPath(activeProjectDir, config.latexTemplate ?? config.template);
    const authorTexAbs = writeAuthorLatexFile(meta, distDir);
    const mergedYamlOpts = {
        ...(customLatex ? { fontsIncludeRel: fontsTexRelFromDist(ctx) } : {}),
        ...(authorTexAbs ? { authorsIncludeRel: relative(rootForRelativePaths, authorTexAbs).replace(/\\/g, '/') } : {}),
    };
    const chapterFiles = resolveChapterFiles(chapterArgs, activeProjectDir, config);
    const yamlBlock = mergedYamlDocument(meta, rawYaml, mergedYamlOpts);
    const merged = buildMergedMarkdown(yamlBlock, chapterFiles, activeProjectDir);
    const stylePaths = resolveStylePaths(rawYaml.styles, ctx);
    const counts = countMergedBody(merged);
    if (opts.json)
        emitEvent('build-started', {
            bundle: bundleName,
            input: activeProjectDir,
            output: distDir,
            chapters: chapterFiles,
            words: counts.words,
            characters: counts.chars,
        });
    else {
        console.log(`Leafmark ${bundleName ? `(${bundleName}) ` : ''}building ${chapterFiles.length} chapter(s)`);
        console.log(`Input: ${activeProjectDir}`);
        console.log(`Output: ${distDir}`);
        console.log(`Words: ${counts.words.toLocaleString()} | characters: ${counts.chars.toLocaleString()}`);
    }
    const extraMeta = [];
    const coverPdf = resolveCoverPdfPath(rawYaml, activeProjectDir);
    const shouldMergeCover = Boolean(opts.outputFormat === 'pdf' && coverPdf && !opts.noMergeCover && !opts.htmlOnly);
    let pandocPdfOut = primaryOut;
    if (shouldMergeCover) {
        if (!coverPdf || !existsSync(coverPdf))
            die(`coverpage not found: ${coverPdf ?? ''}`, 1);
        if (!which('pdfunite'))
            die('coverpage requires pdfunite. Run `leafmark doctor`, or use --no-merge-cover.', 1);
        pandocPdfOut = join(distDir, '_body.pdf');
        extraMeta.push('-M', 'title-page=false');
    }
    const latexTemplate = customLatex ?? defaultLatexTemplate(ctx);
    const useThesisHeaderIncludes = true;
    const includeFontsInThesisHeaderIncludes = !customLatex;
    const useDefaultGeometry = !customLatex;
    if (opts.wantHtml) {
        await runPandocHtml({ merged, meta, bibPaths, ctx, mergedFile, htmlOutAbs, stylePaths });
        if (opts.json)
            emitEvent('artifact', { format: 'html', path: htmlOutAbs });
        else
            console.log(`Wrote ${relFrom(workspace.cwd, htmlOutAbs)}`);
    }
    if (!opts.htmlOnly) {
        const outputMarkdown = await renderHtmlBlocks(merged, stylePaths, ctx);
        if (opts.outputFormat === 'pdf') {
            await runPandocPdf({
                merged: outputMarkdown,
                meta,
                bibPaths,
                extraMeta,
                outputPdfAbs: pandocPdfOut,
                ctx,
                mergedFile,
                latexTemplate,
                useThesisHeaderIncludes,
                includeFontsInThesisHeaderIncludes,
                useDefaultGeometry,
            });
            if (shouldMergeCover && coverPdf) {
                const r = await spawnComplete('pdfunite', [coverPdf, pandocPdfOut, primaryOut], { cwd: rootForRelativePaths });
                if (r.status !== 0)
                    die(`pdfunite failed:\n${r.stderr || r.stdout || '(no output)'}`, r.status ?? 1);
            }
        }
        else if (opts.outputFormat === 'docx') {
            await runPandocDocx({
                merged: outputMarkdown,
                meta,
                bibPaths,
                extraMeta,
                outputDocxAbs: primaryOut,
                ctx,
                mergedFile,
            });
        }
        if (opts.json)
            emitEvent('artifact', { format: opts.outputFormat, path: primaryOut });
        else
            console.log(`Wrote ${relFrom(workspace.cwd, primaryOut)}`);
    }
    if (!opts.keepBuildFiles)
        removeBuildFiles(distDir);
    if (opts.json)
        emitEvent('complete', { command: 'build', success: true });
}
function outputName(chapterArgs, activeProjectDir) {
    if (chapterArgs.length === 1) {
        const chapter = basename(chapterArgs[0]);
        return chapter.slice(0, -extname(chapter).length);
    }
    return basename(activeProjectDir);
}
function removeBuildFiles(distDir) {
    for (const filename of [
        '_merged.md',
        '_pandoc-authors.tex',
        '_pandoc-build-includes.tex',
        '_pandoc-fonts.tex',
        '_suppress-title-page-header.html',
        '_no-hyphens.css',
        '_leafmark-theme.css',
        '_leafmark-theme.tex',
        '_leafmark-google-fonts.tex',
        '_body.pdf',
    ]) {
        rmSync(join(distDir, filename), { force: true });
    }
    for (const filename of readdirSync(distDir)) {
        if (filename.startsWith('_leafmark-google-') && filename.endsWith('.ttf'))
            rmSync(join(distDir, filename), { force: true });
    }
    rmSync(join(distDir, '_html-blocks'), { recursive: true, force: true });
}
//# sourceMappingURL=build.js.map