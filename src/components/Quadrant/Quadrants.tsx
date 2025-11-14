import { h, Fragment } from 'preact';
import { Quadrant as QuadrantType, Item } from '../../types';
import { Quadrant } from './Quadrant';

interface QuadrantsProps {
    quadrants: QuadrantType[];
    onItemClick?: (item: Item) => void;
}

export function Quadrants({ quadrants, onItemClick }: QuadrantsProps) {
    return (
        <>
            {quadrants.map((quadrant) => (
                <Quadrant key={quadrant.id} quadrant={quadrant} onItemClick={onItemClick} />
            ))}
        </>
    );
}

