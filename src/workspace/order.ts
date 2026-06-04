import { stdin as input, stdout as output } from 'node:process';
import type { Workspace } from './workspace.js';
import { listMarkdownFiles } from './chapters.js';
import { readProjectConfig, updateProjectOrder } from './config.js';
import { die } from '../system/errors.js';

export async function orderProject(workspace: Workspace): Promise<void> {
  const projectDir = workspace.projectBase;
  const config = readProjectConfig(projectDir);
  const files = applyInitialOrder(listMarkdownFiles(projectDir), config.order ?? []);
  if (files.length === 0) die(`No Markdown chapter files found in ${projectDir}`, 1);
  if (!input.isTTY || !output.isTTY) {
    updateProjectOrder(projectDir, files);
    console.log(`Saved ${files.length} file(s) to .leafmark/config.json`);
    return;
  }

  const ordered = await interactiveOrder(files);
  updateProjectOrder(projectDir, ordered);
  console.log(`Saved order to .leafmark/config.json`);
}

function applyInitialOrder(files: string[], order: string[]): string[] {
  const remaining = new Set(files);
  const out: string[] = [];
  for (const item of order) {
    if (!remaining.has(item)) continue;
    out.push(item);
    remaining.delete(item);
  }
  return [...out, ...remaining];
}

async function interactiveOrder(initial: string[]): Promise<string[]> {
  const items = [...initial];
  let selected = 0;
  let grabbed = false;

  const render = () => {
    output.write('\x1b[2J\x1b[H');
    output.write('Leafmark order\n\n');
    output.write('Up/down selects, space grabs, enter saves, q cancels.\n\n');
    for (let i = 0; i < items.length; i++) {
      const pointer = i === selected ? '>' : ' ';
      const grip = grabbed && i === selected ? '*' : ' ';
      output.write(`${pointer} ${grip} ${items[i]}\n`);
    }
  };

  input.setRawMode(true);
  input.resume();
  input.setEncoding('utf-8');

  try {
    render();
    for await (const key of input) {
      if (key === '\u0003' || key === 'q') {
        output.write('\x1b[2J\x1b[H');
        die('Order unchanged.', 1);
      }
      if (key === '\r' || key === '\n') {
        output.write('\x1b[2J\x1b[H');
        return items;
      }
      if (key === ' ') grabbed = !grabbed;
      if (key === '\u001b[A') {
        if (grabbed) move(items, selected, selected - 1);
        selected = Math.max(0, selected - 1);
      }
      if (key === '\u001b[B') {
        if (grabbed) move(items, selected, selected + 1);
        selected = Math.min(items.length - 1, selected + 1);
      }
      render();
    }
  } finally {
    input.setRawMode(false);
    input.pause();
  }
  return items;
}

function move(items: string[], from: number, to: number): void {
  if (to < 0 || to >= items.length || from === to) return;
  const [item] = items.splice(from, 1);
  if (item) items.splice(to, 0, item);
}
