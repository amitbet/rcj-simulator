// ============================================================
// RoboCup Jr. Simulator - Game Mode Selector Component
// ============================================================

import React, { useState } from 'react';
import { GameMode } from '../types';

interface GameModeSelectorProps {
  onSelect: (mode: GameMode) => void;
}

export const GameModeSelector: React.FC<GameModeSelectorProps> = ({ onSelect }) => {
  const [selectedMode, setSelectedMode] = useState<GameMode>(GameMode.TwoTeam);

  const modes = [
    {
      mode: GameMode.SingleBotAttacker,
      name: 'Single Bot Attacker',
      description: 'One attacker robot vs. the goal. Perfect for testing attacker strategies.',
      icon: '🤖',
    },
    {
      mode: GameMode.SingleBotDefender,
      name: 'Single Bot Defender',
      description: 'One defender robot vs. the goal. Perfect for testing defender strategies.',
      icon: '🛡️',
    },
    {
      mode: GameMode.SingleTeam,
      name: 'Single Team',
      description: 'Your attacker and defender working together. No opponents.',
      icon: '👥',
    },
    {
      mode: GameMode.TwoTeam,
      name: 'Full Match',
      description: 'Complete 2v2 simulation with opposing team. Full game rules.',
      icon: '⚽',
    },
  ];

  return (
    <div className="modal-overlay">
      <div className="modal">
        <h1 className="modal-title">RoboCup Jr. Simulator</h1>
        <p className="modal-subtitle">Select a game mode to begin</p>

        <div className="mode-options">
          {modes.map(({ mode, name, description, icon }) => (
            <div
              key={mode}
              className={`mode-option ${selectedMode === mode ? 'selected' : ''}`}
              onClick={() => setSelectedMode(mode)}
            >
              <div className="mode-icon">{icon}</div>
              <div className="mode-info">
                <div className="mode-name">{name}</div>
                <div className="mode-description">{description}</div>
              </div>
            </div>
          ))}
        </div>

        <div className="modal-actions">
          <button
            className="btn btn-primary btn-large"
            onClick={() => onSelect(selectedMode)}
          >
            Start Simulation
          </button>
        </div>
      </div>
    </div>
  );
};

