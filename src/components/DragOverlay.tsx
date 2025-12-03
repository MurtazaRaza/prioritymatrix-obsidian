/* global window, document */
import { useEffect, useRef } from 'preact/hooks';
import { Coordinates } from '../utils/drag';

interface DragOverlayProps {
    isDragging: boolean;
    dragItem: HTMLElement | null;
    pointerPosition: Coordinates | null;
    originPosition: Coordinates | null;
}

export function DragOverlay({ isDragging, dragItem, pointerPosition, originPosition }: DragOverlayProps) {
    const cloneRef = useRef<HTMLElement | null>(null);

    useEffect(() => {
        if (!isDragging || !dragItem || !pointerPosition || !originPosition) {
            // Clean up clone when not dragging
            if (cloneRef.current) {
                cloneRef.current.remove();
                cloneRef.current = null;
            }
            return;
        }

        // Get the original element's position and dimensions
        const rect = dragItem.getBoundingClientRect();
        const scrollX = window.scrollX || window.pageXOffset;
        const scrollY = window.scrollY || window.pageYOffset;
        
        const originRect = {
            x: rect.left + scrollX,
            y: rect.top + scrollY,
            width: rect.width,
            height: rect.height,
        };

        // Calculate offset from origin pointer position to current pointer position
        const dx = pointerPosition.x - originPosition.x;
        const dy = pointerPosition.y - originPosition.y;

        // Create or update the overlay
        if (!cloneRef.current) {
            const clone = dragItem.cloneNode(true) as HTMLElement;
            clone.classList.add('pmx-drag-overlay');

            // Set initial position and dynamic styles
            clone.style.width = `${originRect.width}px`;
            clone.style.height = `${originRect.height}px`;
            clone.style.left = `${rect.left}px`;
            clone.style.top = `${rect.top}px`;
            clone.style.transform = `translate3d(${dx}px, ${dy}px, 0)`;
            document.body.appendChild(clone);
            cloneRef.current = clone;
        } else {
            // Update position to follow pointer
            cloneRef.current.style.transform = `translate3d(${dx}px, ${dy}px, 0)`;
        }
    }, [isDragging, dragItem, pointerPosition, originPosition]);

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            if (cloneRef.current) {
                cloneRef.current.remove();
                cloneRef.current = null;
            }
        };
    }, []);

    return null;
}

