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
        return Object.assign({}, DEFAULT_SETTINGS, parsed);
    } catch (e) {
        return DEFAULT_SETTINGS;
    }
}

