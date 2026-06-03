import { existsSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { die } from '../system/errors.js';
import { FRONTMATTER_FILE, PROJECT_CONFIG_FILE } from './config.js';

export type Workspace = {
  cwd: string;
  inputRoot: string;
  projectBase: string;
  outputRoot: string;
  legacyProjectLayout: boolean;
};

export function discoverWorkspace(targetArg: string | null): Workspace {
  const inputRoot = resolve(process.cwd(), targetArg ?? '.');
  if (!existsSync(inputRoot)) die(`Folder not found: ${inputRoot}`, 1);
  if (!statSync(inputRoot).isDirectory()) die(`Not a folder: ${inputRoot}`, 1);

  if (isLeafmarkProject(inputRoot)) {
    return {
      cwd: process.cwd(),
      inputRoot,
      projectBase: inputRoot,
      outputRoot: join(inputRoot, 'dist'),
      legacyProjectLayout: false,
    };
  }

  const legacyProject = join(inputRoot, 'project');
  if (isLeafmarkProject(legacyProject)) {
    return {
      cwd: process.cwd(),
      inputRoot,
      projectBase: legacyProject,
      outputRoot: join(inputRoot, 'dist'),
      legacyProjectLayout: true,
    };
  }

  return {
    cwd: process.cwd(),
    inputRoot,
    projectBase: inputRoot,
    outputRoot: join(inputRoot, 'dist'),
    legacyProjectLayout: false,
  };
}

export function isLeafmarkProject(dir: string): boolean {
  return existsSync(join(dir, PROJECT_CONFIG_FILE)) || existsSync(join(dir, FRONTMATTER_FILE));
}
