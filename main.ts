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

            // Set initial button text based on current mode
            const view = this.app.workspace.getActiveViewOfType(MarkdownView);
            const currentMode = view ? (view.getState() as any)?.mode : 'preview';
            const toggleBtn = toolbar.createEl('button', { 
                text: currentMode === 'preview' ? 'Open as markdown' : 'Open as matrix' 
            });
            toggleBtn.addEventListener('click', () => {
                const view = this.app.workspace.getActiveViewOfType(MarkdownView);
                if (!view) return;
                const mode = (view.getState() as any)?.mode;
                if (mode === 'preview') {
                    // Currently in preview/matrix mode, switch to source/markdown
                    view.setState({ mode: 'source' }, { history: false });
                    toggleBtn.setText('Open as matrix');
                } else {
                    // Currently in source/markdown mode, switch to preview/matrix
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

            // TODO bank (top, full width)
            const todoHeader = grid.createEl('div');
            todoHeader.addClass('pmx-col-header');
            const todoHeaderLabel = todoHeader.createSpan({ text: 'TODO' });
            const todoCollapseBtn = todoHeader.createEl('button', { text: 'Collapse' });
            // bank content
            const todoCol = grid.createEl('div');
            todoCol.addClass('pmx-bank');
            todoCol.addClass('pmx-todo');
            const todoList = todoCol.createEl('ul');
            todoList.addClass('pmx-list');
            todoCollapseBtn.addEventListener('click', () => {
                const collapsed = todoCol.classList.toggle('pmx-collapsed');
                todoCollapseBtn.setText(collapsed ? 'Expand' : 'Collapse');
            });

            // Matrix headers (Urgent / Not urgent)
            const matrixHeader = grid.createEl('div');
            matrixHeader.addClass('pmx-matrix-header');
            matrixHeader.createEl('div', { text: 'Urgent' }).addClass('pmx-col-subheader');
            matrixHeader.createEl('div', { text: 'Not urgent' }).addClass('pmx-col-subheader');

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

            // Matrix Q3/Q4 row
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

            // DONE bank (bottom, full width)
            const doneHeader = grid.createEl('div');
            doneHeader.addClass('pmx-col-header');
            const doneHeaderLabel = doneHeader.createSpan({ text: 'DONE' });
            const doneCollapseBtn = doneHeader.createEl('button', { text: 'Collapse' });
            const doneColTopSlot = grid.createEl('div');
            doneColTopSlot.addClass('pmx-bank');
            doneColTopSlot.addClass('pmx-done');
            const doneList = doneColTopSlot.createEl('ul');
            doneList.addClass('pmx-list');
            doneCollapseBtn.addEventListener('click', () => {
                const collapsed = doneColTopSlot.classList.toggle('pmx-collapsed');
                doneCollapseBtn.setText(collapsed ? 'Expand' : 'Collapse');
            });

            // Helpers for link parsing and rendering as bubbles
            const parseWikiLink = (text: string): { display: string; path: string } | null => {
                const m = /\[\[(.+?)\]\]/.exec(text);
                if (!m) return null;
                const raw = m[1];
                const [file, alias] = raw.split('|');
                return { display: alias?.trim() || file.trim().split('/').pop() || file.trim(), path: file.trim() };
            };

            const makeBubble = (listEl: HTMLElement, itemText: string) => {
                const li = listEl.createEl('li');
                li.addClass('pmx-item');
                li.addClass('pmx-bubble');
                li.setAttr('draggable', 'true');
                const link = parseWikiLink(itemText);
                let href: string | undefined;
                let label = itemText;
                if (link) {
                    const dest = this.app.metadataCache.getFirstLinkpathDest(link.path, ctx.sourcePath);
                    href = dest ? dest.path : link.path;
                    label = link.display;
                    // Create clickable link
                    const a = li.createEl('a', { text: label });
                    a.href = '#';
                    a.addEventListener('click', (evt) => {
                        evt.preventDefault();
                        this.app.workspace.openLinkText(link.path, ctx.sourcePath, false);
                    });
                    // store identity for DnD
                    li.dataset.itemId = link.path;
                } else {
                    // Plain text item (shouldn't happen for notes, but handle it)
                    li.createSpan({ text: label });
                    li.dataset.itemId = itemText;
                }
                return li;
            };

            const sectionFromList = new Map<HTMLElement, string>([
                [todoList, 'todo'],
                [q1List, 'q1'],
                [q2List, 'q2'],
                [q3List, 'q3'],
                [q4List, 'q4'],
                [doneList, 'done'],
            ]);

            const enableDnD = (listEl: HTMLElement) => {
                listEl.addEventListener('dragover', (e) => {
                    e.preventDefault();
                });
                listEl.addEventListener('drop', async (e) => {
                    e.preventDefault();
                    const itemId = e.dataTransfer?.getData('text/plain');
                    const from = e.dataTransfer?.getData('text/pmx-from');
                    const to = sectionFromList.get(listEl) || 'todo';
                    if (!itemId || !from) return;
                    await moveItemInNote(ctx.sourcePath, itemId, from as any, to as any);
                    // re-render simply by triggering a refresh
                    this.app.workspace.requestSaveLayout();
                    new Notice(`Moved to ${to.toUpperCase()}`);
                });
            };

            const attachDragHandlers = (li: HTMLElement, listEl: HTMLElement) => {
                li.addEventListener('dragstart', (e) => {
                    const id = (li as HTMLElement).dataset.itemId || '';
                    e.dataTransfer?.setData('text/plain', id);
                    e.dataTransfer?.setData('text/pmx-from', sectionFromList.get(listEl) || 'todo');
                });
            };

            // Parse the source note to populate lists
            try {
                const file = this.app.vault.getAbstractFileByPath(ctx.sourcePath);
                if (file instanceof TFile) {
                    const content = await this.app.vault.read(file);
                    const parsed = parsePriorityMatrixSections(content);
                    
                    // Debug: log what was parsed (can remove later)
                    console.log('Parsed sections:', parsed);
                    
                    // Enable DnD on lists
                    [todoList, q1List, q2List, q3List, q4List, doneList].forEach(enableDnD);
                    
                    // TODO/DONE from TODO section tasks
                    if (parsed.todo.length > 0) {
                        for (const item of parsed.todo) { 
                            const li = makeBubble(todoList, item); 
                            attachDragHandlers(li, todoList); 
                        }
                    }
                    if (parsed.done.length > 0) {
                        for (const item of parsed.done) { 
                            const li = makeBubble(doneList, item); 
                            attachDragHandlers(li, doneList); 
                        }
                    }
                    // Quadrants
                    if (parsed.q1.length > 0) {
                        for (const item of parsed.q1) { const li = makeBubble(q1List, item); attachDragHandlers(li, q1List); }
                    }
                    if (parsed.q2.length > 0) {
                        for (const item of parsed.q2) { const li = makeBubble(q2List, item); attachDragHandlers(li, q2List); }
                    }
                    if (parsed.q3.length > 0) {
                        for (const item of parsed.q3) { const li = makeBubble(q3List, item); attachDragHandlers(li, q3List); }
                    }
                    if (parsed.q4.length > 0) {
                        for (const item of parsed.q4) { const li = makeBubble(q4List, item); attachDragHandlers(li, q4List); }
                    }
                }
            } catch (err) {
                console.error('Error parsing matrix sections:', err);
            }

            // Hide all markdown sections in preview so only the board is visible
            // Use multiple strategies to ensure sections are hidden
            const headingsToHide = [
                'TODO',
                'Q1', 'Q2', 'Q3', 'Q4',
                'DONE',
                'Matrix type - Eisenhower',
                'settingsJson'
            ];
            
            // Function to hide sections
            const hideSections = () => {
                hideSectionsInPreview(ctx.sourcePath, headingsToHide);
            };
            
            // Hide immediately
            hideSections();
            
            // Hide multiple times with increasing delays to catch all rendering phases
            setTimeout(hideSections, 50);
            setTimeout(hideSections, 200);
            setTimeout(hideSections, 500);
            setTimeout(hideSections, 1000);
            
            // Use MutationObserver to hide sections as they're added
            const app = this.app;
            let observer: MutationObserver | null = null;
            
            const setupObserver = () => {
                const view = app.workspace.getActiveViewOfType(MarkdownView);
                if (view && view.file?.path === ctx.sourcePath && view.getMode() === 'preview') {
                    const previewEl = view.previewMode.containerEl;
                    if (previewEl) {
                        if (observer) observer.disconnect();
                        
                        observer = new MutationObserver(() => {
                            hideSections();
                        });
                        
                        observer.observe(previewEl, {
                            childList: true,
                            subtree: true,
                            attributes: false,
                            characterData: false
                        });
                        
                        // Keep observer active longer - Obsidian can render sections lazily
                        setTimeout(() => {
                            if (observer) observer.disconnect();
                        }, 10000);
                    }
                }
            };
            
            // Setup observer after a brief delay
            setTimeout(setupObserver, 100);
            
            // Also setup observer when view state changes  
            const leafChangeHandler = () => {
                setTimeout(() => {
                    hideSections();
                    setupObserver();
                }, 100);
            };
            
            app.workspace.on('active-leaf-change', leafChangeHandler);
            
            // Cleanup: disconnect observer when processor is destroyed or file changes
            // Note: We can't easily register cleanup here, but observer will disconnect after timeout
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
            'settingsJson'
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
                const codeBlockType = line.match(/^```(\w+)?/)?.[1];
                i++;
                // Skip until we find the closing fence
                while (i < lines.length && !lines[i].startsWith('```')) i++;
            } else if (line.startsWith('%%')) {
                // Skip comment blocks
                i++;
                while (i < lines.length && !lines[i].startsWith('%%')) i++;
            }
            // Don't change section when we hit a code/comment block - continue with same section
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

function hideSectionsInPreview(sourcePath: string, headingsToHide: string[]) {
    // Find the active markdown view for this file
    const app = (window as any).app as App;
    const file = app.vault.getAbstractFileByPath(sourcePath);
    if (!(file instanceof TFile)) return;
    
    const view = app.workspace.getActiveViewOfType(MarkdownView);
    if (!view || view.file !== file) return;
    
    const previewMode = view.getMode() === 'preview';
    if (!previewMode) return;
    
    // Find the preview container - try multiple methods
    let previewEl: HTMLElement | null = null;
    try {
        previewEl = view.previewMode.containerEl;
    } catch (e) {
        previewEl = view.contentEl?.querySelector('.markdown-preview-view') as HTMLElement;
    }
    
    if (!previewEl) return;
    
    // Find our code block container - if we can't find it, abort
    const codeBlockContainer = previewEl.querySelector('.priority-matrix-container') as HTMLElement;
    if (!codeBlockContainer) return;
    
    const hideElement = (el: HTMLElement) => {
        if (!el) return;
        el.classList.add('pmx-hidden');
        el.style.display = 'none';
        el.style.visibility = 'hidden';
        el.style.height = '0';
        el.style.overflow = 'hidden';
    };
    
    const shouldKeep = (el: HTMLElement | null): boolean => {
        if (!el) return false;
        // Keep our code block container and everything inside it
        if (el === codeBlockContainer || codeBlockContainer.contains(el) || el.contains(codeBlockContainer)) {
            return true;
        }
        return false;
    };
    
    // Hide all direct children of preview that aren't our container
    const allChildren = Array.from(previewEl.children) as HTMLElement[];
    for (const child of allChildren) {
        if (shouldKeep(child)) continue;
        hideElement(child);
    }
    
    // Hide all markdown-preview-section elements except ones containing our code block
    const allSections = Array.from(previewEl.querySelectorAll('.markdown-preview-section')) as HTMLElement[];
    for (const section of allSections) {
        if (shouldKeep(section)) continue;
        hideElement(section);
    }
    
    // VERY AGGRESSIVE: Hide ALL headings that aren't in our container
    const allHeadings = Array.from(previewEl.querySelectorAll('h1, h2, h3, h4, h5, h6')) as HTMLElement[];
    for (const heading of allHeadings) {
        if (shouldKeep(heading)) continue;
        hideElement(heading);
        
        // Also hide everything after this heading until we hit our code block or another heading
        const parent = heading.parentElement;
        if (!parent) continue;
        
        const level = parseInt(heading.tagName.charAt(1));
        let current: HTMLElement | null = heading.nextElementSibling as HTMLElement;
        
        while (current && parent && parent.contains(current)) {
            if (shouldKeep(current)) {
                break; // Stop when we hit our code block
            }
            
            // Stop at next heading of same or higher level
            if (current.matches('h1, h2, h3, h4, h5, h6')) {
                const nextLevel = parseInt(current.tagName.charAt(1));
                if (nextLevel <= level) break;
            }
            
            hideElement(current);
            current = current.nextElementSibling as HTMLElement;
        }
    }
    
    // Hide ALL paragraphs that aren't in our container
    const allParagraphs = Array.from(previewEl.querySelectorAll('p')) as HTMLElement[];
    for (const p of allParagraphs) {
        if (shouldKeep(p)) continue;
        hideElement(p);
    }
    
    // Hide all code blocks (pre elements) except ours
    const allPreElements = Array.from(previewEl.querySelectorAll('pre')) as HTMLElement[];
    for (const pre of allPreElements) {
        if (shouldKeep(pre)) continue;
        hideElement(pre);
    }
    
    // Hide all lists (ul, ol) that aren't in our container
    const allLists = Array.from(previewEl.querySelectorAll('ul, ol')) as HTMLElement[];
    for (const list of allLists) {
        if (shouldKeep(list)) continue;
        hideElement(list);
    }
    
    // Hide all list items (li) that aren't in our container
    const allListItems = Array.from(previewEl.querySelectorAll('li')) as HTMLElement[];
    for (const li of allListItems) {
        if (shouldKeep(li)) continue;
        hideElement(li);
    }
}

// Update the matrix note markdown by moving an item between sections
async function moveItemInNote(notePath: string, itemId: string, from: 'todo'|'q1'|'q2'|'q3'|'q4'|'done', to: 'todo'|'q1'|'q2'|'q3'|'q4'|'done') {
    if (from === to) return;
    const app = (window as any).app as App;
    const file = app.vault.getAbstractFileByPath(notePath);
    if (!(file instanceof TFile)) return;
    const content = await app.vault.read(file);
    const updated = rewriteSectionsMove(content, itemId, from, to);
    if (updated !== content) {
        await app.vault.modify(file, updated);
    }
}

function rewriteSectionsMove(content: string, itemId: string, from: string, to: string): string {
    const lines = content.split(/\r?\n/);
    const isTaskLine = (line: string) => /\s*-\s*\[( |x|X)\]\s*(.*)$/.test(line);
    const asTaskUnchecked = (id: string) => `- [ ] [[${id}]]`;
    const asTaskChecked = (id: string) => `- [x] [[${id}]]`;
    const asBullet = (id: string) => `- [[${id}]]`;

    type Section = 'none'|'todo'|'q1'|'q2'|'q3'|'q4'|'done';
    let section: Section = 'none';
    const headingRegex = /^\s{0,3}#{1,6}\s+(.*)$/;
    const toInsertLines: string[] = [];
    const targetLine = ((): string => {
        if (to === 'todo') return asTaskUnchecked(itemId);
        if (to === 'done') return asTaskChecked(itemId);
        return asBullet(itemId);
    })();
    let removed = false;
    for (let i = 0; i < lines.length; i++) {
        const h = lines[i].match(headingRegex)?.[1]?.trim().toLowerCase();
        if (h) {
            section = (h === 'todo' || h === 'q1' || h === 'q2' || h === 'q3' || h === 'q4' || h === 'done') ? (h as Section) : 'none';
            continue;
        }
        if (section === 'none') continue;
        // Skip code/state blocks
        if (/^```/.test(lines[i]) || /^%%\s*priority-matrix:/.test(lines[i])) {
            if (lines[i].startsWith('```')) {
                i++;
                while (i < lines.length && !lines[i].startsWith('```')) i++;
            }
            continue;
        }
        // Remove existing line for this id in any section
        const wiki = /\[\[(.+?)\]\]/.exec(lines[i])?.[1]?.trim();
        if (wiki && normalizeLinkId(wiki) === normalizeLinkId(itemId)) {
            lines.splice(i, 1);
            i--;
            removed = true;
            continue;
        }
    }

    // Insert at end of target section (before next heading or EOF)
    section = 'none';
    for (let i = 0; i < lines.length; i++) {
        const h = lines[i].match(headingRegex)?.[1]?.trim().toLowerCase();
        if (h) {
            section = (h === 'todo' || h === 'q1' || h === 'q2' || h === 'q3' || h === 'q4' || h === 'done') ? (h as Section) : 'none';
            continue;
        }
        if (section === to) {
            // find last content line before next heading; defer insertion after scanning section
        }
    }
    // If target section exists, append a new line at its end
    const out: string[] = [];
    section = 'none';
    for (let i = 0; i < lines.length; i++) {
        out.push(lines[i]);
        const h = lines[i].match(headingRegex)?.[1]?.trim().toLowerCase();
        if (h) {
            section = (h === 'todo' || h === 'q1' || h === 'q2' || h === 'q3' || h === 'q4' || h === 'done') ? (h as Section) : 'none';
            continue;
        }
        if (section === to) {
            // If next line is a heading or we're at the end, insert before heading boundary once
            const next = lines[i + 1];
            const nextIsHeading = next ? /^\s{0,3}#{1,6}\s+/.test(next) : true;
            const nextIsFence = next ? next.startsWith('```') : false;
            if (nextIsHeading || nextIsFence || i === lines.length - 1) {
                // ensure a blank line separation if previous is non-empty
                if (out.length > 0 && out[out.length - 1].trim().length > 0) out.push('');
                out.push(targetLine);
                // prevent duplicate insertions
                section = 'none';
            }
        }
    }

    return out.join('\n');
}

function normalizeLinkId(id: string): string {
    return id.replace(/\\/g, '/');
}
