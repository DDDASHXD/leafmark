import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { LEAFMARK_DIR, PROJECT_CONFIG_FILE } from './config.js';
export function initFolder(targetArg) {
    const root = resolve(process.cwd(), targetArg ?? '.');
    mkdirSync(root, { recursive: true });
    mkdirSync(join(root, LEAFMARK_DIR), { recursive: true });
    const config = join(root, PROJECT_CONFIG_FILE);
    const chapter = join(root, 'introduction.md');
    const bib = join(root, 'sources.bib');
    if (!existsSync(config)) {
        writeFileSync(config, `${JSON.stringify({
            metadata: {
                title: 'My Leafmark Project',
                author: ['Your Name'],
                date: '',
                bibliography: 'sources.bib',
                toc: true,
                'toc-depth': 3,
                'toc-own-page': true,
                'number-sections': true,
            },
            order: ['introduction.md'],
            fonts: {},
            plugins: [],
            pandoc: {},
        }, null, 2)}\n`, 'utf-8');
    }
    if (!existsSync(chapter)) {
        writeFileSync(chapter, ['# Introduction', '', 'Write your first chapter here.', ''].join('\n'), 'utf-8');
    }
    if (!existsSync(bib))
        writeFileSync(bib, '', 'utf-8');
    console.log(`Initialized ${root}`);
}
//# sourceMappingURL=init.js.map