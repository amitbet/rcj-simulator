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
import { WorldView } from './components/WorldView';

// Strategy file paths - using dynamic imports
// These will be updated by Vite HMR automatically
import attackerStrategyRaw from './strategies/attacker_simple.js?raw';
import defenderStrategyRaw from './strategies/defender.js?raw';

// Function to get current strategy content (will reflect HMR updates)
// Both teams use the same strategy files (attacker.js and defender.js)
// The strategies determine which team they're on using the we_are_blue variable
const getCurrentStrategyContent = () => ({
  blue_attacker: attackerStrategyRaw,
  blue_defender: defenderStrategyRaw,
  yellow_attacker: attackerStrategyRaw,
  yellow_defender: defenderStrategyRaw,
});

const App: React.FC = () => {
  // State
  const [showModeSelector, setShowModeSelector] = useState(true);
  const [gameMode, setGameMode] = useState<GameMode>(GameMode.TwoTeam);
  const [viewMode, setViewMode] = useState<ViewMode>('2d');
  const [simulationState, setSimulationState] = useState<SimulationState | null>(null);
  const [speed, setSpeed] = useState(1);
  const [isDragging, setIsDragging] = useState(false);
  const [dragTarget, setDragTarget] = useState<{ type: 'ball' | 'robot'; id?: string } | null>(null);

  // Strategies state with hashes for change detection
  const [strategies, setStrategies] = useState<Record<string, { code: string; hash: string; loadTime: number }>>({});
  const [worldStates, setWorldStates] = useState<Map<string, any>>(new Map());
  const [activeTab, setActiveTab] = useState('blue_attacker');

  // Refs
  const simulationRef = useRef<SimulationEngine | null>(null);
  const renderer2DRef = useRef<Renderer2D | null>(null);
  const renderer3DRef = useRef<Renderer3D | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const container3DRef = useRef<HTMLDivElement>(null);
  const animationRef = useRef<number>(0);

  // Simple hash function for strategy code
  const hashString = (str: string): string => {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return hash.toString(36);
  };

  // Load strategy file content and hash (without timestamp)
  const loadStrategyFileContent = (robotId: string): { code: string; hash: string } => {
    const content = getCurrentStrategyContent();
    const code = content[robotId as keyof typeof content];
    if (!code) {
      throw new Error(`Unknown robot ID: ${robotId}`);
    }
    const hash = hashString(code);
    return { code, hash };
  };

  // Load all strategies (initial load from local files) - with timestamps
  const loadAllStrategies = useCallback(() => {
    const loaded: Record<string, { code: string; hash: string; loadTime: number }> = {};
    const baseTime = Date.now();
    
    try {
      // Load each strategy with offsets to ensure unique timestamps (100ms apart)
      const blueAttacker = loadStrategyFileContent('blue_attacker');
      const blueDefender = loadStrategyFileContent('blue_defender');
      const yellowAttacker = loadStrategyFileContent('yellow_attacker');
      const yellowDefender = loadStrategyFileContent('yellow_defender');
      
      loaded.blue_attacker = { ...blueAttacker, loadTime: baseTime };
      loaded.blue_defender = { ...blueDefender, loadTime: baseTime + 100 };
      loaded.yellow_attacker = { ...yellowAttacker, loadTime: baseTime + 200 };
      loaded.yellow_defender = { ...yellowDefender, loadTime: baseTime + 300 };
      
      return loaded;
    } catch (error) {
      console.error('Failed to load strategies:', error);
      return null;
    }
  }, []);

  // Load all strategies without timestamps (for change detection)
  const loadAllStrategiesForCheck = useCallback(() => {
    const loaded: Record<string, { code: string; hash: string }> = {};
    
    try {
      loaded.blue_attacker = loadStrategyFileContent('blue_attacker');
      loaded.blue_defender = loadStrategyFileContent('blue_defender');
      loaded.yellow_attacker = loadStrategyFileContent('yellow_attacker');
      loaded.yellow_defender = loadStrategyFileContent('yellow_defender');
      
      return loaded;
    } catch (error) {
      console.error('Failed to load strategies for check:', error);
      return null;
    }
  }, []);


  // Initial strategy load
  useEffect(() => {
    const initial = loadAllStrategies();
    if (initial) {
      setStrategies(initial);
    }
  }, []);

  // Watch for strategy file changes (checking every 5 seconds)
  useEffect(() => {
    if (Object.keys(strategies).length === 0) return; // Wait for initial load

    let watchInterval: number | null = null;

    const watchStrategies = () => {
      // Load all strategy files (code and hash only, no timestamps)
      const localStrategies = loadAllStrategiesForCheck();
      if (!localStrategies) return;

      // Create a new object, preserving loadTime and hash for unchanged strategies
      const updated: Record<string, { code: string; hash: string; loadTime: number }> = {};
      let hasChanges = false;

      // First, copy all existing strategies with their original loadTime and hash
      // This ensures unchanged strategies keep their old timestamps
      for (const [robotId, strategy] of Object.entries(strategies)) {
        updated[robotId] = { ...strategy }; // Preserve original loadTime and hash
      }

      // Check each strategy file for changes
      for (const [robotId, localStrategy] of Object.entries(localStrategies)) {
        const currentStrategy = strategies[robotId];
        
        // Only update if hash actually changed
        if (currentStrategy && currentStrategy.hash !== localStrategy.hash) {
          console.log(`Strategy changed for ${robotId}: ${currentStrategy.hash} -> ${localStrategy.hash}, reloading...`);
          hasChanges = true;
          
          // Update strategy in simulation
          if (simulationRef.current) {
            simulationRef.current.updateStrategy(robotId, localStrategy.code);
          }
          
          // Update with new load time (only for this specific changed strategy)
          updated[robotId] = {
            code: localStrategy.code,
            hash: localStrategy.hash,
            loadTime: Date.now(),
          };
        }
        // If hash unchanged, keep existing strategy with old timestamp (already copied above)
      }

      if (hasChanges) {
        setStrategies(updated);
      } else {
        console.log('No strategy changes detected');
      }
    };

    // Watch for changes every 5 seconds
    watchInterval = window.setInterval(watchStrategies, 5000);

    return () => {
      if (watchInterval !== null) {
        clearInterval(watchInterval);
      }
    };
  }, [loadAllStrategiesForCheck, strategies]);

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
      blueAttackerStrategy: (mode === GameMode.SingleBotAttacker || mode === GameMode.SingleTeam || mode === GameMode.TwoTeam) ? strategies.blue_attacker?.code : undefined,
      blueDefenderStrategy: (mode === GameMode.SingleBotDefender || mode === GameMode.SingleTeam || mode === GameMode.TwoTeam) ? strategies.blue_defender?.code : undefined,
      yellowAttackerStrategy: mode === GameMode.TwoTeam ? strategies.yellow_attacker?.code : undefined,
      yellowDefenderStrategy: mode === GameMode.TwoTeam ? strategies.yellow_defender?.code : undefined,
    };

    simulation.initialize(config);
    simulation.setOnStateUpdate((state) => {
      setSimulationState(state);
      // Update world states
      const worldStates = simulation.getWorldStates();
      setWorldStates(worldStates);
    });
    simulation.setOnGameEvent((event, data) => {
      console.log('Game event:', event, data);
    });

    simulationRef.current = simulation;
    const initialState = simulation.getSimulationState();
    setSimulationState(initialState);
    setWorldStates(simulation.getWorldStates());
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

  // Tab change handler
  const handleTabChange = (tab: string) => {
    setActiveTab(tab);
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

              <WorldView
                worldStates={worldStates}
                gameMode={gameMode}
                activeTab={activeTab}
                onTabChange={handleTabChange}
                strategies={strategies}
              />
            </>
          )}
        </aside>
      </main>
    </div>
  );
};

export default App;

