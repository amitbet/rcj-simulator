// ============================================================
// RoboCup Jr. Simulator - World View Component
// ============================================================

import React from 'react';
import { GameMode, WorldState } from '../types';

interface WorldViewProps {
  worldStates: Map<string, WorldState>;
  gameMode: GameMode;
  activeTab: string;
  onTabChange: (tab: string) => void;
  strategies: Record<string, { code: string; hash: string; loadTime: number }>;
}

export const WorldView: React.FC<WorldViewProps> = ({
  worldStates,
  gameMode,
  activeTab,
  onTabChange,
  strategies,
}) => {
  // Get available tabs based on game mode
  const getTabs = () => {
    const tabs = [];

    if (gameMode === GameMode.SingleBotAttacker) {
      tabs.push({ id: 'blue_attacker', label: 'Blue Attacker', team: 'blue' });
    } else if (gameMode === GameMode.SingleBotDefender) {
      tabs.push({ id: 'blue_defender', label: 'Blue Defender', team: 'blue' });
    } else {
      // SingleTeam or TwoTeam - show both blue robots
      tabs.push(
        { id: 'blue_attacker', label: 'Blue Attacker', team: 'blue' },
        { id: 'blue_defender', label: 'Blue Defender', team: 'blue' }
      );
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
  const worldState = worldStates.get(activeTab);

  const formatObservation = (obs: WorldState['ball']) => {
    if (!obs.visible) return 'Not visible';
    // Ultra-compact format to ensure single line: distance@angle(conf)
    return `${obs.distance.toFixed(1)}cm@${obs.angle_deg.toFixed(1)}°(${obs.confidence.toFixed(2)})`;
  };

  const formatBoolean = (val: boolean) => (
    <span className={val ? 'sensor-active' : 'sensor-inactive'}>
      {val ? '✓' : '✗'}
    </span>
  );

  // Get strategy info for active tab
  const strategyInfo = strategies[activeTab];
  const formatLoadTime = (timestamp: number) => {
    const date = new Date(timestamp);
    const timeString = date.toLocaleTimeString();
    const milliseconds = date.getMilliseconds().toString().padStart(3, '0');
    return `${timeString}.${milliseconds}`;
  };

  return (
    <div className="world-view">
      <h3 className="panel-section-title">Robot World View</h3>
      
      {strategyInfo && (
        <div className="strategy-info">
          <div className="strategy-info-item">
            <span>Script Hash:</span> <span className="strategy-hash">{strategyInfo.hash}</span>
          </div>
          <div className="strategy-info-item">
            <span>Last Load:</span> <span>{formatLoadTime(strategyInfo.loadTime)}</span>
          </div>
        </div>
      )}

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

      {worldState ? (
        <div className="world-state-content">
          <div className="world-state-section">
            <h4>Time</h4>
            <div className="world-state-item">
              <span>Time:</span> <span>{worldState.t_ms.toFixed(0)} ms</span>
            </div>
            <div className="world-state-item">
              <span>Delta:</span> <span>{(worldState.dt_s * 1000).toFixed(1)} ms</span>
            </div>
          </div>

          <div className="world-state-section">
            <h4>Robot Motion</h4>
            <div className="world-state-item">
              <span>Heading:</span> <span>{worldState.heading_deg.toFixed(1)}°</span>
            </div>
            <div className="world-state-item">
              <span>Yaw Rate:</span> <span>{worldState.yaw_rate_dps.toFixed(1)} deg/s</span>
            </div>
            <div className="world-state-item">
              <span>Speed:</span> <span>{worldState.v_est.toFixed(1)} cm/s</span>
            </div>
          </div>

          <div className="world-state-section">
            <h4>Vision</h4>
            <div className="world-state-item">
              <span>Ball:</span> <span>{formatObservation(worldState.ball)}</span>
            </div>
            <div className="world-state-item">
              <span>Blue Goal:</span> <span>{formatObservation(worldState.goal_blue)}</span>
            </div>
            <div className="world-state-item">
              <span>Yellow Goal:</span> <span>{formatObservation(worldState.goal_yellow)}</span>
            </div>
          </div>

          <div className="world-state-section">
            <h4>Bumpers</h4>
            <div className="world-state-item">
              <span>Front:</span> <span>{formatBoolean(worldState.bumper_front)}</span>
            </div>
            <div className="world-state-item">
              <span>Left:</span> <span>{formatBoolean(worldState.bumper_left)}</span>
            </div>
            <div className="world-state-item">
              <span>Right:</span> <span>{formatBoolean(worldState.bumper_right)}</span>
            </div>
          </div>

          <div className="world-state-section">
            <h4>Line Sensors</h4>
            <div className="world-state-item">
              <span>Front:</span> <span>{formatBoolean(worldState.line_front)}</span>
            </div>
            <div className="world-state-item">
              <span>Left:</span> <span>{formatBoolean(worldState.line_left)}</span>
            </div>
            <div className="world-state-item">
              <span>Right:</span> <span>{formatBoolean(worldState.line_right)}</span>
            </div>
            <div className="world-state-item">
              <span>Rear:</span> <span>{formatBoolean(worldState.line_rear)}</span>
            </div>
          </div>

          <div className="world-state-section">
            <h4>Status</h4>
            <div className="world-state-item">
              <span>State:</span> <span className="state-value">{worldState.state || 'UNKNOWN'}</span>
            </div>
            {worldState.target && (
              <div className="world-state-item">
                <span>Target:</span> <span className="target-value">{worldState.target}</span>
              </div>
            )}
            <div className="world-state-item">
              <span>Stuck:</span> <span>{formatBoolean(worldState.stuck)}</span>
            </div>
            <div className="world-state-item">
              <span>Stuck Confidence:</span> <span>{worldState.stuck_confidence.toFixed(2)}</span>
            </div>
            <div className="world-state-item">
              <span>We Are Blue:</span> <span>{formatBoolean(worldState.we_are_blue)}</span>
            </div>
            <div className="world-state-item">
              <span>Kickoff Us:</span> <span>{formatBoolean(worldState.kickoff_us)}</span>
            </div>
          </div>
        </div>
      ) : (
        <div className="world-state-empty">
          No world state available for {activeTab}
        </div>
      )}
    </div>
  );
};

