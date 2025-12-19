import { MatrixSettings } from './types';

export const DEFAULT_SETTINGS: MatrixSettings = {
    includePath: '/',
    recursive: true,
    todoTag: 'TODO',
    maxFiles: 99999,
    autoRemoveTodoOnDone: false,
    enableStrikethroughOnDone: true,
    exemptPaths: [],
    explicitlyAddedNotes: [],
};

export function parseSettingsFromJson(jsonStr: string): MatrixSettings {
    try {
        const parsed = JSON.parse(jsonStr) as Partial<MatrixSettings>;
        const settings: MatrixSettings = Object.assign({}, DEFAULT_SETTINGS, parsed);
        // Normalize empty string includePath to "/" for consistency
        if (settings.includePath === '') {
            settings.includePath = '/';
        }
        // Ensure explicitlyAddedNotes is always an array for backward compatibility
        if (!Array.isArray(settings.explicitlyAddedNotes)) {
            settings.explicitlyAddedNotes = [];
        }
        // Ensure exemptPaths is always an array
        if (!Array.isArray(settings.exemptPaths)) {
            settings.exemptPaths = [];
        }
        return settings;
    } catch {
        return DEFAULT_SETTINGS;
    }
}

