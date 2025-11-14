import { App } from 'obsidian';
import { Matrix } from '../types';
import { parseMarkdown, ParsedMarkdown } from './parseMarkdown';
import { astToUnhydratedMatrix } from './formats/matrix';
import { hydrateMatrix } from './helpers/hydrateMatrix';

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

    // Frontmatter (if any)
    if (Object.keys(matrix.data.frontmatter).length > 0) {
        lines.push('---');
        for (const [key, value] of Object.entries(matrix.data.frontmatter)) {
            lines.push(`${key}: ${JSON.stringify(value)}`);
        }
        lines.push('---');
        lines.push('');
    }

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

    // Matrix type heading
    lines.push('## Matrix type - Eisenhower');
    lines.push('');
    lines.push('```priority-matrix');
    lines.push('```');
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
    lines.push(JSON.stringify(matrix.data.settings, null, 2));
    lines.push('```');
    lines.push('');

    return lines.join('\n');
}

