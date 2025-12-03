/* global window, document */
import { h } from 'preact';
import { useRef, useEffect, useCallback, useMemo } from 'preact/hooks';
import { App, Menu, Modal, Setting, Notice } from 'obsidian';
import { Item } from '../../types';
import { StateManager } from '../../state/StateManager';
import { createLogger } from '../../utils/logger';
import { distanceBetween, rafThrottle, isTouchEvent, DRAG_CONSTANTS, Coordinates } from '../../utils/drag';

interface ItemProps {
    item: Item;
    onItemClick?: (item: Item) => void;
    onPointerDragStart?: (itemId: string, from: 'todo' | 'q1' | 'q2' | 'q3' | 'q4' | 'done', pointer: PointerEvent) => void;
    onPointerDragMove?: (pointer: PointerEvent) => void;
    onPointerDragEnd?: () => void;
    from?: 'todo' | 'q1' | 'q2' | 'q3' | 'q4' | 'done';
    stateManager: StateManager;
    app: App;
}

class TodoLinkedRemoveModal extends Modal {
	constructor(app: App, onRemoveTag: () => void, onExempt: () => void) {
		super(app);
		this.setTitle('Linked note options');
		new Setting(this.contentEl)
			.setName('Remove todo tag from note')
			.setDesc('This will edit the linked note to remove the todo tag.')
			.addButton(b => b.setButtonText('Remove todo tag').onClick(() => {
				onRemoveTag();
				this.close();
			}));
		new Setting(this.contentEl)
			.setName('Add to exemption list')
			.setDesc('Keep the note in the vault but exclude it from todo scans.')
			.addButton(b => b.setButtonText('Exempt').onClick(() => {
				onExempt();
				this.close();
			}));
		new Setting(this.contentEl)
			.addButton(b => b.setButtonText('Cancel').onClick(() => this.close()));
	}
}

const log = createLogger('ItemComponent');

export function ItemComponent({ item, onItemClick, onPointerDragStart, onPointerDragMove, onPointerDragEnd, from, stateManager, app }: ItemProps) {
    const itemElementRef = useRef<HTMLElement | null>(null);
    const isDraggingRef = useRef(false);
    const pointerIdRef = useRef<number | null>(null);
    const initialPositionRef = useRef<Coordinates | null>(null);
    const longPressTimeoutRef = useRef<number | null>(null);
    const currentPointerPositionRef = useRef<Coordinates | null>(null);
    const initialTargetRef = useRef<HTMLElement | null>(null);
    const wasDraggingRef = useRef(false);
    const win = typeof window !== 'undefined' ? window : null;

    // Store latest props in ref to avoid re-creating event handlers
    const latestPropsRef = useRef({ item, onItemClick, onPointerDragStart, onPointerDragMove, onPointerDragEnd, from, stateManager, app });
    useEffect(() => {
        latestPropsRef.current = { item, onItemClick, onPointerDragStart, onPointerDragMove, onPointerDragEnd, from, stateManager, app };
    });

    const handleClick = useCallback((e?: MouseEvent) => {
        // Prevent click if we were dragging
        if (wasDraggingRef.current || isDraggingRef.current) {
            if (e) {
                e.preventDefault();
                e.stopPropagation();
            }
            return;
        }
        if (latestPropsRef.current.onItemClick) {
            latestPropsRef.current.onItemClick(latestPropsRef.current.item);
        }
    }, []);

    const cancelContextMenu = useCallback((e: Event) => {
        e.preventDefault();
        e.stopPropagation();
    }, []);

    const cancelTouchMove = useCallback((e: TouchEvent) => {
        if (isDraggingRef.current) {
            e.preventDefault();
            e.stopPropagation();
        }
    }, []);

    // Define handlers first so they can be used in cleanup
    // We use useMemo for handlePointerMove to handle throttling
    const handlePointerMove = useMemo(() => {
        if (!win) return () => {};
        
        return rafThrottle(win, (e: PointerEvent) => {
            // Only track the initial pointer
            if (e.pointerId !== pointerIdRef.current) return;
            if (!initialPositionRef.current) return;

            const currentPosition: Coordinates = { x: e.pageX, y: e.pageY };
            currentPointerPositionRef.current = currentPosition;
            const distance = distanceBetween(initialPositionRef.current, currentPosition);
            const isTouch = isTouchEvent(e);

            // If not dragging yet, check if we should start or cancel
            if (!isDraggingRef.current) {
                if (isTouch) {
                    // For touch: cancel long press if movement exceeds threshold
                    if (distance > DRAG_CONSTANTS.MOVEMENT_THRESHOLD) {
                        // We need to trigger cleanup here, but cleanup isn't defined yet
                        // So we'll implement the cleanup logic directly or call a ref
                        if (cleanupRef.current) cleanupRef.current();
                        return;
                    }
                } else {
                    // For mouse: start drag immediately when movement exceeds threshold
                    if (distance > DRAG_CONSTANTS.MOVEMENT_THRESHOLD) {
                        isDraggingRef.current = true;
                        
                        // Add dragging class
                        if (itemElementRef.current) {
                            itemElementRef.current.classList.add('dragging');
                        }
                        
                        // Call drag start callback
                        if (latestPropsRef.current.onPointerDragStart) {
                            latestPropsRef.current.onPointerDragStart(
                                latestPropsRef.current.item.id, 
                                latestPropsRef.current.from || 'q1', 
                                e
                            );
                        }
                    }
                }
            } else {
                // Already dragging - update position
                if (latestPropsRef.current.onPointerDragMove) {
                    latestPropsRef.current.onPointerDragMove(e);
                }
            }
        });
    }, [win]);

    const handlePointerUp = useCallback((e: PointerEvent) => {
        if (e.pointerId !== pointerIdRef.current) return;
        
        const wasDragging = isDraggingRef.current;
        const hadInitialPosition = !!initialPositionRef.current;
        const wasClickOnLink = initialTargetRef.current?.closest('a') !== null;
        
        if (cleanupRef.current) cleanupRef.current();

        if (wasDragging && latestPropsRef.current.onPointerDragEnd) {
            latestPropsRef.current.onPointerDragEnd();
        } else if (!wasDragging && hadInitialPosition && !wasClickOnLink) {
            // It was a tap, not a drag - trigger click
            // Don't trigger if it was a click on a link (link's onClick will handle it)
            handleClick();
        }
    }, [handleClick]);

    const handlePointerCancel = useCallback((e: PointerEvent) => {
        if (e.pointerId !== pointerIdRef.current) return;
        
        const wasDragging = isDraggingRef.current;
        
        if (cleanupRef.current) cleanupRef.current();
        
        if (wasDragging && latestPropsRef.current.onPointerDragEnd) {
            latestPropsRef.current.onPointerDragEnd();
        }
    }, []);

    // Cleanup function
    const cleanup = useCallback(() => {
        if (longPressTimeoutRef.current !== null && win) {
            win.clearTimeout(longPressTimeoutRef.current);
            longPressTimeoutRef.current = null;
        }
        
        // Remove event listeners
        if (win) {
            win.removeEventListener('pointermove', handlePointerMove);
            win.removeEventListener('pointerup', handlePointerUp);
            win.removeEventListener('pointercancel', handlePointerCancel);
            win.removeEventListener('contextmenu', cancelContextMenu, true); // Capture phase must match
            win.removeEventListener('touchmove', cancelTouchMove, { passive: false } as EventListenerOptions);
        }

        // Remove dragging class
        if (itemElementRef.current) {
            itemElementRef.current.classList.remove('dragging');
        }

        // Restore body scroll
        document.body.classList.remove('pmx-no-scroll');

        const wasDragging = isDraggingRef.current;
        isDraggingRef.current = false;
        pointerIdRef.current = null;
        initialPositionRef.current = null;
        currentPointerPositionRef.current = null;
        
        // Keep wasDraggingRef for a short time to allow click events to check it
        wasDraggingRef.current = wasDragging;
        if (win) {
            win.setTimeout(() => {
                wasDraggingRef.current = false;
                initialTargetRef.current = null;
            }, 100);
        }
    }, [win, handlePointerMove, handlePointerUp, handlePointerCancel, cancelContextMenu, cancelTouchMove]);

    // Store cleanup in a ref so it can be called from handlePointerMove
    const cleanupRef = useRef(cleanup);
    useEffect(() => {
        cleanupRef.current = cleanup;
    }, [cleanup]);

    const handlePointerDown = useCallback((e: PointerEvent) => {
        if (!win) return;
        
        // Ignore if event was already handled
        if (e.defaultPrevented) return;
        
        const target = e.target as HTMLElement;
        
        // Ignore if clicking on menu button or elements with data-ignore-drag
        if (target.closest('.pmx-item-menu-btn')) {
            return;
        }

        // Check for data-ignore-drag attribute
        let node: HTMLElement | null = target;
        while (node) {
            if (node.dataset.ignoreDrag) {
                return;
            }
            node = node.parentElement;
        }
        
        // Allow dragging from links, but we'll prevent the click if it was a drag

        // We only care about left mouse / touch contact
        if (e.button !== 0 && e.buttons !== 1) {
            return;
        }

        const isTouch = isTouchEvent(e);
        
        // For mouse events, prevent default immediately to prevent text selection
        if (!isTouch) {
            e.stopPropagation();
            e.preventDefault();
        }

        // Store initial state
        pointerIdRef.current = e.pointerId;
        initialPositionRef.current = { x: e.pageX, y: e.pageY };
        currentPointerPositionRef.current = { x: e.pageX, y: e.pageY };
        initialTargetRef.current = target;
        isDraggingRef.current = false;

        // Add event listeners to window
        win.addEventListener('pointermove', handlePointerMove);
        win.addEventListener('pointerup', handlePointerUp);
        win.addEventListener('pointercancel', handlePointerCancel);

        if (isTouch && win) {
            // For touch: require 500ms long press
            win.addEventListener('contextmenu', cancelContextMenu, true);
            
            longPressTimeoutRef.current = win.setTimeout(() => {
                if (!initialPositionRef.current || pointerIdRef.current === null) return;
                
                // Start drag
                isDraggingRef.current = true;
                
                // Add dragging class
                if (itemElementRef.current) {
                    itemElementRef.current.classList.add('dragging');
                }
                
                // Prevent body scroll during drag
                document.body.classList.add('pmx-no-scroll');
                
                // Add touchmove prevention
                win.addEventListener('touchmove', cancelTouchMove, { passive: false });
                
                // Call drag start callback
                if (latestPropsRef.current.onPointerDragStart) {
                    latestPropsRef.current.onPointerDragStart(
                        latestPropsRef.current.item.id, 
                        latestPropsRef.current.from || 'q1', 
                        e
                    );
                }
            }, DRAG_CONSTANTS.LONG_PRESS_TIMEOUT);
        }
    }, [win, handlePointerMove, handlePointerUp, handlePointerCancel, cancelContextMenu, cancelTouchMove]);

    // Swallow touchstart to prevent event bubbling (like Kanban does)
    const swallowTouchEvent = useCallback((e: TouchEvent) => {
        e.stopPropagation();
    }, []);

    // Cleanup on unmount and set up touchstart listener
    useEffect(() => {
        const element = itemElementRef.current;
        if (!element || !win) return;
        
        element.addEventListener('touchstart', swallowTouchEvent);
        
        return () => {
            if (cleanupRef.current) cleanupRef.current();
            if (element) {
                element.removeEventListener('touchstart', swallowTouchEvent);
            }
        };
    }, [swallowTouchEvent]); // Dependencies stable

    const handleMenuClick = useCallback((e: MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        const coords = { x: e.clientX, y: e.clientY };
        const menu = new Menu();

        menu
            .addItem((i) => {
                i.setIcon('lucide-trash-2')
                    .setTitle('Remove')
                    .onClick(() => {
                        const { item, from, stateManager, app } = latestPropsRef.current;
                        const isLinked = !!item.data.metadata.fileAccessor;
                        const section = (from || 'q1');
                        if (!isLinked) {
                            stateManager.removeItem(item.id, section);
                            void stateManager.save();
                            new Notice('Item removed');
                            return;
                        }
                        const modal = new TodoLinkedRemoveModal(app,
                            () => {
                                void (async () => {
                                // Remove #TODO from linked note
                                const file = item.data.metadata.fileAccessor;
                                if (!file) {
                                    new Notice('Could not resolve file');
                                    return;
                                }

                                try {
                                    // Get the TODO tag from matrix settings
                                    const current = stateManager.getState();
                                    if (!current) {
                                        new Notice('Could not access matrix state');
                                        return;
                                    }
                                    const todoTag = current.data.settings.todoTag || 'TODO';

                                    // Read file content
                                    const content = await app.vault.read(file);

                                    // Create regex to match the tag (case-insensitive, with negative lookahead)
                                    const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                                    const tagPattern = `#${escapeRegExp(todoTag)}(?![\\w-])`;
                                    const tagRegex = new RegExp(tagPattern, 'gi');

                                    // Remove all instances of the tag
                                    let newContent = content.replace(tagRegex, '');

                                    // Clean up any resulting double spaces (but preserve line breaks)
                                    newContent = newContent.replace(/[ \t]{2,}/g, ' ');

                                    // Save the modified content
                                    await app.vault.modify(file, newContent);

                                    // Remove the bubble from the matrix
                                    stateManager.removeItem(item.id, section);
                                    void stateManager.save();

                                    new Notice(`Removed #${todoTag} from note and removed from matrix`);
                                } catch (error) {
                                    log.error('Error removing TODO tag:', error);
                                    new Notice('Error removing TODO tag: ' + (error instanceof Error ? error.message : String(error)));
                                }
                                })();
                            },
                            () => {
                                // Add to exemption list and remove item
                                const filePath = item.data.metadata.fileAccessor?.path;
                                if (!filePath) {
                                    new Notice('Could not resolve file path for exemption');
                                    return;
                                }
                                const current = stateManager.getState();
                                if (!current) return;
                                const settings = current.data.settings;
                                const list = new Set<string>((settings.exemptPaths || []).map(p => p.trim()).filter(Boolean));
                                list.add(filePath);
                                settings.exemptPaths = Array.from(list);
                                stateManager.setState(current);
                                stateManager.removeItem(item.id, section);
                                void stateManager.save();
                                new Notice('Added to exemption list and removed from matrix');
                            }
                        );
                        modal.open();
                    });
            });

        menu.showAtPosition(coords);
    }, []);

    const displayTitle = useMemo(() => {
        const title = item.data.title || '';
        if (title.length <= 26) return title;
        return title.substring(0, 26) + '...';
    }, [item.data.title]);

    const tooltipText = useMemo(() => {
        const path = item.data.metadata.fileAccessor?.path;
        return path ? `${item.data.title}\n${path}` : item.data.title;
    }, [item.data.title, item.data.metadata.fileAccessor]);

    return (
        <div className="pmx-item-wrapper">
            <div
                ref={(el: HTMLElement | null) => { itemElementRef.current = el; }}
                className="pmx-item"
                draggable={false}
                data-item-id={item.id}
                onPointerDown={handlePointerDown}
            >
                <div className="pmx-item-content-wrapper">
                    <div className="pmx-item-title-wrapper">
                        {item.data.metadata.fileAccessor ? (
                            <a
                                href="#"
                                className="pmx-item-title"
                                title={tooltipText}
                                onClick={(e) => {
                                    // Only trigger click if we weren't dragging
                                    if (!wasDraggingRef.current) {
                                        e.preventDefault();
                                        e.stopPropagation();
                                        if (latestPropsRef.current.onItemClick) {
                                            latestPropsRef.current.onItemClick(latestPropsRef.current.item);
                                        }
                                    } else {
                                        e.preventDefault();
                                        e.stopPropagation();
                                    }
                                }}
                            >
                                {displayTitle}
                            </a>
                        ) : (
                            <div className="pmx-item-title" title={tooltipText}>{displayTitle}</div>
                        )}
                        <button
                            className="pmx-item-menu-btn"
                            data-ignore-drag="true"
                            onClick={handleMenuClick}
                            aria-label="Item options"
                        >
                            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                                <circle cx="8" cy="4" r="1.5" fill="currentColor"/>
                                <circle cx="8" cy="8" r="1.5" fill="currentColor"/>
                                <circle cx="8" cy="12" r="1.5" fill="currentColor"/>
                            </svg>
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}