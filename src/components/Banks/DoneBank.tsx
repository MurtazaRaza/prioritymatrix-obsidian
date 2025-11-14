import { h, Fragment } from 'preact';
import { Item } from '../../types';

interface DoneBankProps {
    items: Item[];
    collapsed: boolean;
    onToggleCollapse: () => void;
    onItemClick?: (item: Item) => void;
}

export function DoneBank({ items, collapsed, onToggleCollapse, onItemClick }: DoneBankProps) {
    return (
        <>
            <div className="pmx-col-header">
                <span>DONE</span>
                <button onClick={onToggleCollapse}>
                    {collapsed ? 'Expand' : 'Collapse'}
                </button>
            </div>
            <div className={`pmx-bank pmx-done ${collapsed ? 'pmx-collapsed' : ''}`}>
                <ul className="pmx-list">
                    {items.map((item) => (
                        <li
                            key={item.id}
                            className="pmx-item pmx-bubble"
                            draggable={true}
                            data-item-id={item.id}
                            onDragStart={(e) => {
                                e.dataTransfer?.setData('text/plain', item.id);
                                e.dataTransfer?.setData('text/pmx-from', 'done');
                            }}
                            onClick={() => onItemClick?.(item)}
                        >
                            {item.data.metadata.fileAccessor ? (
                                <a href="#" onClick={(e) => { e.preventDefault(); onItemClick?.(item); }}>
                                    {item.data.title}
                                </a>
                            ) : (
                                <span>{item.data.title}</span>
                            )}
                        </li>
                    ))}
                </ul>
            </div>
        </>
    );
}

