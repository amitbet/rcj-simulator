// ============================================================
// RoboCup Jr. Simulator - Score Board Component
// ============================================================

import React from 'react';
import { GamePhase } from '../types';

interface ScoreBoardProps {
  scoreBlue: number;
  scoreYellow: number;
  timeMs: number;
  half: 1 | 2;
  phase: GamePhase;
}

export const ScoreBoard: React.FC<ScoreBoardProps> = ({
  scoreBlue,
  scoreYellow,
  timeMs,
  half,
  phase,
}) => {
  // Format time as MM:SS
  const formatTime = (ms: number): string => {
    const totalSeconds = Math.floor(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  };

  // Get phase display text
  const getPhaseText = (): string => {
    switch (phase) {
      case GamePhase.Setup:
        return 'Setup';
      case GamePhase.Kickoff:
        return 'Kickoff';
      case GamePhase.Playing:
        return 'Playing';
      case GamePhase.Paused:
        return 'Paused';
      case GamePhase.OutOfBounds:
        return 'Out of Bounds';
      case GamePhase.Goal:
        return 'Goal!';
      case GamePhase.HalfTime:
        return 'Half Time';
      case GamePhase.Finished:
        return 'Game Over';
      default:
        return '';
    }
  };

  const getPhaseClass = (): string => {
    switch (phase) {
      case GamePhase.Playing:
        return 'playing';
      case GamePhase.Paused:
        return 'paused';
      case GamePhase.Kickoff:
      case GamePhase.OutOfBounds:
        return 'kickoff';
      default:
        return '';
    }
  };

  return (
    <div className="panel-section">
      <h3 className="panel-section-title">Score</h3>
      
      <div className="scoreboard">
        <div className="team-score">
          <span className="team-label blue">Blue</span>
          <span className="score-value blue">{scoreBlue}</span>
        </div>
        <span className="score-separator">-</span>
        <div className="team-score">
          <span className="team-label yellow">Yellow</span>
          <span className="score-value yellow">{scoreYellow}</span>
        </div>
      </div>

      <div className="game-info">
        <div className="info-item">
          <div className="info-label">Time</div>
          <div className="info-value">{formatTime(timeMs)}</div>
        </div>
        <div className="info-item">
          <div className="info-label">Half</div>
          <div className="info-value">{half}</div>
        </div>
        <div className="info-item" style={{ gridColumn: 'span 2' }}>
          <div className="info-label">Status</div>
          <div className={`info-value ${getPhaseClass()}`}>{getPhaseText()}</div>
        </div>
      </div>
    </div>
  );
};

