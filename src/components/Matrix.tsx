import { h } from 'preact';
import { useState, useCallback, useRef, useEffect } from 'preact/hooks';
import { Matrix as MatrixType, Item } from '../types';
import { Quadrants } from './Quadrant/Quadrants';
import { TodoBank } from './Banks/TodoBank';
import { DoneBank } from './Banks/DoneBank';
import { Items } from './Item/Items';
import { StateManager } from '../state/StateManager';
import { App } from 'obsidian';
import { DragOverlay } from './DragOverlay';
import { Coordinates } from '../utils/drag';

interface MatrixProps {
    matrix: MatrixType | null;
    stateManager: StateManager;
    app: App;
}

export function Matrix({ matrix, stateManager, app }: MatrixProps) {
    const [todoCollapsed, setTodoCollapsed] = useState(false);
    const [doneCollapsed, setDoneCollapsed] = useState(false);

    // Single source of truth for drag state that triggers renders
    const [dragState, setDragState] = useState<{
        draggedItemId: string | null;
        dragElement: HTMLElement | null;
        originPosition: Coordinates | null;
        pointerPosition: Coordinates | null;
    }>({
        draggedItemId: null,
        dragElement: null,
        originPosition: null,
        pointerPosition: null,
    });

    // Ref for mutable drag state that doesn't need to trigger renders (except for final drop)
    // We keep the essential state here for event handlers to access without closure staleness
    const touchDragStateRef = useRef<{
        itemId: string | null;
        from: 'todo' | 'q1' | 'q2' | 'q3' | 'q4' | 'done' | null;
        hoverOverSection: 'todo' | 'q1' | 'q2' | 'q3' | 'q4' | 'done' | null;
        insertIndex: number | null;
    }>({
        itemId: null,
        from: null,
        hoverOverSection: null,
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

    // Calculate insertion index based on pointer position
    // Simplified for robust flex-wrap handling
    const calculateInsertIndex = useCallback((containerElement: HTMLElement, mouseX: number, mouseY: number, draggedItemId: string): number => {
        const listElement = containerElement.querySelector('.pmx-list');
        if (!listElement) return -1;

        // Get all items excluding the dragged one (if it's in the same list) and placeholders
        const allItems = Array.from(listElement.querySelectorAll<HTMLElement>('.pmx-item-wrapper:not(.pmx-drop-placeholder)'));
        const items = allItems.filter(item => {
            const itemEl = item.querySelector('.pmx-item');
            const itemId = itemEl?.getAttribute('data-item-id');
            // Exclude the dragged item only if it's being dragged (has dragging class) or by ID match
            // But wait, we want to calculate index relative to *static* items.
            // The dragged item might be in the DOM but hidden/moved.
            return itemId !== draggedItemId && !item.classList.contains('dragging');
        });

        if (items.length === 0) return 0;

        // Find the item that the pointer is "before"
        // In a flex-wrap layout (LTR, Top-to-Bottom):
        // An item is "after" the pointer if:
        // 1. Its center Y is significantly below the pointer Y (next row)
        // 2. OR Its center Y is roughly same as pointer Y (same row) AND its center X is right of pointer X

        const ROW_TOLERANCE = 20; // px

        for (let i = 0; i < items.length; i++) {
            const item = items[i];
            const rect = item.getBoundingClientRect();
            const itemCenterX = rect.left + rect.width / 2;

            // Check if pointer is definitely above this item's row
            if (mouseY < rect.top - ROW_TOLERANCE) {
                return i;
            }

            // Check if pointer is in the same row
            if (mouseY >= rect.top - ROW_TOLERANCE && mouseY <= rect.bottom + ROW_TOLERANCE) {
                // If on same row, check X position
                if (mouseX < itemCenterX) {
                    return i;
                }
            }

            // If pointer is below this item, continue to next item
        }

        // If we haven't returned yet, the pointer is after all items
        return items.length;
    }, []);

    // HTML5 drag handlers removed - using unified pointer events instead

    // Unified pointer drag handlers
    const handlePointerDragStart = useCallback((itemId: string, from: 'todo' | 'q1' | 'q2' | 'q3' | 'q4' | 'done', pointer: PointerEvent) => {
        // Find the dragged element
        const dragElement = document.querySelector(`[data-item-id="${itemId}"]`)?.closest('.pmx-item') as HTMLElement;

        // Calculate origin position from element's bounding rect for overlay positioning
        // Use pageX/Y for pointer position to account for scrolling
        const pointerPosition: Coordinates = { x: pointer.pageX, y: pointer.pageY };

        // Origin position is the pointer position when drag starts (for calculating offset)
        const originPosition: Coordinates = { x: pointer.pageX, y: pointer.pageY };

        touchDragStateRef.current = {
            itemId,
            from,
            hoverOverSection: null,
            insertIndex: null,
        };

        setDragState({
            draggedItemId: itemId,
            dragElement,
            originPosition,
            pointerPosition,
        });

        // Prevent body scroll during drag (mainly for touch)
        if (['pen', 'touch'].includes(pointer.pointerType)) {
            document.body.style.overflow = 'hidden';
        }
    }, []);

    const handlePointerDragMove = useCallback((pointer: PointerEvent) => {
        const { itemId, from } = touchDragStateRef.current;
        if (!itemId || !from) return;

        // Update pointer position for drag overlay
        const pointerPosition = { x: pointer.pageX, y: pointer.pageY };

        // Update state to trigger re-render of DragOverlay
        setDragState(prev => ({
            ...prev,
            pointerPosition,
        }));

        // Find the element under the pointer
        const elementUnderPointer = document.elementFromPoint(pointer.clientX, pointer.clientY);
        if (!elementUnderPointer) return;

        // Find the drop zone (cell or bank wrapper)
        let dropZone = elementUnderPointer.closest('.pmx-cell') as HTMLElement;
        let isBankWrapper = false;

        if (!dropZone) {
            // Check for bank wrapper
            const bankWrapper = elementUnderPointer.closest('.pmx-bank-wrapper') as HTMLElement;
            if (bankWrapper) {
                dropZone = bankWrapper;
                isBankWrapper = true;
            }
        }

        if (!dropZone) {
            // Clear all drop indicators and placeholders if not over a valid drop zone
            document.querySelectorAll('.pmx-drop-placeholder').forEach(el => el.remove());
            touchDragStateRef.current.hoverOverSection = null;
            touchDragStateRef.current.insertIndex = null;
            return;
        }

        // Determine which section this is
        let section: 'todo' | 'q1' | 'q2' | 'q3' | 'q4' | 'done' | null = null;

        if (isBankWrapper) {
            // For bank wrapper, look for the bank inside
            const bank = dropZone.querySelector('.pmx-bank');
            if (bank) {
                if (bank.classList.contains('pmx-todo')) section = 'todo';
                else if (bank.classList.contains('pmx-done')) section = 'done';
            }
        } else {
            // For cells, check the cell class
            if (dropZone.classList.contains('pmx-q1')) section = 'q1';
            else if (dropZone.classList.contains('pmx-q2')) section = 'q2';
            else if (dropZone.classList.contains('pmx-q3')) section = 'q3';
            else if (dropZone.classList.contains('pmx-q4')) section = 'q4';
        }

        if (!section) return;

        // Calculate insertion index
        // For bank wrapper, pass the bank element or the wrapper itself
        const bankElement = isBankWrapper ? dropZone.querySelector('.pmx-bank') as HTMLElement : null;
        const targetElement = bankElement || dropZone;
        const insertIndex = calculateInsertIndex(targetElement, pointer.clientX, pointer.clientY, itemId);

        // Update ref
        touchDragStateRef.current.hoverOverSection = section;
        touchDragStateRef.current.insertIndex = insertIndex;

        // Update visual feedback
        // For bank wrapper, we need to look inside the bank for the list
        let listElement = dropZone.querySelector('.pmx-list');
        if (!listElement && isBankWrapper) {
            // Look inside the bank
            const bank = dropZone.querySelector('.pmx-bank');
            if (bank) {
                listElement = bank.querySelector('.pmx-list');
            }
        }

        // Clear all placeholders from ALL lists to prevent accumulation
        document.querySelectorAll('.pmx-drop-placeholder').forEach(el => el.remove());

        if (listElement) {
            // Get all items excluding dragged one and existing placeholders
            const allItems = Array.from(listElement.querySelectorAll<HTMLElement>('.pmx-item-wrapper:not(.pmx-drop-placeholder)'));
            const draggedItemId = touchDragStateRef.current.itemId;
            const items = allItems.filter(item => {
                const itemEl = item.querySelector('.pmx-item');
                const itemId = itemEl?.getAttribute('data-item-id');
                return itemId !== draggedItemId && !item.classList.contains('dragging');
            });

            // Find the dragged item's original index in the full list
            let draggedOriginalIndex = -1;
            if (draggedItemId) {
                draggedOriginalIndex = allItems.findIndex(item => {
                    const itemEl = item.querySelector('.pmx-item');
                    return itemEl?.getAttribute('data-item-id') === draggedItemId;
                });
            }

            // Calculate effective insert index
            const isMovingWithinSameSection = from === section && draggedOriginalIndex >= 0;
            let effectiveInsertIndex = insertIndex;

            if (isMovingWithinSameSection && draggedOriginalIndex >= 0) {
                // When moving within same section, we need to account for the item being removed from the list
                if (insertIndex > draggedOriginalIndex) {
                    // Inserting after original position
                    effectiveInsertIndex = insertIndex;
                } else if (insertIndex <= draggedOriginalIndex) {
                    // Inserting before or at original position
                    effectiveInsertIndex = insertIndex;
                }
            }

            // Create and insert placeholder
            const placeholder = document.createElement('div');
            placeholder.className = 'pmx-drop-placeholder';
            placeholder.style.height = '40px';
            placeholder.style.minHeight = '40px';

            if (effectiveInsertIndex < items.length && items[effectiveInsertIndex]) {
                // Insert before this item
                const insertTargetItem = items[effectiveInsertIndex];
                const parent = insertTargetItem.parentNode;
                if (parent) {
                    parent.insertBefore(placeholder, insertTargetItem);
                }
            } else if (items.length > 0) {
                // Inserting at the end
                const lastItem = items[items.length - 1];
                const parent = lastItem.parentNode;
                if (parent) {
                    parent.appendChild(placeholder);
                }
            } else if (listElement) {
                // Empty list, just add placeholder
                listElement.appendChild(placeholder);
            }
        }
    }, [calculateInsertIndex]);

    const handlePointerDragEnd = useCallback(() => {
        const { itemId, from, hoverOverSection: to, insertIndex } = touchDragStateRef.current;

        // Always restore body scroll
        document.body.style.overflow = '';

        if (!itemId || !from) {
            // Reset state
            setDragState({
                draggedItemId: null,
                dragElement: null,
                originPosition: null,
                pointerPosition: null,
            });
            touchDragStateRef.current = {
                itemId: null,
                from: null,
                hoverOverSection: null,
                insertIndex: null,
            };
            return;
        }

        // Remove dragging class from all items
        document.querySelectorAll('.pmx-item.dragging').forEach(el => {
            el.classList.remove('dragging');
        });

        // Clear all placeholders
        document.querySelectorAll('.pmx-drop-placeholder').forEach(el => el.remove());

        // Perform the move if we have a valid target
        if (to && to !== from) {
            if (insertIndex !== null && insertIndex >= 0) {
                stateManager.moveItem(itemId, from, to, insertIndex);
            } else {
                stateManager.moveItem(itemId, from, to);
            }
            stateManager.save();
        } else if (to === from && insertIndex !== null && insertIndex >= 0) {
            // Reorder within same section
            // Need to adjust index if moving forwards in list
            let finalIndex = insertIndex;

            // Find the original index to compare
            let originalIndex = -1;
            const currentState = stateManager.getState();
            if (currentState) {
                let items: Item[] = [];
                if (from === 'todo') items = currentState.data.banks.todo;
                else if (from === 'done') items = currentState.data.banks.done;
                else {
                    const quadrant = currentState.children.find(q => q.id === from);
                    if (quadrant) items = quadrant.children;
                }

                originalIndex = items.findIndex(i => i.id === itemId);
            }

            if (originalIndex >= 0 && insertIndex > originalIndex) {
                // If inserting after original position, we need to increment index
                // because insertIndex is calculated based on filtered list (without dragged item)
                // but StateManager expects index in original list
                finalIndex = insertIndex + 1;
            }

            stateManager.moveItem(itemId, from, to, finalIndex);
            stateManager.save();
        }

        // Reset state
        setDragState({
            draggedItemId: null,
            dragElement: null,
            originPosition: null,
            pointerPosition: null,
        });
        touchDragStateRef.current = {
            itemId: null,
            from: null,
            hoverOverSection: null,
            insertIndex: null,
        };
    }, [stateManager]);

    if (!matrix) {
        return <div>Loading...</div>;
    }

    const isDragging = !!dragState.draggedItemId;
    const dragElement = dragState.dragElement;
    const pointerPosition = dragState.pointerPosition;
    const originPosition = dragState.originPosition;

    return (
        <div className="priority-matrix-container">

            <DragOverlay
                isDragging={isDragging}
                dragItem={dragElement}
                pointerPosition={pointerPosition}
                originPosition={originPosition}
            />
            <div className="priority-matrix-grid">
                <div className="pmx-bank-wrapper">
                    <TodoBank
                        items={matrix.data.banks.todo}
                        collapsed={todoCollapsed}
                        onToggleCollapse={() => setTodoCollapsed(!todoCollapsed)}
                        onItemClick={handleItemClick}
                        onPointerDragStart={handlePointerDragStart}
                        onPointerDragMove={handlePointerDragMove}
                        onPointerDragEnd={handlePointerDragEnd}
                        stateManager={stateManager}
                        app={app}
                    />
                </div>

                <div className="pmx-matrix-header">
                    <div className="pmx-col-subheader">Urgent</div>
                    <div className="pmx-col-subheader">Not urgent</div>
                </div>

                <div className="pmx-cell pmx-q1">
                    <div className="pmx-cell-title">Q1: Do</div>
                    <div className="pmx-cell-items-wrapper">
                        <Items
                            items={matrix.children.find(q => q.id === 'q1')?.children || []}
                            onItemClick={handleItemClick}
                            onPointerDragStart={handlePointerDragStart}
                            onPointerDragMove={handlePointerDragMove}
                            onPointerDragEnd={handlePointerDragEnd}
                            from="q1"
                            stateManager={stateManager}
                            app={app}
                        />
                    </div>
                </div>

                <div className="pmx-cell pmx-q2">
                    <div className="pmx-cell-title">Q2: Plan</div>
                    <div className="pmx-cell-items-wrapper">
                        <Items
                            items={matrix.children.find(q => q.id === 'q2')?.children || []}
                            onItemClick={handleItemClick}
                            onPointerDragStart={handlePointerDragStart}
                            onPointerDragMove={handlePointerDragMove}
                            onPointerDragEnd={handlePointerDragEnd}
                            from="q2"
                            stateManager={stateManager}
                            app={app}
                        />
                    </div>
                </div>

                <div className="pmx-cell pmx-q3">
                    <div className="pmx-cell-title">Q3: Delegate</div>
                    <div className="pmx-cell-items-wrapper">
                        <Items
                            items={matrix.children.find(q => q.id === 'q3')?.children || []}
                            onItemClick={handleItemClick}
                            onPointerDragStart={handlePointerDragStart}
                            onPointerDragMove={handlePointerDragMove}
                            onPointerDragEnd={handlePointerDragEnd}
                            from="q3"
                            stateManager={stateManager}
                            app={app}
                        />
                    </div>
                </div>

                <div className="pmx-cell pmx-q4">
                    <div className="pmx-cell-title">Q4: Eliminate</div>
                    <div className="pmx-cell-items-wrapper">
                        <Items
                            items={matrix.children.find(q => q.id === 'q4')?.children || []}
                            onItemClick={handleItemClick}
                            onPointerDragStart={handlePointerDragStart}
                            onPointerDragMove={handlePointerDragMove}
                            onPointerDragEnd={handlePointerDragEnd}
                            from="q4"
                            stateManager={stateManager}
                            app={app}
                        />
                    </div>
                </div>

                <div className="pmx-bank-wrapper">
                    <DoneBank
                        items={matrix.data.banks.done}
                        collapsed={doneCollapsed}
                        onToggleCollapse={() => setDoneCollapsed(!doneCollapsed)}
                        onItemClick={handleItemClick}
                        onPointerDragStart={handlePointerDragStart}
                        onPointerDragMove={handlePointerDragMove}
                        onPointerDragEnd={handlePointerDragEnd}
                        stateManager={stateManager}
                        app={app}
                    />
                </div>
            </div>
        </div>
    );
}