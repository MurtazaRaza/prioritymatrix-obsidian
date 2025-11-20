/**
 * Unified drag and drop utilities using Pointer Events API
 * Inspired by Obsidian Kanban plugin's approach
 */

export interface Coordinates {
    x: number;
    y: number;
}

/**
 * Calculate Euclidean distance between two points
 */
export function distanceBetween(p1: Coordinates, p2: Coordinates): number {
    return Math.sqrt(Math.pow(p1.x - p2.x, 2) + Math.pow(p1.y - p2.y, 2));
}

/**
 * RAF-throttled function wrapper
 * Ensures the callback is called at most once per animation frame
 */
export function rafThrottle<T extends (...args: any[]) => void>(
    win: Window,
    callback: T
): T {
    let rafId: number | null = null;
    let lastArgs: Parameters<T> | null = null;

    const throttled = ((...args: Parameters<T>) => {
        lastArgs = args;
        
        if (rafId === null) {
            rafId = win.requestAnimationFrame(() => {
                rafId = null;
                if (lastArgs) {
                    callback(...lastArgs);
                    lastArgs = null;
                }
            });
        }
    }) as T;

    return throttled;
}

/**
 * Check if a pointer event is a touch/pen event
 */
export function isTouchEvent(e: PointerEvent): boolean {
    return ['pen', 'touch'].includes(e.pointerType);
}

/**
 * Constants for drag and drop
 */
export const DRAG_CONSTANTS = {
    /** Time required to initiate touch drag (long press) */
    LONG_PRESS_TIMEOUT: 500,
    /** Minimum movement in pixels to start/cancel drag */
    MOVEMENT_THRESHOLD: 5,
} as const;

