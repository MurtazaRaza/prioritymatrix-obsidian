import { h, Fragment } from 'preact';
import { useState, useRef, useEffect } from 'preact/hooks';
import { Item, Matrix } from '../../types';
import { Items } from '../Item/Items';
import { StateManager } from '../../state/StateManager';
import { App, TFile } from 'obsidian';
import { createLogger } from '../../utils/logger';

const log = createLogger('TodoBank');

interface TodoBankProps {
    items: Item[];
    collapsed: boolean;
    onToggleCollapse: () => void;
    onItemClick?: (item: Item) => void;
    onPointerDragStart?: (itemId: string, from: 'todo' | 'q1' | 'q2' | 'q3' | 'q4' | 'done', pointer: PointerEvent) => void;
    onPointerDragMove?: (pointer: PointerEvent) => void;
    onPointerDragEnd?: () => void;
    stateManager: StateManager;
    app: App;
    matrixFile: TFile;
}

export function TodoBank({
    items,
    collapsed,
    onToggleCollapse,
    onItemClick,
    onPointerDragStart,
    onPointerDragMove,
    onPointerDragEnd,
    stateManager,
    app,
    matrixFile,
}: TodoBankProps) {
    const [isAdding, setIsAdding] = useState(false);
    const [newItemText, setNewItemText] = useState('');
    const inputRef = useRef<HTMLInputElement>(null);
    const itemJustAddedRef = useRef<string | null>(null);
    const [isExternalDragOver, setIsExternalDragOver] = useState(false);

    useEffect(() => {
        if (isAdding && inputRef.current && !collapsed) {
            inputRef.current.focus();
        }
    }, [isAdding, collapsed]);

    // Reset adding state if bank is collapsed
    useEffect(() => {
        if (collapsed && isAdding) {
            setIsAdding(false);
            setNewItemText('');
        }
    }, [collapsed]);

    const handleDragEnter = (e: DragEvent) => {
        if (!e.dataTransfer) return;
        // Indicate we can handle this drag; actual validation happens on drop
        e.preventDefault();
        setIsExternalDragOver(true);
    };

    const handleDragOver = (e: DragEvent) => {
        if (!e.dataTransfer) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = 'copy';
        setIsExternalDragOver(true);
    };

    const handleDragLeave = () => {
        setIsExternalDragOver(false);
    };

    const handleDrop = async (e: DragEvent) => {
        if (!e.dataTransfer) return;
        e.preventDefault();
        e.stopPropagation();
        setIsExternalDragOver(false);

        const matrix = stateManager.getState();
        if (!matrix) {
            log.log('handleDrop: no matrix state');
            return;
        }

        try {
            const dt = e.dataTransfer;
            let resolved: TFile | null = null;

            // Debug: log the available dataTransfer types and a preview of key payloads
            try {
                const types = Array.from(dt.types || []);
                const plainPreview = dt.getData('text/plain')?.slice(0, 200) ?? '';
                const uriPreview = dt.getData('text/uri-list')?.slice(0, 200) ?? '';
                const htmlPreview = dt.getData('text/html')?.slice(0, 200) ?? '';
                log.log('TodoBank drop dataTransfer payloads', {
                    types,
                    plainPreview,
                    uriPreview,
                    htmlPreview,
                    filesCount: dt.files?.length || 0,
                });
            } catch (err) {
                log.log('handleDrop: error logging dataTransfer', err);
            }

            // First, try to get file directly from dataTransfer.files (if Obsidian provides it)
            if (dt.files && dt.files.length > 0) {
                const file = dt.files[0];
                if (file.name.endsWith('.md')) {
                    // Try to resolve the file by name/path
                    const fileName = file.name;
                    // Try to find the file in the vault
                    const vaultFile = app.vault.getAbstractFileByPath(fileName);
                    if (vaultFile instanceof TFile) {
                        resolved = vaultFile;
                        log.log('handleDrop: resolved file from dataTransfer.files', resolved.path);
                    } else {
                        // Try to find by basename
                        const allFiles = app.vault.getMarkdownFiles();
                        const found = allFiles.find(f => f.basename === fileName.replace(/\.md$/, ''));
                        if (found) {
                            resolved = found;
                            log.log('handleDrop: resolved file by basename', resolved.path);
                        }
                    }
                }
            }

            // If not resolved from files, try dataTransfer data
            if (!resolved) {
                let linkTarget = dt.getData('text/plain')?.trim();

                // Fallback to URI list if plain text is empty
                if (!linkTarget) {
                    const uriList = dt.getData('text/uri-list')?.trim();
                    if (uriList) {
                        linkTarget = uriList.split('\n')[0].trim();
                    }
                }

                if (!linkTarget) {
                    log.log('handleDrop: no linkTarget found from dataTransfer data');
                    return;
                }

                // Check if it's an Obsidian URI (obsidian://open?vault=...&file=...)
                if (linkTarget.startsWith('obsidian://')) {
                    try {
                        const url = new URL(linkTarget);
                        const fileParam = url.searchParams.get('file');
                        if (fileParam) {
                            // Decode the file path (it's URL-encoded)
                            const decodedPath = decodeURIComponent(fileParam);
                            log.log('handleDrop: extracted file path from obsidian:// URI', decodedPath);
                            
                            // Get the file directly from the vault
                            const vaultFile = app.vault.getAbstractFileByPath(decodedPath);
                            if (vaultFile instanceof TFile) {
                                resolved = vaultFile;
                                log.log('handleDrop: resolved file from obsidian:// URI', resolved.path);
                            } else {
                                // Try without extension (in case the URI doesn't include .md)
                                const withoutExt = decodedPath.replace(/\.md$/, '');
                                const vaultFileNoExt = app.vault.getAbstractFileByPath(withoutExt);
                                if (vaultFileNoExt instanceof TFile) {
                                    resolved = vaultFileNoExt;
                                    log.log('handleDrop: resolved file from obsidian:// URI (without ext)', resolved.path);
                                } else {
                                    // Try to find by basename
                                    const basename = decodedPath.split('/').pop() || decodedPath;
                                    const allFiles = app.vault.getMarkdownFiles();
                                    const found = allFiles.find(f => f.basename === basename.replace(/\.md$/, ''));
                                    if (found) {
                                        resolved = found;
                                        log.log('handleDrop: resolved file by basename from obsidian:// URI', resolved.path);
                                    }
                                }
                            }
                        }
                    } catch (err) {
                        log.log('handleDrop: error parsing obsidian:// URI', err);
                    }
                } else {
                    // Handle regular wikilink or path format
                    const wikilinkMatch = linkTarget.match(/\[\[([^\]]+)\]\]/);
                    if (wikilinkMatch) {
                        // Use the inner wikilink target (before alias if present)
                        const content = wikilinkMatch[1];
                        const [path] = content.split('|');
                        linkTarget = path.trim();
                    }

                    if (!linkTarget) {
                        log.log('handleDrop: linkTarget empty after processing');
                        return;
                    }

                    // Resolve to a file within the vault, relative to the matrix file
                    resolved = app.metadataCache.getFirstLinkpathDest(linkTarget, matrixFile.path);
                    if (resolved) {
                        log.log('handleDrop: resolved file from linkTarget', linkTarget, '->', resolved.path);
                    }
                }
            }

            if (!resolved || resolved.extension.toLowerCase() !== 'md') {
                log.log('handleDrop: no valid md file resolved', { resolved: resolved?.path, extension: resolved?.extension });
                return;
            }

            const filePath = resolved.path;

            // Build set of existing paths using same logic as refreshTodos
            const existingPaths = new Set<string>();

            const collectExisting = (m: Matrix) => {
                m.data.banks.todo.forEach(item => {
                    const existingFilePath = item.data.metadata.fileAccessor?.path;
                    if (existingFilePath) {
                        existingPaths.add(existingFilePath);
                        return;
                    }
                    const match = item.data.titleRaw.match(/\[\[([^\]]+)\]\]/);
                    if (match) {
                        const path = match[1].split('|')[0].trim();
                        existingPaths.add(path);
                    }
                });

                m.data.banks.done.forEach(item => {
                    const existingFilePath = item.data.metadata.fileAccessor?.path;
                    if (existingFilePath) {
                        existingPaths.add(existingFilePath);
                        return;
                    }
                    const match = item.data.titleRaw.match(/\[\[([^\]]+)\]\]/);
                    if (match) {
                        const path = match[1].split('|')[0].trim();
                        existingPaths.add(path);
                    }
                });

                m.children.forEach(quadrant => {
                    quadrant.children.forEach(item => {
                        const existingFilePath = item.data.metadata.fileAccessor?.path;
                        if (existingFilePath) {
                            existingPaths.add(existingFilePath);
                            return;
                        }
                        const match = item.data.titleRaw.match(/\[\[([^\]]+)\]\]/);
                        if (match) {
                            const path = match[1].split('|')[0].trim();
                            existingPaths.add(path);
                        }
                    });
                });
            };

            collectExisting(matrix);

            if (existingPaths.has(filePath)) {
                // Already in matrix somewhere; silently skip
                log.log('handleDrop: file already in matrix', filePath);
                return;
            }

            log.log('handleDrop: proceeding to add file', filePath);

            const settings = matrix.data.settings;

            // Resolve includePath similar to refreshTodos logic
            const matrixFolder = matrixFile.parent;
            const includePath = settings.includePath !== undefined && settings.includePath !== null && settings.includePath !== ''
                ? settings.includePath
                : (matrixFolder ? matrixFolder.path : '/');

            const normalizedInclude = includePath === '/' ? '' : includePath.replace(/^\/*|\/*$/g, '');
            const normalizedFilePath = filePath.replace(/^\/*/, '');

            const isWithinInclude =
                normalizedInclude.length === 0 ||
                normalizedFilePath === normalizedInclude ||
                normalizedFilePath.startsWith(normalizedInclude + '/');

            const exemptSet = new Set<string>((settings.exemptPaths || []).map(p => p.trim()).filter(Boolean));
            const isExempt = exemptSet.has(filePath);

            // Prepare updated settings, managing explicitlyAddedNotes if needed
            const existingExplicit = (settings.explicitlyAddedNotes || []).map(p => p.trim()).filter(Boolean);
            const explicitSet = new Set<string>(existingExplicit);

            if (!isWithinInclude || isExempt) {
                // Outside include path (or explicitly exempt) -> track explicitly
                explicitSet.add(filePath);
            }

            const updatedSettings = {
                ...settings,
                explicitlyAddedNotes: Array.from(explicitSet),
            };

            // Create new TODO item as a hydrated link item
            const titleRaw = `[[${filePath}]]`;
            const title = resolved.basename;

            const newItem: Item = {
                id: filePath,
                data: {
                    title,
                    titleRaw,
                    checked: false,
                    metadata: {
                        fileAccessor: resolved,
                    },
                },
            };

            const updatedMatrix: Matrix = {
                ...matrix,
                data: {
                    ...matrix.data,
                    settings: updatedSettings,
                    banks: {
                        ...matrix.data.banks,
                        todo: [...matrix.data.banks.todo, newItem],
                    },
                },
            };

            log.log('handleDrop: updating matrix state with new item', {
                filePath,
                newItemId: newItem.id,
                todoCount: updatedMatrix.data.banks.todo.length,
            });

            stateManager.setState(updatedMatrix);
            log.log('handleDrop: state updated, saving...');
            await stateManager.save();
            log.log('handleDrop: save completed');
        } catch (error) {
            log.error('Error handling drop into TODO bank', error);
        }
    };

    const handleAddClick = () => {
        // If collapsed, expand first
        if (collapsed) {
            onToggleCollapse();
            // Wait a bit for the expansion animation, then show input
            globalThis.setTimeout(() => {
                setIsAdding(true);
            }, 100);
        } else {
            setIsAdding(true);
        }
    };

    const handleInputKeyDown = async (e: KeyboardEvent) => {
        if (e.key === 'Enter' && newItemText.trim()) {
            e.preventDefault();
            const text = newItemText.trim();
            stateManager.addItem(text, 'todo');
            await stateManager.save();
            // Track that we just added this item to prevent duplicate on blur
            itemJustAddedRef.current = text;
            setNewItemText('');
            setIsAdding(false);
            // Clear the flag after a short delay
            globalThis.setTimeout(() => {
                itemJustAddedRef.current = null;
            }, 500);
        } else if (e.key === 'Escape') {
            setNewItemText('');
            setIsAdding(false);
            itemJustAddedRef.current = null;
        }
    };

    const handleInputBlur = () => {
        // Only hide if we're not clicking the add button
        globalThis.setTimeout(() => {
            const text = newItemText.trim();
            // Don't add if we just added this item (e.g., via Enter key)
            // or if the item already exists in the list
            if (text && itemJustAddedRef.current !== text) {
                // Check if item already exists to prevent duplicates
                const itemExists = items.some(item => 
                    item.data.title === text || item.data.titleRaw === text
                );
                if (!itemExists) {
                    stateManager.addItem(text, 'todo');
                    void stateManager.save();
                    itemJustAddedRef.current = text;
                    globalThis.setTimeout(() => {
                        itemJustAddedRef.current = null;
                    }, 500);
                }
                setNewItemText('');
            }
            setIsAdding(false);
        }, 200);
    };

    return (
        <>
            <div className="pmx-col-header">
                <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    TODO
                    <button 
                        className="pmx-collapse-btn"
                        onClick={handleAddClick}
                        aria-label="Add item"
                        title="Add item"
                    >
                        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg">
                            <path d="M6 3V9M3 6H9" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
                        </svg>
                    </button>
                    <button 
                        className="pmx-collapse-btn"
                        onClick={onToggleCollapse}
                        aria-label={collapsed ? 'Expand' : 'Collapse'}
                    >
                        {collapsed ? (
                            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg">
                                <path d="M3 4.5L6 7.5L9 4.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
                            </svg>
                        ) : (
                            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg">
                                <path d="M3 7.5L6 4.5L9 7.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
                            </svg>
                        )}
                    </button>
                </span>
            </div>
            <div
                className={`pmx-bank pmx-todo ${collapsed ? 'pmx-collapsed' : ''} ${isExternalDragOver ? 'pmx-drop-target' : ''}`}
                onDragEnter={(e) => handleDragEnter(e as unknown as DragEvent)}
                onDragOver={(e) => handleDragOver(e as unknown as DragEvent)}
                onDragLeave={() => handleDragLeave()}
                onDrop={(e) => { void handleDrop(e as unknown as DragEvent); }}
            >
                <div className="pmx-cell-items-wrapper">
                    {isAdding && !collapsed && (
                        <div className="pmx-add-item-input-wrapper" style={{ margin: '4px', padding: '4px' }}>
                            <input
                                ref={inputRef}
                                type="text"
                                className="pmx-add-item-input"
                                value={newItemText}
                                onInput={(e) => setNewItemText((e.target as HTMLInputElement).value)}
                                onKeyDown={(e) => { void handleInputKeyDown(e as KeyboardEvent); }}
                                onBlur={handleInputBlur}
                                placeholder="Enter item text..."
                                style={{
                                    width: '100%',
                                    padding: '4px 8px',
                                    border: '1px solid var(--background-modifier-border)',
                                    borderRadius: 'var(--input-radius)',
                                    background: 'var(--background-primary)',
                                    color: 'var(--text-normal)',
                                    fontSize: '0.875rem',
                                }}
                            />
                        </div>
                    )}
                    <Items
                        items={items}
                        onItemClick={onItemClick}
                        onPointerDragStart={onPointerDragStart}
                        onPointerDragMove={onPointerDragMove}
                        onPointerDragEnd={onPointerDragEnd}
                        from="todo"
                        stateManager={stateManager}
                        app={app}
                    />
                </div>
            </div>
        </>
    );
}

