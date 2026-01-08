// ============================================================
// RoboCup Jr. Simulator - Simulation Engine
// ============================================================

import { PhysicsEngine } from '../physics/PhysicsEngine';
import { StrategyExecutor } from '../strategy/StrategyExecutor';
import { Referee } from './Referee';
import { ObservationSystem } from './ObservationSystem';
import {
  GameMode,
  GamePhase,
  GameState,
  Team,
  RobotRole,
  SimulationState,
  Action,
  WorldState,
  createDefaultAction,
} from '../types';
import { TIMING, STARTING_POSITIONS, FIELD, ROBOT } from '../types/constants';

export interface SimulationConfig {
  mode: GameMode;
  blueAttackerStrategy?: string;
  blueDefenderStrategy?: string;
  yellowAttackerStrategy?: string;
  yellowDefenderStrategy?: string;
}

export class SimulationEngine {
  private physics: PhysicsEngine;
  private referee: Referee;
  private strategyExecutor: StrategyExecutor;
  private observationSystem: ObservationSystem;
  
  private gameState: GameState;
  private config: SimulationConfig;
  
  private lastUpdateTime: number = 0;
  private animationFrameId: number | null = null;
  private isRunning: boolean = false;
  private speedMultiplier: number = 1;

  // Callbacks
  private onStateUpdate: ((state: SimulationState) => void) | null = null;
  private onGameEvent: ((event: string, data?: any) => void) | null = null;

  constructor() {
    this.physics = new PhysicsEngine();
    this.referee = new Referee();
    this.strategyExecutor = new StrategyExecutor();
    this.observationSystem = new ObservationSystem();
    
    this.config = { mode: GameMode.TwoTeam };
    
    this.gameState = {
      mode: GameMode.TwoTeam,
      phase: GamePhase.Setup,
      score_blue: 0,
      score_yellow: 0,
      time_elapsed_ms: 0,
      half: 1,
      countdown_ms: 0,
      last_touch_team: null,
      kickoff_team: 'blue',
      paused: true,
    };

    this.setupPhysicsCallbacks();
    this.setupRefereeCallbacks();
  }

  // Initialize the simulation
  initialize(config: SimulationConfig): void {
    this.config = config;
    this.gameState.mode = config.mode;
    
    this.physics.initialize();
    this.createRobots();
    this.loadStrategies();
    
    this.resetPositions();
    this.gameState.phase = GamePhase.Kickoff;
    this.gameState.countdown_ms = TIMING.KICKOFF_COUNTDOWN;
    
    // Disable out-of-bounds checking during kickoff countdown
    this.physics.setOutOfBoundsCheckEnabled(false);
  }

  // Create robots based on game mode
  private createRobots(): void {
    const { mode } = this.config;

    // Always create blue team
    if (mode === GameMode.SingleBot) {
      // Single bot - either attacker or defender
      this.physics.createRobot(
        'blue_attacker',
        'blue',
        'attacker',
        STARTING_POSITIONS.blue.attacker.x,
        STARTING_POSITIONS.blue.attacker.y,
        STARTING_POSITIONS.blue.attacker.angle
      );
    } else {
      // Both blue robots
      this.physics.createRobot(
        'blue_attacker',
        'blue',
        'attacker',
        STARTING_POSITIONS.blue.attacker.x,
        STARTING_POSITIONS.blue.attacker.y,
        STARTING_POSITIONS.blue.attacker.angle
      );
      this.physics.createRobot(
        'blue_defender',
        'blue',
        'defender',
        STARTING_POSITIONS.blue.defender.x,
        STARTING_POSITIONS.blue.defender.y,
        STARTING_POSITIONS.blue.defender.angle
      );
    }

    // Create yellow team for TwoTeam mode
    if (mode === GameMode.TwoTeam) {
      this.physics.createRobot(
        'yellow_attacker',
        'yellow',
        'attacker',
        STARTING_POSITIONS.yellow.attacker.x,
        STARTING_POSITIONS.yellow.attacker.y,
        STARTING_POSITIONS.yellow.attacker.angle
      );
      this.physics.createRobot(
        'yellow_defender',
        'yellow',
        'defender',
        STARTING_POSITIONS.yellow.defender.x,
        STARTING_POSITIONS.yellow.defender.y,
        STARTING_POSITIONS.yellow.defender.angle
      );
    }
  }

  // Load strategy code
  private loadStrategies(): void {
    const { blueAttackerStrategy, blueDefenderStrategy, yellowAttackerStrategy, yellowDefenderStrategy } = this.config;

    if (blueAttackerStrategy) {
      this.strategyExecutor.loadStrategy('blue_attacker', blueAttackerStrategy);
    }
    if (blueDefenderStrategy) {
      this.strategyExecutor.loadStrategy('blue_defender', blueDefenderStrategy);
    }
    if (yellowAttackerStrategy) {
      this.strategyExecutor.loadStrategy('yellow_attacker', yellowAttackerStrategy);
    }
    if (yellowDefenderStrategy) {
      this.strategyExecutor.loadStrategy('yellow_defender', yellowDefenderStrategy);
    }
  }

  // Setup physics callbacks
  private setupPhysicsCallbacks(): void {
    this.physics.setOnGoalScored((team: Team) => {
      this.handleGoalScored(team);
    });

    this.physics.setOnOutOfBounds((side) => {
      this.handleOutOfBounds(side);
    });

    this.physics.setOnCollision((a, b) => {
      // Track last touch for determining possession
      if (a === 'ball' || b === 'ball') {
        const other = a === 'ball' ? b : a;
        if (other.startsWith('robot_blue')) {
          this.gameState.last_touch_team = 'blue';
        } else if (other.startsWith('robot_yellow')) {
          this.gameState.last_touch_team = 'yellow';
        }
      }
    });
  }

  // Setup referee callbacks
  private setupRefereeCallbacks(): void {
    this.referee.setOnLackOfProgress(() => {
      this.handleLackOfProgress();
    });
  }

  // Handle goal scored
  private handleGoalScored(scoringTeam: Team): void {
    if (this.gameState.phase !== GamePhase.Playing) return;

    if (scoringTeam === 'blue') {
      this.gameState.score_blue++;
    } else {
      this.gameState.score_yellow++;
    }

    this.gameState.phase = GamePhase.Goal;
    this.gameState.countdown_ms = TIMING.GOAL_CELEBRATION;
    this.gameState.kickoff_team = scoringTeam === 'blue' ? 'yellow' : 'blue';

    this.onGameEvent?.('goal', { team: scoringTeam, score: this.getScore() });
  }

  // Handle ball out of bounds
  private handleOutOfBounds(side: 'top' | 'bottom' | 'left' | 'right'): void {
    if (this.gameState.phase !== GamePhase.Playing) return;

    // Disable out-of-bounds checking while we handle this
    this.physics.setOutOfBoundsCheckEnabled(false);

    this.gameState.phase = GamePhase.OutOfBounds;
    this.gameState.countdown_ms = TIMING.OUT_OF_BOUNDS_COUNTDOWN;

    // Find nearest neutral spot and move ball there immediately
    const neutralSpot = this.referee.findNearestNeutralSpot(side);
    console.log(`[handleOutOfBounds] Moving ball to neutral spot:`, neutralSpot);
    this.physics.setBallPosition(neutralSpot.x, neutralSpot.y);
    
    // Push robots away from the ball (minimum 20cm distance per RCJ rules)
    const MIN_ROBOT_DISTANCE = 20;
    this.physics.pushRobotsAwayFrom(neutralSpot.x, neutralSpot.y, MIN_ROBOT_DISTANCE + ROBOT.RADIUS);
    
    this.onGameEvent?.('out_of_bounds', { side, neutralSpot });
  }

  // Handle lack of progress
  private handleLackOfProgress(): void {
    if (this.gameState.phase !== GamePhase.Playing) return;

    // Move ball to nearest neutral spot
    const ballState = this.physics.getState().ball;
    const neutralSpot = this.referee.findNearestNeutralSpotToPosition(ballState.x, ballState.y);
    this.physics.setBallPosition(neutralSpot.x, neutralSpot.y);

    this.onGameEvent?.('lack_of_progress', { neutralSpot });
  }

  // Reset positions to starting positions
  resetPositions(): void {
    // Reset ball
    this.physics.setBallPosition(STARTING_POSITIONS.ball.x, STARTING_POSITIONS.ball.y);

    // Reset robots
    const robots = this.physics.getRobots();
    for (const [id, robot] of robots) {
      const pos = this.getStartingPosition(robot.team, robot.role);
      this.physics.setRobotPosition(id, pos.x, pos.y, pos.angle);
    }
  }

  // Get starting position for a robot
  private getStartingPosition(team: Team, role: RobotRole): { x: number; y: number; angle: number } {
    return STARTING_POSITIONS[team][role];
  }

  // Main game loop
  private gameLoop = (currentTime: number): void => {
    if (!this.isRunning) return;

    const deltaTime = this.lastUpdateTime ? (currentTime - this.lastUpdateTime) : TIMING.PHYSICS_STEP;
    this.lastUpdateTime = currentTime;

    const scaledDelta = deltaTime * this.speedMultiplier;

    // Update based on game phase
    switch (this.gameState.phase) {
      case GamePhase.Kickoff:
        this.updateKickoff(scaledDelta);
        break;
      case GamePhase.Playing:
        this.updatePlaying(scaledDelta);
        break;
      case GamePhase.OutOfBounds:
        this.updateOutOfBounds(scaledDelta);
        break;
      case GamePhase.Goal:
        this.updateGoal(scaledDelta);
        break;
      case GamePhase.HalfTime:
        this.updateHalfTime(scaledDelta);
        break;
      default:
        break;
    }

    // Notify state update
    this.onStateUpdate?.(this.getSimulationState());

    // Continue loop
    this.animationFrameId = requestAnimationFrame(this.gameLoop);
  };

  // Update during kickoff countdown
  private updateKickoff(deltaMs: number): void {
    this.gameState.countdown_ms -= deltaMs;
    
    if (this.gameState.countdown_ms <= 0) {
      this.gameState.phase = GamePhase.Playing;
      this.gameState.countdown_ms = 0;
      // Enable out-of-bounds checking when play starts
      this.physics.setOutOfBoundsCheckEnabled(true);
      this.onGameEvent?.('kickoff_start', {});
    }
  }

  // Update during active play
  private updatePlaying(deltaMs: number): void {
    // Update game time
    this.gameState.time_elapsed_ms += deltaMs;

    // Check for half time / end
    if (this.gameState.time_elapsed_ms >= TIMING.HALF_DURATION) {
      if (this.gameState.half === 1) {
        this.gameState.phase = GamePhase.HalfTime;
        this.gameState.countdown_ms = TIMING.KICKOFF_COUNTDOWN;
        this.onGameEvent?.('half_time', {});
      } else {
        this.gameState.phase = GamePhase.Finished;
        this.isRunning = false;
        this.onGameEvent?.('game_end', { score: this.getScore() });
      }
      return;
    }

    // Execute strategies and get actions
    const physicsState = this.physics.getState();
    const robots = this.physics.getRobots();

    for (const [id, robot] of robots) {
      // Calculate world state for this robot
      const worldState = this.observationSystem.calculateWorldState(
        id,
        physicsState,
        this.gameState.time_elapsed_ms,
        deltaMs / 1000,
        robot.team === 'blue'
      );

      // Execute strategy
      const action = this.strategyExecutor.executeStrategy(id, worldState);
      
      // Apply action to physics
      this.physics.applyAction(id, action);
    }

    // Step physics
    this.physics.step(deltaMs);

    // Update referee (check for lack of progress, etc.)
    this.referee.update(deltaMs, physicsState.ball);
  }

  // Update during out of bounds
  private updateOutOfBounds(deltaMs: number): void {
    this.gameState.countdown_ms -= deltaMs;

    if (this.gameState.countdown_ms <= 0) {
      // Ball was already repositioned in handleOutOfBounds
      // Re-enable out-of-bounds checking and reset timer before resuming play
      this.physics.resetOutOfBoundsTimer();
      this.physics.setOutOfBoundsCheckEnabled(true);
      
      // Resume play
      this.gameState.phase = GamePhase.Playing;
      this.gameState.countdown_ms = 0;
      
      this.onGameEvent?.('play_resumed', {});
    }
  }

  // Update during goal celebration
  private updateGoal(deltaMs: number): void {
    this.gameState.countdown_ms -= deltaMs;

    if (this.gameState.countdown_ms <= 0) {
      // Reset to kickoff
      this.resetPositions();
      this.gameState.phase = GamePhase.Kickoff;
      this.gameState.countdown_ms = TIMING.KICKOFF_COUNTDOWN;
    }
  }

  // Update during half time
  private updateHalfTime(deltaMs: number): void {
    this.gameState.countdown_ms -= deltaMs;

    if (this.gameState.countdown_ms <= 0) {
      // Start second half
      this.gameState.half = 2;
      this.gameState.time_elapsed_ms = 0;
      this.gameState.kickoff_team = this.gameState.kickoff_team === 'blue' ? 'yellow' : 'blue';
      this.resetPositions();
      this.gameState.phase = GamePhase.Kickoff;
      this.gameState.countdown_ms = TIMING.KICKOFF_COUNTDOWN;
    }
  }

  // Start the simulation
  start(): void {
    if (this.isRunning) return;
    
    this.isRunning = true;
    this.gameState.paused = false;
    this.lastUpdateTime = 0;
    this.animationFrameId = requestAnimationFrame(this.gameLoop);
  }

  // Pause the simulation
  pause(): void {
    this.isRunning = false;
    this.gameState.paused = true;
    
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
  }

  // Toggle pause
  togglePause(): void {
    if (this.isRunning) {
      this.pause();
    } else {
      this.start();
    }
  }

  // Reset the simulation
  reset(): void {
    this.pause();
    this.physics.reset();
    
    this.gameState = {
      mode: this.config.mode,
      phase: GamePhase.Setup,
      score_blue: 0,
      score_yellow: 0,
      time_elapsed_ms: 0,
      half: 1,
      countdown_ms: 0,
      last_touch_team: null,
      kickoff_team: 'blue',
      paused: true,
    };

    this.createRobots();
    this.resetPositions();
    this.gameState.phase = GamePhase.Kickoff;
    this.gameState.countdown_ms = TIMING.KICKOFF_COUNTDOWN;

    this.onStateUpdate?.(this.getSimulationState());
  }

  // Set simulation speed
  setSpeed(multiplier: number): void {
    this.speedMultiplier = Math.max(0.1, Math.min(4, multiplier));
  }

  // Get current simulation state
  getSimulationState(): SimulationState {
    const physicsState = this.physics.getState();
    const robots = this.physics.getRobots();

    const robotStates = Array.from(robots.entries()).map(([id, robot]) => {
      const state = physicsState.robots.get(id);
      return {
        id,
        team: robot.team,
        role: robot.role,
        x: state?.x ?? 0,
        y: state?.y ?? 0,
        angle: state?.angle ?? 0,
        vx: state?.vx ?? 0,
        vy: state?.vy ?? 0,
        angularVelocity: 0,
      };
    });

    return {
      game: { ...this.gameState },
      robots: robotStates,
      ball: { ...physicsState.ball },
      timestamp: Date.now(),
    };
  }

  // Get score
  getScore(): { blue: number; yellow: number } {
    return {
      blue: this.gameState.score_blue,
      yellow: this.gameState.score_yellow,
    };
  }

  // Set ball position (for drag and drop)
  setBallPosition(x: number, y: number): void {
    this.physics.setBallPosition(x, y);
    this.onStateUpdate?.(this.getSimulationState());
  }

  // Set robot position (for drag and drop)
  setRobotPosition(id: string, x: number, y: number, angle?: number): void {
    this.physics.setRobotPosition(id, x, y, angle);
    this.onStateUpdate?.(this.getSimulationState());
  }

  // Update strategy code for a robot
  updateStrategy(robotId: string, code: string): void {
    this.strategyExecutor.loadStrategy(robotId, code);
  }

  // Set callbacks
  setOnStateUpdate(callback: (state: SimulationState) => void): void {
    this.onStateUpdate = callback;
  }

  setOnGameEvent(callback: (event: string, data?: any) => void): void {
    this.onGameEvent = callback;
  }

  // Get physics engine (for rendering)
  getPhysicsEngine(): PhysicsEngine {
    return this.physics;
  }

  // Dispose
  dispose(): void {
    this.pause();
    this.physics.dispose();
  }
}

