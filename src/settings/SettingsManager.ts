import { App, Setting } from 'obsidian';
import { MatrixSettings } from '../types';
import PriorityMatrixPlugin from '../../main';
import { createLogger } from '../utils/logger';

export interface SettingsManagerConfig {
    onSettingsChange: (settings: MatrixSettings) => void;
}

const log = createLogger('SettingsManager');

export class SettingsManager {
    win: Window | null = null;
    app: App;
    plugin: PriorityMatrixPlugin;
    config: SettingsManagerConfig;
    settings: MatrixSettings;
    cleanupFns: Array<() => void> = [];
    applyDebounceTimer: number = 0;

    constructor(plugin: PriorityMatrixPlugin, config: SettingsManagerConfig, settings: MatrixSettings) {
        this.app = plugin.app;
        this.plugin = plugin;
        this.config = config;
        this.settings = settings;
    }

    /**
     * Get setting value with precedence (local over global)
     * Returns [localValue, globalValue]
     */
    getSetting<K extends keyof MatrixSettings>(
        key: K,
        local: boolean
    ): [MatrixSettings[K] | undefined, MatrixSettings[K] | undefined] {
        if (local) {
            // For matrix-specific settings, return [local, global]
            const pluginKey = key as keyof PriorityMatrixPlugin['settings'];
            const globalValue = (this.plugin.settings?.[pluginKey] as MatrixSettings[K]) ?? undefined;
            return [this.settings[key], globalValue];
        }
        // For global settings, return [global, undefined]
        return [this.settings[key], undefined];
    }

    /**
     * Apply settings update with debouncing
     */
    applySettingsUpdate(updateFn: (current: MatrixSettings) => MatrixSettings): void {
        if (!this.win) return;

        this.win.clearTimeout(this.applyDebounceTimer);

        this.applyDebounceTimer = this.win.setTimeout(() => {
            const oldIncludePath = this.settings.includePath;
            this.settings = updateFn(this.settings);
            log.log('applySettingsUpdate', {
                oldIncludePath,
                newIncludePath: this.settings.includePath,
                allSettings: this.settings
            });
            this.config.onSettingsChange(this.settings);
        }, 1000);
    }

    /**
     * Clean up resources
     */
    cleanUp(): void {
        if (this.win) {
            this.win.clearTimeout(this.applyDebounceTimer);
        }
        this.win = null;
        this.cleanupFns.forEach((fn) => fn());
        this.cleanupFns = [];
    }

    /**
     * Construct the settings UI
     */
    constructUI(contentEl: HTMLElement, heading: string, local: boolean): void {
        this.win = contentEl.win;

        // Add heading
        contentEl.createEl('h3', { text: heading });

        // Add description based on local vs global
        if (local) {
            contentEl.createEl('p', {
                text: 'These settings will take precedence over the default priority matrix settings.',
                cls: 'priority-matrix-settings-description'
            });
        } else {
            contentEl.createEl('p', {
                text: 'Set the default priority matrix settings. Settings can be overridden on a matrix-by-matrix basis.',
                cls: 'priority-matrix-settings-description'
            });
        }

        // Scan options section
        contentEl.createEl('h4', { text: 'Scan options' });

        // Include path
        new Setting(contentEl)
            .setName('Include folder')
            .setDesc('Vault-relative path to scan for todo notes (default: /)')
            .addText((text) => {
                const [value, globalValue] = this.getSetting('includePath', local);
                log.log('includePath display', {
                    local,
                    value,
                    globalValue,
                    'value type': typeof value,
                    'value === "/"': value === '/',
                    'value && value !== "/"': value && value !== '/'
                });
                text.inputEl.placeholder = globalValue ? `${globalValue} (default)` : '/ (default)';
                const displayValue = value && value !== '/' ? value : '';
                log.log('setting input value to', displayValue, 'placeholder:', text.inputEl.placeholder);
                text.inputEl.value = displayValue;

                text.onChange((val) => {
                    const trimmed = val.trim();
                    const newIncludePath = trimmed || '/';
                    log.log('includePath onChange', {
                        inputValue: val,
                        trimmed,
                        newIncludePath
                    });
                    this.applySettingsUpdate((current) => ({
                        ...current,
                        includePath: newIncludePath,
                    }));
                });
            })
            .addExtraButton((b) => {
                b.setIcon('lucide-rotate-ccw')
                    .setTooltip('Reset to default')
                    .onClick(() => {
                        const [, globalValue] = this.getSetting('includePath', local);
                        const defaultValue = globalValue ?? '/';
                        const textInput = contentEl.querySelector('input[type="text"]') as HTMLInputElement;
                        if (textInput) {
                            textInput.value = '';
                            textInput.placeholder = `${defaultValue} (default)`;
                        }

                        this.applySettingsUpdate((current) => ({
                            ...current,
                            includePath: defaultValue,
                        }));
                    });
            });

        // Recursive scan
        new Setting(contentEl)
            .setName('Recursive scan')
            .setDesc('Scan subfolders of include folder')
            .addToggle((toggle) => {
                const [value, globalValue] = this.getSetting('recursive', local);
                const effectiveValue = value !== undefined ? value : (globalValue ?? true);
                toggle.setValue(effectiveValue);

                toggle.onChange((newValue) => {
                    this.applySettingsUpdate((current) => ({
                        ...current,
                        recursive: newValue,
                    }));
                });
            })
            .addExtraButton((b) => {
                b.setIcon('lucide-rotate-ccw')
                    .setTooltip('Reset to default')
                    .onClick(() => {
                        const [, globalValue] = this.getSetting('recursive', local);
                        const defaultValue = globalValue ?? true;
                        const toggles = contentEl.querySelectorAll('.checkbox-container input[type="checkbox"]');
                        const toggle = toggles[0] as HTMLInputElement;
                        if (toggle) {
                            toggle.checked = defaultValue;
                            toggle.dispatchEvent(new Event('change'));
                        }

                        this.applySettingsUpdate((current) => ({
                            ...current,
                            recursive: defaultValue,
                        }));
                    });
            });

        // Todo tag
        new Setting(contentEl)
            .setName('Todo tag')
            .setDesc('Tag to match (without #), case-insensitive')
            .addText((text) => {
                const [value] = this.getSetting('todoTag', local);
                text.inputEl.placeholder = 'Todo';
                text.inputEl.value = value || '';

                text.onChange((val) => {
                    const trimmed = val.trim() || 'TODO';
                    this.applySettingsUpdate((current) => ({
                        ...current,
                        todoTag: trimmed,
                    }));
                });
            })
            .addExtraButton((b) => {
                b.setIcon('lucide-rotate-ccw')
                    .setTooltip('Reset to default')
                    .onClick(() => {
                        const [, globalValue] = this.getSetting('todoTag', local);
                        const defaultValue = globalValue || 'TODO';
                        const textInputs = contentEl.querySelectorAll('input[type="text"]');
                        const textInput = textInputs[1] as HTMLInputElement;
                        if (textInput) {
                            textInput.value = '';
                            textInput.placeholder = defaultValue;
                        }

                        this.applySettingsUpdate((current) => ({
                            ...current,
                            todoTag: defaultValue,
                        }));
                    });
            });

        // Max Files
        new Setting(contentEl)
            .setName('Max files to scan')
            .setDesc('Set 0 for unlimited')
            .addText((text) => {
                const [value, globalValue] = this.getSetting('maxFiles', local);
                text.inputEl.setAttr('type', 'number');
                text.inputEl.placeholder = `${globalValue ?? 99999} (default)`;
                text.inputEl.value = value !== undefined ? value.toString() : '';

                const numberRegEx = /^\d+$/;
                text.onChange((val) => {
                    if (val && numberRegEx.test(val)) {
                        text.inputEl.removeClass('error');
                        const num = parseInt(val, 10);
                        this.applySettingsUpdate((current) => ({
                            ...current,
                            maxFiles: num,
                        }));
                        return;
                    }

                    if (val) {
                        text.inputEl.addClass('error');
                    }

                    this.applySettingsUpdate((current) => {
                        const next: MatrixSettings = { ...current };
                        // Remove maxFiles so it falls back to default/global
                        delete (next as Partial<MatrixSettings>).maxFiles;
                        return next;
                    });
                });
            })
            .addExtraButton((b) => {
                b.setIcon('lucide-rotate-ccw')
                    .setTooltip('Reset to default')
                    .onClick(() => {
                        const [, globalValue] = this.getSetting('maxFiles', local);
                        const defaultValue = globalValue ?? 99999;
                        const textInput = contentEl.querySelector('input[type="number"]') as HTMLInputElement;
                        if (textInput) {
                            textInput.value = '';
                            textInput.placeholder = `${defaultValue} (default)`;
                            textInput.removeClass('error');
                        }

                        this.applySettingsUpdate((current) => ({
                            ...current,
                            maxFiles: defaultValue,
                        }));
                    });
            });

        // Exempt Paths
        new Setting(contentEl)
            .setName('Exempt paths')
            .setDesc('Paths to exclude from scanning (one per line)')
            .addTextArea((text) => {
                const [value, globalValue] = this.getSetting('exemptPaths', local);
                const paths = value || globalValue || [];
                text.inputEl.placeholder = 'Enter paths to exclude, one per line';
                text.inputEl.value = Array.isArray(paths) ? paths.join('\n') : '';
                text.inputEl.rows = 4;

                text.onChange((val) => {
                    const paths = val
                        .split('\n')
                        .map(p => p.trim())
                        .filter(Boolean);
                    
                    this.applySettingsUpdate((current) => ({
                        ...current,
                        exemptPaths: paths,
                    }));
                });
            })
            .addExtraButton((b) => {
                b.setIcon('lucide-rotate-ccw')
                    .setTooltip('Reset to default')
                    .onClick(() => {
                        const [, globalValue] = this.getSetting('exemptPaths', local);
                        const defaultValue = globalValue || [];
                        const textArea = contentEl.querySelector('textarea') as HTMLTextAreaElement;
                        if (textArea) {
                            textArea.value = Array.isArray(defaultValue) ? defaultValue.join('\n') : '';
                            textArea.placeholder = 'Enter paths to exclude, one per line';
                        }

                        this.applySettingsUpdate((current) => ({
                            ...current,
                            exemptPaths: defaultValue,
                        }));
                    });
            });

        // Behavior options section
        contentEl.createEl('h4', { text: 'Behavior options' });

        // Auto-remove todo on done
        new Setting(contentEl)
            .setName('Auto-remove todo on done')
            .setDesc('Remove the todo tag instead of strikethrough when moved to done')
            .addToggle((toggle) => {
                const [value, globalValue] = this.getSetting('autoRemoveTodoOnDone', local);
                const effectiveValue = value !== undefined ? value : (globalValue ?? false);
                toggle.setValue(effectiveValue);

                toggle.onChange((newValue) => {
                    this.applySettingsUpdate((current) => {
                        const updated: MatrixSettings = {
                            ...current,
                            autoRemoveTodoOnDone: newValue,
                        };
                        // If auto-remove is enabled, disable strikethrough
                        if (newValue) {
                            updated.enableStrikethroughOnDone = false;
                        }
                        return updated;
                    });
                    // Re-render to update strikethrough toggle state
                    globalThis.setTimeout(() => {
                        const strikethroughToggle = contentEl.querySelectorAll('.checkbox-container input[type="checkbox"]')[1] as HTMLInputElement;
                        if (strikethroughToggle) {
                            strikethroughToggle.disabled = newValue;
                        }
                    }, 100);
                });
            })
            .addExtraButton((b) => {
                b.setIcon('lucide-rotate-ccw')
                    .setTooltip('Reset to default')
                    .onClick(() => {
                        const [, globalValue] = this.getSetting('autoRemoveTodoOnDone', local);
                        const defaultValue = globalValue ?? false;
                        const toggles = contentEl.querySelectorAll('.checkbox-container input[type="checkbox"]');
                        const autoRemoveToggle = toggles[0] as HTMLInputElement;
                        if (autoRemoveToggle) {
                            autoRemoveToggle.checked = defaultValue;
                            autoRemoveToggle.dispatchEvent(new Event('change'));
                        }

                        this.applySettingsUpdate((current) => ({
                            ...current,
                            autoRemoveTodoOnDone: defaultValue,
                        }));
                    });
            });

        // Enable strikethrough on done
        new Setting(contentEl)
            .setName('Strikethrough todo on done')
            .setDesc('Replace #todo with ~~#todo~~ when moved to done')
            .addToggle((toggle) => {
                const [value, globalValue] = this.getSetting('autoRemoveTodoOnDone', local);
                const autoRemoveEnabled = value !== undefined ? value : (globalValue ?? false);
                toggle.setDisabled(autoRemoveEnabled);

                const [strikethroughValue, strikethroughGlobal] = this.getSetting('enableStrikethroughOnDone', local);
                const effectiveValue = strikethroughValue !== undefined ? strikethroughValue : (strikethroughGlobal ?? true);
                toggle.setValue(effectiveValue);

                toggle.onChange((newValue) => {
                    this.applySettingsUpdate((current) => ({
                        ...current,
                        enableStrikethroughOnDone: newValue,
                    }));
                });
            })
            .addExtraButton((b) => {
                b.setIcon('lucide-rotate-ccw')
                    .setTooltip('Reset to default')
                    .onClick(() => {
                        const [, globalValue] = this.getSetting('enableStrikethroughOnDone', local);
                        const defaultValue = globalValue ?? true;
                        const toggles = contentEl.querySelectorAll('.checkbox-container input[type="checkbox"]');
                        const strikethroughToggle = toggles[1] as HTMLInputElement;
                        if (strikethroughToggle) {
                            strikethroughToggle.checked = defaultValue;
                            strikethroughToggle.dispatchEvent(new Event('change'));
                        }

                        this.applySettingsUpdate((current) => ({
                            ...current,
                            enableStrikethroughOnDone: defaultValue,
                        }));
                    });
            });
    }
}

