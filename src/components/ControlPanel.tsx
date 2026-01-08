// ============================================================
// RoboCup Jr. Simulator - Control Panel Component
// ============================================================

import React from 'react';

interface ControlPanelProps {
  isPaused: boolean;
  speed: number;
  onPlayPause: () => void;
  onReset: () => void;
  onSpeedChange: (speed: number) => void;
  onNewGame: () => void;
}

export const ControlPanel: React.FC<ControlPanelProps> = ({
  isPaused,
  speed,
  onPlayPause,
  onReset,
  onSpeedChange,
  onNewGame,
}) => {
  return (
    <div className="panel-section control-panel">
      <h3 className="panel-section-title">Controls</h3>
      
      <div className="control-buttons">
        <button
          className="btn btn-primary btn-large"
          onClick={onPlayPause}
        >
          {isPaused ? '▶ Play' : '⏸ Pause'}
        </button>
        <button
          className="btn btn-secondary btn-icon"
          onClick={onReset}
          title="Reset"
        >
          ↺
        </button>
      </div>

      <div className="speed-control">
        <span className="speed-label">Speed</span>
        <input
          type="range"
          className="speed-slider"
          min="0.25"
          max="4"
          step="0.25"
          value={speed}
          onChange={(e) => onSpeedChange(parseFloat(e.target.value))}
        />
        <span className="speed-value">{speed}x</span>
      </div>

      <div style={{ marginTop: '16px' }}>
        <button
          className="btn btn-secondary"
          onClick={onNewGame}
          style={{ width: '100%' }}
        >
          New Game
        </button>
      </div>
    </div>
  );
};

