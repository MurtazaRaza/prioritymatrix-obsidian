import { App, FuzzySuggestModal, MarkdownPostProcessorContext, MarkdownView, Menu, Notice, Plugin, PluginSettingTab, Setting, TAbstractFile, TFile, TFolder } from 'obsidian';

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

        this.addCommand({
            id: 'create-priority-matrix-note',
            name: 'Create priority matrix note',
            callback: async () => {
                await this.createPriorityMatrixInActiveFolder();
            }
        });

        this.addCommand({
            id: 'open-as-priority-matrix',
            name: 'Open as matrix (Preview)',
            checkCallback: (checking) => {
                const view = this.app.workspace.getActiveViewOfType(MarkdownView);
                const can = !!view && this.noteHasPriorityMatrixBlock(view);
                if (!checking && can) view.setState({ mode: 'preview' }, { history: false });
                return can;
            }
        });

        this.addCommand({
            id: 'open-as-markdown',
            name: 'Open as markdown (Source)',
            checkCallback: (checking) => {
                const view = this.app.workspace.getActiveViewOfType(MarkdownView);
                const can = !!view && this.noteHasPriorityMatrixBlock(view);
                if (!checking && can) view.setState({ mode: 'source' }, { history: false });
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

        this.registerMarkdownCodeBlockProcessor('priority-matrix', async (src: string, el: HTMLElement, ctx: MarkdownPostProcessorContext) => {
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

            const toggleBtn = toolbar.createEl('button', { text: 'Open as markdown' });
            toggleBtn.addEventListener('click', () => {
                const view = this.app.workspace.getActiveViewOfType(MarkdownView);
                if (!view) return;
                const mode = (view.getState() as any)?.mode;
                if (mode === 'preview') {
                    view.setState({ mode: 'source' }, { history: false });
                    toggleBtn.setText('Open as matrix');
                } else {
                    view.setState({ mode: 'preview' }, { history: false });
                    toggleBtn.setText('Open as markdown');
                }
            });

            const menuBtn = toolbar.createEl('button', { text: '⋯' });
            menuBtn.addClass('pmx-menu-btn');
            menuBtn.addEventListener('click', (evt) => {
                const menu = new Menu();
                menu.addItem((i) => i.setTitle('Refresh').onClick(() => refreshBtn.click()));
                menu.addItem((i) => i.setTitle('Open as matrix').onClick(() => { toggleBtn.setText('Open as markdown'); toggleBtn.click(); }));
                menu.addItem((i) => i.setTitle('Open as markdown').onClick(() => { toggleBtn.setText('Open as matrix'); toggleBtn.click(); }));
                menu.showAtMouseEvent(evt as unknown as MouseEvent);
            });

            const grid = container.createEl('div');
            grid.addClass('priority-matrix-grid');

            // Headers row
            grid.createEl('div', { text: 'TODO' }).addClass('pmx-col-header');
            const matrixHeader = grid.createEl('div');
            matrixHeader.addClass('pmx-matrix-header');
            matrixHeader.createEl('div', { text: 'Urgent' }).addClass('pmx-col-subheader');
            matrixHeader.createEl('div', { text: 'Not urgent' }).addClass('pmx-col-subheader');
            grid.createEl('div', { text: 'DONE' }).addClass('pmx-col-header');

            // TODO column (spans 2 rows)
            const todoCol = grid.createEl('div');
            todoCol.addClass('pmx-side-col');
            todoCol.addClass('pmx-todo');
            const todoList = todoCol.createEl('ul');
            todoList.addClass('pmx-list');

            // Matrix Q1/Q2 row
            const q1 = grid.createEl('div');
            q1.addClass('pmx-cell');
            q1.addClass('pmx-q1');
            q1.createEl('div', { text: 'Q1: Do' }).addClass('pmx-cell-title');
            const q1List = q1.createEl('ul');
            q1List.addClass('pmx-list');
            const q2 = grid.createEl('div');
            q2.addClass('pmx-cell');
            q2.addClass('pmx-q2');
            q2.createEl('div', { text: 'Q2: Plan' }).addClass('pmx-cell-title');
            const q2List = q2.createEl('ul');
            q2List.addClass('pmx-list');

            // DONE column (spans 2 rows)
            const doneColTopSlot = grid.createEl('div');
            doneColTopSlot.addClass('pmx-side-col');
            doneColTopSlot.addClass('pmx-done');
            const doneList = doneColTopSlot.createEl('ul');
            doneList.addClass('pmx-list');

            // Matrix Q3/Q4 row
            const todoColBottomSpacer = grid.createEl('div');
            todoColBottomSpacer.addClass('pmx-side-col-spacer');
            const q3 = grid.createEl('div');
            q3.addClass('pmx-cell');
            q3.addClass('pmx-q3');
            q3.createEl('div', { text: 'Q3: Delegate' }).addClass('pmx-cell-title');
            const q3List = q3.createEl('ul');
            q3List.addClass('pmx-list');
            const q4 = grid.createEl('div');
            q4.addClass('pmx-cell');
            q4.addClass('pmx-q4');
            q4.createEl('div', { text: 'Q4: Eliminate' }).addClass('pmx-cell-title');
            const q4List = q4.createEl('ul');
            q4List.addClass('pmx-list');
            const doneColBottomSpacer = grid.createEl('div');
            doneColBottomSpacer.addClass('pmx-side-col-spacer');

            // Parse the source note to populate lists
            try {
                const file = this.app.vault.getAbstractFileByPath(ctx.sourcePath);
                if (file instanceof TFile) {
                    const content = await this.app.vault.read(file);
                    const parsed = parsePriorityMatrixSections(content);
                    // TODO/DONE from TODO section tasks
                    for (const item of parsed.todo) {
                        const li = todoList.createEl('li');
                        li.addClass('pmx-item');
                        li.setText(item);
                    }
                    for (const item of parsed.done) {
                        const li = doneList.createEl('li');
                        li.addClass('pmx-item');
                        li.setText(item);
                    }
                    // Quadrants
                    for (const item of parsed.q1) { const li = q1List.createEl('li'); li.addClass('pmx-item'); li.setText(item); }
                    for (const item of parsed.q2) { const li = q2List.createEl('li'); li.addClass('pmx-item'); li.setText(item); }
                    for (const item of parsed.q3) { const li = q3List.createEl('li'); li.addClass('pmx-item'); li.setText(item); }
                    for (const item of parsed.q4) { const li = q4List.createEl('li'); li.addClass('pmx-item'); li.setText(item); }
                }
            } catch {}

            // Hide matrix-related sections in preview so only the board is visible
            try {
                hideSectionsInPreview(el, [
                    'TODO',
                    'Q1', 'Q2', 'Q3', 'Q4',
                    'DONE',
                    'Matrix type - Eisenhower',
                    'Settings (JSON)'
                ]);
            } catch {}
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

        // Use the folder where the matrix note is created as the default include root
        const scannedTodos = await this.scanForTodoFiles(folder);
        const checklistFromScan = scannedTodos.map((p) => `- [ ] [[${p}]]`);

        const effectiveIncludePath = (this.settings.includePath?.trim() && this.settings.includePath.trim() !== '/')
            ? this.settings.includePath.trim()
            : folder.path;

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

    // Simple detector for whether the note has a priority-matrix code block
    // Uses synchronous view data to keep command checkCallbacks synchronous
    private noteHasPriorityMatrixBlock(view: MarkdownView): boolean {
        const text = (view as unknown as MarkdownViewLike).getViewData?.() ?? '';
        return text.includes('```priority-matrix');
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

// Helpers
interface MarkdownViewLike {
    getViewData(): string;
}

// Parse the markdown content into sections for TODO/DONE and Q1–Q4.
function parsePriorityMatrixSections(content: string): { todo: string[]; done: string[]; q1: string[]; q2: string[]; q3: string[]; q4: string[] } {
    const lines = content.split(/\r?\n/);
    type Section = 'none' | 'todo' | 'q1' | 'q2' | 'q3' | 'q4' | 'done';
    let section: Section = 'none';
    const out = { todo: [] as string[], done: [] as string[], q1: [] as string[], q2: [] as string[], q3: [] as string[], q4: [] as string[] };

    const headingRegex = /^\s{0,3}#{1,6}\s+(.*)$/;
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const h = line.match(headingRegex)?.[1]?.trim();
        if (h) {
            const key = h.toLowerCase();
            if (key === 'todo') section = 'todo';
            else if (key === 'q1') section = 'q1';
            else if (key === 'q2') section = 'q2';
            else if (key === 'q3') section = 'q3';
            else if (key === 'q4') section = 'q4';
            else if (key === 'done') section = 'done';
            else section = 'none';
            continue;
        }

        // Only collect within known sections
        if (section === 'none') continue;

        // Stop capturing when reaching fenced code or comment blocks specific to settings/state
        if (/^```/.test(line) || /^%%\s*priority-matrix:/.test(line)) {
            // consume until end of block if code fence
            if (line.startsWith('```')) {
                i++;
                while (i < lines.length && !lines[i].startsWith('```')) i++;
            }
            continue;
        }

        // Tasks under TODO: split checked vs unchecked
        if (section === 'todo') {
            const taskMatch = /^\s*-\s*\[( |x|X)\]\s*(.*)$/.exec(line);
            if (taskMatch) {
                const isDone = taskMatch[1].toLowerCase() === 'x';
                const text = taskMatch[2].trim();
                if (isDone) out.done.push(text);
                else out.todo.push(text);
            }
            continue;
        }

        // DONE section: optional extra tasks (treat all as done if task line)
        if (section === 'done') {
            const taskMatch = /^\s*-\s*\[( |x|X)\]\s*(.*)$/.exec(line);
            if (taskMatch) out.done.push(taskMatch[2].trim());
            continue;
        }

        // Q1–Q4: accept bullet lines as items
        if (section === 'q1' || section === 'q2' || section === 'q3' || section === 'q4') {
            const bullet = /^\s*-\s*(.*)$/.exec(line);
            if (bullet) {
                const text = bullet[1].trim();
                out[section].push(text);
            }
        }
    }

    return out;
}

function hideSectionsInPreview(blockEl: HTMLElement, headingsToHide: string[]) {
    const sectionRoot = (blockEl.closest('.markdown-preview-section') as HTMLElement | null)?.parentElement;
    if (!sectionRoot) return;
    const headingSet = new Set(headingsToHide.map((h) => h.toLowerCase()));
    const children = Array.from(sectionRoot.children);
    let hide = false;
    for (const node of children) {
        if ((node as HTMLElement).matches?.('h1,h2,h3,h4,h5,h6')) {
            const text = (node.textContent || '').trim().toLowerCase();
            hide = headingSet.has(text);
        }
        if (hide) (node as HTMLElement).classList.add('pmx-hidden');
    }
}
