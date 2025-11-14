import { App, TFile } from 'obsidian';
import { Matrix } from '../types';
import { mdToMatrix, matrixToMd } from '../parsers/MatrixFormat';

export class StateManager {
    private app: App;
    private file: TFile;
    private state: Matrix | null = null;
    private listeners: Set<() => void> = new Set();
    private isSaving: boolean = false;

    constructor(app: App, file: TFile) {
        this.app = app;
        this.file = file;
    }

    /**
     * Get the current matrix state
     */
    getState(): Matrix | null {
        return this.state;
    }

    /**
     * Parse markdown and set state
     */
    async getParsedMatrix(data: string): Promise<Matrix> {
        const matrix = mdToMatrix(data, this.app, this.file.path);
        this.state = matrix;
        this.notifyListeners();
        return matrix;
    }

    /**
     * Set matrix state and notify listeners
     */
    setState(matrix: Matrix): void {
        this.state = matrix;
        this.notifyListeners();
    }

    /**
     * Save matrix to file
     */
    async save(): Promise<void> {
        if (!this.state) return;
        this.isSaving = true;
        try {
            const md = matrixToMd(this.state);
            await this.app.vault.modify(this.file, md);
            // Brief delay to allow file change event to propagate
            await new Promise(resolve => setTimeout(resolve, 100));
        } finally {
            this.isSaving = false;
        }
    }

    /**
     * Check if we're currently saving (to prevent re-parsing during save)
     */
    getIsSaving(): boolean {
        return this.isSaving;
    }

    /**
     * Subscribe to state changes
     */
    subscribe(listener: () => void): () => void {
        this.listeners.add(listener);
        return () => {
            this.listeners.delete(listener);
        };
    }

    /**
     * Notify all listeners of state change
     */
    private notifyListeners(): void {
        this.listeners.forEach(listener => listener());
    }

    /**
     * Move an item from one section to another (optionally at a specific index)
     */
    moveItem(itemId: string, from: 'todo' | 'q1' | 'q2' | 'q3' | 'q4' | 'done', to: 'todo' | 'q1' | 'q2' | 'q3' | 'q4' | 'done', insertIndex?: number): void {
        if (!this.state) return;
        
        // Handle reordering within the same section
        if (from === to) {
            // Only reorder if insertIndex is provided
            if (insertIndex !== undefined && insertIndex >= 0) {
                this.reorderItem(itemId, from, insertIndex);
            }
            return;
        }

        // Find the item
        let item: any = null;
        
        // Search in banks
        if (from === 'todo') {
            const index = this.state.data.banks.todo.findIndex(i => i.id === itemId);
            if (index !== -1) {
                item = this.state.data.banks.todo[index];
                this.state.data.banks.todo.splice(index, 1);
            }
        } else if (from === 'done') {
            const index = this.state.data.banks.done.findIndex(i => i.id === itemId);
            if (index !== -1) {
                item = this.state.data.banks.done[index];
                this.state.data.banks.done.splice(index, 1);
            }
        } else {
            // Search in quadrants
            const quadrant = this.state.children.find(q => q.id === from);
            if (quadrant) {
                const index = quadrant.children.findIndex(i => i.id === itemId);
                if (index !== -1) {
                    item = quadrant.children[index];
                    quadrant.children.splice(index, 1);
                }
            }
        }

        if (!item) return;

        // Update checked status based on destination
        if (to === 'done') {
            item.data.checked = true;
        } else if (to === 'todo') {
            item.data.checked = false;
        }

        // Add to destination at specific index or append
        if (to === 'todo') {
            if (insertIndex !== undefined && insertIndex >= 0) {
                this.state.data.banks.todo.splice(insertIndex, 0, item);
            } else {
                this.state.data.banks.todo.push(item);
            }
        } else if (to === 'done') {
            if (insertIndex !== undefined && insertIndex >= 0) {
                this.state.data.banks.done.splice(insertIndex, 0, item);
            } else {
                this.state.data.banks.done.push(item);
            }
        } else {
            const quadrant = this.state.children.find(q => q.id === to);
            if (quadrant) {
                if (insertIndex !== undefined && insertIndex >= 0) {
                    quadrant.children.splice(insertIndex, 0, item);
                } else {
                    quadrant.children.push(item);
                }
            }
        }

        this.notifyListeners();
    }

    /**
     * Reorder an item within the same section
     */
    reorderItem(itemId: string, section: 'todo' | 'q1' | 'q2' | 'q3' | 'q4' | 'done', insertIndex: number): void {
        if (!this.state) return;
        if (insertIndex === undefined || insertIndex < 0) return;

        let items: any[] = [];
        
        // Get the items array for the section
        if (section === 'todo') {
            items = this.state.data.banks.todo;
        } else if (section === 'done') {
            items = this.state.data.banks.done;
        } else {
            const quadrant = this.state.children.find(q => q.id === section);
            if (!quadrant) return;
            items = quadrant.children;
        }

        // Find current index
        const currentIndex = items.findIndex(i => i.id === itemId);
        if (currentIndex === -1) return;

        // Remove item from current position
        const item = items.splice(currentIndex, 1)[0];

        // Adjust insert index if needed (since we removed an item before it)
        let adjustedIndex = insertIndex;
        if (insertIndex > currentIndex) {
            adjustedIndex = insertIndex - 1;
        }

        // Clamp to valid range
        adjustedIndex = Math.max(0, Math.min(adjustedIndex, items.length));

        // Insert at new position
        items.splice(adjustedIndex, 0, item);

        this.notifyListeners();
    }
}

