import { TextFileView, WorkspaceLeaf, TFile, TFolder } from 'obsidian';
import { render, h } from 'preact';
import { Matrix, Item } from '../types';
import { StateManager } from '../state/StateManager';
import { useState } from '../state/useState';
import { Matrix as MatrixComponent } from '../components/Matrix';

export const VIEW_TYPE_PRIORITY_MATRIX = 'priority-matrix-view';

export class PriorityMatrixView extends TextFileView {
    private stateManager: StateManager | null = null;

    constructor(leaf: WorkspaceLeaf) {
        super(leaf);
    }

    getViewType(): string {
        return VIEW_TYPE_PRIORITY_MATRIX;
    }

    getViewData(): string {
        // Return current markdown content
        return this.data;
    }

    async setViewData(data: string, clear: boolean): Promise<void> {
        this.data = data;

        if (!this.file) {
            console.log('[PriorityMatrix] No file available');
            return;
        }

        // Check if this file has priority matrix frontmatter or code block
        if (!this.isPriorityMatrixFile(data)) {
            console.log('[PriorityMatrix] File does not appear to be a priority matrix file');
            return;
        }

        // Create or update state manager
        if (!this.stateManager || clear) {
            this.stateManager = new StateManager(this.app, this.file);
        }

        // Skip re-parsing if we're currently saving (prevents overwriting state during save)
        if (this.stateManager.getIsSaving()) {
            console.log('[PriorityMatrix] Skipping re-parse during save operation');
            return;
        }

        // If we have existing state, check if the incoming data matches what we would generate
        // This prevents re-parsing (and losing order) when the file change is from our own save
        const currentState = this.stateManager.getState();
        if (currentState && !clear) {
            const { matrixToMd } = await import('../parsers/MatrixFormat');
            const expectedMd = matrixToMd(currentState);
            if (data.trim() === expectedMd.trim()) {
                console.log('[PriorityMatrix] Incoming data matches current state, skipping re-parse');
                return;
            }
        }

        // Parse and set state
        const matrix = await this.stateManager.getParsedMatrix(data);
        console.log('[PriorityMatrix] Parsed matrix:', matrix);
        console.log('[PriorityMatrix] TODO items:', matrix.data.banks.todo.length);
        console.log('[PriorityMatrix] Q1 items:', matrix.children.find(q => q.id === 'q1')?.children.length || 0);

        // Render after a brief delay to ensure state is set
        setTimeout(() => {
            this.render();
        }, 0);
    }

    clear(): void {
        this.data = '';
        this.contentEl.empty();
    }

    onload(): void {
        super.onload();
        // Load data when view loads
        if (this.file) {
            this.app.vault.read(this.file).then(data => {
                this.setViewData(data, true);
            });
        }
    }

    onunload(): void {
        render(null, this.contentEl);
        super.onunload();
    }

    private isPriorityMatrixFile(data: string): boolean {
        // Check for priority-matrix code block or frontmatter
        return data.includes('```priority-matrix') || 
               data.includes('priority-matrix-plugin:') ||
               data.match(/^##\s+(TODO|Q1|Q2|Q3|Q4|DONE)/m) !== null;
    }

    private render(): void {
        if (!this.stateManager || !this.file) {
            return;
        }

        // Get or create root element
        this.contentEl.empty();
        const container = this.contentEl.createDiv();
        container.addClass('priority-matrix-view');

        // Create a wrapper component that uses the hook
        const MatrixWrapper = () => {
            const matrix = useState(this.stateManager!);
            return (
                <MatrixComponent
                    matrix={matrix}
                    stateManager={this.stateManager!}
                    app={this.app}
                />
            );
        };

        // Render Preact component
        render(<MatrixWrapper />, container);
    }

    async onOpen(): Promise<void> {
        // Load initial data
        if (this.file) {
            const data = await this.app.vault.read(this.file);
            await this.setViewData(data, true);
        }
    }

    async onClose(): Promise<void> {
        // Save before closing
        if (this.stateManager) {
            await this.stateManager.save();
        }
    }

    async refreshTodos(): Promise<void> {
        if (!this.stateManager || !this.file) return;

        const matrix = this.stateManager.getState();
        if (!matrix) return;

        // Get settings from matrix
        const settings = matrix.data.settings;
        // Default to the folder where the matrix note is located
        const matrixFolder = this.file.parent;
        const includePath = settings.includePath && settings.includePath !== '/' 
            ? settings.includePath 
            : (matrixFolder ? matrixFolder.path : '/');
        const recursive = settings.recursive !== false;
        const todoTag = settings.todoTag || 'TODO';
        const maxFiles = settings.maxFiles || 99999;

        // Resolve include root folder - default to matrix note's folder
        const normalized = includePath === '/' ? '' : includePath.replace(/^\/*|\/*$/g, '');
        const includeRoot = normalized.length === 0 
            ? (matrixFolder || this.app.vault.getRoot())
            : this.app.vault.getAbstractFileByPath(normalized);
        
        if (!(includeRoot instanceof TFolder)) {
            console.log('[PriorityMatrix] Invalid include path:', includePath);
            return;
        }

        // Scan for TODO files
        const results: string[] = [];
        const tagRegex = new RegExp(`#${escapeRegExp(todoTag)}(?![\w-])`, 'i');

        const walk = async (folder: TFolder) => {
            for (const child of folder.children) {
                if (results.length >= maxFiles) return;
                if (child instanceof TFolder) {
                    if (recursive) {
                        await walk(child);
                    }
                } else if (child instanceof TFile) {
                    if (child.extension.toLowerCase() !== 'md') continue;
                    const content = await this.app.vault.read(child);
                    if (tagRegex.test(content)) {
                        results.push(child.path);
                    }
                }
            }
        };

        await walk(includeRoot);

        // Get all existing item paths from all sections (TODO, Q1-Q4, DONE)
        const existingPaths = new Set<string>();
        
        // Collect from TODO bank
        matrix.data.banks.todo.forEach(item => {
            const match = item.data.titleRaw.match(/\[\[([^\]]+)\]\]/);
            if (match) {
                const path = match[1].split('|')[0].trim(); // Get path part before | if alias exists
                existingPaths.add(path);
            }
        });
        
        // Collect from DONE bank
        matrix.data.banks.done.forEach(item => {
            const match = item.data.titleRaw.match(/\[\[([^\]]+)\]\]/);
            if (match) {
                const path = match[1].split('|')[0].trim();
                existingPaths.add(path);
            }
        });
        
        // Collect from all quadrants (Q1-Q4)
        matrix.children.forEach(quadrant => {
            quadrant.children.forEach(item => {
                const match = item.data.titleRaw.match(/\[\[([^\]]+)\]\]/);
                if (match) {
                    const path = match[1].split('|')[0].trim();
                    existingPaths.add(path);
                }
            });
        });
        
        console.log(`[PriorityMatrix] Found ${existingPaths.size} existing items in matrix`);

        // Add new items
        const newItems = results
            .filter(path => !existingPaths.has(path))
            .map(path => ({
                id: path,
                titleRaw: `[[${path}]]`,
                checked: false,
                section: 'todo' as const,
            }));

        if (newItems.length > 0) {
            // Hydrate new items
            const hydratedItems = newItems.map(unhydrated => {
                const wikilinkMatch = unhydrated.titleRaw.match(/\[\[([^\]]+)\]\]/);
                let fileAccessor = undefined;
                let title = unhydrated.titleRaw;
                
                if (wikilinkMatch && this.file) {
                    const linkContent = wikilinkMatch[1];
                    const [path] = linkContent.split('|');
                    const resolved = this.app.metadataCache.getFirstLinkpathDest(path.trim(), this.file.path);
                    if (resolved) {
                        fileAccessor = resolved;
                        title = resolved.basename;
                    } else {
                        title = path.trim().split('/').pop() || path.trim();
                    }
                }

                return {
                    id: unhydrated.id,
                    data: {
                        title,
                        titleRaw: unhydrated.titleRaw,
                        checked: false,
                        metadata: {
                            fileAccessor,
                        },
                    },
                };
            });

            // Add to TODO bank
            matrix.data.banks.todo.push(...hydratedItems);
            
            // Update state and save
            this.stateManager.setState(matrix);
            await this.stateManager.save();
            
            // Re-render
            this.render();
            
            console.log(`[PriorityMatrix] Added ${newItems.length} new TODO items`);
        } else {
            console.log('[PriorityMatrix] No new TODO items found');
        }
    }
}

function escapeRegExp(s: string): string {
    return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

