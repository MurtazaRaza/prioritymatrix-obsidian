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
                                <a href="#" onClick={(e) => { e.preventDefault(); e.stopPropagation(); onItemClick?.(item); }}>
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

