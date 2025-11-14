import { h } from 'preact';
import { useState, useCallback } from 'preact/hooks';
import { Matrix as MatrixType, Item } from '../types';
import { Quadrants } from './Quadrant/Quadrants';
import { TodoBank } from './Banks/TodoBank';
import { DoneBank } from './Banks/DoneBank';
import { StateManager } from '../state/StateManager';
import { App } from 'obsidian';
import { PriorityMatrixView } from '../views/PriorityMatrixView';

interface MatrixProps {
    matrix: MatrixType | null;
    stateManager: StateManager;
    app: App;
}

export function Matrix({ matrix, stateManager, app }: MatrixProps) {
    const [todoCollapsed, setTodoCollapsed] = useState(false);
    const [doneCollapsed, setDoneCollapsed] = useState(false);
    const [dragState, setDragState] = useState<{
        draggedItemId: string | null;
        draggedFrom: 'todo' | 'q1' | 'q2' | 'q3' | 'q4' | 'done' | null;
        hoverOverSection: 'todo' | 'q1' | 'q2' | 'q3' | 'q4' | 'done' | null;
        hoverOverItemId: string | null;
        insertIndex: number | null;
    }>({
        draggedItemId: null,
        draggedFrom: null,
        hoverOverSection: null,
        hoverOverItemId: null,
        insertIndex: null,
    });

    const handleItemClick = useCallback((item: Item) => {
        if (item.data.metadata.fileAccessor) {
            // Open in a new tab (newLeaf = true) so the priority matrix stays open
            app.workspace.openLinkText(
                item.data.metadata.fileAccessor.path,
                '',
                true
            );
        }
    }, [app]);

    // Calculate insertion index based on mouse position (handles flex-wrap layouts properly)
    const calculateInsertIndex = useCallback((containerElement: HTMLElement, mouseX: number, mouseY: number, draggedItemId: string): number => {
        const listElement = containerElement.querySelector('.pmx-list');
        if (!listElement) return -1;

        const items = Array.from(listElement.querySelectorAll<HTMLElement>('.pmx-item.pmx-bubble:not(.dragging)'));
        if (items.length === 0) return 0;

        // Group items by row (items with similar top position are on the same row)
        const rows: { top: number; items: Array<{ element: HTMLElement; index: number; rect: DOMRect }> }[] = [];
        const rowTolerance = 10; // pixels tolerance for considering items on the same row

        items.forEach((item, index) => {
            const rect = item.getBoundingClientRect();
            const top = rect.top;
            
            // Find existing row or create new one
            let row = rows.find(r => Math.abs(r.top - top) < rowTolerance);
            if (!row) {
                row = { top, items: [] };
                rows.push(row);
            }
            row.items.push({ element: item, index, rect });
        });

        // Sort rows by top position
        rows.sort((a, b) => a.top - b.top);

        // Find which row the mouse is in (or closest to)
        let targetRow: typeof rows[0] | null = null;
        let targetRowIndex = -1;

        for (let i = 0; i < rows.length; i++) {
            const row = rows[i];
            const firstItem = row.items[0];
            const lastItem = row.items[row.items.length - 1];
            const rowTop = firstItem.rect.top;
            const rowBottom = lastItem.rect.bottom;

            // Check if mouse is within this row
            if (mouseY >= rowTop && mouseY <= rowBottom) {
                targetRow = row;
                targetRowIndex = i;
                break;
            }

            // If mouse is between rows, choose the closer one
            if (i < rows.length - 1) {
                const nextRowTop = rows[i + 1].items[0].rect.top;
                const midPoint = (rowBottom + nextRowTop) / 2;
                if (mouseY < midPoint) {
                    targetRow = row;
                    targetRowIndex = i;
                    break;
                }
            }
        }

        // If no row found, use first or last row
        if (!targetRow) {
            if (mouseY < rows[0]?.top) {
                targetRow = rows[0];
                targetRowIndex = 0;
            } else {
                targetRow = rows[rows.length - 1];
                targetRowIndex = rows.length - 1;
            }
        }

        if (!targetRow) return items.length;

        // Sort items in the row by left position (x-axis)
        const sortedRowItems = [...targetRow.items].sort((a, b) => a.rect.left - b.rect.left);

        // Find insertion point within the row based on x-axis
        let insertIndexInRow = -1;
        for (let i = 0; i < sortedRowItems.length; i++) {
            const item = sortedRowItems[i];
            const itemCenterX = item.rect.left + item.rect.width / 2;
            
            if (mouseX < itemCenterX) {
                insertIndexInRow = i;
                break;
            }
        }

        // If mouse is after all items in the row
        if (insertIndexInRow === -1) {
            insertIndexInRow = sortedRowItems.length;
        }

        // Map back to actual index in the DOM order
        if (insertIndexInRow < sortedRowItems.length) {
            // Inserting before an item in this row
            return sortedRowItems[insertIndexInRow].index;
        } else {
            // Inserting after the last item in the row
            // In flex-wrap layouts, we need to insert before the first item of the next row,
            // or at the end if this is the last row
            const lastItemInRow = sortedRowItems[sortedRowItems.length - 1];
            
            // Check if there's a next row
            if (targetRowIndex < rows.length - 1) {
                // Insert before the first item of the next row
                const nextRowFirstItem = [...rows[targetRowIndex + 1].items].sort((a, b) => a.rect.left - b.rect.left)[0];
                return nextRowFirstItem.index;
            } else {
                // This is the last row, insert at the end
                return lastItemInRow.index + 1;
            }
        }
    }, []);

    const handleDragOver = useCallback((e: DragEvent, section: 'todo' | 'q1' | 'q2' | 'q3' | 'q4' | 'done') => {
        e.preventDefault();
        
        const draggedItemId = e.dataTransfer?.getData('text/plain');
        const from = e.dataTransfer?.getData('text/pmx-from') as 'todo' | 'q1' | 'q2' | 'q3' | 'q4' | 'done';
        
        if (!draggedItemId || !from) return;

        const containerElement = e.currentTarget as HTMLElement;
        
        // Calculate insertion index based on mouse position
        const insertIndex = calculateInsertIndex(containerElement, e.clientX, e.clientY, draggedItemId);
        
        // Find the item we're hovering over
        const target = e.target as HTMLElement;
        const bubble = target.closest('.pmx-item.pmx-bubble:not(.dragging)') as HTMLElement;
        const hoverOverItemId = bubble?.getAttribute('data-item-id') || null;

        setDragState({
            draggedItemId,
            draggedFrom: from,
            hoverOverSection: section,
            hoverOverItemId,
            insertIndex,
        });

        // Update visual feedback with preview
        const listElement = containerElement.querySelector('.pmx-list');
        if (listElement) {
            // Remove all drop indicators and shift classes in this list
            listElement.querySelectorAll('.pmx-item').forEach(el => {
                el.classList.remove('pmx-drop-before', 'pmx-drop-after', 'pmx-shift-right');
            });
            // Remove any placeholder elements
            listElement.querySelectorAll('.pmx-drop-placeholder').forEach(el => el.remove());

            const items = Array.from(listElement.querySelectorAll<HTMLElement>('.pmx-item.pmx-bubble:not(.dragging)'));
            
            if (items.length > 0 && insertIndex >= 0 && insertIndex <= items.length) {
                // Create a placeholder element to show where the item will be inserted
                const placeholder = document.createElement('li');
                placeholder.className = 'pmx-item pmx-drop-placeholder';
                placeholder.style.cssText = `
                    width: 40px;
                    height: 28px;
                    border: 2px dashed var(--interactive-accent);
                    border-radius: 999px;
                    background: var(--interactive-accent);
                    opacity: 0.3;
                    pointer-events: none;
                    transition: all 0.2s ease;
                `;

                if (insertIndex < items.length) {
                    // Insert before this item
                    const targetItem = items[insertIndex];
                    targetItem.parentNode?.insertBefore(placeholder, targetItem);
                    targetItem.classList.add('pmx-shift-right');
                    // Also shift items that come after in the same visual row
                    const targetRect = targetItem.getBoundingClientRect();
                    items.slice(insertIndex + 1).forEach(item => {
                        const itemRect = item.getBoundingClientRect();
                        // If items are on the same row (within tolerance), shift them too
                        if (Math.abs(itemRect.top - targetRect.top) < 10) {
                            item.classList.add('pmx-shift-right');
                        }
                    });
                } else {
                    // Inserting at the end
                    const lastItem = items[items.length - 1];
                    lastItem.parentNode?.appendChild(placeholder);
                    lastItem.classList.add('pmx-drop-after');
                }
            }
        }
    }, [calculateInsertIndex]);

    const handleDragLeave = useCallback((e: DragEvent) => {
        // Only clear if we're leaving the container, not just moving between children
        const relatedTarget = e.relatedTarget as HTMLElement;
        const currentTarget = e.currentTarget as HTMLElement;
        
        if (!currentTarget.contains(relatedTarget)) {
            setDragState(prev => ({
                ...prev,
                hoverOverSection: null,
                hoverOverItemId: null,
                insertIndex: null,
            }));
            
            // Clear all drop indicators, placeholders, and shift classes
            document.querySelectorAll('.pmx-drop-before, .pmx-drop-after, .pmx-shift-right').forEach(el => {
                el.classList.remove('pmx-drop-before', 'pmx-drop-after', 'pmx-shift-right');
            });
            document.querySelectorAll('.pmx-drop-placeholder').forEach(el => el.remove());
        }
    }, []);

    const handleDrop = useCallback((e: DragEvent, to: 'todo' | 'q1' | 'q2' | 'q3' | 'q4' | 'done') => {
        e.preventDefault();
        const itemId = e.dataTransfer?.getData('text/plain');
        const from = e.dataTransfer?.getData('text/pmx-from') as 'todo' | 'q1' | 'q2' | 'q3' | 'q4' | 'done';
        if (!itemId || !from) return;
        
        // Remove dragging class from all bubbles
        document.querySelectorAll('.pmx-bubble.dragging').forEach(el => {
            el.classList.remove('dragging');
        });
        
        // Clear all drop indicators, placeholders, and shift classes
        document.querySelectorAll('.pmx-drop-before, .pmx-drop-after, .pmx-shift-right').forEach(el => {
            el.classList.remove('pmx-drop-before', 'pmx-drop-after', 'pmx-shift-right');
        });
        document.querySelectorAll('.pmx-drop-placeholder').forEach(el => el.remove());

        const containerElement = e.currentTarget as HTMLElement;
        
        // Calculate insertion index at drop time (most accurate)
        const insertIndex = calculateInsertIndex(containerElement, e.clientX, e.clientY, itemId);

        console.log('[PriorityMatrix] Drop:', { itemId, from, to, insertIndex });

        if (insertIndex >= 0) {
            stateManager.moveItem(itemId, from, to, insertIndex);
        } else {
            stateManager.moveItem(itemId, from, to);
        }
        
        stateManager.save();
        
        // Reset drag state
        setDragState({
            draggedItemId: null,
            draggedFrom: null,
            hoverOverSection: null,
            hoverOverItemId: null,
            insertIndex: null,
        });
    }, [stateManager, calculateInsertIndex]);

    const handleDragStart = useCallback((e: DragEvent, itemId: string, from: 'todo' | 'q1' | 'q2' | 'q3' | 'q4' | 'done') => {
        e.dataTransfer?.setData('text/plain', itemId);
        e.dataTransfer?.setData('text/pmx-from', from);
        (e.target as HTMLElement)?.classList.add('dragging');
        
        setDragState({
            draggedItemId: itemId,
            draggedFrom: from,
            hoverOverSection: null,
            hoverOverItemId: null,
            insertIndex: null,
        });
    }, []);

    const handleDragEnd = useCallback((e: DragEvent) => {
        (e.target as HTMLElement)?.classList.remove('dragging');
        
        // Clear all drop indicators and placeholders
        document.querySelectorAll('.pmx-drop-before, .pmx-drop-after, .pmx-shift-right').forEach(el => {
            el.classList.remove('pmx-drop-before', 'pmx-drop-after', 'pmx-shift-right');
        });
        document.querySelectorAll('.pmx-drop-placeholder').forEach(el => el.remove());
        
        // Reset drag state
        setDragState({
            draggedItemId: null,
            draggedFrom: null,
            hoverOverSection: null,
            hoverOverItemId: null,
            insertIndex: null,
        });
    }, []);

    if (!matrix) {
        return <div>Loading...</div>;
    }

    return (
        <div className="priority-matrix-container">
            <div className="priority-matrix-toolbar">
                <div className="priority-matrix-title">Eisenhower Matrix</div>
                <div style={{ display: 'flex', gap: '8px' }}>
                    <button onClick={async () => {
                        // Refresh TODO items
                        const view = app.workspace.getActiveViewOfType(PriorityMatrixView);
                        if (view && view.file) {
                            await view.refreshTodos();
                        }
                    }}>
                        Refresh TODOs
                    </button>
                    <button onClick={async () => {
                        // Switch to markdown view
                        const file = matrix.id;
                        app.workspace.getLeaf(true).setViewState({
                            type: 'markdown',
                            state: { file },
                        });
                    }}>
                        Open as markdown
                    </button>
                </div>
            </div>
            <div className="priority-matrix-grid">
                <div
                    className="pmx-bank-wrapper"
                    onDragOver={(e) => handleDragOver(e, 'todo')}
                    onDragLeave={handleDragLeave}
                    onDrop={(e) => handleDrop(e, 'todo')}
                >
                    <TodoBank
                        items={matrix.data.banks.todo}
                        collapsed={todoCollapsed}
                        onToggleCollapse={() => setTodoCollapsed(!todoCollapsed)}
                        onItemClick={handleItemClick}
                        onDragStart={handleDragStart}
                        onDragEnd={handleDragEnd}
                    />
                </div>
                
                <div className="pmx-matrix-header">
                    <div className="pmx-col-subheader">Urgent</div>
                    <div className="pmx-col-subheader">Not urgent</div>
                </div>

                <div
                    className="pmx-cell pmx-q1"
                    onDragOver={(e) => handleDragOver(e, 'q1')}
                    onDragLeave={handleDragLeave}
                    onDrop={(e) => handleDrop(e, 'q1')}
                >
                    <div className="pmx-cell-title">Q1: Do</div>
                    <ul className="pmx-list">
                        {matrix.children.find(q => q.id === 'q1')?.children.map((item) => (
                            <li
                                key={item.id}
                                className="pmx-item pmx-bubble"
                                draggable={true}
                                data-item-id={item.id}
                                onDragStart={(e) => handleDragStart(e, item.id, 'q1')}
                                onDragEnd={handleDragEnd}
                                onClick={() => handleItemClick(item)}
                            >
                                {item.data.metadata.fileAccessor ? (
                                    <a href="#" onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleItemClick(item); }}>
                                        {item.data.title}
                                    </a>
                                ) : (
                                    <span>{item.data.title}</span>
                                )}
                            </li>
                        ))}
                    </ul>
                </div>

                <div
                    className="pmx-cell pmx-q2"
                    onDragOver={(e) => handleDragOver(e, 'q2')}
                    onDragLeave={handleDragLeave}
                    onDrop={(e) => handleDrop(e, 'q2')}
                >
                    <div className="pmx-cell-title">Q2: Plan</div>
                    <ul className="pmx-list">
                        {matrix.children.find(q => q.id === 'q2')?.children.map((item) => (
                            <li
                                key={item.id}
                                className="pmx-item pmx-bubble"
                                draggable={true}
                                data-item-id={item.id}
                                onDragStart={(e) => handleDragStart(e, item.id, 'q2')}
                                onDragEnd={handleDragEnd}
                                onClick={() => handleItemClick(item)}
                            >
                                {item.data.metadata.fileAccessor ? (
                                    <a href="#" onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleItemClick(item); }}>
                                        {item.data.title}
                                    </a>
                                ) : (
                                    <span>{item.data.title}</span>
                                )}
                            </li>
                        ))}
                    </ul>
                </div>

                <div
                    className="pmx-cell pmx-q3"
                    onDragOver={(e) => handleDragOver(e, 'q3')}
                    onDragLeave={handleDragLeave}
                    onDrop={(e) => handleDrop(e, 'q3')}
                >
                    <div className="pmx-cell-title">Q3: Delegate</div>
                    <ul className="pmx-list">
                        {matrix.children.find(q => q.id === 'q3')?.children.map((item) => (
                            <li
                                key={item.id}
                                className="pmx-item pmx-bubble"
                                draggable={true}
                                data-item-id={item.id}
                                onDragStart={(e) => handleDragStart(e, item.id, 'q3')}
                                onDragEnd={handleDragEnd}
                                onClick={() => handleItemClick(item)}
                            >
                                {item.data.metadata.fileAccessor ? (
                                    <a href="#" onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleItemClick(item); }}>
                                        {item.data.title}
                                    </a>
                                ) : (
                                    <span>{item.data.title}</span>
                                )}
                            </li>
                        ))}
                    </ul>
                </div>

                <div
                    className="pmx-cell pmx-q4"
                    onDragOver={(e) => handleDragOver(e, 'q4')}
                    onDragLeave={handleDragLeave}
                    onDrop={(e) => handleDrop(e, 'q4')}
                >
                    <div className="pmx-cell-title">Q4: Eliminate</div>
                    <ul className="pmx-list">
                        {matrix.children.find(q => q.id === 'q4')?.children.map((item) => (
                            <li
                                key={item.id}
                                className="pmx-item pmx-bubble"
                                draggable={true}
                                data-item-id={item.id}
                                onDragStart={(e) => handleDragStart(e, item.id, 'q4')}
                                onDragEnd={handleDragEnd}
                                onClick={() => handleItemClick(item)}
                            >
                                {item.data.metadata.fileAccessor ? (
                                    <a href="#" onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleItemClick(item); }}>
                                        {item.data.title}
                                    </a>
                                ) : (
                                    <span>{item.data.title}</span>
                                )}
                            </li>
                        ))}
                    </ul>
                </div>

                <div
                    className="pmx-bank-wrapper"
                    onDragOver={(e) => handleDragOver(e, 'done')}
                    onDragLeave={handleDragLeave}
                    onDrop={(e) => handleDrop(e, 'done')}
                >
                    <DoneBank
                        items={matrix.data.banks.done}
                        collapsed={doneCollapsed}
                        onToggleCollapse={() => setDoneCollapsed(!doneCollapsed)}
                        onItemClick={handleItemClick}
                        onDragStart={handleDragStart}
                        onDragEnd={handleDragEnd}
                    />
                </div>
            </div>
        </div>
    );
}

