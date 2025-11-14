import { App, TFile } from 'obsidian';
import { Matrix } from '../types';
import { mdToMatrix, matrixToMd } from '../parsers/MatrixFormat';

export class StateManager {
    private app: App;
    private file: TFile;
    private state: Matrix | null = null;
    private listeners: Set<() => void> = new Set();

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
        const md = matrixToMd(this.state);
        await this.app.vault.modify(this.file, md);
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
     * Move an item from one section to another
     */
    moveItem(itemId: string, from: 'todo' | 'q1' | 'q2' | 'q3' | 'q4' | 'done', to: 'todo' | 'q1' | 'q2' | 'q3' | 'q4' | 'done'): void {
        if (!this.state) return;
        if (from === to) return;

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

        // Add to destination
        if (to === 'todo') {
            this.state.data.banks.todo.push(item);
        } else if (to === 'done') {
            this.state.data.banks.done.push(item);
        } else {
            const quadrant = this.state.children.find(q => q.id === to);
            if (quadrant) {
                quadrant.children.push(item);
            }
        }

        this.notifyListeners();
    }
}

