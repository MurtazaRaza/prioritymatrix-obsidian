import { h } from 'preact';
import { useRef, useEffect } from 'preact/hooks';
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
			.setName('Remove #TODO from note')
			.setDesc('This will edit the linked note to remove the TODO tag.')
			.addButton(b => b.setButtonText('Remove #TODO').onClick(() => {
				onRemoveTag();
				this.close();
			}));
		new Setting(this.contentEl)
			.setName('Add to exemption list')
			.setDesc('Keep the note in the vault but exclude it from TODO scans.')
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

    const handleClick = (e?: MouseEvent) => {
        // Prevent click if we were dragging
        if (wasDraggingRef.current || isDraggingRef.current) {
            if (e) {
                e.preventDefault();
                e.stopPropagation();
            }
            return;
        }
        if (onItemClick) {
            onItemClick(item);
        }
    };

    // Cleanup function
    const cleanup = () => {
        if (longPressTimeoutRef.current !== null && win) {
            win.clearTimeout(longPressTimeoutRef.current);
            longPressTimeoutRef.current = null;
        }
        
        // Remove event listeners
        if (win) {
            win.removeEventListener('pointermove', handlePointerMove);
            win.removeEventListener('pointerup', handlePointerUp);
            win.removeEventListener('pointercancel', handlePointerCancel);
            win.removeEventListener('contextmenu', cancelContextMenu);
            win.removeEventListener('touchmove', cancelTouchMove, { passive: false } as any);
        }

        // Remove dragging class
        if (itemElementRef.current) {
            itemElementRef.current.classList.remove('dragging');
        }

        // Restore body scroll
        if (document.body) {
            document.body.style.overflow = '';
        }

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
    };

    const cancelContextMenu = (e: Event) => {
        e.preventDefault();
        e.stopPropagation();
    };

    const cancelTouchMove = (e: TouchEvent) => {
        if (isDraggingRef.current) {
            e.preventDefault();
            e.stopPropagation();
        }
    };

    const handlePointerMove = win ? rafThrottle(win, (e: PointerEvent) => {
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
                    cleanup();
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
                    if (onPointerDragStart) {
                        onPointerDragStart(item.id, from || 'q1', e);
                    }
                }
            }
        } else {
            // Already dragging - update position
            if (onPointerDragMove) {
                onPointerDragMove(e);
            }
        }
    }) : () => {};

    const handlePointerUp = (e: PointerEvent) => {
        if (e.pointerId !== pointerIdRef.current) return;
        
        const wasDragging = isDraggingRef.current;
        const hadInitialPosition = !!initialPositionRef.current;
        const wasClickOnLink = initialTargetRef.current?.closest('a') !== null;
        
        cleanup();

        if (wasDragging && onPointerDragEnd) {
            onPointerDragEnd();
        } else if (!wasDragging && hadInitialPosition && !wasClickOnLink) {
            // It was a tap, not a drag - trigger click
            // Don't trigger if it was a click on a link (link's onClick will handle it)
            handleClick();
        }
    };

    const handlePointerCancel = (e: PointerEvent) => {
        if (e.pointerId !== pointerIdRef.current) return;
        
        const wasDragging = isDraggingRef.current;
        
        cleanup();
        
        if (wasDragging && onPointerDragEnd) {
            onPointerDragEnd();
        }
    };

    const handlePointerDown = (e: PointerEvent) => {
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
        // The link's onClick will be prevented if isDraggingRef is true

        // We only care about left mouse / touch contact
        // https://developer.mozilla.org/en-US/docs/Web/API/Pointer_events#determining_button_states
        if (e.button !== 0 && e.buttons !== 1) {
            return;
        }

        const isTouch = isTouchEvent(e);
        
        // For mouse events, prevent default immediately to prevent text selection
        // This follows the Kanban approach of unified pointer event handling
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
                if (document.body) {
                    document.body.style.overflow = 'hidden';
                }
                
                // Add touchmove prevention
                win.addEventListener('touchmove', cancelTouchMove, { passive: false });
                
                // Call drag start callback
                if (onPointerDragStart) {
                    onPointerDragStart(item.id, from || 'q1', e);
                }
            }, DRAG_CONSTANTS.LONG_PRESS_TIMEOUT);
        } else {
            // For mouse: start drag immediately on movement > 5px
            // The movement will be handled in handlePointerMove
        }
    };

    // Swallow touchstart to prevent event bubbling (like Kanban does)
    const swallowTouchEvent = (e: TouchEvent) => {
        e.stopPropagation();
    };

    // Cleanup on unmount and set up touchstart listener
    useEffect(() => {
        const element = itemElementRef.current;
        if (!element || !win) return;
        
        element.addEventListener('touchstart', swallowTouchEvent);
        
        return () => {
            cleanup();
            if (element) {
                element.removeEventListener('touchstart', swallowTouchEvent);
            }
        };
    }, []);

    const handleMenuClick = (e: MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        const coords = { x: e.clientX, y: e.clientY };
        const menu = new Menu();

        menu
            .addItem((i) => {
                i.setIcon('lucide-trash-2')
                    .setTitle('Remove')
                    .onClick(() => {
                        const isLinked = !!item.data.metadata.fileAccessor;
                        const section = (from || 'q1');
                        if (!isLinked) {
                            stateManager.removeItem(item.id, section);
                            stateManager.save();
                            new Notice('Item removed');
                            return;
                        }
                        const modal = new TodoLinkedRemoveModal(app,
                            async () => {
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
                                    const tagPattern = `#${escapeRegExp(todoTag)}(?![\w-])`;
                                    const tagRegex = new RegExp(tagPattern, 'gi');

                                    // Remove all instances of the tag
                                    let newContent = content.replace(tagRegex, '');

                                    // Clean up any resulting double spaces (but preserve line breaks)
                                    newContent = newContent.replace(/[ \t]{2,}/g, ' ');

                                    // Save the modified content
                                    await app.vault.modify(file, newContent);

                                    // Remove the bubble from the matrix
                                    stateManager.removeItem(item.id, section);
                                    stateManager.save();

                                    new Notice(`Removed #${todoTag} from note and removed from matrix`);
                                } catch (error) {
                                    log.error('Error removing TODO tag:', error);
                                    new Notice('Error removing TODO tag: ' + (error instanceof Error ? error.message : String(error)));
                                }
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
                                stateManager.save();
                                new Notice('Added to exemption list and removed from matrix');
                            }
                        );
                        modal.open();
                    });
            });

        menu.showAtPosition(coords);
    };

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
                                onClick={(e) => {
                                    // Only trigger click if we weren't dragging
                                    if (!wasDraggingRef.current) {
                                        e.preventDefault();
                                        e.stopPropagation();
                                        if (onItemClick) {
                                            onItemClick(item);
                                        }
                                    } else {
                                        e.preventDefault();
                                        e.stopPropagation();
                                    }
                                }}
                            >
                                {item.data.title}
                            </a>
                        ) : (
                            <div className="pmx-item-title">{item.data.title}</div>
                        )}
                        <button
                            className="pmx-item-menu-btn"
                            data-ignore-drag={true as any}
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

