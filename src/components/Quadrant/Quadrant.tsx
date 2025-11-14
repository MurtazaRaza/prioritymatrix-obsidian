import { h } from 'preact';
import { Quadrant as QuadrantType, Item } from '../../types';
import { Items } from '../Item/Items';

interface QuadrantProps {
    quadrant: QuadrantType;
    onItemClick?: (item: Item) => void;
}

export function Quadrant({ quadrant, onItemClick }: QuadrantProps) {
    return (
        <div className={`pmx-cell pmx-${quadrant.id}`}>
            <div className="pmx-cell-title">{quadrant.data.title}</div>
            <Items items={quadrant.children} onItemClick={onItemClick} />
        </div>
    );
}

