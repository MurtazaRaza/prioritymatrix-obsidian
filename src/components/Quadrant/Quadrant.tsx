import { h } from 'preact';
import { Quadrant as QuadrantType, Item } from '../../types';
import { Items } from '../Item/Items';
import { StateManager } from '../../state/StateManager';
import { App } from 'obsidian';

interface QuadrantProps {
    quadrant: QuadrantType;
    onItemClick?: (item: Item) => void;
    onPointerDragStart?: (itemId: string, from: 'todo' | 'q1' | 'q2' | 'q3' | 'q4' | 'done', pointer: PointerEvent) => void;
    onPointerDragMove?: (pointer: PointerEvent) => void;
    onPointerDragEnd?: () => void;
    stateManager: StateManager;
    app: App;
}

export function Quadrant({ quadrant, onItemClick, onPointerDragStart, onPointerDragMove, onPointerDragEnd, stateManager, app }: QuadrantProps) {
    return (
        <div className={`pmx-cell pmx-${quadrant.id}`}>
            <div className="pmx-cell-title">{quadrant.data.title}</div>
            <div className="pmx-cell-items-wrapper">
                <Items
                    items={quadrant.children}
                    onItemClick={onItemClick}
                    onPointerDragStart={onPointerDragStart}
                    onPointerDragMove={onPointerDragMove}
                    onPointerDragEnd={onPointerDragEnd}
                    from={quadrant.id as 'q1' | 'q2' | 'q3' | 'q4'}
                    stateManager={stateManager}
                    app={app}
                />
            </div>
        </div>
    );
}

