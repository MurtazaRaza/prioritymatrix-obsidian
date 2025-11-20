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
    const [dragState, setDragState] = useState<{
        draggedItemId: string | null;
        draggedFrom: 'todo' | 'q1' | 'q2' | 'q3' | 'q4' | 'done' | null;
        hoverOverSection: 'todo' | 'q1' | 'q2' | 'q3' | 'q4' | 'done' | null;
        hoverOverItemId: string | null;
        insertIndex: number | null;
        dragElement: HTMLElement | null;
        originPosition: Coordinates | null;
        pointerPosition: Coordinates | null;
    }>({
        draggedItemId: null,
        draggedFrom: null,
        hoverOverSection: null,
        hoverOverItemId: null,
        insertIndex: null,
        dragElement: null,
        originPosition: null,
        pointerPosition: null,
    });

    const touchDragStateRef = useRef<{
        itemId: string | null;
        from: 'todo' | 'q1' | 'q2' | 'q3' | 'q4' | 'done' | null;
        hoverOverSection: 'todo' | 'q1' | 'q2' | 'q3' | 'q4' | 'done' | null;
        insertIndex: number | null;
        dragElement: HTMLElement | null;
        originPosition: Coordinates | null;
        pointerPosition: Coordinates | null;
    }>({
        itemId: null,
        from: null,
        hoverOverSection: null,
        insertIndex: null,
        dragElement: null,
        originPosition: null,
        pointerPosition: null,
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
    // Handles flex-wrap layout by considering both X and Y positions
    const calculateInsertIndex = useCallback((containerElement: HTMLElement, mouseX: number, mouseY: number, draggedItemId: string): number => {
        const listElement = containerElement.querySelector('.pmx-list');
        if (!listElement) return -1;

        // Get all items excluding the dragged one
        const allItems = Array.from(listElement.querySelectorAll<HTMLElement>('.pmx-item-wrapper'));
        const items = allItems.filter(item => {
            const itemEl = item.querySelector('.pmx-item');
            const itemId = itemEl?.getAttribute('data-item-id');
            return itemId !== draggedItemId && !item.classList.contains('dragging');
        });
        
        if (items.length === 0) return 0;

        // Get item positions with their rects
        const itemsWithRects = items.map((item, index) => ({
            item,
            index,
            rect: item.getBoundingClientRect()
        }));

        // For flex-wrap layout, we need to consider both X and Y positions
        // Strategy: First find which row the pointer is on, then find position within that row
        const pointerRowItems: Array<{ item: HTMLElement; index: number; rect: DOMRect }> = [];
        const otherRowItems: Array<{ item: HTMLElement; index: number; rect: DOMRect }> = [];
        
        // Separate items by row based on Y position
        // Use a more generous tolerance to account for varying item heights
        const rowTolerance = 20; // Items within 20px vertically are considered same row
        itemsWithRects.forEach(({ item, index, rect }) => {
            const itemData = { item, index, rect };
            
            // Check if pointer is on the same row as this item
            // Consider the item's center Y position for better row detection
            const itemCenterY = rect.top + rect.height / 2;
            const pointerY = mouseY;
            
            if (pointerY >= rect.top - rowTolerance && pointerY <= rect.bottom + rowTolerance) {
                pointerRowItems.push(itemData);
            } else {
                otherRowItems.push(itemData);
            }
        });
        
        // If pointer is on a row with items, find position within that row based on X
        if (pointerRowItems.length > 0) {
            // Sort by X position
            pointerRowItems.sort((a, b) => a.rect.left - b.rect.left);
            
            for (let i = 0; i < pointerRowItems.length; i++) {
                const { rect, index } = pointerRowItems[i];
                const itemCenterX = rect.left + rect.width / 2;
                
                // If pointer is to the left of this item's center, insert before it
                if (mouseX < itemCenterX) {
                    return index;
                }
            }
            
            // Pointer is to the right of all items on this row
            // Insert after the last item on this row
            const lastOnRow = pointerRowItems[pointerRowItems.length - 1];
            const lastIndex = lastOnRow.index;
            
            // Check if there are items after this row
            const itemsAfterRow = otherRowItems.filter(({ rect }) => rect.top > lastOnRow.rect.bottom);
            if (itemsAfterRow.length > 0) {
                // Sort by Y then X to find the first item on the next row
                itemsAfterRow.sort((a, b) => {
                    const yDiff = a.rect.top - b.rect.top;
                    if (Math.abs(yDiff) < rowTolerance) {
                        return a.rect.left - b.rect.left;
                    }
                    return yDiff;
                });
                return itemsAfterRow[0].index;
            }
            
            // No items after this row, insert at end
            return items.length;
        }
        
        // Pointer is not on any row with items
        // Find the closest item based on Y position, considering both above and below
        let bestIndex = items.length;
        let minDistance = Infinity;
        
        for (let i = 0; i < itemsWithRects.length; i++) {
            const { rect, index } = itemsWithRects[i];
            const itemCenterY = rect.top + rect.height / 2;
            const distance = Math.abs(mouseY - itemCenterY);
            
            // If pointer is above this item's center, insert before it
            if (mouseY < itemCenterY && distance < minDistance) {
                minDistance = distance;
                bestIndex = index;
            }
            // If pointer is below this item and it's the last item or next item is on a different row
            else if (mouseY > rect.bottom) {
                // Check if this is the last item in its row
                const nextItem = itemsWithRects[i + 1];
                if (!nextItem || Math.abs(nextItem.rect.top - rect.top) > rowTolerance) {
                    // This is the last item on its row, insert after it
                    if (i + 1 < items.length) {
                        bestIndex = i + 1;
                    } else {
                        bestIndex = items.length;
                    }
                    break;
                }
            }
        }
        
        return bestIndex;
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
            dragElement,
            originPosition,
            pointerPosition,
        };
        
        setDragState({
            draggedItemId: itemId,
            draggedFrom: from,
            hoverOverSection: null,
            hoverOverItemId: null,
            insertIndex: null,
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
        touchDragStateRef.current.pointerPosition = pointerPosition;
        
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
            // Clear all drop indicators and shift classes if not over a valid drop zone
            document.querySelectorAll('.pmx-item-wrapper').forEach(el => {
                el.classList.remove('pmx-drop-before', 'pmx-drop-after', 'pmx-shift-right', 'pmx-shift-down');
            });
            document.querySelectorAll('.pmx-drop-placeholder').forEach(el => el.remove());
            touchDragStateRef.current.hoverOverSection = null;
            touchDragStateRef.current.insertIndex = null;
            setDragState(prev => ({
                ...prev,
                hoverOverSection: null,
                hoverOverItemId: null,
                insertIndex: null,
                // Keep drag element and positions
                dragElement: prev.dragElement,
                originPosition: prev.originPosition,
                pointerPosition: prev.pointerPosition,
            }));
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

        // Update both state and ref
        touchDragStateRef.current.hoverOverSection = section;
        touchDragStateRef.current.insertIndex = insertIndex;
        
        setDragState(prev => ({
            ...prev,
            hoverOverSection: section,
            insertIndex,
            // Keep drag element and positions
            dragElement: prev.dragElement,
            originPosition: prev.originPosition,
            pointerPosition: prev.pointerPosition,
        }));

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
        
        // First, clear all shift classes and placeholders from ALL lists to prevent accumulation
        document.querySelectorAll('.pmx-item-wrapper').forEach(el => {
            el.classList.remove('pmx-shift-down');
        });
        document.querySelectorAll('.pmx-drop-placeholder').forEach(el => el.remove());
        
        if (listElement) {
            // Get all items including dragged one to find original position
            const allItems = Array.from(listElement.querySelectorAll<HTMLElement>('.pmx-item-wrapper'));
            const draggedItemId = touchDragStateRef.current.itemId;
            const items = allItems.filter(item => {
                const itemEl = item.querySelector('.pmx-item');
                const itemId = itemEl?.getAttribute('data-item-id');
                return itemId !== draggedItemId && !item.classList.contains('dragging');
            });
            
            // Remove drop indicators from this list only
            allItems.forEach(el => {
                el.classList.remove('pmx-drop-before', 'pmx-drop-after', 'pmx-shift-right');
            });

            if (items.length > 0 && insertIndex >= 0 && insertIndex <= items.length) {
                // Find the dragged item's original index in the full list
                let draggedOriginalIndex = -1;
                if (draggedItemId) {
                    draggedOriginalIndex = allItems.findIndex(item => {
                        const itemEl = item.querySelector('.pmx-item');
                        return itemEl?.getAttribute('data-item-id') === draggedItemId;
                    });
                }
                
                // Calculate effective insert index accounting for the dragged item being removed
                const isMovingWithinSameSection = from === section && draggedOriginalIndex >= 0;
                let effectiveInsertIndex = insertIndex;
                
                if (isMovingWithinSameSection && draggedOriginalIndex >= 0) {
                    // When moving within same section, we need to account for the item being removed from the list
                    // The items array doesn't include the dragged item, so we need to adjust
                    if (insertIndex > draggedOriginalIndex) {
                        // Inserting after original position - no adjustment needed since dragged item is already excluded
                        effectiveInsertIndex = insertIndex;
                    } else if (insertIndex <= draggedOriginalIndex) {
                        // Inserting before or at original position - no adjustment needed
                        effectiveInsertIndex = insertIndex;
                    }
                }
                
                // Determine the Y position where the item will be inserted
                // This is used to shift items that are visually below the insertion point
                const targetInsertItem = effectiveInsertIndex < items.length ? items[effectiveInsertIndex] : null;
                const targetRect = targetInsertItem ? targetInsertItem.getBoundingClientRect() : null;
                
                // Calculate the Y threshold for shifting
                // Items below this Y position should be shifted down
                let insertYThreshold: number;
                if (targetRect) {
                    // Inserting before an item - use its top position
                    insertYThreshold = targetRect.top;
                } else if (items.length > 0) {
                    // Inserting at the end - use the bottom of the last item
                    const lastItemRect = items[items.length - 1].getBoundingClientRect();
                    insertYThreshold = lastItemRect.bottom;
                } else {
                    // Empty list - use pointer position
                    insertYThreshold = pointer.clientY;
                }
                
                // Shift items based on their visual position
                // This is important for flex-wrap layouts where items can wrap to new rows
                const rowTolerance = 20;
                items.forEach((item, index) => {
                    const itemEl = item.querySelector('.pmx-item');
                    const itemId = itemEl?.getAttribute('data-item-id');
                    
                    // Don't shift the dragged item itself
                    if (itemId === draggedItemId) {
                        return;
                    }
                    
                    const rect = item.getBoundingClientRect();
                    const itemTop = rect.top;
                    const itemBottom = rect.bottom;
                    
                    // Determine if this item should be shifted
                    let shouldShift = false;
                    
                    if (targetRect) {
                        // We have a target insertion item
                        const isOnInsertionRow = Math.abs(itemTop - targetRect.top) < rowTolerance;
                        
                        if (isOnInsertionRow) {
                            // Item is on the same row as insertion
                            // Shift if it's at or after the insertion index
                            shouldShift = index >= effectiveInsertIndex;
                        } else if (itemTop > insertYThreshold + rowTolerance) {
                            // Item is visually below the insertion point - always shift
                            shouldShift = true;
                        }
                    } else {
                        // No target item (inserting at end)
                        // Shift items at or after the insertion index
                        shouldShift = index >= effectiveInsertIndex;
                    }
                    
                    if (shouldShift) {
                        item.classList.add('pmx-shift-down');
                    }
                });
                
                // Show a placeholder for visual clarity
                const placeholder = document.createElement('div');
                placeholder.className = 'pmx-drop-placeholder';
                // Set a reasonable height based on typical item height
                placeholder.style.height = '40px';
                placeholder.style.minHeight = '40px';

                if (effectiveInsertIndex < items.length && items[effectiveInsertIndex]) {
                    // Insert before this item
                    const insertTargetItem = items[effectiveInsertIndex];
                    const parent = insertTargetItem.parentNode;
                    if (parent) {
                        parent.insertBefore(placeholder, insertTargetItem);
                        insertTargetItem.classList.add('pmx-drop-before');
                    }
                } else if (items.length > 0) {
                    // Inserting at the end
                    const lastItem = items[items.length - 1];
                    const parent = lastItem.parentNode;
                    if (parent) {
                        parent.appendChild(placeholder);
                        lastItem.classList.add('pmx-drop-after');
                    }
                } else if (listElement) {
                    // Empty list, just add placeholder
                    listElement.appendChild(placeholder);
                }
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
                draggedFrom: null,
                hoverOverSection: null,
                hoverOverItemId: null,
                insertIndex: null,
                dragElement: null,
                originPosition: null,
                pointerPosition: null,
            });
            touchDragStateRef.current = { 
                itemId: null, 
                from: null, 
                hoverOverSection: null, 
                insertIndex: null,
                dragElement: null,
                originPosition: null,
                pointerPosition: null,
            };
            return;
        }

        // Remove dragging class from all items
        document.querySelectorAll('.pmx-item.dragging').forEach(el => {
            el.classList.remove('dragging');
        });
        
        // Clear all drop indicators, placeholders, and shift classes
        document.querySelectorAll('.pmx-item-wrapper.pmx-drop-before, .pmx-item-wrapper.pmx-drop-after, .pmx-item-wrapper.pmx-shift-right').forEach(el => {
            el.classList.remove('pmx-drop-before', 'pmx-drop-after', 'pmx-shift-right');
        });
        document.querySelectorAll('.pmx-drop-placeholder').forEach(el => el.remove());

        // Perform the move if we have a valid target
        if (to && to !== from) {
            if (insertIndex !== null && insertIndex >= 0) {
                stateManager.moveItem(itemId, from, to, insertIndex);
            } else {
                stateManager.moveItem(itemId, from, to);
            }
            stateManager.save();
        }

        // Reset state
        setDragState({
            draggedItemId: null,
            draggedFrom: null,
            hoverOverSection: null,
            hoverOverItemId: null,
            insertIndex: null,
            dragElement: null,
            originPosition: null,
            pointerPosition: null,
        });
        touchDragStateRef.current = { 
            itemId: null, 
            from: null, 
            hoverOverSection: null, 
            insertIndex: null,
            dragElement: null,
            originPosition: null,
            pointerPosition: null,
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
            {/* <div className="priority-matrix-toolbar">
                <div className="priority-matrix-title">Eisenhower Matrix</div>
            </div> */}
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


