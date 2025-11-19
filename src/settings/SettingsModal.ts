import { Modal } from 'obsidian';
import { PriorityMatrixView } from '../views/PriorityMatrixView';
import { SettingsManager, SettingsManagerConfig } from './SettingsManager';
import { MatrixSettings } from '../types';

export class SettingsModal extends Modal {
    view: PriorityMatrixView;
    settingsManager: SettingsManager;

    constructor(view: PriorityMatrixView, config: SettingsManagerConfig, settings: MatrixSettings) {
        super(view.app);
        this.view = view;
        this.settingsManager = new SettingsManager(view.plugin, config, settings);
    }

    onOpen(): void {
        const { contentEl, modalEl } = this;
        
        // Add custom CSS class for styling
        modalEl.addClass('priority-matrix-settings-modal');
        
        // Construct UI with matrix name as heading, local=true for matrix-specific settings
        const heading = this.view.file?.basename || 'Priority Matrix Settings';
        this.settingsManager.constructUI(contentEl, heading, true);
    }

    onClose(): void {
        const { contentEl } = this;
        
        // Clean up any event listeners or resources
        this.settingsManager.cleanUp();
        contentEl.empty();
    }
}

