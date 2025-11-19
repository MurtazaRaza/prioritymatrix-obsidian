import { h } from 'preact';
import { useState, useCallback } from 'preact/hooks';
import { Matrix as MatrixType, Item } from '../types';
import { Quadrants } from './Quadrant/Quadrants';
import { TodoBank } from './Banks/TodoBank';
import { DoneBank } from './Banks/DoneBank';
import { Items } from './Item/Items';
import { StateManager } from '../state/StateManager';
import { App } from 'obsidian';

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

    // Calculate insertion index based on mouse position (vertical column layout)
    const calculateInsertIndex = useCallback((containerElement: HTMLElement, mouseX: number, mouseY: number, draggedItemId: string): number => {
        const listElement = containerElement.querySelector('.pmx-list');
        if (!listElement) return -1;

        const items = Array.from(listElement.querySelectorAll<HTMLElement>('.pmx-item-wrapper:not(.dragging)'));
        if (items.length === 0) return 0;

        // For vertical column layout, find insertion point based on Y position
        for (let i = 0; i < items.length; i++) {
            const item = items[i];
            const rect = item.getBoundingClientRect();
            const itemCenterY = rect.top + rect.height / 2;
            
            if (mouseY < itemCenterY) {
                return i;
            }
        }

        // Mouse is below all items, insert at the end
        return items.length;
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
        const itemWrapper = target.closest('.pmx-item-wrapper:not(.dragging)') as HTMLElement;
        const item = itemWrapper?.querySelector('.pmx-item') as HTMLElement;
        const hoverOverItemId = item?.getAttribute('data-item-id') || null;

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
            listElement.querySelectorAll('.pmx-item-wrapper').forEach(el => {
                el.classList.remove('pmx-drop-before', 'pmx-drop-after', 'pmx-shift-right');
            });
            // Remove any placeholder elements
            listElement.querySelectorAll('.pmx-drop-placeholder').forEach(el => el.remove());

            const items = Array.from(listElement.querySelectorAll<HTMLElement>('.pmx-item-wrapper:not(.dragging)'));
            
            if (items.length > 0 && insertIndex >= 0 && insertIndex <= items.length) {
                // Create a placeholder element to show where the item will be inserted
                const placeholder = document.createElement('div');
                placeholder.className = 'pmx-drop-placeholder';

                if (insertIndex < items.length) {
                    // Insert before this item
                    const targetItem = items[insertIndex];
                    targetItem.parentNode?.insertBefore(placeholder, targetItem);
                    targetItem.classList.add('pmx-drop-before');
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
            document.querySelectorAll('.pmx-item-wrapper.pmx-drop-before, .pmx-item-wrapper.pmx-drop-after, .pmx-item-wrapper.pmx-shift-right').forEach(el => {
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
        
        // Remove dragging class from all items
        document.querySelectorAll('.pmx-item.dragging').forEach(el => {
            el.classList.remove('dragging');
        });
        
        // Clear all drop indicators, placeholders, and shift classes
        document.querySelectorAll('.pmx-item-wrapper.pmx-drop-before, .pmx-item-wrapper.pmx-drop-after, .pmx-item-wrapper.pmx-shift-right').forEach(el => {
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
        const target = e.target as HTMLElement;
        const item = target.closest('.pmx-item') as HTMLElement;
        if (item) {
            item.classList.add('dragging');
        }
        
        setDragState({
            draggedItemId: itemId,
            draggedFrom: from,
            hoverOverSection: null,
            hoverOverItemId: null,
            insertIndex: null,
        });
    }, []);

    const handleDragEnd = useCallback((e: DragEvent) => {
        const target = e.target as HTMLElement;
        const item = target.closest('.pmx-item') as HTMLElement;
        if (item) {
            item.classList.remove('dragging');
        }
        
        // Clear all drop indicators and placeholders
        document.querySelectorAll('.pmx-item-wrapper.pmx-drop-before, .pmx-item-wrapper.pmx-drop-after, .pmx-item-wrapper.pmx-shift-right').forEach(el => {
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
            {/* <div className="priority-matrix-toolbar">
                <div className="priority-matrix-title">Eisenhower Matrix</div>
            </div> */}
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
                        stateManager={stateManager}
                        app={app}
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
                    <div className="pmx-cell-items-wrapper">
                        <Items
                            items={matrix.children.find(q => q.id === 'q1')?.children || []}
                            onItemClick={handleItemClick}
                            onDragStart={handleDragStart}
                            onDragEnd={handleDragEnd}
                            from="q1"
                            stateManager={stateManager}
                            app={app}
                        />
                    </div>
                </div>

                <div
                    className="pmx-cell pmx-q2"
                    onDragOver={(e) => handleDragOver(e, 'q2')}
                    onDragLeave={handleDragLeave}
                    onDrop={(e) => handleDrop(e, 'q2')}
                >
                    <div className="pmx-cell-title">Q2: Plan</div>
                    <div className="pmx-cell-items-wrapper">
                        <Items
                            items={matrix.children.find(q => q.id === 'q2')?.children || []}
                            onItemClick={handleItemClick}
                            onDragStart={handleDragStart}
                            onDragEnd={handleDragEnd}
                            from="q2"
                            stateManager={stateManager}
                            app={app}
                        />
                    </div>
                </div>

                <div
                    className="pmx-cell pmx-q3"
                    onDragOver={(e) => handleDragOver(e, 'q3')}
                    onDragLeave={handleDragLeave}
                    onDrop={(e) => handleDrop(e, 'q3')}
                >
                    <div className="pmx-cell-title">Q3: Delegate</div>
                    <div className="pmx-cell-items-wrapper">
                        <Items
                            items={matrix.children.find(q => q.id === 'q3')?.children || []}
                            onItemClick={handleItemClick}
                            onDragStart={handleDragStart}
                            onDragEnd={handleDragEnd}
                            from="q3"
                            stateManager={stateManager}
                            app={app}
                        />
                    </div>
                </div>

                <div
                    className="pmx-cell pmx-q4"
                    onDragOver={(e) => handleDragOver(e, 'q4')}
                    onDragLeave={handleDragLeave}
                    onDrop={(e) => handleDrop(e, 'q4')}
                >
                    <div className="pmx-cell-title">Q4: Eliminate</div>
                    <div className="pmx-cell-items-wrapper">
                        <Items
                            items={matrix.children.find(q => q.id === 'q4')?.children || []}
                            onItemClick={handleItemClick}
                            onDragStart={handleDragStart}
                            onDragEnd={handleDragEnd}
                            from="q4"
                            stateManager={stateManager}
                            app={app}
                        />
                    </div>
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
                        stateManager={stateManager}
                        app={app}
                    />
                </div>
            </div>
        </div>
    );
}

