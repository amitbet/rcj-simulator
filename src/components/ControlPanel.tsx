// ============================================================
// RoboCup Jr. Simulator - Control Panel Component
// ============================================================

import React from 'react';

interface ControlPanelProps {
  isPaused: boolean;
  speed: number;
  useCameraData: boolean;
  onPlayPause: () => void;
  onReset: () => void;
  onResetMatch: () => void;
  onSpeedChange: (speed: number) => void;
  onToggleDataSource: () => void;
  onNewGame: () => void;
}

export const ControlPanel: React.FC<ControlPanelProps> = ({
  isPaused,
  speed,
  useCameraData,
  onPlayPause,
  onReset,
  onResetMatch,
  onSpeedChange,
  onToggleDataSource,
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
          min="0.1"
          max="4"
          step="0.1"
          value={speed}
          onChange={(e) => onSpeedChange(parseFloat(e.target.value))}
        />
        <span className="speed-value">{speed.toFixed(1)}x</span>
      </div>

      <div style={{ marginTop: '16px', display: 'flex', gap: '8px', justifyContent: 'center' }}>
        <button
          className={`btn btn-icon ${useCameraData ? 'btn-secondary' : 'btn-primary'}`}
          onClick={onToggleDataSource}
          title={useCameraData ? 'Switch to physics data' : 'Switch to camera data'}
          style={{ fontSize: '1.5rem' }}
        >
          {useCameraData ? '📷' : '⚙️'}
        </button>
        <button
          className="btn btn-secondary btn-icon"
          onClick={onResetMatch}
          title="Reset positions to starting positions (keeps score)"
          style={{ fontSize: '1.5rem' }}
        >
          🔄
        </button>
        <button
          className="btn btn-secondary btn-icon"
          onClick={onNewGame}
          title="Return to game mode selection"
          style={{ fontSize: '1.5rem' }}
        >
          🏠
        </button>
      </div>
    </div>
  );
};

