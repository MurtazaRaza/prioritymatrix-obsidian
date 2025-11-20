import { h } from 'preact';
import { Item } from '../../types';
import { ItemComponent } from './Item';
import { StateManager } from '../../state/StateManager';
import { App } from 'obsidian';

interface ItemsProps {
    items: Item[];
    onItemClick?: (item: Item) => void;
    onPointerDragStart?: (itemId: string, from: 'todo' | 'q1' | 'q2' | 'q3' | 'q4' | 'done', pointer: PointerEvent) => void;
    onPointerDragMove?: (pointer: PointerEvent) => void;
    onPointerDragEnd?: () => void;
    from?: 'todo' | 'q1' | 'q2' | 'q3' | 'q4' | 'done';
    stateManager: StateManager;
    app: App;
}

export function Items({ items, onItemClick, onPointerDragStart, onPointerDragMove, onPointerDragEnd, from, stateManager, app }: ItemsProps) {
    return (
        <div className="pmx-list">
            {items.map((item) => (
                <ItemComponent
                    key={item.id}
                    item={item}
                    onItemClick={onItemClick}
                    onPointerDragStart={onPointerDragStart}
                    onPointerDragMove={onPointerDragMove}
                    onPointerDragEnd={onPointerDragEnd}
                    from={from}
                    stateManager={stateManager}
                    app={app}
                />
            ))}
        </div>
    );
}

