import { useState as usePreactState, useEffect } from 'preact/hooks';
import { StateManager } from './StateManager';
import { Matrix } from '../types';

/**
 * React hook to use StateManager state
 */
export function useState(manager: StateManager): Matrix | null {
    const [state, setState] = usePreactState<Matrix | null>(() => manager.getState());

    useEffect(() => {
        // Set initial state
        setState(manager.getState());
        
        // Subscribe to changes
        const unsubscribe = manager.subscribe(() => {
            const newState = manager.getState();
            console.log('[PriorityMatrix] State changed, new state:', newState);
            setState(newState);
        });
        return unsubscribe;
    }, [manager, setState]);

    return state;
}

