import { App, MarkdownPostProcessorContext, MarkdownView, Menu, Notice, Plugin, PluginSettingTab, Setting, TAbstractFile, TFile, TFolder, WorkspaceLeaf } from 'obsidian';
import { PriorityMatrixView, VIEW_TYPE_PRIORITY_MATRIX } from './src/views/PriorityMatrixView';

interface PriorityMatrixPluginSettings {
    includePath: string; // vault-relative folder path
    recursive: boolean;
    todoTag: string; // without leading '#', case-insensitive
    maxFiles: number; // 0 means unlimited
    autoRemoveTodoOnDone: boolean;
    enableStrikethroughOnDone: boolean; // disabled when autoRemoveTodoOnDone is true
    matrixType: 'Eisenhower';
}

const DEFAULT_SETTINGS: PriorityMatrixPluginSettings = {
    includePath: '/',
    recursive: true,
    todoTag: 'TODO',
    maxFiles: 99999,
    autoRemoveTodoOnDone: false,
    enableStrikethroughOnDone: true,
    matrixType: 'Eisenhower',
}

export default class PriorityMatrixPlugin extends Plugin {
    settings: PriorityMatrixPluginSettings;

    async onload() {
        await this.loadSettings();

        this.addSettingTab(new PriorityMatrixSettingTab(this.app, this));

        // Register the custom view
        this.registerView(
            VIEW_TYPE_PRIORITY_MATRIX,
            (leaf: WorkspaceLeaf) => new PriorityMatrixView(leaf)
        );

        this.addCommand({
            id: 'create-priority-matrix-note',
            name: 'Create priority matrix note',
            callback: async () => {
                await this.createPriorityMatrixInActiveFolder();
            }
        });

        this.addCommand({
            id: 'open-as-priority-matrix',
            name: 'Open as matrix',
            checkCallback: (checking) => {
                const file = this.app.workspace.getActiveFile();
                const can = !!file && this.noteHasPriorityMatrixBlock(file);
                if (!checking && can) {
                    this.openAsMatrixView(file);
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
                const can = !!file && this.noteHasPriorityMatrixBlock(file);
                if (!checking && can) {
                    this.openAsMatrixView(file);
                }
                return can;
            }
        });

        this.addCommand({
            id: 'open-as-markdown',
            name: 'Open as markdown',
            checkCallback: (checking) => {
                const view = this.app.workspace.getActiveViewOfType(PriorityMatrixView);
                const can = !!view && !!view.file;
                if (!checking && can && view.file) {
                    this.openAsMarkdownView(view.file);
                }
                return can;
            }
        });

        this.registerEvent(this.app.workspace.on('file-menu', (menu: Menu, file: TAbstractFile) => {
            if (file instanceof TFolder) {
                menu.addItem((item) => {
                    item.setTitle('New priority matrix note')
                        .setIcon('layout-grid')
                        .onClick(async () => {
                            await this.createPriorityMatrixInFolder(file);
                        });
                });
            }
        }));

        // Register markdown post-processor to add switch button and hide code block
        this.registerMarkdownPostProcessor((el, ctx) => {
            const file = ctx.sourcePath ? this.app.vault.getAbstractFileByPath(ctx.sourcePath) : null;
            if (!(file instanceof TFile) || !this.noteHasPriorityMatrixBlock(file)) {
                return;
            }

            // Hide the priority-matrix code block
            const codeBlocks = el.querySelectorAll('pre code.language-priority-matrix, pre code[class*="priority-matrix"]');
            codeBlocks.forEach((code) => {
                const pre = code.closest('pre');
                if (pre) {
                    pre.style.display = 'none';
                }
            });

            // Add a button at the top to switch to matrix view
            const firstHeading = el.querySelector('h1, h2, h3, h4, h5, h6');
            if (firstHeading) {
                const buttonContainer = document.createElement('div');
                buttonContainer.style.cssText = 'margin-bottom: 1em; padding: 8px; background: var(--background-secondary); border-radius: 4px;';
                
                const button = document.createElement('button');
                button.textContent = 'Switch to Matrix View';
                button.style.cssText = 'padding: 6px 12px; background: var(--interactive-accent); color: var(--text-on-accent); border: none; border-radius: 4px; cursor: pointer;';
                button.addEventListener('click', () => {
                    this.openAsMatrixView(file);
                });
                
                buttonContainer.appendChild(button);
                firstHeading.parentNode?.insertBefore(buttonContainer, firstHeading);
            }
        });

        // When a file is opened, check if it should be opened as matrix view
        this.registerEvent(
            this.app.workspace.on('file-open', async (file: TFile) => {
                if (file && this.noteHasPriorityMatrixBlock(file)) {
                    // Optionally auto-open as matrix view
                    // For now, user can use command to switch
                }
            })
        );
    }

    onunload() {
        // Clean up view
        this.app.workspace.detachLeavesOfType(VIEW_TYPE_PRIORITY_MATRIX);
    }

    async loadSettings() {
        this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
        if (this.settings.autoRemoveTodoOnDone) {
            this.settings.enableStrikethroughOnDone = false;
        }
    }

    async saveSettings() {
        await this.saveData(this.settings);
    }

    private async openAsMatrixView(file: TFile) {
        const leaf = this.app.workspace.getLeaf(true);
        await leaf.setViewState({
            type: VIEW_TYPE_PRIORITY_MATRIX,
            state: { file: file.path },
        });
    }

    private async openAsMarkdownView(file: TFile) {
        const leaf = this.app.workspace.getLeaf(true);
        await leaf.setViewState({
            type: 'markdown',
            state: { file: file.path },
        });
    }

    private async createPriorityMatrixInActiveFolder() {
        const activeFile = this.app.workspace.getActiveFile();
        const targetFolder = activeFile ? this.app.fileManager.getNewFileParent(activeFile.path) : this.app.vault.getRoot();
        await this.createPriorityMatrixInFolder(targetFolder);
    }

    private async createPriorityMatrixInFolder(folder: TFolder) {
        const filename = await this.getNextMatrixFilename(folder);
        const content = await this.generateMatrixNoteContent(folder);
        const file = await this.app.vault.create(`${folder.path}/${filename}`, content);
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
        const headings = [
            'TODO',
            'Matrix type - Eisenhower',
            'Q1',
            'Q2',
            'Q3',
            'Q4',
            'DONE',
            'settingsJson'
        ];

        const placeholderTodos = [
            '- [ ] Example: Add a README for the project',
            '- [ ] Example: Plan next sprint goals'
        ];

        // Use the folder where the matrix note is created as the default include root
        const scannedTodos = await this.scanForTodoFiles(folder);
        const checklistFromScan = scannedTodos.map((p) => `- [ ] [[${p}]]`);

        // Default to the folder where the matrix note is created
        const effectiveIncludePath = folder.path;

        const settingsJson = {
            includePath: effectiveIncludePath,
            recursive: this.settings.recursive,
            todoTag: this.settings.todoTag,
            maxFiles: this.settings.maxFiles,
            autoRemoveTodoOnDone: this.settings.autoRemoveTodoOnDone,
            enableStrikethroughOnDone: this.settings.enableStrikethroughOnDone,
            matrixType: this.settings.matrixType
        };

        const lines: string[] = [];
        // TODO
        lines.push(`## ${headings[0]}`);
        lines.push('');
        lines.push(...placeholderTodos);
        if (checklistFromScan.length > 0) {
            if (placeholderTodos.length > 0) lines.push('');
            lines.push(...checklistFromScan);
        }
        lines.push('');
        // Matrix type + mount point
        lines.push(`## ${headings[1]}`);
        lines.push('');
        lines.push('```priority-matrix');
        lines.push('```');
        lines.push('');
        // Q1-Q4
        lines.push(`## ${headings[2]}`);
        lines.push('');
        lines.push(`## ${headings[3]}`);
        lines.push('');
        lines.push(`## ${headings[4]}`);
        lines.push('');
        lines.push(`## ${headings[5]}`);
        lines.push('');
        // DONE
        lines.push(`## ${headings[6]}`);
        lines.push('');
        // Settings JSON block
        lines.push(`## ${headings[7]}`);
        lines.push('');
        lines.push('```json');
        lines.push(JSON.stringify(settingsJson, null, 2));
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
        const tagRegex = new RegExp(`#${escapeRegExp(todoTag)}(?![\w-])`, 'i');

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
    private noteHasPriorityMatrixBlock(file: TFile): boolean {
        // Check file content synchronously if possible, or use metadata cache
        const cache = this.app.metadataCache.getFileCache(file);
        if (cache) {
            // Check for priority-matrix code block in frontmatter or content
            // For now, check if file has the expected structure
            return true; // Simplified - could check actual content
        }
        // Fallback: check if file name suggests it's a matrix
        return file.name.toLowerCase().includes('priority matrix');
    }
}

class PriorityMatrixSettingTab extends PluginSettingTab {
    plugin: PriorityMatrixPlugin;

    constructor(app: App, plugin: PriorityMatrixPlugin) {
        super(app, plugin);
        this.plugin = plugin;
    }

    display(): void {
        const {containerEl} = this;
        containerEl.empty();

        containerEl.createEl('h3', { text: 'Scan' });
        new Setting(containerEl)
            .setName('Include folder')
            .setDesc('Vault-relative path to scan for #TODO notes (default: /)')
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
            .setName('TODO tag')
            .setDesc('Tag to match (without #), case-insensitive')
            .addText(text => text
                .setPlaceholder('TODO')
                .setValue(this.plugin.settings.todoTag)
                .onChange(async (value) => {
                    this.plugin.settings.todoTag = value.trim() || 'TODO';
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('Max files to scan')
            .setDesc('Set 0 for unlimited')
            .addText(text => text
                .setPlaceholder('99999')
                .setValue(String(this.plugin.settings.maxFiles))
                .onChange(async (value) => {
                    const n = Number(value);
                    this.plugin.settings.maxFiles = Number.isFinite(n) && n >= 0 ? n : 99999;
                    await this.plugin.saveSettings();
                }));

        containerEl.createEl('h3', { text: 'Behavior' });
        new Setting(containerEl)
            .setName('Auto-remove TODO on Done')
            .setDesc('Remove the TODO tag instead of strikethrough when moved to Done')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.autoRemoveTodoOnDone)
                .onChange(async (value) => {
                    this.plugin.settings.autoRemoveTodoOnDone = value;
                    if (value) this.plugin.settings.enableStrikethroughOnDone = false;
                    await this.plugin.saveSettings();
                    this.display();
                }));

        new Setting(containerEl)
            .setName('Strikethrough TODO on Done')
            .setDesc('Replace #TODO with ~~#TODO~~ when moved to Done')
            .addToggle(toggle => toggle
                .setDisabled(this.plugin.settings.autoRemoveTodoOnDone)
                .setValue(this.plugin.settings.enableStrikethroughOnDone)
                .onChange(async (value) => {
                    this.plugin.settings.enableStrikethroughOnDone = value;
                    await this.plugin.saveSettings();
                }));

        containerEl.createEl('h3', { text: 'Matrix' });
        new Setting(containerEl)
            .setName('Matrix type')
            .setDesc('Choose the layout for the matrix')
            .addDropdown(drop => {
                drop.addOption('Eisenhower', 'Eisenhower (2×2)');
                drop.setValue(this.plugin.settings.matrixType);
                drop.onChange(async (value: 'Eisenhower') => {
                    this.plugin.settings.matrixType = value;
                    await this.plugin.saveSettings();
                });
            });
    }
}

function escapeRegExp(s: string): string {
    return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
