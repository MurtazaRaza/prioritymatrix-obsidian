import { TFile } from 'obsidian';

export interface MatrixSettings {
    includePath: string;
    recursive: boolean;
    todoTag: string;
    maxFiles: number;
    autoRemoveTodoOnDone: boolean;
    enableStrikethroughOnDone: boolean;
    exemptPaths: string[];
}

export interface ItemMetadata {
    date?: Date;
    tags?: string[];
    fileAccessor?: TFile;
    [key: string]: unknown;
}

export interface ItemData {
    title: string;
    titleRaw: string; // Original markdown
    checked: boolean;
    metadata: ItemMetadata;
}

export interface Item {
    id: string;
    data: ItemData;
}

export interface QuadrantData {
    title: string;
    urgent: boolean;
    important: boolean;
}

export interface Quadrant {
    id: 'q1' | 'q2' | 'q3' | 'q4';
    children: Item[];
    data: QuadrantData;
}

export interface MatrixBanks {
    todo: Item[];
    done: Item[];
}

export interface ErrorReport {
    message: string;
    line?: number;
    column?: number;
}

export interface MatrixData {
    settings: MatrixSettings;
    frontmatter: Record<string, unknown>;
    banks: MatrixBanks;
    errors: ErrorReport[];
}

export interface Matrix {
    id: string; // file path
    children: Quadrant[];
    data: MatrixData;
}

