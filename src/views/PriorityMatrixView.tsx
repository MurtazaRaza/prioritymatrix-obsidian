import { TextFileView, WorkspaceLeaf, TFile, TFolder, Platform } from 'obsidian';
import { render, h } from 'preact';
import { Matrix, Item } from '../types';
import { StateManager } from '../state/StateManager';
import { useState } from '../state/useState';
import { Matrix as MatrixComponent } from '../components/Matrix';
import { SettingsModal } from '../settings/SettingsModal';
import PriorityMatrixPlugin from '../../main';
import { createLogger } from '../utils/logger';

export const VIEW_TYPE_PRIORITY_MATRIX = 'priority-matrix-view';

const log = createLogger('PriorityMatrixView');

export class PriorityMatrixView extends TextFileView {
    plugin: PriorityMatrixPlugin;
    private stateManager: StateManager | null = null;
    private isRendered: boolean = false;
    private renderTimeout: number | null = null;
    private isUnloading: boolean = false;
    actionButtons: Record<string, HTMLElement> = {};

    constructor(leaf: WorkspaceLeaf, plugin: PriorityMatrixPlugin) {
        super(leaf);
        this.plugin = plugin;
        log.log('PriorityMatrixView constructor called', {
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
        log.log('setViewData called', {
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
            log.log('setViewData aborted - view is unloading');
            this.data = data; // Still update data for getViewData()
            return;
        }

        this.data = data;

        if (!this.file) {
            log.log('No file available');
            return;
        }

        // Check if this file has priority matrix frontmatter or code block
        if (!this.isPriorityMatrixFile(data)) {
            log.log('File does not appear to be a priority matrix file');
            return;
        }

        // Create or update state manager
        if (!this.stateManager || clear) {
            log.log('Creating new StateManager', { clear, hadStateManager: !!this.stateManager });
            this.stateManager = new StateManager(this.app, this.file);
        }

        // Skip re-parsing if we're currently saving (prevents overwriting state during save)
        const isSaving = this.stateManager.getIsSaving();
        if (isSaving) {
            log.log('Skipping re-parse during save operation');
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
            
            log.log('Comparing incoming data with current state', {
                matches,
                dataLength: dataTrimmed.length,
                expectedLength: expectedTrimmed.length,
                dataStart: dataTrimmed.substring(0, 100),
                expectedStart: expectedTrimmed.substring(0, 100),
                dataEnd: dataTrimmed.substring(Math.max(0, dataTrimmed.length - 100)),
                expectedEnd: expectedTrimmed.substring(Math.max(0, expectedTrimmed.length - 100))
            });

            if (matches) {
                log.log('Incoming data matches current state, skipping re-parse and re-render');
                // Don't re-render if data matches - this prevents unnecessary recreation
                return;
            } else {
                log.log('Data mismatch detected - will re-parse');
            }
        } else {
            log.log('No current state or clear flag is true - will parse', {
                hasCurrentState: !!currentState,
                clear
            });
        }

        // Parse and set state
        log.log('Parsing matrix from data...');
        const matrix = await this.stateManager.getParsedMatrix(data);
        log.log('Parsed matrix:', {
            todoItems: matrix.data.banks.todo.length,
            q1Items: matrix.children.find(q => q.id === 'q1')?.children.length || 0,
            q2Items: matrix.children.find(q => q.id === 'q2')?.children.length || 0,
            q3Items: matrix.children.find(q => q.id === 'q3')?.children.length || 0,
            q4Items: matrix.children.find(q => q.id === 'q4')?.children.length || 0,
            doneItems: matrix.data.banks.done.length
        });

        // Clear any pending render timeout
        if (this.renderTimeout !== null) {
            log.log('Clearing pending render timeout');
            clearTimeout(this.renderTimeout);
        }

        // Render after a brief delay to ensure state is set, and debounce rapid calls
        log.log('Scheduling render');
        this.renderTimeout = window.setTimeout(() => {
            log.log('Render timeout fired, calling render()');
            this.render();
            this.renderTimeout = null;
            // Re-initialize header buttons after render
            this.initHeaderButtons();
        }, 0);
    }

    clear(): void {
        log.log('clear() called', {
            file: this.file?.path,
            isRendered: this.isRendered
        });
        this.data = '';
        this.contentEl.empty();
        this.isRendered = false;
        
        // Remove action buttons
        Object.values(this.actionButtons).forEach((b) => b.remove());
        this.actionButtons = {};
    }

    onload(): void {
        log.log('onload() called', { file: this.file?.path });
        super.onload();
        
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
        
        this.initHeaderButtons();
        
        // Load data when view loads
        if (this.file) {
            log.log('Reading file in onload()');
            this.app.vault.read(this.file).then(data => {
                log.log('File read in onload(), calling setViewData with clear=true');
                this.setViewData(data, true);
            });
        }
    }

    onunload(): void {
        const stackTrace = new Error().stack;
        log.log('onunload() called', {
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
        log.log('render() called', {
            file: this.file?.path,
            hasStateManager: !!this.stateManager,
            hasFile: !!this.file,
            isRendered: this.isRendered,
            hasContainer: !!this.contentEl.querySelector('.priority-matrix-view'),
            stackTrace: stackTrace?.split('\n').slice(1, 5).join('\n')
        });

        if (!this.stateManager || !this.file) {
            log.log('render() aborted - missing stateManager or file');
            return;
        }

        // Get or create container - only clear and recreate if container doesn't exist
        // This prevents unnecessary DOM recreation when setViewData is called multiple times
        let container = this.contentEl.querySelector('.priority-matrix-view') as HTMLElement;
        const containerExisted = !!container;
        
        if (!container) {
            log.log('Container does not exist - creating new container and clearing contentEl');
            this.contentEl.empty();
            container = this.contentEl.createDiv();
            container.addClass('priority-matrix-view');
            this.isRendered = true;
        } else {
            log.log('Container exists - reusing it (no DOM recreation)');
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
        log.log('Calling Preact render()', {
            containerExisted,
            willRecreateDOM: !containerExisted
        });
        render(<MatrixWrapper />, container);
        log.log('Preact render() completed');
    }

    async onOpen(): Promise<void> {
        log.log('onOpen() called', { file: this.file?.path });
        // Load initial data
        if (this.file) {
            log.log('Reading file in onOpen()');
            const data = await this.app.vault.read(this.file);
            log.log('File read in onOpen(), calling setViewData with clear=true');
            await this.setViewData(data, true);
        }
    }

    async onClose(): Promise<void> {
        log.log('onClose() called', {
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
                log.log('File exists, saving before close');
                await this.stateManager.save();
            } else {
                log.log('File does not exist (likely being deleted), skipping save');
            }
        }
    }

    async refreshTodos(): Promise<void> {
        if (!this.stateManager || !this.file) return;

        const matrix = this.stateManager.getState();
        if (!matrix) return;

        // Get settings from matrix
        const settings = matrix.data.settings;
        log.log('PriorityMatrixView - settings from matrix:', settings);
        log.log('PriorityMatrixView - settings.includePath:', settings.includePath);
        // Default to the folder where the matrix note is located
        const matrixFolder = this.file.parent;
        log.log('PriorityMatrixView - matrixFolder:', matrixFolder?.path || 'null');
        
        // Respect explicit root path ('/') - don't default to matrix folder if user set it to '/'
        const includePath = settings.includePath !== undefined && settings.includePath !== null && settings.includePath !== ''
            ? settings.includePath 
            : (matrixFolder ? matrixFolder.path : '/');
        log.log('PriorityMatrixView - resolved includePath:', includePath);
        const recursive = settings.recursive !== false;
        const todoTag = settings.todoTag || 'TODO';
        const maxFiles = settings.maxFiles || 99999;

        // Resolve include root folder
        // If includePath is explicitly '/', use vault root
        // Otherwise, normalize the path and resolve it
        const normalized = includePath === '/' ? '' : includePath.replace(/^\/*|\/*$/g, '');
        const includeRoot = normalized.length === 0 
            ? this.app.vault.getRoot()  // Always use vault root when path is '/' or empty
            : this.app.vault.getAbstractFileByPath(normalized);
        
        if (!(includeRoot instanceof TFolder)) {
            log.log('Invalid include path:', includePath);
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

        // Exemption list: skip any paths present
        const exemptSet = new Set<string>((settings.exemptPaths || []).map(p => p.trim()).filter(Boolean));
        const filteredResults = results.filter(path => !exemptSet.has(path));

        // Get all existing item paths from all sections (TODO, Q1-Q4, DONE)
        const existingPaths = new Set<string>();
        
        // Collect from TODO bank
        matrix.data.banks.todo.forEach(item => {
            // Prefer resolved file path if available, fallback to wikilink text
            const filePath = item.data.metadata.fileAccessor?.path;
            if (filePath) {
                existingPaths.add(filePath);
                return;
            }
            const match = item.data.titleRaw.match(/\[\[([^\]]+)\]\]/);
            if (match) {
                const path = match[1].split('|')[0].trim();
                existingPaths.add(path);
            }
        });
        
        // Collect from DONE bank
        matrix.data.banks.done.forEach(item => {
            const filePath = item.data.metadata.fileAccessor?.path;
            if (filePath) {
                existingPaths.add(filePath);
                return;
            }
            const match = item.data.titleRaw.match(/\[\[([^\]]+)\]\]/);
            if (match) {
                const path = match[1].split('|')[0].trim();
                existingPaths.add(path);
            }
        });
        
        // Collect from all quadrants (Q1-Q4)
        matrix.children.forEach(quadrant => {
            quadrant.children.forEach(item => {
                const filePath = item.data.metadata.fileAccessor?.path;
                if (filePath) {
                    existingPaths.add(filePath);
                    return;
                }
                const match = item.data.titleRaw.match(/\[\[([^\]]+)\]\]/);
                if (match) {
                    const path = match[1].split('|')[0].trim();
                    existingPaths.add(path);
                }
            });
        });
        
        log.log(`Found ${existingPaths.size} existing items in matrix`);

        // Add new items
        const newItems = filteredResults
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
            
            log.log(`Added ${newItems.length} new TODO items`);
        } else {
            log.log('No new TODO items found');
        }
    }

    /**
     * Get matrix settings modal
     */
    getMatrixSettings(): void {
        if (!this.stateManager || !this.file) return;

        const matrix = this.stateManager.getState();
        if (!matrix) return;

        new SettingsModal(
            this,
            {
                onSettingsChange: (settings) => {
                    const updatedMatrix: Matrix = {
                        ...matrix,
                        data: {
                            ...matrix.data,
                            settings: settings,
                        },
                    };

                    // Save to disk
                    this.stateManager?.setState(updatedMatrix);
                    this.stateManager?.save();
                },
            },
            matrix.data.settings
        ).open();
    }

    /**
     * Initialize header buttons (debounced)
     */
    private _initHeaderButtons = async () => {
        if (Platform.isPhone) return;
        if (!this.stateManager) return;

        // Add settings button if it doesn't exist
        if (!this.actionButtons['show-matrix-settings']) {
            this.actionButtons['show-matrix-settings'] = this.addAction(
                'lucide-settings',
                'Open matrix settings',
                () => {
                    this.getMatrixSettings();
                }
            );
        }
    };

    /**
     * Debounced version of initHeaderButtons
     */
    initHeaderButtons = (() => {
        let timeout: number | null = null;
        return () => {
            if (timeout !== null) {
                clearTimeout(timeout);
            }
            timeout = window.setTimeout(() => {
                this._initHeaderButtons();
                timeout = null;
            }, 10);
        };
    })();
}

function escapeRegExp(s: string): string {
    return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

