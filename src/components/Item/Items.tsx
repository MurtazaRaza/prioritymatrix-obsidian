import { h } from 'preact';
import { Item } from '../../types';
import { ItemComponent } from './Item';

interface ItemsProps {
    items: Item[];
    onItemClick?: (item: Item) => void;
    onDragStart?: (e: DragEvent, itemId: string, from: 'todo' | 'q1' | 'q2' | 'q3' | 'q4' | 'done') => void;
    onDragEnd?: (e: DragEvent) => void;
    from?: 'todo' | 'q1' | 'q2' | 'q3' | 'q4' | 'done';
}

export function Items({ items, onItemClick, onDragStart, onDragEnd, from }: ItemsProps) {
    return (
        <div className="pmx-list">
            {items.map((item) => (
                <ItemComponent
                    key={item.id}
                    item={item}
                    onItemClick={onItemClick}
                    onDragStart={onDragStart}
                    onDragEnd={onDragEnd}
                    from={from}
                />
            ))}
        </div>
    );
}

