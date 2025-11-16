import { h } from 'preact';
import { App, Menu, Modal, Setting, Notice } from 'obsidian';
import { Item } from '../../types';
import { StateManager } from '../../state/StateManager';

interface ItemProps {
    item: Item;
    onItemClick?: (item: Item) => void;
    onDragStart?: (e: DragEvent, itemId: string, from: 'todo' | 'q1' | 'q2' | 'q3' | 'q4' | 'done') => void;
    onDragEnd?: (e: DragEvent) => void;
    from?: 'todo' | 'q1' | 'q2' | 'q3' | 'q4' | 'done';
    stateManager: StateManager;
    app: App;
}

class TodoLinkedRemoveModal extends Modal {
	constructor(app: App, onRemoveTag: () => void, onExempt: () => void) {
		super(app);
		this.setTitle('Linked note options');
		new Setting(this.contentEl)
			.setName('Remove #TODO from note')
			.setDesc('This will edit the linked note to remove the TODO tag.')
			.addButton(b => b.setButtonText('Remove #TODO').onClick(() => {
				onRemoveTag();
				this.close();
			}));
		new Setting(this.contentEl)
			.setName('Add to exemption list')
			.setDesc('Keep the note in the vault but exclude it from TODO scans.')
			.addButton(b => b.setButtonText('Exempt').onClick(() => {
				onExempt();
				this.close();
			}));
		new Setting(this.contentEl)
			.addButton(b => b.setButtonText('Cancel').onClick(() => this.close()));
	}
}

export function ItemComponent({ item, onItemClick, onDragStart, onDragEnd, from, stateManager, app }: ItemProps) {
    const handleClick = () => {
        if (onItemClick) {
            onItemClick(item);
        }
    };

    const handleMenuClick = (e: MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        const coords = { x: e.clientX, y: e.clientY };
        const menu = new Menu();

        menu
            .addItem((i) => {
                i.setIcon('lucide-trash-2')
                    .setTitle('Remove')
                    .onClick(() => {
                        const isLinked = !!item.data.metadata.fileAccessor;
                        const section = (from || 'q1');
                        if (!isLinked) {
                            stateManager.removeItem(item.id, section);
                            stateManager.save();
                            new Notice('Item removed');
                            return;
                        }
                        const modal = new TodoLinkedRemoveModal(app,
                            () => {
                                // TODO: Implement removing #TODO from linked note
                                new Notice('Will remove #TODO from linked note (coming soon)');
                            },
                            () => {
                                // TODO: Implement adding to exemption list
                                new Notice('Will add note to exemption list (coming soon)');
                            }
                        );
                        modal.open();
                    });
            });

        menu.showAtPosition(coords);
    };

    return (
        <div className="pmx-item-wrapper">
            <div
                className="pmx-item"
                draggable={true}
                data-item-id={item.id}
                onDragStart={onDragStart ? (e) => onDragStart(e, item.id, from || 'q1') : undefined}
                onDragEnd={onDragEnd}
            >
                <div className="pmx-item-content-wrapper">
                    <div className="pmx-item-title-wrapper">
                        {item.data.metadata.fileAccessor ? (
                            <a
                                href="#"
                                className="pmx-item-title"
                                onClick={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    if (onItemClick) {
                                        onItemClick(item);
                                    }
                                }}
                            >
                                {item.data.title}
                            </a>
                        ) : (
                            <div className="pmx-item-title">{item.data.title}</div>
                        )}
                        <button
                            className="pmx-item-menu-btn"
                            data-ignore-drag={true as any}
                            onClick={handleMenuClick}
                            aria-label="Item options"
                        >
                            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                                <circle cx="8" cy="4" r="1.5" fill="currentColor"/>
                                <circle cx="8" cy="8" r="1.5" fill="currentColor"/>
                                <circle cx="8" cy="12" r="1.5" fill="currentColor"/>
                            </svg>
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}

