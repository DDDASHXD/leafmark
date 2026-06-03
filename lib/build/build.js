import { existsSync, mkdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { splitBundleAndChapters } from '../workspace/bundles.js';
import { buildMergedMarkdown, countMergedBody, resolveChapterFiles } from '../workspace/chapters.js';
import { readProjectConfig, readProjectMetadata, resolveConfigPath } from '../workspace/config.js';
import { CSL_PATH, LUA_FILTER_PATH } from '../system/paths.js';
import { die } from '../system/errors.js';
import { which } from '../system/tools.js';
import { defaultLatexTemplate, fontsTexRelFromDist, relFrom, runPandocHtml, runPandocPdf, spawnComplete, } from './pandoc.js';
import { mergedYamlDocument, normalizeConfig, resolveBibliographyPaths, resolveCoverPdfPath, resolveLatexTemplatePath, writeAuthorLatexFile, } from '../thesis-meta.js';
export async function buildOnce(workspace, opts) {
    if (!which('pandoc'))
        die('pandoc not found. Run `leafmark doctor` for install guidance.', 1);
    const { bundleName, chapterArgs } = splitBundleAndChapters(opts.positional, workspace);
    const activeProjectDir = bundleName ? join(workspace.projectBase, bundleName) : workspace.projectBase;
    const distDir = bundleName ? join(workspace.outputRoot, bundleName) : workspace.outputRoot;
    const rootForRelativePaths = workspace.legacyProjectLayout ? workspace.inputRoot : activeProjectDir;
    const config = readProjectConfig(activeProjectDir);
    const ctx = {
        workspace,
        bundleName,
        activeProjectDir,
        distDir,
        rootForRelativePaths,
        config,
    };
    const mergedFile = join(distDir, '_merged.md');
    const pdfOut = join(distDir, 'output.pdf');
    const htmlOutAbs = join(distDir, 'thesis.html');
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
    const counts = countMergedBody(merged);
    console.log(`Leafmark ${bundleName ? `(${bundleName}) ` : ''}building ${chapterFiles.length} chapter(s)`);
    console.log(`Input: ${activeProjectDir}`);
    console.log(`Output: ${distDir}`);
    console.log(`Words: ${counts.words.toLocaleString()} | characters: ${counts.chars.toLocaleString()}`);
    const extraMeta = [];
    const coverPdf = resolveCoverPdfPath(rawYaml, activeProjectDir);
    const shouldMergeCover = Boolean(coverPdf && !opts.noMergeCover && !opts.htmlOnly);
    let pandocPdfOut = pdfOut;
    if (shouldMergeCover) {
        if (!coverPdf || !existsSync(coverPdf))
            die(`coverpage not found: ${coverPdf ?? ''}`, 1);
        if (!which('pdfunite'))
            die('coverpage requires pdfunite. Run `leafmark doctor`, or use --no-merge-cover.', 1);
        pandocPdfOut = join(distDir, '_body.pdf');
        extraMeta.push('-M', 'title-page=false');
    }
    const latexTemplate = customLatex ?? defaultLatexTemplate(ctx);
    const useThesisHeaderIncludes = !customLatex;
    const useDefaultGeometry = !customLatex;
    if (opts.wantHtml) {
        await runPandocHtml({ merged, meta, bibPaths, ctx, mergedFile, htmlOutAbs });
        console.log(`Wrote ${relFrom(workspace.inputRoot, htmlOutAbs)}`);
    }
    if (!opts.htmlOnly) {
        await runPandocPdf({
            merged,
            meta,
            bibPaths,
            extraMeta,
            outputPdfAbs: pandocPdfOut,
            ctx,
            mergedFile,
            latexTemplate,
            useThesisHeaderIncludes,
            useDefaultGeometry,
        });
        if (shouldMergeCover && coverPdf) {
            const r = await spawnComplete('pdfunite', [coverPdf, pandocPdfOut, pdfOut], { cwd: rootForRelativePaths });
            if (r.status !== 0)
                die(`pdfunite failed:\n${r.stderr || r.stdout || '(no output)'}`, r.status ?? 1);
        }
        console.log(`Wrote ${relFrom(workspace.inputRoot, pdfOut)}`);
    }
}
//# sourceMappingURL=build.js.map