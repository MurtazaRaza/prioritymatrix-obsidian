import { h, Fragment } from 'preact';
import { useState, useRef, useEffect } from 'preact/hooks';
import { Item } from '../../types';
import { Items } from '../Item/Items';
import { StateManager } from '../../state/StateManager';

interface TodoBankProps {
    items: Item[];
    collapsed: boolean;
    onToggleCollapse: () => void;
    onItemClick?: (item: Item) => void;
    onDragStart?: (e: DragEvent, itemId: string, from: 'todo' | 'q1' | 'q2' | 'q3' | 'q4' | 'done') => void;
    onDragEnd?: (e: DragEvent) => void;
    stateManager: StateManager;
}

export function TodoBank({ items, collapsed, onToggleCollapse, onItemClick, onDragStart, onDragEnd, stateManager }: TodoBankProps) {
    const [isAdding, setIsAdding] = useState(false);
    const [newItemText, setNewItemText] = useState('');
    const inputRef = useRef<HTMLInputElement>(null);
    const itemJustAddedRef = useRef<string | null>(null);

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

    const handleAddClick = () => {
        // If collapsed, expand first
        if (collapsed) {
            onToggleCollapse();
            // Wait a bit for the expansion animation, then show input
            setTimeout(() => {
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
            stateManager.save();
            // Track that we just added this item to prevent duplicate on blur
            itemJustAddedRef.current = text;
            setNewItemText('');
            setIsAdding(false);
            // Clear the flag after a short delay
            setTimeout(() => {
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
        setTimeout(() => {
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
                    stateManager.save();
                    itemJustAddedRef.current = text;
                    setTimeout(() => {
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
            <div className={`pmx-bank pmx-todo ${collapsed ? 'pmx-collapsed' : ''}`}>
                <div className="pmx-cell-items-wrapper">
                    {isAdding && !collapsed && (
                        <div className="pmx-add-item-input-wrapper" style={{ margin: '4px', padding: '4px' }}>
                            <input
                                ref={inputRef}
                                type="text"
                                className="pmx-add-item-input"
                                value={newItemText}
                                onInput={(e) => setNewItemText((e.target as HTMLInputElement).value)}
                                onKeyDown={handleInputKeyDown}
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
                        onDragStart={onDragStart}
                        onDragEnd={onDragEnd}
                        from="todo"
                    />
                </div>
            </div>
        </>
    );
}

