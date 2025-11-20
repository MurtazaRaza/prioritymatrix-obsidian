import { h, Fragment } from 'preact';
import { Quadrant as QuadrantType, Item } from '../../types';
import { Quadrant } from './Quadrant';
import { StateManager } from '../../state/StateManager';
import { App } from 'obsidian';

interface QuadrantsProps {
    quadrants: QuadrantType[];
    onItemClick?: (item: Item) => void;
    onPointerDragStart?: (itemId: string, from: 'todo' | 'q1' | 'q2' | 'q3' | 'q4' | 'done', pointer: PointerEvent) => void;
    onPointerDragMove?: (pointer: PointerEvent) => void;
    onPointerDragEnd?: () => void;
    stateManager: StateManager;
    app: App;
}

export function Quadrants({ quadrants, onItemClick, onPointerDragStart, onPointerDragMove, onPointerDragEnd, stateManager, app }: QuadrantsProps) {
    return (
        <>
            {quadrants.map((quadrant) => (
                <Quadrant 
                    key={quadrant.id} 
                    quadrant={quadrant} 
                    onItemClick={onItemClick}
                    onPointerDragStart={onPointerDragStart}
                    onPointerDragMove={onPointerDragMove}
                    onPointerDragEnd={onPointerDragEnd}
                    stateManager={stateManager} 
                    app={app} 
                />
            ))}
        </>
    );
}

