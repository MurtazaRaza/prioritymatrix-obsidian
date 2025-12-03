import { visit } from 'unist-util-visit';
import type { Node } from 'unist';
import type { Heading, List, ListItem } from 'mdast';
import { MatrixSettings, ErrorReport } from '../../types';
import { DEFAULT_SETTINGS, parseSettingsFromJson } from '../../settings';
import { ParsedMarkdown } from '../parseMarkdown';
import { createLogger } from '../../utils/logger';

type Section = 'none' | 'todo' | 'q1' | 'q2' | 'q3' | 'q4' | 'done';

export interface UnhydratedItem {
    id: string;
    titleRaw: string;
    checked: boolean;
    section: Section;
}

export interface UnhydratedMatrix {
    quadrants: {
        q1: UnhydratedItem[];
        q2: UnhydratedItem[];
        q3: UnhydratedItem[];
        q4: UnhydratedItem[];
    };
    banks: {
        todo: UnhydratedItem[];
        done: UnhydratedItem[];
    };
    settings: MatrixSettings;
    frontmatter: Record<string, unknown>;
    errors: ErrorReport[];
}

type NodeLike = {
    type?: string;
    value?: unknown;
    url?: unknown;
    children?: NodeLike[];
};

function isTextNode(node: NodeLike): node is NodeLike & { type: 'text'; value: string } {
    return node.type === 'text' && typeof node.value === 'string';
}

function isLinkNode(node: NodeLike): node is NodeLike & { type: 'link'; url: string } {
    return node.type === 'link' && typeof node.url === 'string';
}

function hasChildren(node: NodeLike): node is NodeLike & { children: NodeLike[] } {
    return Array.isArray(node.children);
}

/**
 * Extract text content from a node (handles text, links, etc.)
 */
function extractText(node: NodeLike): string {
    if (isTextNode(node)) {
        return node.value;
    }
    if (isLinkNode(node) && node.children) {
        return extractTextFromChildren(node.children);
    }
    if (hasChildren(node)) {
        return extractTextFromChildren(node.children);
    }
    return '';
}

function extractTextFromChildren(children: NodeLike[]): string {
    return children.map(child => extractText(child)).join('');
}

type TaskListItem = ListItem & { checked?: boolean | null };

/**
 * Convert a list item to an unhydrated item
 */
function listItemToUnhydratedItem(listItem: ListItem, section: Section): UnhydratedItem | null {
    // Check if it's a task list item
    const checked = (listItem as TaskListItem).checked === true;
    
    // Extract all text content from the list item (including from paragraph children)
    let titleRaw = '';
    let foundWikilink: { path: string; alias?: string } | null = null;
    
    // Traverse all nodes in the list item to extract text
    visit(listItem, (node) => {
        if (node.type === 'text') {
            const text = node.value;
            // Check for wikilink pattern in text: [[path]] or [[path|alias]]
            const wikilinkMatch = text.match(/\[\[([^\]]+)\]\]/);
            if (wikilinkMatch) {
                const content = wikilinkMatch[1];
                const [path, alias] = content.split('|');
                foundWikilink = { path: path.trim(), alias: alias?.trim() };
                titleRaw = text; // Keep the full text including wikilink brackets
            } else {
                titleRaw += text;
            }
        }
    });

    // If no text found, try extracting from children directly
    if (!titleRaw.trim() && listItem.children) {
        titleRaw = extractTextFromChildren(listItem.children);
        // Check again for wikilink in the extracted text
        const wikilinkMatch = titleRaw.match(/\[\[([^\]]+)\]\]/);
        if (wikilinkMatch) {
            const content = wikilinkMatch[1];
            const [path, alias] = content.split('|');
            foundWikilink = { path: path.trim(), alias: alias?.trim() };
        }
    }

    // Determine item ID and format titleRaw
    let itemId = '';
    if (foundWikilink) {
        itemId = foundWikilink.path;
        // Ensure titleRaw is properly formatted as wikilink
        if (foundWikilink.alias) {
            titleRaw = `[[${foundWikilink.path}|${foundWikilink.alias}]]`;
        } else {
            titleRaw = `[[${foundWikilink.path}]]`;
        }
    } else {
        // Use text as ID if no wikilink
        itemId = titleRaw.trim();
    }

    if (!titleRaw.trim()) {
        return null;
    }

    return {
        id: itemId,
        titleRaw: titleRaw.trim(),
        checked,
        section,
    };
}

/**
 * Convert AST to unhydrated matrix structure
 */
const log = createLogger('matrixParser');

export function astToUnhydratedMatrix(parsed: ParsedMarkdown): UnhydratedMatrix {
    const matrix: UnhydratedMatrix = {
        quadrants: {
            q1: [],
            q2: [],
            q3: [],
            q4: [],
        },
        banks: {
            todo: [],
            done: [],
        },
        settings: (() => {
            // log.log('astToUnhydratedMatrix - parsed.settings value', parsed.settings);
            // log.log('astToUnhydratedMatrix - parsed.settings type', typeof parsed.settings);
            // log.log('astToUnhydratedMatrix - parsed.settings truthy?', !!parsed.settings);
            const result = parsed.settings ? parseSettingsFromJson(parsed.settings) : DEFAULT_SETTINGS;
            // log.log('astToUnhydratedMatrix - parsed settings result', result);
            // log.log('astToUnhydratedMatrix - result.includePath', result.includePath);
            return result;
        })(),
        frontmatter: parsed.frontmatter,
        errors: [],
    };

    let currentSection: Section = 'none';
    const ast = parsed.ast;

    // First pass: collect all headings and their positions
    const headings: Array<{ text: string; section: Section; rawText: string }> = [];
    visit(ast, (node: Node) => {
        // Log all node types we encounter
        if (node.type === 'heading') {
            const heading = node as Heading;
            const rawText = extractTextFromChildren(heading.children);
            const text = rawText.toLowerCase().trim();
            let section: Section = 'none';
            
            log.log(`Found heading node: depth=${heading.depth}, rawText="${rawText}", normalized="${text}"`);
            
            if (text === 'todo') {
                section = 'todo';
            } else if (text === 'q1') {
                section = 'q1';
            } else if (text === 'q2') {
                section = 'q2';
            } else if (text === 'q3') {
                section = 'q3';
            } else if (text === 'q4') {
                section = 'q4';
            } else if (text === 'done') {
                section = 'done';
            }
            
            headings.push({ text, section, rawText });
            if (section !== 'none') {
                log.log(`Recognized heading: "${text}" -> section: ${section}`);
            } else {
                log.log(`Unrecognized heading: "${text}" (raw: "${rawText}")`);
            }
        }
    });
    
    log.log('Total headings found', headings.length);

    // Second pass: process nodes and track current section
    visit(ast, (node: Node) => {
        // Detect section headings
        if (node.type === 'heading') {
            const heading = node as Heading;
            const text = extractTextFromChildren(heading.children).toLowerCase().trim();
            
            if (text === 'todo') {
                currentSection = 'todo';
                log.log('Entering TODO section');
            } else if (text === 'q1') {
                currentSection = 'q1';
                log.log('Entering Q1 section');
            } else if (text === 'q2') {
                currentSection = 'q2';
                log.log('Entering Q2 section');
            } else if (text === 'q3') {
                currentSection = 'q3';
                log.log('Entering Q3 section');
            } else if (text === 'q4') {
                currentSection = 'q4';
                log.log('Entering Q4 section');
            } else if (text === 'done') {
                currentSection = 'done';
                log.log('Entering DONE section');
            } else {
                // Don't reset to 'none' if we're already in a section
                // Only reset if this is a different heading
                if (!headings.some(h => h.text === text)) {
                    log.log(`Unknown heading: "${text}", keeping current section: ${currentSection}`);
                }
            }
            return;
        }

        // Process list items
        if (node.type === 'list') {
            const list = node as List;
            if (currentSection === 'none') {
                log.log('List found but no active section. Current headings found', headings);
                // Try to infer section from parent or previous siblings
                return;
            }

            log.log(`Processing list in section: ${currentSection}, items: ${list.children.length}`);
            list.children.forEach((listItem) => {
                const item = listItemToUnhydratedItem(listItem, currentSection);
                if (!item) {
                    log.log('Failed to parse list item');
                    return;
                }

                log.log(`Parsed item: ${item.titleRaw} in ${currentSection}`);

                if (currentSection === 'todo') {
                    if (item.checked) {
                        matrix.banks.done.push(item);
                    } else {
                        matrix.banks.todo.push(item);
                    }
                } else if (currentSection === 'done') {
                    matrix.banks.done.push(item);
                } else if (currentSection === 'q1') {
                    matrix.quadrants.q1.push(item);
                } else if (currentSection === 'q2') {
                    matrix.quadrants.q2.push(item);
                } else if (currentSection === 'q3') {
                    matrix.quadrants.q3.push(item);
                } else if (currentSection === 'q4') {
                    matrix.quadrants.q4.push(item);
                }
            });
        }
    });

    return matrix;
}

