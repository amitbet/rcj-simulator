// ============================================================
// RoboCup Jr. Simulator - Main App Component
// ============================================================

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { SimulationEngine, SimulationConfig } from './simulator/SimulationEngine';
import { Renderer2D } from './renderer/Renderer2D';
import { Renderer3D } from './renderer/Renderer3D';
import { GameMode, SimulationState, ViewMode, GamePhase } from './types';
import { GameModeSelector } from './components/GameModeSelector';
import { ControlPanel } from './components/ControlPanel';
import { ScoreBoard } from './components/ScoreBoard';
import { StrategyEditor } from './components/StrategyEditor';

// Default strategies
import attackerStrategy from './strategies/attacker.js?raw';
import defenderStrategy from './strategies/defender.js?raw';
import opponent1Strategy from './strategies/opponent1.js?raw';
import opponent2Strategy from './strategies/opponent2.js?raw';

const App: React.FC = () => {
  // State
  const [showModeSelector, setShowModeSelector] = useState(true);
  const [gameMode, setGameMode] = useState<GameMode>(GameMode.TwoTeam);
  const [viewMode, setViewMode] = useState<ViewMode>('2d');
  const [simulationState, setSimulationState] = useState<SimulationState | null>(null);
  const [speed, setSpeed] = useState(1);
  const [isDragging, setIsDragging] = useState(false);
  const [dragTarget, setDragTarget] = useState<{ type: 'ball' | 'robot'; id?: string } | null>(null);

  // Strategies state
  const [strategies, setStrategies] = useState({
    blue_attacker: attackerStrategy,
    blue_defender: defenderStrategy,
    yellow_attacker: opponent1Strategy,
    yellow_defender: opponent2Strategy,
  });
  const [activeEditorTab, setActiveEditorTab] = useState('blue_attacker');

  // Refs
  const simulationRef = useRef<SimulationEngine | null>(null);
  const renderer2DRef = useRef<Renderer2D | null>(null);
  const renderer3DRef = useRef<Renderer3D | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const container3DRef = useRef<HTMLDivElement>(null);
  const animationRef = useRef<number>(0);

  // Initialize simulation
  const initializeSimulation = useCallback((mode: GameMode) => {
    // Cleanup previous
    if (simulationRef.current) {
      simulationRef.current.dispose();
    }

    // Create new simulation
    const simulation = new SimulationEngine();
    
    const config: SimulationConfig = {
      mode,
      blueAttackerStrategy: (mode === GameMode.SingleBotAttacker || mode === GameMode.SingleTeam || mode === GameMode.TwoTeam) ? strategies.blue_attacker : undefined,
      blueDefenderStrategy: (mode === GameMode.SingleBotDefender || mode === GameMode.SingleTeam || mode === GameMode.TwoTeam) ? strategies.blue_defender : undefined,
      yellowAttackerStrategy: mode === GameMode.TwoTeam ? strategies.yellow_attacker : undefined,
      yellowDefenderStrategy: mode === GameMode.TwoTeam ? strategies.yellow_defender : undefined,
    };

    simulation.initialize(config);
    simulation.setOnStateUpdate((state) => {
      setSimulationState(state);
    });
    simulation.setOnGameEvent((event, data) => {
      console.log('Game event:', event, data);
    });

    simulationRef.current = simulation;
    setSimulationState(simulation.getSimulationState());
  }, [strategies]);

  // Handle mode selection - auto-start the simulation
  const handleModeSelect = (mode: GameMode) => {
    setGameMode(mode);
    initializeSimulation(mode);
    setShowModeSelector(false);
    
    // Auto-start the simulation after a short delay to allow renderers to initialize
    setTimeout(() => {
      if (simulationRef.current) {
        simulationRef.current.start();
      }
    }, 100);
  };

  // Initialize renderers
  useEffect(() => {
    if (showModeSelector) return;

    // 2D Renderer
    if (canvasRef.current && !renderer2DRef.current) {
      renderer2DRef.current = new Renderer2D(canvasRef.current);
    }

    // 3D Renderer
    if (container3DRef.current && !renderer3DRef.current) {
      renderer3DRef.current = new Renderer3D(container3DRef.current);
    }

    // Cleanup
    return () => {
      if (renderer2DRef.current) {
        renderer2DRef.current.dispose();
        renderer2DRef.current = null;
      }
      if (renderer3DRef.current) {
        renderer3DRef.current.dispose();
        renderer3DRef.current = null;
      }
    };
  }, [showModeSelector]);

  // Render loop
  useEffect(() => {
    if (showModeSelector || !simulationState) return;

    const render = () => {
      if (simulationState) {
        if (viewMode === '2d' && renderer2DRef.current) {
          renderer2DRef.current.render(simulationState);
        } else if (viewMode === '3d' && renderer3DRef.current) {
          renderer3DRef.current.render(simulationState);
        }
      }
      animationRef.current = requestAnimationFrame(render);
    };

    animationRef.current = requestAnimationFrame(render);

    return () => {
      cancelAnimationFrame(animationRef.current);
    };
  }, [showModeSelector, simulationState, viewMode]);

  // Handle resize
  useEffect(() => {
    const handleResize = () => {
      if (renderer2DRef.current) {
        renderer2DRef.current.resize();
      }
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Control handlers
  const handlePlayPause = () => {
    if (simulationRef.current) {
      simulationRef.current.togglePause();
    }
  };

  const handleReset = () => {
    if (simulationRef.current) {
      simulationRef.current.reset();
    }
  };

  const handleResetMatch = () => {
    if (simulationRef.current) {
      simulationRef.current.resetMatch();
    }
  };

  const handleSpeedChange = (newSpeed: number) => {
    setSpeed(newSpeed);
    if (simulationRef.current) {
      simulationRef.current.setSpeed(newSpeed);
    }
  };

  // Strategy update handler
  const handleStrategyChange = (robotId: string, code: string) => {
    setStrategies((prev) => ({ ...prev, [robotId]: code }));
    if (simulationRef.current) {
      simulationRef.current.updateStrategy(robotId, code);
    }
  };

  // Drag and drop handlers
  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!simulationState || !renderer2DRef.current) return;
    if (!simulationState.game.paused) return;

    const rect = canvasRef.current!.getBoundingClientRect();
    const canvasX = e.clientX - rect.left;
    const canvasY = e.clientY - rect.top;

    const target = renderer2DRef.current.getObjectAt(canvasX, canvasY, simulationState);
    if (target) {
      setIsDragging(true);
      setDragTarget(target);
    }
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDragging || !dragTarget || !renderer2DRef.current || !simulationRef.current) return;

    const rect = canvasRef.current!.getBoundingClientRect();
    const canvasX = e.clientX - rect.left;
    const canvasY = e.clientY - rect.top;

    const worldPos = renderer2DRef.current.toWorld(canvasX, canvasY);

    if (dragTarget.type === 'ball') {
      simulationRef.current.setBallPosition(worldPos.x, worldPos.y);
    } else if (dragTarget.type === 'robot' && dragTarget.id) {
      simulationRef.current.setRobotPosition(dragTarget.id, worldPos.x, worldPos.y);
    }
  };

  const handleMouseUp = () => {
    setIsDragging(false);
    setDragTarget(null);
  };

  // Show mode selector
  if (showModeSelector) {
    return <GameModeSelector onSelect={handleModeSelect} />;
  }

  const isPaused = simulationState?.game.paused ?? true;
  const showDragHint = isPaused && viewMode === '2d';

  return (
    <div className="app">
      <header className="app-header">
        <h1 className="app-title">RoboCup Jr. Simulator</h1>
        <div className="view-toggle">
          <button
            className={`view-toggle-btn ${viewMode === '2d' ? 'active' : ''}`}
            onClick={() => setViewMode('2d')}
          >
            2D View
          </button>
          <button
            className={`view-toggle-btn ${viewMode === '3d' ? 'active' : ''}`}
            onClick={() => {
              setViewMode('3d');
              // Resize 3D renderer after it becomes visible
              setTimeout(() => {
                if (renderer3DRef.current) {
                  renderer3DRef.current.resize();
                }
              }, 50);
            }}
          >
            3D View
          </button>
        </div>
      </header>

      <main className="app-main">
        <div className="simulator-container">
          <div className="view-container">
            {/* 2D Canvas */}
            <canvas
              ref={canvasRef}
              style={{ display: viewMode === '2d' ? 'block' : 'none' }}
              onMouseDown={handleMouseDown}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
              onMouseLeave={handleMouseUp}
            />
            
            {/* 3D Container */}
            <div
              ref={container3DRef}
              style={{
                display: viewMode === '3d' ? 'block' : 'none',
                width: '100%',
                height: '100%',
              }}
            />

            {/* Drag hint */}
            {showDragHint && (
              <div className="drag-hint visible">
                ⬤ Click and drag to move ball or robots
              </div>
            )}

            {/* Game phase overlay (Kickoff, Out of Bounds, Goal) */}
            {simulationState && (simulationState.game.phase === GamePhase.Kickoff || 
              simulationState.game.phase === GamePhase.OutOfBounds || 
              simulationState.game.phase === GamePhase.Goal) && (
              <div className="countdown-overlay">
                <div className="phase-message">
                  {simulationState.game.phase === GamePhase.Kickoff && 'KICKOFF'}
                  {simulationState.game.phase === GamePhase.OutOfBounds && 'OUT OF BOUNDS'}
                  {simulationState.game.phase === GamePhase.Goal && 'GOAL!'}
                </div>
                {simulationState.game.countdown_ms > 0 && (
                  <div className="countdown-number">
                    {Math.ceil(simulationState.game.countdown_ms / 1000)}
                  </div>
                )}
              </div>
            )}

            {/* Robot penalty overlays */}
            {simulationState && simulationState.robots
              .filter(robot => robot.penalized)
              .map((robot, index) => (
                <div key={robot.id} className="penalty-overlay" style={{
                  top: `${30 + index * 15}%`,
                  left: '50%',
                  transform: 'translate(-50%, -50%)',
                }}>
                  <div className="penalty-message">
                    {robot.team.toUpperCase()} {robot.role.toUpperCase()} PENALTY
                  </div>
                  <div className="penalty-time">
                    {Math.ceil(robot.penaltyTimeRemaining_ms / 1000)}s
                  </div>
                </div>
              ))}
          </div>
        </div>

        <aside className="side-panel">
          {simulationState && (
            <>
              <ScoreBoard
                scoreBlue={simulationState.game.score_blue}
                scoreYellow={simulationState.game.score_yellow}
                timeMs={simulationState.game.time_elapsed_ms}
                half={simulationState.game.half}
                phase={simulationState.game.phase}
              />

              <ControlPanel
                isPaused={isPaused}
                speed={speed}
                onPlayPause={handlePlayPause}
                onReset={handleReset}
                onResetMatch={handleResetMatch}
                onSpeedChange={handleSpeedChange}
                onNewGame={() => setShowModeSelector(true)}
              />

              <StrategyEditor
                strategies={strategies}
                activeTab={activeEditorTab}
                onTabChange={setActiveEditorTab}
                onStrategyChange={handleStrategyChange}
                gameMode={gameMode}
              />
            </>
          )}
        </aside>
      </main>
    </div>
  );
};

export default App;

