import { h } from 'preact';
import { Item } from '../../types';

interface ItemProps {
    item: Item;
    onItemClick?: (item: Item) => void;
}

export function ItemComponent({ item, onItemClick }: ItemProps) {
    const handleClick = () => {
        if (onItemClick) {
            onItemClick(item);
        }
    };

    return (
        <li
            className="pmx-item pmx-bubble"
            draggable={true}
            data-item-id={item.id}
            onClick={handleClick}
        >
            {item.data.metadata.fileAccessor ? (
                <a
                    href="#"
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
                <span>{item.data.title}</span>
            )}
        </li>
    );
}

