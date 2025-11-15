import { h } from 'preact';
import { Item } from '../../types';

interface ItemProps {
    item: Item;
    onItemClick?: (item: Item) => void;
    onDragStart?: (e: DragEvent, itemId: string, from: 'todo' | 'q1' | 'q2' | 'q3' | 'q4' | 'done') => void;
    onDragEnd?: (e: DragEvent) => void;
    from?: 'todo' | 'q1' | 'q2' | 'q3' | 'q4' | 'done';
}

export function ItemComponent({ item, onItemClick, onDragStart, onDragEnd, from }: ItemProps) {
    const handleClick = () => {
        if (onItemClick) {
            onItemClick(item);
        }
    };

    const handleMenuClick = (e: MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        // TODO: Show menu with options
    };

    return (
        <div className="pmx-item-wrapper">
            <div
                className="pmx-item"
                draggable={true}
                data-item-id={item.id}
                onDragStart={onDragStart ? (e) => onDragStart(e, item.id, from || 'q1') : undefined}
                onDragEnd={onDragEnd}
            >
                <div className="pmx-item-content-wrapper">
                    <div className="pmx-item-title-wrapper">
                        {item.data.metadata.fileAccessor ? (
                            <a
                                href="#"
                                className="pmx-item-title"
                                onClick={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    if (onItemClick) {
                                        onItemClick(item);
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

