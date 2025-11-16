import { TextFileView, WorkspaceLeaf, TFile, TFolder } from 'obsidian';
import { render, h } from 'preact';
import { Matrix, Item } from '../types';
import { StateManager } from '../state/StateManager';
import { useState } from '../state/useState';
import { Matrix as MatrixComponent } from '../components/Matrix';

export const VIEW_TYPE_PRIORITY_MATRIX = 'priority-matrix-view';

export class PriorityMatrixView extends TextFileView {
    private stateManager: StateManager | null = null;
    private isRendered: boolean = false;
    private renderTimeout: number | null = null;
    private isUnloading: boolean = false;

    constructor(leaf: WorkspaceLeaf) {
        super(leaf);
        console.log('[PriorityMatrix] PriorityMatrixView constructor called', {
            file: this.file?.path
        });
    }

    getViewType(): string {
        return VIEW_TYPE_PRIORITY_MATRIX;
    }

    getViewData(): string {
        // Return current markdown content
        return this.data;
    }

    async setViewData(data: string, clear: boolean): Promise<void> {
        const stackTrace = new Error().stack;
        console.log('[PriorityMatrix] setViewData called', {
            file: this.file?.path,
            clear,
            dataLength: data.length,
            isRendered: this.isRendered,
            hasStateManager: !!this.stateManager,
            isUnloading: this.isUnloading,
            stackTrace: stackTrace?.split('\n').slice(1, 5).join('\n')
        });

        // Don't process if we're unloading - this prevents re-rendering during unload
        if (this.isUnloading) {
            console.log('[PriorityMatrix] setViewData aborted - view is unloading');
            this.data = data; // Still update data for getViewData()
            return;
        }

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
            console.log('[PriorityMatrix] Creating new StateManager', { clear, hadStateManager: !!this.stateManager });
            this.stateManager = new StateManager(this.app, this.file);
        }

        // Skip re-parsing if we're currently saving (prevents overwriting state during save)
        const isSaving = this.stateManager.getIsSaving();
        if (isSaving) {
            console.log('[PriorityMatrix] Skipping re-parse during save operation');
            return;
        }

        // If we have existing state, check if the incoming data matches what we would generate
        // This prevents re-parsing (and losing order) when the file change is from our own save
        const currentState = this.stateManager.getState();
        if (currentState && !clear) {
            const { matrixToMd } = await import('../parsers/MatrixFormat');
            const expectedMd = matrixToMd(currentState);
            const dataTrimmed = data.trim();
            const expectedTrimmed = expectedMd.trim();
            const matches = dataTrimmed === expectedTrimmed;
            
            console.log('[PriorityMatrix] Comparing incoming data with current state', {
                matches,
                dataLength: dataTrimmed.length,
                expectedLength: expectedTrimmed.length,
                dataStart: dataTrimmed.substring(0, 100),
                expectedStart: expectedTrimmed.substring(0, 100),
                dataEnd: dataTrimmed.substring(Math.max(0, dataTrimmed.length - 100)),
                expectedEnd: expectedTrimmed.substring(Math.max(0, expectedTrimmed.length - 100))
            });

            if (matches) {
                console.log('[PriorityMatrix] Incoming data matches current state, skipping re-parse and re-render');
                // Don't re-render if data matches - this prevents unnecessary recreation
                return;
            } else {
                console.log('[PriorityMatrix] Data mismatch detected - will re-parse');
            }
        } else {
            console.log('[PriorityMatrix] No current state or clear flag is true - will parse', {
                hasCurrentState: !!currentState,
                clear
            });
        }

        // Parse and set state
        console.log('[PriorityMatrix] Parsing matrix from data...');
        const matrix = await this.stateManager.getParsedMatrix(data);
        console.log('[PriorityMatrix] Parsed matrix:', {
            todoItems: matrix.data.banks.todo.length,
            q1Items: matrix.children.find(q => q.id === 'q1')?.children.length || 0,
            q2Items: matrix.children.find(q => q.id === 'q2')?.children.length || 0,
            q3Items: matrix.children.find(q => q.id === 'q3')?.children.length || 0,
            q4Items: matrix.children.find(q => q.id === 'q4')?.children.length || 0,
            doneItems: matrix.data.banks.done.length
        });

        // Clear any pending render timeout
        if (this.renderTimeout !== null) {
            console.log('[PriorityMatrix] Clearing pending render timeout');
            clearTimeout(this.renderTimeout);
        }

        // Render after a brief delay to ensure state is set, and debounce rapid calls
        console.log('[PriorityMatrix] Scheduling render');
        this.renderTimeout = window.setTimeout(() => {
            console.log('[PriorityMatrix] Render timeout fired, calling render()');
            this.render();
            this.renderTimeout = null;
        }, 0);
    }

    clear(): void {
        console.log('[PriorityMatrix] clear() called', {
            file: this.file?.path,
            isRendered: this.isRendered
        });
        this.data = '';
        this.contentEl.empty();
        this.isRendered = false;
    }

    onload(): void {
        console.log('[PriorityMatrix] onload() called', { file: this.file?.path });
        super.onload();
        
        // Add header action buttons
        this.addAction('refresh-cw', 'Refresh TODOs', async () => {
            await this.refreshTodos();
        });
        
        this.addAction('file-text', 'Open as Markdown', async () => {
            if (this.file) {
                // Signal main.ts to suppress next auto-switch back to matrix
                this.app.workspace.trigger('priority-matrix:suppress-next-autoswitch', this.file.path);
                // Switch in the same tab/leaf
                const leaf = this.leaf;
                if (leaf) {
                    await leaf.setViewState({
                        type: 'markdown',
                        state: { file: this.file.path },
                    });
                }
            }
        });
        
        // Load data when view loads
        if (this.file) {
            console.log('[PriorityMatrix] Reading file in onload()');
            this.app.vault.read(this.file).then(data => {
                console.log('[PriorityMatrix] File read in onload(), calling setViewData with clear=true');
                this.setViewData(data, true);
            });
        }
    }

    onunload(): void {
        const stackTrace = new Error().stack;
        console.log('[PriorityMatrix] onunload() called', {
            file: this.file?.path,
            isRendered: this.isRendered,
            hasStateManager: !!this.stateManager,
            stackTrace: stackTrace?.split('\n').slice(1, 5).join('\n')
        });
        
        // Set flag to prevent setViewData from processing during unload
        this.isUnloading = true;
        
        if (this.renderTimeout !== null) {
            clearTimeout(this.renderTimeout);
            this.renderTimeout = null;
        }
        render(null, this.contentEl);
        this.isRendered = false;
        super.onunload();
    }

    private isPriorityMatrixFile(data: string): boolean {
        // Check for frontmatter marker or section headings
        return (data.includes('do-not-delete:') && data.includes('priority-matrix-plugin')) ||
               data.match(/^##\s+(TODO|Q1|Q2|Q3|Q4|DONE)/m) !== null;
    }

    private render(): void {
        const stackTrace = new Error().stack;
        console.log('[PriorityMatrix] render() called', {
            file: this.file?.path,
            hasStateManager: !!this.stateManager,
            hasFile: !!this.file,
            isRendered: this.isRendered,
            hasContainer: !!this.contentEl.querySelector('.priority-matrix-view'),
            stackTrace: stackTrace?.split('\n').slice(1, 5).join('\n')
        });

        if (!this.stateManager || !this.file) {
            console.log('[PriorityMatrix] render() aborted - missing stateManager or file');
            return;
        }

        // Get or create container - only clear and recreate if container doesn't exist
        // This prevents unnecessary DOM recreation when setViewData is called multiple times
        let container = this.contentEl.querySelector('.priority-matrix-view') as HTMLElement;
        const containerExisted = !!container;
        
        if (!container) {
            console.log('[PriorityMatrix] Container does not exist - creating new container and clearing contentEl');
            this.contentEl.empty();
            container = this.contentEl.createDiv();
            container.addClass('priority-matrix-view');
            this.isRendered = true;
        } else {
            console.log('[PriorityMatrix] Container exists - reusing it (no DOM recreation)');
        }

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

        // Preact's render function handles updates to existing DOM efficiently
        // Always call render - it will diff and update only what changed
        console.log('[PriorityMatrix] Calling Preact render()', {
            containerExisted,
            willRecreateDOM: !containerExisted
        });
        render(<MatrixWrapper />, container);
        console.log('[PriorityMatrix] Preact render() completed');
    }

    async onOpen(): Promise<void> {
        console.log('[PriorityMatrix] onOpen() called', { file: this.file?.path });
        // Load initial data
        if (this.file) {
            console.log('[PriorityMatrix] Reading file in onOpen()');
            const data = await this.app.vault.read(this.file);
            console.log('[PriorityMatrix] File read in onOpen(), calling setViewData with clear=true');
            await this.setViewData(data, true);
        }
    }

    async onClose(): Promise<void> {
        console.log('[PriorityMatrix] onClose() called', {
            file: this.file?.path,
            hasStateManager: !!this.stateManager,
            fileExists: this.file ? this.app.vault.getAbstractFileByPath(this.file.path) !== null : false
        });
        
        // Set flag early to prevent setViewData from processing during close/unload
        // This prevents re-rendering when file changes trigger setViewData
        this.isUnloading = true;
        
        // Save before closing, but only if file still exists (not being deleted)
        if (this.stateManager && this.file) {
            const fileStillExists = this.app.vault.getAbstractFileByPath(this.file.path) !== null;
            if (fileStillExists) {
                console.log('[PriorityMatrix] File exists, saving before close');
                await this.stateManager.save();
            } else {
                console.log('[PriorityMatrix] File does not exist (likely being deleted), skipping save');
            }
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

