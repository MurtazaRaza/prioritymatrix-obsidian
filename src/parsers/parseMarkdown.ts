import { fromMarkdown } from 'mdast-util-from-markdown';
import { gfmTaskListItemFromMarkdown } from 'mdast-util-gfm-task-list-item';
import { gfmTaskListItem } from 'micromark-extension-gfm-task-list-item';
import type { Root } from 'mdast';
import { createLogger } from '../utils/logger';

export interface ParsedMarkdown {
    frontmatter: Record<string, unknown>;
    settings: string | null;
    content: string;
    ast: Root;
}

const log = createLogger('parseMarkdown');

/**
 * Parse markdown content into AST and extract frontmatter/settings
 */
export function parseMarkdown(md: string): ParsedMarkdown {
    // Extract frontmatter
    const frontmatterMatch = md.match(/^---\n([\s\S]*?)\n---\n/);
    const frontmatter: Record<string, unknown> = {};
    let contentWithoutFrontmatter = md;
    
    if (frontmatterMatch) {
        try {
            const frontmatterText = frontmatterMatch[1];
            // Simple YAML-like parsing (basic key-value pairs)
            frontmatterText.split('\n').forEach(line => {
                const match = line.match(/^(\w+):\s*(.+)$/);
                if (match) {
                    const key = match[1];
                    const value = match[2].trim();
                    // Try to parse as JSON, otherwise use as string
                    try {
                        const parsedValue: unknown = JSON.parse(value);
                        frontmatter[key] = parsedValue;
                    } catch {
                        frontmatter[key] = value;
                    }
                }
            });
        } catch {
            // Ignore frontmatter parsing errors
        }
        contentWithoutFrontmatter = md.slice(frontmatterMatch[0].length);
    }

    // Extract settings JSON block (```json in settingsJson section)
    // Match heading, then any whitespace/newlines, then ```json, then capture JSON content, then closing ```
    let settings: string | null = null;
    let settingsMatch: RegExpMatchArray | null = null;
    
    // Try primary pattern first (more strict)
    settingsMatch = contentWithoutFrontmatter.match(/^##\s+settingsJson\s*[\r\n]+[\s\S]*?```json\s*[\r\n]+([\s\S]*?)```/);
    if (settingsMatch) {
        settings = settingsMatch[1].trim();
        log.log('extracted settings string', settings);
        log.log('settings string length', settings.length);
    } else {
        log.log('NO settings match found with primary pattern');
        // Try a more flexible pattern as fallback (matches anywhere, handles any whitespace)
        settingsMatch = contentWithoutFrontmatter.match(/##\s+settingsJson[\s\S]*?```json\s*([\s\S]*?)```/);
        if (settingsMatch) {
            settings = settingsMatch[1].trim();
            log.log('fallback pattern matched, extracted', settings);
            log.log('settings string length', settings.length);
        } else {
            log.log('NO settings match found with fallback pattern either');
        }
    }

    // Remove settings block from content for AST parsing
    let contentForAst = contentWithoutFrontmatter;
    if (settingsMatch) {
        contentForAst = contentWithoutFrontmatter.replace(settingsMatch[0], '');
    }

    // Debug: log content being parsed
    // log.log('Content for AST (first 500 chars)', contentForAst.substring(0, 500));
    // log.log('Content length', contentForAst.length);

    // Parse markdown to AST
    const ast = fromMarkdown(contentForAst, {
        extensions: [gfmTaskListItem],
        mdastExtensions: [gfmTaskListItemFromMarkdown],
    });

    // log.log('AST created, root type', ast.type);
    // log.log('AST children count', ast.children?.length || 0);

    return {
        frontmatter,
        settings,
        content: contentForAst,
        ast,
    };
}

