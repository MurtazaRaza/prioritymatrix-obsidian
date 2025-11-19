import { MatrixSettings } from './types';

export const DEFAULT_SETTINGS: MatrixSettings = {
    includePath: '/',
    recursive: true,
    todoTag: 'TODO',
    maxFiles: 99999,
    autoRemoveTodoOnDone: false,
    enableStrikethroughOnDone: true,
    exemptPaths: [],
};

export function parseSettingsFromJson(jsonStr: string): MatrixSettings {
  try {
        const parsed = JSON.parse(jsonStr);
        const settings = Object.assign({}, DEFAULT_SETTINGS, parsed);
        console.log('[PriorityMatrix] Parsing settings JSON - after Object.assign, settings.includePath:', settings.includePath);
        // Normalize empty string includePath to "/" for consistency
        if (settings.includePath === '') {
            settings.includePath = '/';
        }
        return settings;
    } catch (e) {
        return DEFAULT_SETTINGS;
    }
}

