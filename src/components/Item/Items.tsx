import { h } from 'preact';
import { Item } from '../../types';
import { ItemComponent } from './Item';

interface ItemsProps {
    items: Item[];
    onItemClick?: (item: Item) => void;
}

export function Items({ items, onItemClick }: ItemsProps) {
    return (
        <ul className="pmx-list">
            {items.map((item) => (
                <ItemComponent key={item.id} item={item} onItemClick={onItemClick} />
            ))}
        </ul>
    );
}

