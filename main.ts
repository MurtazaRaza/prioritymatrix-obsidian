import { App, FuzzySuggestModal, MarkdownPostProcessorContext, MarkdownView, Menu, Notice, Plugin, PluginSettingTab, Setting, TAbstractFile, TFile, TFolder } from 'obsidian';

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

export default class PriorityMatrixPlugin extends Plugin {
    settings: PriorityMatrixPluginSettings;

    async onload() {
        await this.loadSettings();

        this.addSettingTab(new PriorityMatrixSettingTab(this.app, this));

        this.addCommand({
            id: 'create-priority-matrix-note',
            name: 'Create priority matrix note',
            callback: async () => {
                await this.createPriorityMatrixInActiveFolder();
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

        this.registerMarkdownCodeBlockProcessor('priority-matrix', (src: string, el: HTMLElement, _ctx: MarkdownPostProcessorContext) => {
            const container = el.createEl('div');
            container.addClass('priority-matrix-container');

            const toolbar = container.createEl('div');
            toolbar.addClass('priority-matrix-toolbar');
            const title = toolbar.createEl('div', { text: 'Eisenhower Matrix' });
            title.addClass('priority-matrix-title');
            const refreshBtn = toolbar.createEl('button', { text: 'Refresh' });
            refreshBtn.addEventListener('click', async () => {
                new Notice('Refreshing matrix…');
            });

            const grid = container.createEl('div');
            grid.addClass('priority-matrix-grid');

            // Column headers
            grid.createEl('div').addClass('pmx-empty');
            grid.createEl('div', { text: 'Urgent' }).addClass('pmx-col-header');
            grid.createEl('div', { text: 'Not urgent' }).addClass('pmx-col-header');

            // Row 1 header + Q1/Q2
            grid.createEl('div', { text: 'Important' }).addClass('pmx-row-header');
            const q1 = grid.createEl('div');
            q1.addClass('pmx-cell');
            q1.addClass('pmx-q1');
            q1.createEl('div', { text: 'Q1: Do' }).addClass('pmx-cell-title');
            const q2 = grid.createEl('div');
            q2.addClass('pmx-cell');
            q2.addClass('pmx-q2');
            q2.createEl('div', { text: 'Q2: Plan' }).addClass('pmx-cell-title');

            // Row 2 header + Q3/Q4
            grid.createEl('div', { text: 'Not important' }).addClass('pmx-row-header');
            const q3 = grid.createEl('div');
            q3.addClass('pmx-cell');
            q3.addClass('pmx-q3');
            q3.createEl('div', { text: 'Q3: Delegate' }).addClass('pmx-cell-title');
            const q4 = grid.createEl('div');
            q4.addClass('pmx-cell');
            q4.addClass('pmx-q4');
            q4.createEl('div', { text: 'Q4: Eliminate' }).addClass('pmx-cell-title');

            // Optionally parse src in future for customization
            void src;
        });
    }

    onunload() {
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

    private async createPriorityMatrixInActiveFolder() {
        const activeFile = this.app.workspace.getActiveFile();
        const targetFolder = activeFile ? this.app.fileManager.getNewFileParent(activeFile.path) : this.app.vault.getRoot();
        await this.createPriorityMatrixInFolder(targetFolder);
    }

    private async createPriorityMatrixInFolder(folder: TFolder) {
        const filename = await this.getNextMatrixFilename(folder);
        const content = await this.generateMatrixNoteContent(folder);
        const file = await this.app.vault.create(`${folder.path}/${filename}`, content);
        await this.app.workspace.getLeaf(true).openFile(file);
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
            'Settings (JSON)'
        ];

        const placeholderTodos = [
            '- [ ] Example: Add a README for the project',
            '- [ ] Example: Plan next sprint goals'
        ];

        const scannedTodos = await this.scanForTodoFiles();
        const checklistFromScan = scannedTodos.map((p) => `- [ ] [[${p}]]`);

        const settingsJson = {
            includePath: this.settings.includePath,
            recursive: this.settings.recursive,
            todoTag: this.settings.todoTag,
            maxFiles: this.settings.maxFiles,
            autoRemoveTodoOnDone: this.settings.autoRemoveTodoOnDone,
            enableStrikethroughOnDone: this.settings.enableStrikethroughOnDone
        };

        const lines: string[] = [];
        // TODO
        lines.push(`${headings[0]}`);
        lines.push('');
        lines.push(...placeholderTodos);
        if (checklistFromScan.length > 0) {
            if (placeholderTodos.length > 0) lines.push('');
            lines.push(...checklistFromScan);
        }
        lines.push('');
        // Matrix type + mount point
        lines.push(`${headings[1]}`);
        lines.push('');
        lines.push('```priority-matrix');
        lines.push('```');
        lines.push('');
        // Q1-Q4
        lines.push(`${headings[2]}`);
        lines.push('');
        lines.push(`${headings[3]}`);
        lines.push('');
        lines.push(`${headings[4]}`);
        lines.push('');
        lines.push(`${headings[5]}`);
        lines.push('');
        // DONE
        lines.push(`${headings[6]}`);
        lines.push('');
        // Settings JSON block
        lines.push(`${headings[7]}`);
        lines.push('');
        lines.push('```json');
        lines.push(JSON.stringify(settingsJson, null, 2));
        lines.push('```');
        lines.push('');
        // Hidden state block placeholder
        lines.push('%% priority-matrix:state');
        lines.push('```json');
        lines.push(JSON.stringify({ schemaVersion: 1, items: {}, history: [] }, null, 2));
        lines.push('```');
        lines.push('%%');

        return lines.join('\n');
    }

    private async scanForTodoFiles(): Promise<string[]> {
        const includeRoot = this.resolveIncludeRoot();
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
    }
}

function escapeRegExp(s: string): string {
    return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
