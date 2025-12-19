import { MatrixSettings } from '../types';
import { createLogger } from './logger';

const log = createLogger('Diagnostic');

/**
 * Diagnostic function to clean up explicitlyAddedNotes.
 * Removes paths from explicitlyAddedNotes that are now within the includePath.
 * 
 * @param settings - The matrix settings to clean up
 * @param matrixFolderPath - The path of the folder containing the matrix file (used as fallback for includePath)
 * @returns Updated settings with cleaned up explicitlyAddedNotes
 */
export function cleanupExplicitlyAddedNotes(
    settings: MatrixSettings,
    matrixFolderPath: string | null
): MatrixSettings {
    // Resolve includePath (same logic as refreshTodos)
    const includePath = settings.includePath !== undefined && settings.includePath !== null && settings.includePath !== ''
        ? settings.includePath
        : (matrixFolderPath || '/');

    const normalizedInclude = includePath === '/' ? '' : includePath.replace(/^\/*|\/*$/g, '');

    // Get current explicitlyAddedNotes
    const explicitlyAddedNotes = (settings.explicitlyAddedNotes || []).map(p => p.trim()).filter(Boolean);
    
    if (explicitlyAddedNotes.length === 0) {
        // Nothing to clean up
        return settings;
    }

    // Filter out paths that are now within includePath
    const cleaned = explicitlyAddedNotes.filter(notePath => {
        const normalizedNotePath = notePath.replace(/^\/*/, '');
        
        // Check if note is within includePath
        const isWithinInclude =
            normalizedInclude.length === 0 ||
            normalizedNotePath === normalizedInclude ||
            normalizedNotePath.startsWith(normalizedInclude + '/');

        // Also check if it's exempt (exempt paths should remain in explicitlyAddedNotes)
        const exemptSet = new Set<string>((settings.exemptPaths || []).map(p => p.trim()).filter(Boolean));
        const isExempt = exemptSet.has(notePath);

        // Remove if within includePath and not exempt
        if (isWithinInclude && !isExempt) {
            log.log('Removing from explicitlyAddedNotes (now within includePath):', notePath);
            return false;
        }
        
        return true;
    });

    // Only update if something changed
    if (cleaned.length !== explicitlyAddedNotes.length) {
        log.log('Cleaned up explicitlyAddedNotes', {
            before: explicitlyAddedNotes.length,
            after: cleaned.length,
            removed: explicitlyAddedNotes.length - cleaned.length
        });
        
        return {
            ...settings,
            explicitlyAddedNotes: cleaned,
        };
    }

    return settings;
}

