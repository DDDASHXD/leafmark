import { existsSync, mkdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import type { CliOptions } from '../cli/options.js';
import { splitBundleAndChapters } from '../workspace/bundles.js';
import { buildMergedMarkdown, countMergedBody, resolveChapterFiles } from '../workspace/chapters.js';
import { readProjectConfig, readProjectMetadata, resolveConfigPath } from '../workspace/config.js';
import type { Workspace } from '../workspace/workspace.js';
import { CSL_PATH, LUA_FILTER_PATH } from '../system/paths.js';
import { die } from '../system/errors.js';
import { which } from '../system/tools.js';
import { outputFormatSpec } from './output-formats.js';
import {
  defaultLatexTemplate,
  fontsTexRelFromDist,
  relFrom,
  runPandocDocx,
  runPandocHtml,
  runPandocPdf,
  spawnComplete,
  type BuildContext,
} from './pandoc.js';
import {
  mergedYamlDocument,
  normalizeConfig,
  resolveBibliographyPaths,
  resolveCoverPdfPath,
  resolveLatexTemplatePath,
  writeAuthorLatexFile,
  type MergedYamlOptions,
} from '../thesis-meta.js';

export async function buildOnce(workspace: Workspace, opts: CliOptions): Promise<void> {
  if (!which('pandoc')) die('pandoc not found. Run `leafmark doctor` for install guidance.', 1);

  const { bundleName, chapterArgs } = splitBundleAndChapters(opts.positional, workspace);
  const activeProjectDir = bundleName ? join(workspace.projectBase, bundleName) : workspace.projectBase;
  const distDir = bundleName ? join(workspace.outputRoot, bundleName) : workspace.outputRoot;
  const rootForRelativePaths = workspace.legacyProjectLayout ? workspace.inputRoot : activeProjectDir;
  const config = readProjectConfig(activeProjectDir);
  const ctx: BuildContext = {
    workspace,
    bundleName,
    activeProjectDir,
    distDir,
    rootForRelativePaths,
    config,
  };
  const mergedFile = join(distDir, '_merged.md');
  const formatSpec = outputFormatSpec(opts.outputFormat);
  const primaryOut = join(distDir, formatSpec.outputFilename);
  const htmlOutAbs = join(distDir, 'thesis.html');
  mkdirSync(distDir, { recursive: true });

  let rawYaml: Record<string, unknown>;
  try {
    rawYaml = readProjectMetadata(activeProjectDir, config);
  } catch (e) {
    die(e instanceof Error ? e.message : String(e), 1);
  }

  if (rawYaml['header-includes'] !== undefined) {
    die('Remove `header-includes` from metadata. Leafmark generates the LaTeX preamble under dist/.', 1);
  }

  const meta = normalizeConfig(rawYaml);
  const bibPaths = resolveBibliographyPaths(rawYaml, activeProjectDir);
  if (bibPaths.length > 0) {
    if (!existsSync(CSL_PATH)) die(`Missing APA CSL for citeproc: ${CSL_PATH}`, 1);
    if (!existsSync(LUA_FILTER_PATH)) die(`Missing Pandoc Lua filter: ${LUA_FILTER_PATH}`, 1);
    for (const b of bibPaths) if (!existsSync(b)) die(`Bibliography file not found: ${b}`, 1);
  }

  const customLatex = resolveLatexTemplatePath(rawYaml, activeProjectDir)
    ?? resolveConfigPath(activeProjectDir, config.latexTemplate ?? config.template);
  const authorTexAbs = writeAuthorLatexFile(meta, distDir);
  const mergedYamlOpts: MergedYamlOptions = {
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

  const extraMeta: string[] = [];
  const coverPdf = resolveCoverPdfPath(rawYaml, activeProjectDir);
  const shouldMergeCover = Boolean(
    opts.outputFormat === 'pdf' && coverPdf && !opts.noMergeCover && !opts.htmlOnly
  );
  let pandocPdfOut = primaryOut;
  if (shouldMergeCover) {
    if (!coverPdf || !existsSync(coverPdf)) die(`coverpage not found: ${coverPdf ?? ''}`, 1);
    if (!which('pdfunite')) die('coverpage requires pdfunite. Run `leafmark doctor`, or use --no-merge-cover.', 1);
    pandocPdfOut = join(distDir, '_body.pdf');
    extraMeta.push('-M', 'title-page=false');
  }

  const latexTemplate = customLatex ?? defaultLatexTemplate(ctx);
  const useThesisHeaderIncludes = true;
  const includeFontsInThesisHeaderIncludes = !customLatex;
  const useDefaultGeometry = !customLatex;

  if (opts.wantHtml) {
    await runPandocHtml({ merged, meta, bibPaths, ctx, mergedFile, htmlOutAbs });
    console.log(`Wrote ${relFrom(workspace.inputRoot, htmlOutAbs)}`);
  }

  if (!opts.htmlOnly) {
    if (opts.outputFormat === 'pdf') {
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
        includeFontsInThesisHeaderIncludes,
        useDefaultGeometry,
      });

      if (shouldMergeCover && coverPdf) {
        const r = await spawnComplete('pdfunite', [coverPdf, pandocPdfOut, primaryOut], { cwd: rootForRelativePaths });
        if (r.status !== 0) die(`pdfunite failed:\n${r.stderr || r.stdout || '(no output)'}`, r.status ?? 1);
      }
    } else if (opts.outputFormat === 'docx') {
      await runPandocDocx({
        merged,
        meta,
        bibPaths,
        extraMeta,
        outputDocxAbs: primaryOut,
        ctx,
        mergedFile,
      });
    }
    console.log(`Wrote ${relFrom(workspace.inputRoot, primaryOut)}`);
  }
}
