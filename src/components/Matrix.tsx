import { h } from 'preact';
import { useState, useCallback } from 'preact/hooks';
import { Matrix as MatrixType, Item } from '../types';
import { Quadrants } from './Quadrant/Quadrants';
import { TodoBank } from './Banks/TodoBank';
import { DoneBank } from './Banks/DoneBank';
import { StateManager } from '../state/StateManager';
import { App } from 'obsidian';
import { PriorityMatrixView } from '../views/PriorityMatrixView';

interface MatrixProps {
    matrix: MatrixType | null;
    stateManager: StateManager;
    app: App;
}

export function Matrix({ matrix, stateManager, app }: MatrixProps) {
    const [todoCollapsed, setTodoCollapsed] = useState(false);
    const [doneCollapsed, setDoneCollapsed] = useState(false);

    const handleItemClick = useCallback((item: Item) => {
        if (item.data.metadata.fileAccessor) {
            app.workspace.openLinkText(
                item.data.metadata.fileAccessor.path,
                '',
                false
            );
        }
    }, [app]);

    const handleDragOver = useCallback((e: DragEvent) => {
        e.preventDefault();
    }, []);

    const handleDrop = useCallback((e: DragEvent, to: 'todo' | 'q1' | 'q2' | 'q3' | 'q4' | 'done') => {
        e.preventDefault();
        const itemId = e.dataTransfer?.getData('text/plain');
        const from = e.dataTransfer?.getData('text/pmx-from') as 'todo' | 'q1' | 'q2' | 'q3' | 'q4' | 'done';
        if (!itemId || !from) return;
        
        stateManager.moveItem(itemId, from, to);
        stateManager.save();
    }, [stateManager]);

    if (!matrix) {
        return <div>Loading...</div>;
    }

    return (
        <div className="priority-matrix-container">
            <div className="priority-matrix-toolbar">
                <div className="priority-matrix-title">Eisenhower Matrix</div>
                <div style={{ display: 'flex', gap: '8px' }}>
                    <button onClick={async () => {
                        // Refresh TODO items
                        const view = app.workspace.getActiveViewOfType(PriorityMatrixView);
                        if (view && view.file) {
                            await view.refreshTodos();
                        }
                    }}>
                        Refresh TODOs
                    </button>
                    <button onClick={async () => {
                        // Switch to markdown view
                        const file = matrix.id;
                        app.workspace.getLeaf(true).setViewState({
                            type: 'markdown',
                            state: { file },
                        });
                    }}>
                        Open as markdown
                    </button>
                </div>
            </div>
            <div className="priority-matrix-grid">
                <div
                    onDragOver={handleDragOver}
                    onDrop={(e) => handleDrop(e, 'todo')}
                >
                    <TodoBank
                        items={matrix.data.banks.todo}
                        collapsed={todoCollapsed}
                        onToggleCollapse={() => setTodoCollapsed(!todoCollapsed)}
                        onItemClick={handleItemClick}
                    />
                </div>
                
                <div className="pmx-matrix-header">
                    <div className="pmx-col-subheader">Urgent</div>
                    <div className="pmx-col-subheader">Not urgent</div>
                </div>

                <div
                    className="pmx-cell pmx-q1"
                    onDragOver={handleDragOver}
                    onDrop={(e) => handleDrop(e, 'q1')}
                >
                    <div className="pmx-cell-title">Q1: Do</div>
                    <ul className="pmx-list">
                        {matrix.children.find(q => q.id === 'q1')?.children.map((item) => (
                            <li
                                key={item.id}
                                className="pmx-item pmx-bubble"
                                draggable={true}
                                data-item-id={item.id}
                                onDragStart={(e) => {
                                    e.dataTransfer?.setData('text/plain', item.id);
                                    e.dataTransfer?.setData('text/pmx-from', 'q1');
                                }}
                                onClick={() => handleItemClick(item)}
                            >
                                {item.data.metadata.fileAccessor ? (
                                    <a href="#" onClick={(e) => { e.preventDefault(); handleItemClick(item); }}>
                                        {item.data.title}
                                    </a>
                                ) : (
                                    <span>{item.data.title}</span>
                                )}
                            </li>
                        ))}
                    </ul>
                </div>

                <div
                    className="pmx-cell pmx-q2"
                    onDragOver={handleDragOver}
                    onDrop={(e) => handleDrop(e, 'q2')}
                >
                    <div className="pmx-cell-title">Q2: Plan</div>
                    <ul className="pmx-list">
                        {matrix.children.find(q => q.id === 'q2')?.children.map((item) => (
                            <li
                                key={item.id}
                                className="pmx-item pmx-bubble"
                                draggable={true}
                                data-item-id={item.id}
                                onDragStart={(e) => {
                                    e.dataTransfer?.setData('text/plain', item.id);
                                    e.dataTransfer?.setData('text/pmx-from', 'q2');
                                }}
                                onClick={() => handleItemClick(item)}
                            >
                                {item.data.metadata.fileAccessor ? (
                                    <a href="#" onClick={(e) => { e.preventDefault(); handleItemClick(item); }}>
                                        {item.data.title}
                                    </a>
                                ) : (
                                    <span>{item.data.title}</span>
                                )}
                            </li>
                        ))}
                    </ul>
                </div>

                <div
                    className="pmx-cell pmx-q3"
                    onDragOver={handleDragOver}
                    onDrop={(e) => handleDrop(e, 'q3')}
                >
                    <div className="pmx-cell-title">Q3: Delegate</div>
                    <ul className="pmx-list">
                        {matrix.children.find(q => q.id === 'q3')?.children.map((item) => (
                            <li
                                key={item.id}
                                className="pmx-item pmx-bubble"
                                draggable={true}
                                data-item-id={item.id}
                                onDragStart={(e) => {
                                    e.dataTransfer?.setData('text/plain', item.id);
                                    e.dataTransfer?.setData('text/pmx-from', 'q3');
                                }}
                                onClick={() => handleItemClick(item)}
                            >
                                {item.data.metadata.fileAccessor ? (
                                    <a href="#" onClick={(e) => { e.preventDefault(); handleItemClick(item); }}>
                                        {item.data.title}
                                    </a>
                                ) : (
                                    <span>{item.data.title}</span>
                                )}
                            </li>
                        ))}
                    </ul>
                </div>

                <div
                    className="pmx-cell pmx-q4"
                    onDragOver={handleDragOver}
                    onDrop={(e) => handleDrop(e, 'q4')}
                >
                    <div className="pmx-cell-title">Q4: Eliminate</div>
                    <ul className="pmx-list">
                        {matrix.children.find(q => q.id === 'q4')?.children.map((item) => (
                            <li
                                key={item.id}
                                className="pmx-item pmx-bubble"
                                draggable={true}
                                data-item-id={item.id}
                                onDragStart={(e) => {
                                    e.dataTransfer?.setData('text/plain', item.id);
                                    e.dataTransfer?.setData('text/pmx-from', 'q4');
                                }}
                                onClick={() => handleItemClick(item)}
                            >
                                {item.data.metadata.fileAccessor ? (
                                    <a href="#" onClick={(e) => { e.preventDefault(); handleItemClick(item); }}>
                                        {item.data.title}
                                    </a>
                                ) : (
                                    <span>{item.data.title}</span>
                                )}
                            </li>
                        ))}
                    </ul>
                </div>

                <div
                    onDragOver={handleDragOver}
                    onDrop={(e) => handleDrop(e, 'done')}
                >
                    <DoneBank
                        items={matrix.data.banks.done}
                        collapsed={doneCollapsed}
                        onToggleCollapse={() => setDoneCollapsed(!doneCollapsed)}
                        onItemClick={handleItemClick}
                    />
                </div>
            </div>
        </div>
    );
}

