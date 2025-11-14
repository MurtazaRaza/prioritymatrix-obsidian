import { App } from 'obsidian';
import { Matrix, Quadrant, Item, MatrixBanks } from '../../types';
import { UnhydratedMatrix, UnhydratedItem } from '../formats/matrix';

/**
 * Hydrate unhydrated matrix by adding computed properties
 */
export function hydrateMatrix(
    unhydrated: UnhydratedMatrix,
    app: App,
    filePath: string
): Matrix {
    const quadrants: Quadrant[] = [
        {
            id: 'q1',
            children: unhydrated.quadrants.q1.map(item => hydrateItem(item, app, filePath)),
            data: {
                title: 'Q1: Do',
                urgent: true,
                important: true,
            },
        },
        {
            id: 'q2',
            children: unhydrated.quadrants.q2.map(item => hydrateItem(item, app, filePath)),
            data: {
                title: 'Q2: Plan',
                urgent: false,
                important: true,
            },
        },
        {
            id: 'q3',
            children: unhydrated.quadrants.q3.map(item => hydrateItem(item, app, filePath)),
            data: {
                title: 'Q3: Delegate',
                urgent: true,
                important: false,
            },
        },
        {
            id: 'q4',
            children: unhydrated.quadrants.q4.map(item => hydrateItem(item, app, filePath)),
            data: {
                title: 'Q4: Eliminate',
                urgent: false,
                important: false,
            },
        },
    ];

    const banks: MatrixBanks = {
        todo: unhydrated.banks.todo.map(item => hydrateItem(item, app, filePath)),
        done: unhydrated.banks.done.map(item => hydrateItem(item, app, filePath)),
    };

    return {
        id: filePath,
        children: quadrants,
        data: {
            settings: unhydrated.settings,
            frontmatter: unhydrated.frontmatter,
            banks,
            errors: unhydrated.errors,
        },
    };
}

function hydrateItem(
    unhydrated: UnhydratedItem,
    app: App,
    filePath: string
): Item {
    // Resolve wikilink to file if it's a wikilink
    let fileAccessor = undefined;
    const wikilinkMatch = unhydrated.titleRaw.match(/\[\[([^\]]+)\]\]/);
    if (wikilinkMatch) {
        const linkContent = wikilinkMatch[1];
        const [path, alias] = linkContent.split('|');
        const resolved = app.metadataCache.getFirstLinkpathDest(path.trim(), filePath);
        if (resolved) {
            fileAccessor = resolved;
        }
    }

    // Extract display title (use alias if available, otherwise filename)
    let title = unhydrated.titleRaw;
    if (wikilinkMatch) {
        const linkContent = wikilinkMatch[1];
        const [path, alias] = linkContent.split('|');
        if (alias) {
            title = alias.trim();
        } else if (fileAccessor) {
            title = fileAccessor.basename;
        } else {
            title = path.trim().split('/').pop() || path.trim();
        }
    }

    return {
        id: unhydrated.id,
        data: {
            title,
            titleRaw: unhydrated.titleRaw,
            checked: unhydrated.checked,
            metadata: {
                fileAccessor,
            },
        },
    };
}

