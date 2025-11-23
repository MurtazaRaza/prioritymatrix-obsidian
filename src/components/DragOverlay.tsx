import { h } from 'preact';
import { useEffect, useState, useRef } from 'preact/hooks';
import { createPortal } from 'preact/compat';
import { Coordinates } from '../utils/drag';

interface DragOverlayProps {
    isDragging: boolean;
    dragItem: HTMLElement | null;
    pointerPosition: Coordinates | null;
    originPosition: Coordinates | null;
}

export function DragOverlay({ isDragging, dragItem, pointerPosition, originPosition }: DragOverlayProps) {
    const [overlayElement, setOverlayElement] = useState<HTMLElement | null>(null);
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
            
            // Set initial position and styles
            clone.style.position = 'fixed';
            clone.style.pointerEvents = 'none';
            clone.style.zIndex = '10000';
            clone.style.opacity = '0.8';
            clone.style.width = `${originRect.width}px`;
            clone.style.height = `${originRect.height}px`;
            clone.style.left = `${rect.left}px`;
            clone.style.top = `${rect.top}px`;
            clone.style.margin = '0';
            clone.style.boxShadow = '0 8px 16px rgba(0, 0, 0, 0.2)';
            clone.style.transform = `translate3d(${dx}px, ${dy}px, 0)`;
            clone.style.transition = 'none';
            
            document.body.appendChild(clone);
            cloneRef.current = clone;
            setOverlayElement(clone);
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

