import * as vscode from 'vscode';
import { spawn, type ChildProcess } from 'node:child_process';
import * as path from 'node:path';
import { existsSync } from 'node:fs';
import { Chapter, countText, isInside, LeafmarkSource, naturalSort } from './model.js';

const VIEW_ID = 'leafmark.sidebar';
const ACTIVE_SOURCE_KEY = 'leafmark.activeSource';
const SINGLE_SETTINGS_KEY = 'leafmark.singleSettings';
const MARKERS = ['.leafmark/config.json', 'leafmark.json', '_frontmatter.md'];
const RESERVED = new Set(['_frontmatter.md', '_merged.md']);

type WebMessage = { type: string; [key: string]: unknown };
type JsonObject = Record<string, unknown>;

export function activate(context: vscode.ExtensionContext): void {
  const provider = new LeafmarkViewProvider(context);
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(VIEW_ID, provider, { webviewOptions: { retainContextWhenHidden: true } }),
    vscode.commands.registerCommand('leafmark.chooseSource', () => provider.chooseSource()),
    vscode.commands.registerCommand('leafmark.export', () => provider.exportActive()),
    vscode.commands.registerCommand('leafmark.exportCurrentFile', () => provider.exportCurrentFile()),
    vscode.commands.registerCommand('leafmark.showCurrentFileCharacters', () => provider.showCurrentFileCharacters()),
    vscode.commands.registerCommand('leafmark.doctor', () => provider.runDoctor()),
    vscode.commands.registerCommand('leafmark.watch', () => provider.watchActive()),
    vscode.commands.registerCommand('leafmark.themes', () => provider.listThemes()),
    vscode.commands.registerCommand('leafmark.convert', () => provider.convertSingle()),
    vscode.commands.registerCommand('leafmark.refresh', () => provider.refresh()),
    vscode.workspace.onDidChangeTextDocument(() => provider.scheduleRefresh()),
    vscode.workspace.onDidSaveTextDocument(() => provider.scheduleRefresh()),
    vscode.workspace.onDidChangeWorkspaceFolders(() => provider.refresh()),
  );

  for (const glob of ['**/*.md', '**/.leafmark/config.json', '**/leafmark.json', '**/_frontmatter.md', '**/*.bib']) {
    const watcher = vscode.workspace.createFileSystemWatcher(glob);
    watcher.onDidCreate(() => provider.scheduleRefresh());
    watcher.onDidChange(() => provider.scheduleRefresh());
    watcher.onDidDelete(() => provider.scheduleRefresh());
    context.subscriptions.push(watcher);
  }
}

export function deactivate(): void {}

class LeafmarkViewProvider implements vscode.WebviewViewProvider {
  private view?: vscode.WebviewView;
  private sources: LeafmarkSource[] = [];
  private active?: LeafmarkSource;
  private refreshTimer?: NodeJS.Timeout;
  private running?: ChildProcess;
  private readonly output = vscode.window.createOutputChannel('Leafmark');

  constructor(private readonly context: vscode.ExtensionContext) {
    context.subscriptions.push(this.output);
  }

  async resolveWebviewView(view: vscode.WebviewView): Promise<void> {
    this.view = view;
    view.webview.options = { enableScripts: true };
    view.webview.html = webviewHtml(view.webview);
    view.webview.onDidReceiveMessage((message: unknown) => {
      void this.handleMessage(message).catch((error: unknown) => {
        const message = error instanceof Error ? error.message : String(error);
        this.output.appendLine(`Sidebar error: ${message}`);
        void vscode.window.showErrorMessage(`Leafmark: ${message}`);
      });
    }, undefined, this.context.subscriptions);
    await this.refresh();
  }

  scheduleRefresh(): void {
    if (this.refreshTimer) clearTimeout(this.refreshTimer);
    this.refreshTimer = setTimeout(() => void this.refresh(), 180);
  }

  async refresh(): Promise<void> {
    this.sources = await discoverSources();
    const saved = this.context.workspaceState.get<LeafmarkSource>(ACTIVE_SOURCE_KEY);
    const candidate = this.active ?? saved;
    if (candidate && isWorkspacePath(candidate.path) && existsSync(candidate.path)) {
      this.active = this.sources.find((source) => source.path === candidate.path) ?? candidate;
      if (!this.sources.some((source) => source.path === candidate.path)) this.sources.push(candidate);
    } else {
      this.active = this.sources[0];
    }
    await this.publishState();
  }

  async chooseSource(): Promise<void> {
    const folders = vscode.workspace.workspaceFolders;
    if (!folders?.length) {
      void vscode.window.showInformationMessage('Open a workspace before choosing a Leafmark source.');
      return;
    }
    await this.refresh();
    const items: Array<vscode.QuickPickItem & { source?: LeafmarkSource; action?: 'folder' | 'file' }> = [
      ...this.sources.map((source) => ({
        label: source.kind === 'single' ? `$(file) ${source.label}` : `$(folder) ${source.label}`,
        description: source.kind === 'bundle' ? 'Leafmark bundle' : source.kind === 'project' ? 'Leafmark project' : 'Single Markdown file',
        detail: vscode.workspace.asRelativePath(source.path),
        source,
      })),
      { label: '$(folder-opened) Browse Workspace for Project Folder…', action: 'folder' },
      { label: '$(file) Browse Workspace for Markdown File…', action: 'file' },
    ];
    const chosen = await vscode.window.showQuickPick(items, { title: 'Choose a Leafmark project or single file', matchOnDescription: true, matchOnDetail: true });
    if (!chosen) return;
    if (chosen.source) return this.setActive(chosen.source);
    if (chosen.action === 'folder') await this.browseFolder();
    if (chosen.action === 'file') await this.browseFile();
  }

  private async browseFolder(): Promise<void> {
    const selected = await vscode.window.showOpenDialog({ canSelectFolders: true, canSelectFiles: false, canSelectMany: false, title: 'Choose a project folder in this workspace' });
    const uri = selected?.[0];
    if (!uri || !ensureWorkspaceUri(uri)) return;
    const source = this.sources.find((entry) => entry.path === uri.fsPath);
    if (source) return this.setActive(source);
    const answer = await vscode.window.showWarningMessage(
      `Initialize ${path.basename(uri.fsPath)} as a Leafmark project? This creates .leafmark/config.json.`,
      { modal: true }, 'Initialize Project'
    );
    if (answer !== 'Initialize Project') return;
    const markdown = await markdownFiles(uri.fsPath);
    await writeJson(vscode.Uri.joinPath(uri, '.leafmark', 'config.json'), { order: markdown });
    await this.setActive(sourceFor(uri.fsPath, 'project'));
  }

  private async browseFile(): Promise<void> {
    const selected = await vscode.window.showOpenDialog({ canSelectFiles: true, canSelectFolders: false, canSelectMany: false, filters: { Markdown: ['md'] }, title: 'Choose a Markdown file in this workspace' });
    const uri = selected?.[0];
    if (!uri || !ensureWorkspaceUri(uri)) return;
    if (path.extname(uri.fsPath).toLowerCase() !== '.md') {
      void vscode.window.showErrorMessage('Leafmark single-file mode requires a Markdown file.');
      return;
    }
    await this.setActive(sourceFor(uri.fsPath, 'single'));
  }

  private async setActive(source: LeafmarkSource): Promise<void> {
    if (!isWorkspacePath(source.path)) {
      void vscode.window.showErrorMessage('Leafmark sources must be inside the current workspace.');
      return;
    }
    this.active = source;
    await this.context.workspaceState.update(ACTIVE_SOURCE_KEY, source);
    if (!this.sources.some((entry) => entry.path === source.path)) this.sources.push(source);
    await this.publishState();
  }

  private async publishState(): Promise<void> {
    if (!this.view) return;
    const active = this.active;
    const chapters = active ? await chaptersFor(active) : [];
    const totals = chapters.reduce((sum, chapter) => ({
      words: sum.words + chapter.counts.words,
      charsWithSpaces: sum.charsWithSpaces + chapter.counts.charsWithSpaces,
      charsWithoutSpaces: sum.charsWithoutSpaces + chapter.counts.charsWithoutSpaces,
    }), { words: 0, charsWithSpaces: 0, charsWithoutSpaces: 0 });
    const settings = active ? await settingsFor(active, this.context) : {};
    await this.view.webview.postMessage({ type: 'state', active, sources: this.sources, chapters, totals, settings, trusted: vscode.workspace.isTrusted, running: Boolean(this.running) });
  }

  private async handleMessage(raw: unknown): Promise<void> {
    if (!raw || typeof raw !== 'object' || typeof (raw as WebMessage).type !== 'string') return;
    const message = raw as WebMessage;
    switch (message.type) {
      case 'ready': await this.refresh(); break;
      case 'choose': await this.chooseSource(); break;
      case 'switch': {
        const source = this.sources.find((entry) => entry.id === message.id);
        if (source) await this.setActive(source);
        break;
      }
      case 'open': await this.openChapter(String(message.path ?? '')); break;
      case 'reorder': if (Array.isArray(message.order)) await this.reorder(message.order.map(String)); break;
      case 'add': await this.addChapter(); break;
      case 'rename': await this.renameChapter(String(message.path ?? '')); break;
      case 'remove': await this.removeChapter(String(message.path ?? '')); break;
      case 'saveSettings': if (isJsonObject(message.settings)) await this.saveSettings(message.settings); break;
      case 'advanced': await this.openAdvanced(); break;
      case 'export': await this.exportActive(String(message.format ?? 'pdf')); break;
      case 'exportChapter': await this.exportActive(String(message.format ?? 'pdf'), String(message.chapter ?? '')); break;
      case 'watch': await this.watchActive(); break;
      case 'doctor': await this.runDoctor(); break;
      case 'themes': await this.listThemes(); break;
      case 'applyTheme': await this.applyTheme(String(message.theme ?? '')); break;
      case 'convert': await this.convertSingle(); break;
      case 'cancel': this.running?.kill(); break;
    }
  }

  private async openChapter(filePath: string): Promise<void> {
    if (!this.active || !isAllowedActivePath(filePath, this.active)) return;
    await vscode.window.showTextDocument(vscode.Uri.file(filePath));
  }

  private async reorder(order: string[]): Promise<void> {
    if (!this.active || this.active.kind === 'single') return;
    const known = new Set((await markdownFiles(this.active.path)));
    if (order.some((name) => !known.has(name))) return;
    const config = await readConfig(this.active.path);
    await writeJson(configUri(this.active.path), { ...config, order: [...order, ...[...known].filter((name) => !order.includes(name))] });
    await this.refresh();
  }

  private async addChapter(): Promise<void> {
    if (!this.active || this.active.kind === 'single') return;
    const name = await vscode.window.showInputBox({ title: 'New Leafmark chapter', prompt: 'Markdown filename', validateInput: (v) => /^[^/\\]+\.md$/i.test(v) ? undefined : 'Enter a filename ending in .md' });
    if (!name) return;
    const uri = vscode.Uri.file(path.join(this.active.path, name));
    if (existsSync(uri.fsPath)) return void vscode.window.showErrorMessage(`${name} already exists.`);
    await vscode.workspace.fs.writeFile(uri, new TextEncoder().encode(`# ${path.basename(name, '.md')}\n`));
    await this.refresh();
    await vscode.window.showTextDocument(uri);
  }

  private async renameChapter(filePath: string): Promise<void> {
    if (!this.active || !isAllowedActivePath(filePath, this.active)) return;
    const oldName = path.basename(filePath);
    const name = await vscode.window.showInputBox({ title: 'Rename chapter', value: oldName, validateInput: (v) => /^[^/\\]+\.md$/i.test(v) ? undefined : 'Enter a filename ending in .md' });
    if (!name || name === oldName) return;
    await vscode.workspace.fs.rename(vscode.Uri.file(filePath), vscode.Uri.file(path.join(path.dirname(filePath), name)), { overwrite: false });
    const config = await readConfig(this.active.path);
    if (Array.isArray(config.order)) config.order = config.order.map((entry) => entry === oldName ? name : entry);
    await writeJson(configUri(this.active.path), config);
    await this.refresh();
  }

  private async removeChapter(filePath: string): Promise<void> {
    if (!this.active || !isAllowedActivePath(filePath, this.active)) return;
    const answer = await vscode.window.showWarningMessage(`Move ${path.basename(filePath)} to the trash?`, { modal: true }, 'Move to Trash');
    if (answer !== 'Move to Trash') return;
    await vscode.workspace.fs.delete(vscode.Uri.file(filePath), { useTrash: true });
    await this.refresh();
  }

  private async saveSettings(settings: JsonObject): Promise<void> {
    if (!this.active) return;
    if (this.active.kind === 'single') {
      const all = this.context.workspaceState.get<Record<string, JsonObject>>(SINGLE_SETTINGS_KEY, {});
      all[this.active.path] = settings;
      await this.context.workspaceState.update(SINGLE_SETTINGS_KEY, all);
    } else {
      const config = await readConfig(this.active.path);
      const frontmatter = effectiveFrontmatter(this.active.path, config);
      if (frontmatter && existsSync(frontmatter.fsPath)) await updateFrontmatter(frontmatter, settings);
      else {
        const metadata = isJsonObject(config.metadata) ? config.metadata : {};
        const next = {
          ...config,
          metadata: { ...metadata, title: settings.title ?? '', author: settings.author ? [settings.author] : [], toc: Boolean(settings.toc), 'number-sections': Boolean(settings.numberSections) },
        };
        await writeJson(configUri(this.active.path), next);
      }
    }
    await this.publishState();
    void vscode.window.showInformationMessage('Leafmark settings saved.');
  }

  private async openAdvanced(): Promise<void> {
    if (!this.active) return;
    if (this.active.kind === 'single') {
      void vscode.window.showInformationMessage('Standalone settings are temporary. Convert the file to a project to edit raw configuration.');
      return;
    }
    const uri = configUri(this.active.path);
    if (!existsSync(uri.fsPath)) await writeJson(uri, {});
    await vscode.window.showTextDocument(uri);
  }

  async exportActive(format?: string, chapter = ''): Promise<void> {
    if (!this.active) return this.chooseSource();
    await this.exportSource(this.active, format, chapter);
  }

  async exportCurrentFile(): Promise<void> {
    const document = vscode.window.activeTextEditor?.document;
    if (!document || document.uri.scheme !== 'file' || path.extname(document.uri.fsPath).toLowerCase() !== '.md') {
      void vscode.window.showInformationMessage('Open a Markdown file before exporting the current file.');
      return;
    }
    if (!isWorkspacePath(document.uri.fsPath)) {
      void vscode.window.showErrorMessage('The current Markdown file must be inside the current workspace.');
      return;
    }
    await this.exportSource(sourceFor(document.uri.fsPath, 'single'));
  }

  showCurrentFileCharacters(): void {
    const document = vscode.window.activeTextEditor?.document;
    if (!document || (document.languageId !== 'markdown' && path.extname(document.uri.fsPath).toLowerCase() !== '.md')) {
      void vscode.window.showInformationMessage('Open a Markdown file to see its character count.');
      return;
    }
    const counts = countText(document.getText());
    void vscode.window.showInformationMessage(
      `${counts.charsWithSpaces.toLocaleString()} characters · ${counts.charsWithoutSpaces.toLocaleString()} without spaces · ${counts.words.toLocaleString()} words`
    );
  }

  private async exportSource(active: LeafmarkSource, format?: string, chapter = ''): Promise<void> {
    if (!(await this.ensureRunnable())) return;
    const documents = vscode.workspace.textDocuments.filter((doc) => doc.isDirty && isAllowedActivePath(doc.uri.fsPath, active));
    if (documents.length) {
      const answer = await vscode.window.showWarningMessage('Save changed Markdown files before exporting?', { modal: true }, 'Save and Export');
      if (answer !== 'Save and Export') return;
      if (!(await Promise.all(documents.map((doc) => doc.save()))).every(Boolean)) return;
    }
    const chosenFormat = format || vscode.workspace.getConfiguration('leafmark').get<string>('defaultExportFormat', 'pdf');
    const args: string[] = [];
    args.push(active.path);
    if (active.kind !== 'single' && chapter && !chapter.includes('/') && !chapter.includes('\\')) args.push(chapter);
    if (chosenFormat === 'html') args.push('--html-only');
    else if (chosenFormat === 'pdf+html') args.push('--html');
    else if (chosenFormat === 'docx') args.push('--output-format', 'docx');
    const outputDir = vscode.workspace.getConfiguration('leafmark').get<string>('defaultOutputDirectory', '').trim();
    if (outputDir) args.push('--output', path.resolve(active.workspace, outputDir));
    if (active.kind === 'single') {
      const settings = await settingsFor(active, this.context);
      const temp = vscode.Uri.joinPath(this.context.globalStorageUri, 'single-config.json');
      await writeJson(temp, { metadata: { title: settings.title ?? '', author: settings.author ? [settings.author] : [], toc: Boolean(settings.toc), 'number-sections': Boolean(settings.numberSections) } });
      args.push('--config-file', temp.fsPath);
    }
    args.push('--json', '--skip-tools-check');
    await this.runLeafmark(args, 'Exporting with Leafmark');
  }

  async runDoctor(): Promise<void> {
    if (!(await this.ensureRunnable())) return;
    await this.runLeafmark(['doctor', '--json'], 'Running Leafmark diagnostics');
  }

  async watchActive(): Promise<void> {
    if (!this.active || !(await this.ensureRunnable())) return;
    await this.runLeafmark(['watch', this.active.path, '--json', '--skip-tools-check'], 'Watching with Leafmark');
  }

  async listThemes(): Promise<void> {
    if (!(await this.ensureRunnable())) return;
    const events = await this.runLeafmark(['theme', 'list', '--json'], 'Loading Leafmark themes');
    const themes = events.filter((event) => event.type === 'theme');
    await this.view?.webview.postMessage({ type: 'themeList', themes });
  }

  private async applyTheme(theme: string): Promise<void> {
    if (!this.active || this.active.kind === 'single' || !theme) return;
    if (!(await this.ensureRunnable())) return;
    const external = /^https:\/\/github\.com\//i.test(theme);
    const answer = await vscode.window.showWarningMessage(`Apply theme “${theme}”? Existing .leafmark/theme files will be replaced.`, { modal: true }, 'Apply Theme');
    if (answer !== 'Apply Theme') return;
    if (external && !vscode.workspace.isTrusted) return;
    await this.runLeafmark(['theme', 'use', theme, this.active.path], 'Applying Leafmark theme');
    await this.refresh();
  }

  async convertSingle(): Promise<void> {
    if (!this.active || this.active.kind !== 'single') return;
    const folder = path.dirname(this.active.path);
    const answer = await vscode.window.showWarningMessage(`Create .leafmark/config.json in ${path.basename(folder)}?`, { modal: true }, 'Convert');
    if (answer !== 'Convert') return;
    const settings = await settingsFor(this.active, this.context);
    await writeJson(configUri(folder), { order: [path.basename(this.active.path)], metadata: settings });
    await this.setActive(sourceFor(folder, 'project'));
    await this.refresh();
  }

  private async ensureRunnable(): Promise<boolean> {
    if (!vscode.workspace.isTrusted) {
      void vscode.window.showWarningMessage('Trust this workspace before running Leafmark or external tools.');
      return false;
    }
    const config = vscode.workspace.getConfiguration('leafmark');
    if (!config.get<boolean>('allowPackageDownload', false)) {
      const answer = await vscode.window.showWarningMessage('Leafmark uses npx, which may download the configured npm package. Allow downloads?', { modal: true }, 'Allow');
      if (answer !== 'Allow') return false;
      await config.update('allowPackageDownload', true, vscode.ConfigurationTarget.Global);
    }
    return true;
  }

  private async runLeafmark(args: string[], title: string): Promise<JsonObject[]> {
    if (this.running) {
      void vscode.window.showWarningMessage('A Leafmark operation is already running.');
      return [];
    }
    const packageSpec = vscode.workspace.getConfiguration('leafmark').get<string>('packageSpec', '@skxv/leafmark@latest');
    const cwd = this.active?.kind === 'single' ? path.dirname(this.active.path) : this.active?.path ?? vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (!cwd) return [];
    const events: JsonObject[] = [];
    this.output.show(true);
    this.output.appendLine(`> npx --yes ${packageSpec} ${args.join(' ')}`);
    await this.view?.webview.postMessage({ type: 'operation', running: true, title });
    return await new Promise((resolve) => {
      const command = process.platform === 'win32' ? 'npx.cmd' : 'npx';
      const child = spawn(command, ['--yes', packageSpec, ...args], { cwd, env: process.env });
      this.running = child;
      const consume = (data: Buffer, error = false) => {
        const text = data.toString();
        this.output.append(text);
        for (const line of text.split(/\r?\n/)) {
          try {
            const event = JSON.parse(line) as JsonObject;
            if (typeof event.type === 'string') events.push(event);
          } catch { if (error && line.trim()) void this.view?.webview.postMessage({ type: 'notice', level: 'error', message: line }); }
        }
      };
      child.stdout?.on('data', (data: Buffer) => consume(data));
      child.stderr?.on('data', (data: Buffer) => consume(data, true));
      child.on('error', (error) => this.output.appendLine(error.message));
      child.on('close', async (code) => {
        this.running = undefined;
        await this.view?.webview.postMessage({ type: 'operation', running: false });
        for (const event of events) {
          if (event.type === 'artifact' && typeof event.path === 'string') {
            void vscode.window.showInformationMessage(`Leafmark wrote ${vscode.workspace.asRelativePath(event.path)}`, 'Reveal').then((choice) => {
              if (choice === 'Reveal') void vscode.commands.executeCommand('revealFileInOS', vscode.Uri.file(String(event.path)));
            });
            if (vscode.workspace.getConfiguration('leafmark').get<boolean>('openArtifacts', false)) void vscode.commands.executeCommand('vscode.open', vscode.Uri.file(event.path));
          }
        }
        if (code !== 0) void vscode.window.showErrorMessage(`Leafmark failed with exit code ${code ?? 'unknown'}. See the Leafmark output channel.`);
        await this.publishState();
        resolve(events);
      });
    });
  }
}

async function discoverSources(): Promise<LeafmarkSource[]> {
  const folders = vscode.workspace.workspaceFolders ?? [];
  const byPath = new Map<string, LeafmarkSource>();
  for (const folder of folders) {
    for (const marker of MARKERS) {
      const matches = await vscode.workspace.findFiles(new vscode.RelativePattern(folder, `**/${marker}`), '**/{node_modules,dist,build,.git}/**', 500);
      for (const match of matches) {
        const suffix = marker.split('/');
        const projectPath = suffix.length === 2 ? path.dirname(path.dirname(match.fsPath)) : path.dirname(match.fsPath);
        const relative = path.relative(folder.uri.fsPath, projectPath);
        const kind = relative.split(path.sep).length > 1 ? 'bundle' : 'project';
        byPath.set(projectPath, sourceFor(projectPath, kind));
      }
    }
    const legacy = path.join(folder.uri.fsPath, 'project');
    if (MARKERS.some((marker) => existsSync(path.join(legacy, marker)))) byPath.set(legacy, sourceFor(legacy, 'project'));
  }
  const sources = [...byPath.values()];
  for (const source of sources) {
    if (sources.some((candidate) => candidate.path !== source.path && isInside(source.path, candidate.path))) source.kind = 'bundle';
  }
  return sources.sort((a, b) => a.label.localeCompare(b.label));
}

function sourceFor(filePath: string, kind: LeafmarkSource['kind']): LeafmarkSource {
  const folder = vscode.workspace.getWorkspaceFolder(vscode.Uri.file(filePath));
  const workspace = folder?.uri.fsPath ?? path.dirname(filePath);
  return { id: `${kind}:${filePath}`, kind, path: filePath, label: vscode.workspace.asRelativePath(filePath) || path.basename(filePath), workspace };
}

async function chaptersFor(source: LeafmarkSource): Promise<Chapter[]> {
  if (source.kind === 'single') return [{ name: path.basename(source.path), path: source.path, counts: countText(await documentText(source.path)) }];
  const files = await markdownFiles(source.path);
  const config = await readConfig(source.path);
  const savedOrder = Array.isArray(config.order) ? config.order.filter((name): name is string => typeof name === 'string') : [];
  const ordered = savedOrder.length ? [...savedOrder.filter((name) => files.includes(name)), ...files.filter((name) => !savedOrder.includes(name))] : files;
  return Promise.all(ordered.map(async (name) => ({ name, path: path.join(source.path, name), counts: countText(await documentText(path.join(source.path, name))) })));
}

async function markdownFiles(folder: string): Promise<string[]> {
  const entries = await vscode.workspace.fs.readDirectory(vscode.Uri.file(folder));
  return entries.filter(([name, type]) => type === vscode.FileType.File && name.toLowerCase().endsWith('.md') && !name.startsWith('.') && !RESERVED.has(name)).map(([name]) => name).sort(naturalSort);
}

async function documentText(filePath: string): Promise<string> {
  const open = vscode.workspace.textDocuments.find((doc) => doc.uri.fsPath === filePath);
  if (open) return open.getText();
  return new TextDecoder().decode(await vscode.workspace.fs.readFile(vscode.Uri.file(filePath)));
}

async function readConfig(folder: string): Promise<JsonObject> {
  const preferred = configUri(folder);
  const legacy = vscode.Uri.file(path.join(folder, 'leafmark.json'));
  const uri = existsSync(preferred.fsPath) ? preferred : legacy;
  if (!existsSync(uri.fsPath)) return {};
  try {
    const parsed: unknown = JSON.parse(new TextDecoder().decode(await vscode.workspace.fs.readFile(uri)));
    return isJsonObject(parsed) ? parsed : {};
  } catch (error) {
    void vscode.window.showErrorMessage(`Invalid Leafmark configuration: ${error instanceof Error ? error.message : String(error)}`);
    return {};
  }
}

async function settingsFor(source: LeafmarkSource, context: vscode.ExtensionContext): Promise<JsonObject> {
  if (source.kind === 'single') return context.workspaceState.get<Record<string, JsonObject>>(SINGLE_SETTINGS_KEY, {})[source.path] ?? {};
  const config = await readConfig(source.path);
  let metadata = isJsonObject(config.metadata) ? config.metadata : {};
  const frontmatter = effectiveFrontmatter(source.path, config);
  if (frontmatter && existsSync(frontmatter.fsPath)) metadata = { ...metadata, ...(await readFrontmatter(frontmatter)) };
  return { title: metadata.title ?? '', author: Array.isArray(metadata.author) ? metadata.author[0] ?? '' : metadata.author ?? '', toc: Boolean(metadata.toc), numberSections: Boolean(metadata['number-sections']) };
}

function effectiveFrontmatter(folder: string, config: JsonObject): vscode.Uri | undefined {
  if (config.frontmatter === false) return undefined;
  const configured = typeof config.frontmatter === 'string' && config.frontmatter.trim() ? config.frontmatter : '_frontmatter.md';
  return vscode.Uri.file(path.isAbsolute(configured) ? configured : path.join(folder, configured));
}

async function readFrontmatter(uri: vscode.Uri): Promise<JsonObject> {
  const raw = new TextDecoder().decode(await vscode.workspace.fs.readFile(uri)).replace(/\r\n/g, '\n');
  const body = raw.match(/^---\s*\n([\s\S]*?)\n---/)?.[1] ?? '';
  const scalar = (key: string): unknown => {
    const match = body.match(new RegExp(`^${key}:\\s*(.*?)\\s*$`, 'm'));
    if (!match) return undefined;
    const value = match[1].replace(/^['"]|['"]$/g, '');
    if (value === 'true') return true;
    if (value === 'false') return false;
    return value;
  };
  const authorBlock = body.match(/^author:\s*\n((?:^[ \t]+.*\n?)*)/m)?.[1];
  const author = scalar('author') ?? authorBlock?.match(/^\s*-\s*(.*?)\s*$/m)?.[1]?.replace(/^['"]|['"]$/g, '');
  return { title: scalar('title'), author, toc: scalar('toc'), 'number-sections': scalar('number-sections') };
}

async function updateFrontmatter(uri: vscode.Uri, settings: JsonObject): Promise<void> {
  const raw = new TextDecoder().decode(await vscode.workspace.fs.readFile(uri)).replace(/\r\n/g, '\n');
  const match = raw.match(/^(---\s*\n)([\s\S]*?)(\n---[\s\S]*)$/);
  if (!match) throw new Error(`Expected YAML front matter in ${uri.fsPath}`);
  let body = match[2];
  const values: Record<string, unknown> = {
    title: settings.title ?? '',
    author: settings.author ?? '',
    toc: Boolean(settings.toc),
    'number-sections': Boolean(settings.numberSections),
  };
  for (const [key, value] of Object.entries(values)) {
    const line = `${key}: ${typeof value === 'boolean' ? value : JSON.stringify(String(value))}`;
    const block = new RegExp(`^${key}:.*(?:\\n(?=^[ \\t])[^\\n]*)*`, 'm');
    body = block.test(body) ? body.replace(block, line) : `${body.trimEnd()}\n${line}`;
  }
  await vscode.workspace.fs.writeFile(uri, new TextEncoder().encode(`${match[1]}${body}${match[3]}`));
}

function configUri(folder: string): vscode.Uri { return vscode.Uri.file(path.join(folder, '.leafmark', 'config.json')); }
async function writeJson(uri: vscode.Uri, value: unknown): Promise<void> {
  await vscode.workspace.fs.createDirectory(vscode.Uri.file(path.dirname(uri.fsPath)));
  const temp = vscode.Uri.file(`${uri.fsPath}.tmp`);
  await vscode.workspace.fs.writeFile(temp, new TextEncoder().encode(`${JSON.stringify(value, null, 2)}\n`));
  await vscode.workspace.fs.rename(temp, uri, { overwrite: true });
}
function isJsonObject(value: unknown): value is JsonObject { return Boolean(value) && typeof value === 'object' && !Array.isArray(value); }
function isWorkspacePath(filePath: string): boolean { return (vscode.workspace.workspaceFolders ?? []).some((folder) => isInside(filePath, folder.uri.fsPath)); }
function ensureWorkspaceUri(uri: vscode.Uri): boolean {
  if (isWorkspacePath(uri.fsPath)) return true;
  void vscode.window.showErrorMessage('Choose a folder or file inside the current workspace.');
  return false;
}
function isAllowedActivePath(filePath: string, source: LeafmarkSource): boolean { return source.kind === 'single' ? path.resolve(filePath) === path.resolve(source.path) : isInside(filePath, source.path); }

function webviewHtml(webview: vscode.Webview): string {
  const nonce = String(Date.now());
  return `<!doctype html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'nonce-${nonce}'; script-src 'nonce-${nonce}'"><style nonce="${nonce}">
  :root{color-scheme:light dark}*{box-sizing:border-box}body{margin:0;padding:14px;color:var(--vscode-foreground);background:var(--vscode-sideBar-background);font:13px var(--vscode-font-family)}button,input,select{font:inherit;color:inherit}button{border:1px solid var(--vscode-button-border,transparent);background:var(--vscode-button-background);color:var(--vscode-button-foreground);padding:7px 10px;border-radius:3px;cursor:pointer}button:hover{background:var(--vscode-button-hoverBackground)}button.secondary{background:var(--vscode-button-secondaryBackground);color:var(--vscode-button-secondaryForeground)}button.icon{padding:3px 6px;background:transparent;border-color:transparent}h2{font-size:15px;margin:18px 0 8px}.top{display:grid;gap:8px;position:sticky;top:0;background:var(--vscode-sideBar-background);padding-bottom:10px;z-index:2}select,input{width:100%;padding:6px;background:var(--vscode-input-background);border:1px solid var(--vscode-input-border,transparent)}.stats{display:grid;grid-template-columns:repeat(3,1fr);gap:5px}.stat{background:var(--vscode-editorWidget-background);padding:7px;text-align:center}.stat strong{display:block;font-size:15px}.chapter{display:flex;align-items:center;gap:5px;border-bottom:1px solid var(--vscode-sideBarSectionHeader-border);padding:7px 0}.chapter.drag{opacity:.55}.chapter-name{flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;cursor:pointer}.muted{color:var(--vscode-descriptionForeground);font-size:11px}.actions{display:flex;gap:6px;flex-wrap:wrap}.form{display:grid;gap:7px}.check{display:flex;gap:7px;align-items:center}.check input{width:auto}.notice{padding:8px;background:var(--vscode-inputValidation-warningBackground);margin:8px 0}.hidden{display:none}.spinner{display:inline-block;animation:spin 1s linear infinite}@keyframes spin{to{transform:rotate(360deg)}}
  </style></head><body><div id="app"><div class="top"><button id="choose">Choose Project or File</button><select id="source" aria-label="Active Leafmark source"></select></div><div id="empty" class="notice">Choose a project folder or Markdown file in this workspace.</div><main id="main" class="hidden"><div id="trust" class="notice hidden">Trust this workspace to run exports, themes, and diagnostics.</div><h2 id="title"></h2><div class="stats"><div class="stat"><strong id="words">0</strong>words</div><div class="stat"><strong id="chars">0</strong>characters</div><div class="stat"><strong id="compact">0</strong>no spaces</div></div><h2>Files</h2><div id="chapters"></div><button id="add" class="secondary">Add chapter</button><h2>Settings</h2><div class="form"><label>Title<input id="setting-title"></label><label>Author<input id="setting-author"></label><label class="check"><input type="checkbox" id="setting-toc"> Table of contents</label><label class="check"><input type="checkbox" id="setting-number"> Number sections</label><div class="actions"><button id="save">Save settings</button><button id="advanced" class="secondary">Advanced</button><button id="convert" class="secondary hidden">Convert to project</button></div></div><h2>Export</h2><div class="actions"><button data-export="pdf">PDF</button><button data-export="docx">DOCX</button><button data-export="html">HTML</button><button data-export="pdf+html">PDF + HTML</button><button id="watch" class="secondary">Watch</button><button id="cancel" class="secondary hidden">Cancel</button></div><h2>Themes & tools</h2><div class="actions"><button id="themes" class="secondary">Choose theme</button><button id="doctor" class="secondary">Diagnostics</button></div><div id="operation" class="muted"></div></main></div><script nonce="${nonce}">
  const vscode=acquireVsCodeApi();let state={};const $=id=>document.getElementById(id);const send=(type,data={})=>vscode.postMessage({type,...data});$('choose').onclick=()=>send('choose');$('source').onchange=e=>send('switch',{id:e.target.value});$('add').onclick=()=>send('add');$('advanced').onclick=()=>send('advanced');$('convert').onclick=()=>send('convert');$('doctor').onclick=()=>send('doctor');$('themes').onclick=()=>send('themes');$('watch').onclick=()=>send('watch');$('cancel').onclick=()=>send('cancel');document.querySelectorAll('[data-export]').forEach(b=>b.onclick=()=>send('export',{format:b.dataset.export}));$('save').onclick=()=>send('saveSettings',{settings:{title:$('setting-title').value,author:$('setting-author').value,toc:$('setting-toc').checked,numberSections:$('setting-number').checked}});
  function render(s){state=s;$('source').innerHTML=s.sources.map(x=>'<option value="'+esc(x.id)+'" '+(s.active&&x.id===s.active.id?'selected':'')+'>'+esc(x.label)+'</option>').join('');$('empty').classList.toggle('hidden',!!s.active);$('main').classList.toggle('hidden',!s.active);if(!s.active)return;$('title').textContent=s.active.label;$('trust').classList.toggle('hidden',s.trusted);$('words').textContent=s.totals.words.toLocaleString();$('chars').textContent=s.totals.charsWithSpaces.toLocaleString();$('compact').textContent=s.totals.charsWithoutSpaces.toLocaleString();$('add').classList.toggle('hidden',s.active.kind==='single');$('convert').classList.toggle('hidden',s.active.kind!=='single');$('themes').classList.toggle('hidden',s.active.kind==='single');$('setting-title').value=s.settings.title||'';$('setting-author').value=s.settings.author||'';$('setting-toc').checked=!!s.settings.toc;$('setting-number').checked=!!s.settings.numberSections;$('chapters').innerHTML='';s.chapters.forEach(ch=>{const row=document.createElement('div');row.className='chapter';row.draggable=s.active.kind!=='single';row.dataset.name=ch.name;row.innerHTML='<span aria-hidden="true">☰</span><span class="chapter-name">'+esc(ch.name)+'<div class="muted">'+ch.counts.words.toLocaleString()+' words · '+ch.counts.charsWithSpaces.toLocaleString()+' chars</div></span><button class="icon export-one" title="Export this file">⇩</button><button class="icon rename" title="Rename">✎</button><button class="icon remove" title="Move to trash">×</button>';row.querySelector('.chapter-name').onclick=()=>send('open',{path:ch.path});row.querySelector('.export-one').onclick=()=>send('exportChapter',{format:'pdf',chapter:ch.name});row.querySelector('.rename').onclick=()=>send('rename',{path:ch.path});row.querySelector('.remove').onclick=()=>send('remove',{path:ch.path});row.ondragstart=()=>row.classList.add('drag');row.ondragend=()=>{row.classList.remove('drag');send('reorder',{order:[...$('chapters').children].map(x=>x.dataset.name)})};row.ondragover=e=>{e.preventDefault();const dragging=$('chapters').querySelector('.drag');if(dragging&&dragging!==row){const box=row.getBoundingClientRect();$('chapters').insertBefore(dragging,e.clientY<box.top+box.height/2?row:row.nextSibling)}};$('chapters').appendChild(row)})}
  function esc(v){return String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}window.addEventListener('message',({data})=>{if(data.type==='state')render(data);if(data.type==='operation'){$('cancel').classList.toggle('hidden',!data.running);$('operation').textContent=data.running?'◌ '+(data.title||'Working…'):''}if(data.type==='themeList'){const names=data.themes.map(x=>x.name);const selected=prompt('Theme name:\\n'+names.join('\\n'),names[0]||'');if(selected)send('applyTheme',{theme:selected})}});send('ready');
  </script></body></html>`;
}
