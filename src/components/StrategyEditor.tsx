// ============================================================
// RoboCup Jr. Simulator - Strategy Editor Component
// ============================================================

import React, { useCallback } from 'react';
import Editor from '@monaco-editor/react';
import { GameMode } from '../types';

interface StrategyEditorProps {
  strategies: Record<string, string>;
  activeTab: string;
  onTabChange: (tab: string) => void;
  onStrategyChange: (robotId: string, code: string) => void;
  gameMode: GameMode;
}

export const StrategyEditor: React.FC<StrategyEditorProps> = ({
  strategies,
  activeTab,
  onTabChange,
  onStrategyChange,
  gameMode,
}) => {
  // Get available tabs based on game mode
  const getTabs = () => {
    const tabs = [
      { id: 'blue_attacker', label: 'Blue Attacker', team: 'blue' },
    ];

    if (gameMode !== GameMode.SingleBot) {
      tabs.push({ id: 'blue_defender', label: 'Blue Defender', team: 'blue' });
    }

    if (gameMode === GameMode.TwoTeam) {
      tabs.push(
        { id: 'yellow_attacker', label: 'Yellow Attacker', team: 'yellow' },
        { id: 'yellow_defender', label: 'Yellow Defender', team: 'yellow' }
      );
    }

    return tabs;
  };

  const tabs = getTabs();

  const handleEditorChange = useCallback(
    (value: string | undefined) => {
      if (value !== undefined) {
        onStrategyChange(activeTab, value);
      }
    },
    [activeTab, onStrategyChange]
  );

  return (
    <div className="strategy-editor">
      <h3 className="panel-section-title">Strategy Editor</h3>

      <div className="editor-tabs">
        {tabs.map(({ id, label, team }) => (
          <button
            key={id}
            className={`editor-tab ${team} ${activeTab === id ? 'active' : ''}`}
            onClick={() => onTabChange(id)}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="editor-wrapper">
        <Editor
          height="100%"
          language="javascript"
          theme="vs-dark"
          value={strategies[activeTab] || ''}
          onChange={handleEditorChange}
          options={{
            minimap: { enabled: false },
            fontSize: 13,
            lineNumbers: 'on',
            scrollBeyondLastLine: false,
            wordWrap: 'on',
            tabSize: 2,
            automaticLayout: true,
            folding: true,
            renderLineHighlight: 'line',
            padding: { top: 8 },
          }}
        />
      </div>

      <div style={{ marginTop: '12px', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
        <strong>Available:</strong> worldState.ball, worldState.goal_blue, worldState.goal_yellow, 
        clamp(), normalizeAngle(), Math functions
      </div>
    </div>
  );
};

