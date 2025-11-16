import { h, Fragment } from 'preact';
import { Quadrant as QuadrantType, Item } from '../../types';
import { Quadrant } from './Quadrant';
import { StateManager } from '../../state/StateManager';
import { App } from 'obsidian';

interface QuadrantsProps {
    quadrants: QuadrantType[];
    onItemClick?: (item: Item) => void;
    stateManager: StateManager;
    app: App;
}

export function Quadrants({ quadrants, onItemClick, stateManager, app }: QuadrantsProps) {
    return (
        <>
            {quadrants.map((quadrant) => (
                <Quadrant key={quadrant.id} quadrant={quadrant} onItemClick={onItemClick} stateManager={stateManager} app={app} />
            ))}
        </>
    );
}

