import { App, MarkdownView, Menu, Notice, Plugin, PluginSettingTab, Setting, TAbstractFile, TFile, TFolder, WorkspaceLeaf, EventRef } from 'obsidian';
import { PriorityMatrixView, VIEW_TYPE_PRIORITY_MATRIX } from './src/views/PriorityMatrixView';
import { createLogger } from './src/utils/logger';

interface PriorityMatrixPluginSettings {
    includePath: string; // vault-relative folder path
    recursive: boolean;
    todoTag: string; // without leading '#', case-insensitive
    maxFiles: number; // 0 means unlimited
    autoRemoveTodoOnDone: boolean;
    enableStrikethroughOnDone: boolean; // disabled when autoRemoveTodoOnDone is true
}

const DEFAULT_SETTINGS: PriorityMatrixPluginSettings = {
    includePath: '/',
    recursive: true,
    todoTag: 'TODO',
    maxFiles: 99999,
    autoRemoveTodoOnDone: false,
    enableStrikethroughOnDone: true,
}

const log = createLogger('Plugin');

export default class PriorityMatrixPlugin extends Plugin {
    settings: PriorityMatrixPluginSettings;
    private pendingMatrixFiles = new Set<string>();
    private markdownViewsWithActions = new WeakSet<MarkdownView>();
    private suppressAutoSwitch = new Set<string>();

    async onload() {
        await this.loadSettings();

        this.addSettingTab(new PriorityMatrixSettingTab(this.app, this));

        // Register the custom view
        this.registerView(
            VIEW_TYPE_PRIORITY_MATRIX,
            (leaf: WorkspaceLeaf) => new PriorityMatrixView(leaf, this)
        );

        this.addCommand({
            id: 'create-matrix-note',
            name: 'Create matrix note',
            callback: async () => {
                await this.createPriorityMatrixInActiveFolder();
            }
        });

        this.addCommand({
            id: 'open-as-matrix-view',
            name: 'Open as matrix view',
            checkCallback: (checking) => {
                const file = this.app.workspace.getActiveFile();
                // Quick synchronous check (filename only for availability)
                const can = !!file && file.extension === 'md';
                if (!checking && can && file) {
                    // Do full async check and open if valid
                    void this.noteHasPriorityMatrixBlock(file).then(isMatrix => {
                        if (isMatrix) {
                            void this.openAsMatrixView(file);
                        }
                    });
                }
                return can;
            }
        });

        // Also add a command that works from markdown view
        this.addCommand({
            id: 'switch-to-matrix-view',
            name: 'Switch to matrix view',
            checkCallback: (checking) => {
                const file = this.app.workspace.getActiveFile();
                // Quick synchronous check (filename only for availability)
                const can = !!file && file.extension === 'md';
                if (!checking && can && file) {
                    // Do full async check and open if valid
                    void this.noteHasPriorityMatrixBlock(file).then(isMatrix => {
                        if (isMatrix) {
                            void this.openAsMatrixView(file);
                        }
                    });
                }
                return can;
            }
        });

        this.addCommand({
            id: 'open-as-markdown',
            name: "Open as Markdown",
            checkCallback: (checking) => {
                const view = this.app.workspace.getActiveViewOfType(PriorityMatrixView);
                const can = !!view && !!view.file;
                if (!checking && can && view.file) {
                    void this.openAsMarkdownView(view.file);
                }
                return can;
            }
        });

        this.registerEvent(this.app.workspace.on('file-menu', (menu: Menu, file: TAbstractFile) => {
            if (file instanceof TFolder) {
                menu.addItem((item) => {
                    item.setTitle('New matrix note')
                        .setIcon('layout-grid')
                        .onClick(async () => {
                            await this.createPriorityMatrixInFolder(file);
                        });
                });
            }
        }));


        // Listen for a suppression request coming from views before switching to markdown
        type PriorityMatrixWorkspace = {
            on: (name: 'priority-matrix:suppress-next-autoswitch', callback: (path: string) => void) => EventRef;
        };
        const pmWorkspace = this.app.workspace as unknown as PriorityMatrixWorkspace;
        this.registerEvent(
            pmWorkspace.on('priority-matrix:suppress-next-autoswitch', (path: string) => {
                if (typeof path === 'string' && path.length > 0) {
                    this.suppressAutoSwitch.add(path);
                    // Also clear any pending auto-switch for this path
                    this.pendingMatrixFiles.delete(path);
                }
            })
        );

        // When a file is opened, mark it for matrix view if needed and switch immediately
        this.registerEvent(
            this.app.workspace.on('file-open', async (file: TFile) => {
                if (!file || file.extension !== 'md') return;

                // Quick synchronous check first (filename)
                const quickCheck = file.name.toLowerCase().includes('priority matrix');

                let isMatrixFile = false;
                if (quickCheck) {
                    isMatrixFile = true;
                    if (!this.suppressAutoSwitch.has(file.path)) {
                        this.pendingMatrixFiles.add(file.path);
                    }
                } else {
                    // For other files, do async content check
                    isMatrixFile = await this.noteHasPriorityMatrixBlock(file);
                    if (isMatrixFile && !this.suppressAutoSwitch.has(file.path)) {
                        this.pendingMatrixFiles.add(file.path);
                    }
                }

                // Do not switch here; active-leaf-change will handle if pending
            })
        );

        // When a leaf becomes active, check if it should be matrix view
        this.registerEvent(
            this.app.workspace.on('active-leaf-change', async (leaf) => {
                if (!leaf || !leaf.view) {
                    log.log('active-leaf-change: no leaf or view');
                    return;
                }

                const view = leaf.view;
                const viewType = view.getViewType();
                log.log('active-leaf-change event', {
                    viewType,
                    isPriorityMatrixView: view instanceof PriorityMatrixView,
                    file: view instanceof MarkdownView ? view.file?.path : null
                });

                // Don't interfere if it's already a priority matrix view
                if (view instanceof PriorityMatrixView) {
                    log.log('active-leaf-change: already PriorityMatrixView, skipping');
                    return;
                }

                const file = view instanceof MarkdownView ? view.file : null;
                if (!file) {
                    log.log('active-leaf-change: no file');
                    return;
                }

                // If this was an explicit switch to markdown, respect it and clear flags,
                // but DO NOT return; we still want to add header actions below.
                const wasSuppressed = this.suppressAutoSwitch.has(file.path);
                if (wasSuppressed) {
                    this.suppressAutoSwitch.delete(file.path);
                    this.pendingMatrixFiles.delete(file.path);
                }

                // Check if this file is pending (just opened) - only auto-switch for pending files
                const isPending = this.pendingMatrixFiles.has(file.path);

                if (isPending) {
                    // File was just opened and is pending - check if it's a matrix file and switch
                    const isMatrixFile = await this.noteHasPriorityMatrixBlock(file);
                    this.pendingMatrixFiles.delete(file.path);

                    if (isMatrixFile && viewType === 'markdown') {
                        // Only auto-switch if it's a pending file (just opened) and currently in markdown view
                        log.log('active-leaf-change: switching to matrix view (pending file)', {
                            filePath: file.path
                        });
                        await leaf.setViewState({
                            type: VIEW_TYPE_PRIORITY_MATRIX,
                            state: { file: file.path },
                        });
                        log.log('active-leaf-change: view state changed to matrix');
                        return; // Don't add markdown actions since we're switching
                    }
                }

                // For non-pending files (user has already interacted with the file),
                // just add header actions if it's a matrix file, but don't auto-switch
                if (view instanceof MarkdownView && !this.markdownViewsWithActions.has(view)) {
                    const isMatrixFile = await this.noteHasPriorityMatrixBlock(file);
                    if (isMatrixFile) {
                        this.addMarkdownViewActions(view, file);
                        this.markdownViewsWithActions.add(view);
                    }
                }
            })
        );

        // Also check when a markdown view is opened
        this.registerEvent(
            this.app.workspace.on('file-open', async (file: TFile) => {
                if (!file || file.extension !== 'md') return;

                // Wait a bit for the view to be ready
                globalThis.setTimeout(() => {
                    void (async () => {
                        const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
                        if (activeView && activeView.file?.path === file.path && !this.markdownViewsWithActions.has(activeView)) {
                            const isMatrixFile = await this.noteHasPriorityMatrixBlock(file);
                            if (isMatrixFile) {
                                this.addMarkdownViewActions(activeView, file);
                                this.markdownViewsWithActions.add(activeView);
                            }
                        }
                    })();
                }, 100);
            })
        );
    }

    onunload() {
    }

    async loadSettings() {
        const loaded = await this.loadData() as PriorityMatrixPluginSettings | null;
        this.settings = Object.assign({}, DEFAULT_SETTINGS, loaded ?? {});
        if (this.settings.autoRemoveTodoOnDone) {
            this.settings.enableStrikethroughOnDone = false;
        }
    }

    async saveSettings() {
        await this.saveData(this.settings);
    }

    private async openAsMatrixView(file: TFile) {
        // Use the current active leaf instead of creating a new one
        const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
        const leaf = activeView?.leaf || this.app.workspace.getMostRecentLeaf();
        if (leaf) {
            await leaf.setViewState({
                type: VIEW_TYPE_PRIORITY_MATRIX,
                state: { file: file.path },
            });
        }
    }

    private async openAsMarkdownView(file: TFile) {
        // Use the current active leaf instead of creating a new one
        const activeView = this.app.workspace.getActiveViewOfType(PriorityMatrixView);
        const leaf = activeView?.leaf || this.app.workspace.getMostRecentLeaf();
        if (leaf) {
            // Suppress auto-switching back to matrix on the next activation for this file
            this.suppressAutoSwitch.add(file.path);
            await leaf.setViewState({
                type: 'markdown',
                state: { file: file.path },
            });
        }
    }

    private async createPriorityMatrixInActiveFolder() {
        const activeFile = this.app.workspace.getActiveFile();
        const targetFolder = activeFile ? this.app.fileManager.getNewFileParent(activeFile.path) : this.app.vault.getRoot();
        await this.createPriorityMatrixInFolder(targetFolder);
    }

    private async createPriorityMatrixInFolder(folder: TFolder) {
        const filename = await this.getNextMatrixFilename(folder);
        const content = await this.generateMatrixNoteContent(folder);
        // Handle root folder (empty path) correctly
        const filePath = folder.path ? `${folder.path}/${filename}` : filename;
        const file = await this.app.vault.create(filePath, content);
        await this.openAsMatrixView(file);
        new Notice('Priority matrix note created');
    }

    private async getNextMatrixFilename(folder: TFolder): Promise<string> {
        const base = 'Priority Matrix - ';
        let n = 1;
        while (true) {
            const name = `${base}${n}.md`;
            const existing = folder.children.find((c) => c instanceof TFile && c.name.toLowerCase() === name.toLowerCase());
            if (!existing) return name;
            n += 1;
        }
    }

    private async generateMatrixNoteContent(folder: TFolder): Promise<string> {
        const headings = ['TODO', 'Q1', 'Q2', 'Q3', 'Q4', 'DONE', 'settingsJson'];

        const placeholderTodos = [
            '- [ ] Example: Add a TODO (Remove this)',
        ];

        // Use the folder where the matrix note is created as the default include root
        const scannedTodos = await this.scanForTodoFiles(folder);
        const checklistFromScan = scannedTodos.map((p) => `- [ ] [[${p}]]`);

        // Default to the folder where the matrix note is created
        // Normalize empty string (root folder) to "/" for consistency
        log.log('Creating note - folder.path:', folder.path, 'folder.name:', folder.name);
        const effectiveIncludePath = folder.path || '/';
        log.log('Creating note - effectiveIncludePath:', effectiveIncludePath);

        const settingsJson = {
            includePath: effectiveIncludePath,
            recursive: this.settings.recursive,
            todoTag: this.settings.todoTag,
            maxFiles: this.settings.maxFiles,
            autoRemoveTodoOnDone: this.settings.autoRemoveTodoOnDone,
            enableStrikethroughOnDone: this.settings.enableStrikethroughOnDone
        };

        const lines: string[] = [];
        // Frontmatter with do-not-delete marker
        lines.push('---');
        lines.push('do-not-delete: "priority-matrix-plugin"');
        lines.push('---');
        lines.push('');
        // TODO
        lines.push(`## ${headings[0]}`);
        lines.push('');
        lines.push(...placeholderTodos);
        if (checklistFromScan.length > 0) {
            if (placeholderTodos.length > 0) lines.push('');
            lines.push(...checklistFromScan);
        }
        // Q1-Q4
        lines.push(`## ${headings[1]}`);
        lines.push('');
        lines.push(`## ${headings[2]}`);
        lines.push('');
        lines.push(`## ${headings[3]}`);
        lines.push('');
        lines.push(`## ${headings[4]}`);
        lines.push('');
        // DONE
        lines.push(`## ${headings[5]}`);
        lines.push('');
        // Settings JSON block
        lines.push(`## ${headings[6]}`);
        lines.push('');
        lines.push('```json');
        const settingsJsonString = JSON.stringify(settingsJson, null, 2);
        log.log('Creating note - settingsJson to be saved:', settingsJsonString);
        lines.push(settingsJsonString);
        lines.push('```');
        lines.push('');

        return lines.join('\n');
    }

    private async scanForTodoFiles(includeFolderOverride?: TFolder): Promise<string[]> {
        const includeRoot = includeFolderOverride ?? this.resolveIncludeRoot();
        const results: string[] = [];
        const visited: TFile[] = [];
        const max = this.settings.maxFiles === 0 ? Number.MAX_SAFE_INTEGER : this.settings.maxFiles;
        const todoTag = this.settings.todoTag;
        const tagRegex = new RegExp(`#${escapeRegExp(todoTag)}(?![A-Za-z0-9-])`, 'i');

        const walk = async (folder: TFolder) => {
            for (const child of folder.children) {
                if (results.length >= max) return;
                if (child instanceof TFolder) {
                    if (this.settings.recursive) {
                        await walk(child);
                    }
                } else if (child instanceof TFile) {
                    if (child.extension.toLowerCase() !== 'md') continue;
                    visited.push(child);
                    const content = await this.app.vault.read(child);
                    if (tagRegex.test(content)) {
                        results.push(child.path);
                    }
                }
            }
        };

        await walk(includeRoot);
        return results;
    }

    private resolveIncludeRoot(): TFolder {
        const path = this.settings.includePath?.trim() || '/';
        const normalized = path === '/' ? '' : path.replace(/^\/*|\/*$/g, '');
        const target = normalized.length === 0 ? this.app.vault.getRoot() : this.app.vault.getAbstractFileByPath(normalized);
        if (target instanceof TFolder) return target;
        return this.app.vault.getRoot();
    }

    // Check if the note has a priority matrix block or structure
    private async noteHasPriorityMatrixBlock(file: TFile): Promise<boolean> {
        // Only check markdown files
        if (file.extension !== 'md') {
            return false;
        }

        // Quick check: file name suggests it's a matrix
        if (file.name.toLowerCase().includes('priority matrix')) {
            return true;
        }

        // Content check: read the file and check for priority matrix markers
        try {
            const content = await this.app.vault.read(file);
            const hasFrontmatterMarker = /^---\n[\s\S]*?do-not-delete:\s*["']?priority-matrix-plugin["']?[\s\S]*?\n---/m.test(content);
            
            const hasStructuralMarkers = /^##\s+(Q[1-4]|settingsJson)/m.test(content);

            return hasFrontmatterMarker || hasStructuralMarkers;
        } catch {
            // If we can't read the file, fall back to filename check
            return false;
        }
    }

    // Add header actions to markdown view for priority matrix files
    private addMarkdownViewActions(view: MarkdownView, file: TFile): void {
        // Add refresh button - reloads the file to refresh the view
        view.addAction('refresh-cw', 'Refresh note', async () => {
            try {
                // Read current content and modify file to trigger change event
                // This will cause Obsidian to refresh the markdown view
                const content = await this.app.vault.read(file);
                // Modify with same content to trigger file change event
                await this.app.vault.modify(file, content);
            } catch (error) {
                log.error('Error refreshing markdown view:', error);
            }
        });

        // Add switch to matrix view button
        view.addAction('layout-grid', 'Switch to matrix view', async () => {
            await this.openAsMatrixView(file);
        });
    }
}

class PriorityMatrixSettingTab extends PluginSettingTab {
    plugin: PriorityMatrixPlugin;

    constructor(app: App, plugin: PriorityMatrixPlugin) {
        super(app, plugin);
        this.plugin = plugin;
    }

    display(): void {
        const { containerEl } = this;
        containerEl.empty();

        // eslint-disable-next-line obsidianmd/settings-tab/no-problematic-settings-headings
        new Setting(containerEl)
            .setName('Scan options')
            .setHeading();

        new Setting(containerEl)
            .setName('Include folder')
            .setDesc('Vault-relative path to scan for #todo notes (default: /)')
            .addText(text => text
                .setPlaceholder('/')
                .setValue(this.plugin.settings.includePath)
                .onChange(async (value) => {
                    this.plugin.settings.includePath = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('Recursive scan')
            .setDesc('Scan subfolders of include folder')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.recursive)
                .onChange(async (value) => {
                    this.plugin.settings.recursive = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('Todo tag')
            .setDesc('Tag to match (without #), case insensitive')
            .addText(text => text
                .setPlaceholder('TODO')
                .setValue(this.plugin.settings.todoTag)
                .onChange(async (value) => {
                    this.plugin.settings.todoTag = value.trim() || 'TODO';
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('Max files to scan')
            .setDesc('Set 0 for no limit')
            .addText(text => text
                .setPlaceholder('99999')
                .setValue(String(this.plugin.settings.maxFiles))
                .onChange(async (value) => {
                    const n = Number(value);
                    this.plugin.settings.maxFiles = Number.isFinite(n) && n >= 0 ? n : 99999;
                    await this.plugin.saveSettings();
                }));

        // eslint-disable-next-line obsidianmd/settings-tab/no-problematic-settings-headings
        new Setting(containerEl)
            .setName('Behavior options')
            .setHeading();

        new Setting(containerEl)
            .setName('Automatically remove todo on done')
            .setDesc('Remove the todo tag instead of using strikethrough when moved to done')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.autoRemoveTodoOnDone)
                .onChange(async (value) => {
                    this.plugin.settings.autoRemoveTodoOnDone = value;
                    if (value) this.plugin.settings.enableStrikethroughOnDone = false;
                    await this.plugin.saveSettings();
                    this.display();
                }));

        new Setting(containerEl)
            .setName('Use strikethrough for todo on done')
            .setDesc('Replace #todo with ~~#todo~~ when moved to done')
            .addToggle(toggle => toggle
                .setDisabled(this.plugin.settings.autoRemoveTodoOnDone)
                .setValue(this.plugin.settings.enableStrikethroughOnDone)
                .onChange(async (value) => {
                    this.plugin.settings.enableStrikethroughOnDone = value;
                    await this.plugin.saveSettings();
                }));

    }
}

function escapeRegExp(s: string): string {
    return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

