// ============================================================
// RoboCup Jr. Simulator - Control Panel Component
// ============================================================

import React from 'react';
import { PerceptionMode } from '../types';

interface ControlPanelProps {
  isPaused: boolean;
  speed: number;
  perceptionMode: PerceptionMode;
  onPlayPause: () => void;
  onReset: () => void;
  onResetMatch: () => void;
  onSpeedChange: (speed: number) => void;
  onCyclePerceptionMode: () => void;
  onNewGame: () => void;
}

export const ControlPanel: React.FC<ControlPanelProps> = ({
  isPaused,
  speed,
  perceptionMode,
  onPlayPause,
  onReset,
  onResetMatch,
  onSpeedChange,
  onCyclePerceptionMode,
  onNewGame,
}) => {
  const modeInfo: Record<PerceptionMode, { icon: string; title: string; isPrimary: boolean }> = {
    physics: {
      icon: '⚙️',
      title: 'Perception: Physics (click to switch to Camera 360)',
      isPrimary: true,
    },
    camera_conical_360: {
      icon: '📷360',
      title: 'Perception: Camera 360 Conical Mirror (click to switch to Front Pixy2)',
      isPrimary: false,
    },
    camera_front_pixy2: {
      icon: '📷F',
      title: 'Perception: Front-Facing Pixy2 Camera (click to switch to Physics)',
      isPrimary: false,
    },
  };

  const currentMode = modeInfo[perceptionMode];

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
          className={`btn btn-icon ${currentMode.isPrimary ? 'btn-primary' : 'btn-secondary'}`}
          onClick={onCyclePerceptionMode}
          title={currentMode.title}
          style={{ fontSize: '1.5rem' }}
        >
          {currentMode.icon}
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
