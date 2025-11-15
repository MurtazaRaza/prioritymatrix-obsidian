import { h, Fragment } from 'preact';
import { Item } from '../../types';
import { Items } from '../Item/Items';

interface TodoBankProps {
    items: Item[];
    collapsed: boolean;
    onToggleCollapse: () => void;
    onItemClick?: (item: Item) => void;
    onDragStart?: (e: DragEvent, itemId: string, from: 'todo' | 'q1' | 'q2' | 'q3' | 'q4' | 'done') => void;
    onDragEnd?: (e: DragEvent) => void;
}

export function TodoBank({ items, collapsed, onToggleCollapse, onItemClick, onDragStart, onDragEnd }: TodoBankProps) {
    return (
        <>
            <div className="pmx-col-header">
                <span>TODO</span>
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
            </div>
            <div className={`pmx-bank pmx-todo ${collapsed ? 'pmx-collapsed' : ''}`}>
                <div className="pmx-cell-items-wrapper">
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

