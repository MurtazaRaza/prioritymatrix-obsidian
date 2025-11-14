import { fromMarkdown } from 'mdast-util-from-markdown';
import { gfmTaskListItemFromMarkdown } from 'mdast-util-gfm-task-list-item';
import { gfmTaskListItem } from 'micromark-extension-gfm-task-list-item';
import type { Root } from 'mdast';

export interface ParsedMarkdown {
    frontmatter: Record<string, any>;
    settings: string | null;
    content: string;
    ast: Root;
}

/**
 * Parse markdown content into AST and extract frontmatter/settings
 */
export function parseMarkdown(md: string): ParsedMarkdown {
    // Extract frontmatter
    const frontmatterMatch = md.match(/^---\n([\s\S]*?)\n---\n/);
    let frontmatter: Record<string, any> = {};
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
                        frontmatter[key] = JSON.parse(value);
                    } catch {
                        frontmatter[key] = value;
                    }
                }
            });
        } catch (e) {
            // Ignore frontmatter parsing errors
        }
        contentWithoutFrontmatter = md.slice(frontmatterMatch[0].length);
    }

    // Extract settings JSON block (```json in settingsJson section)
    let settings: string | null = null;
    const settingsMatch = contentWithoutFrontmatter.match(/^##\s+settingsJson\s*\n[\s\S]*?```json\n([\s\S]*?)```/);
    if (settingsMatch) {
        settings = settingsMatch[1].trim();
    }

    // Remove settings block from content for AST parsing
    let contentForAst = contentWithoutFrontmatter;
    if (settingsMatch) {
        contentForAst = contentWithoutFrontmatter.replace(settingsMatch[0], '');
    }

    // Debug: log content being parsed
    console.log('[PriorityMatrix] Content for AST (first 500 chars):', contentForAst.substring(0, 500));
    console.log('[PriorityMatrix] Content length:', contentForAst.length);

    // Parse markdown to AST
    const ast = fromMarkdown(contentForAst, {
        extensions: [gfmTaskListItem],
        mdastExtensions: [gfmTaskListItemFromMarkdown],
    });

    console.log('[PriorityMatrix] AST created, root type:', ast.type);
    console.log('[PriorityMatrix] AST children count:', ast.children?.length || 0);

    return {
        frontmatter,
        settings,
        content: contentForAst,
        ast,
    };
}

