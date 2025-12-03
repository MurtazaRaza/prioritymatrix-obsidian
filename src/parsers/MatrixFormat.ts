import { App } from 'obsidian';
import { Matrix } from '../types';
import { parseMarkdown } from './parseMarkdown';
import { astToUnhydratedMatrix } from './formats/matrix';
import { hydrateMatrix } from './helpers/hydrateMatrix';
import { createLogger } from '../utils/logger';

const log = createLogger('MatrixFormat');

/**
 * Convert markdown to Matrix structure
 */
export function mdToMatrix(md: string, app: App, filePath: string): Matrix {
    const parsed = parseMarkdown(md);
    const unhydrated = astToUnhydratedMatrix(parsed);
    const hydrated = hydrateMatrix(unhydrated, app, filePath);
    return hydrated;
}

/**
 * Convert Matrix structure back to markdown
 */
export function matrixToMd(matrix: Matrix): string {
    const lines: string[] = [];

    // Frontmatter - always include do-not-delete marker
    const frontmatter = { ...matrix.data.frontmatter };
    frontmatter['do-not-delete'] = 'priority-matrix-plugin';
    
    lines.push('---');
    for (const [key, value] of Object.entries(frontmatter)) {
        lines.push(`${key}: ${JSON.stringify(value)}`);
    }
    lines.push('---');
    lines.push('');

    // TODO section
    lines.push('## TODO');
    lines.push('');
    for (const item of matrix.data.banks.todo) {
        lines.push(`- [ ] ${item.data.titleRaw}`);
    }
    if (matrix.data.banks.todo.length === 0) {
        lines.push('');
    }
    lines.push('');

    // Quadrants
    for (const quadrant of matrix.children) {
        lines.push(`## ${quadrant.id.toUpperCase()}`);
        lines.push('');
        for (const item of quadrant.children) {
            lines.push(`- ${item.data.titleRaw}`);
        }
        if (quadrant.children.length === 0) {
            lines.push('');
        }
        lines.push('');
    }

    // DONE section
    lines.push('## DONE');
    lines.push('');
    for (const item of matrix.data.banks.done) {
        lines.push(`- [x] ${item.data.titleRaw}`);
    }
    if (matrix.data.banks.done.length === 0) {
        lines.push('');
    }
    lines.push('');

    // Settings JSON block
    lines.push('## settingsJson');
    lines.push('');
    lines.push('```json');
    const settingsJsonString = JSON.stringify(matrix.data.settings, null, 2);
    log.log('matrixToMd - saving settings JSON', settingsJsonString);
    log.log('matrixToMd - settings.includePath', matrix.data.settings.includePath);
    lines.push(settingsJsonString);
    lines.push('```');
    lines.push('');

    return lines.join('\n');
}

