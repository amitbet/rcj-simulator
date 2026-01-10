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
import { TIMING, STARTING_POSITIONS, FIELD, ROBOT, GOAL } from '../types/constants';

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

  // Line crossing penalty tracking
  private consecutiveLineCrossings: Map<string, number> = new Map(); // robotId -> count
  private penaltyEndTimes: Map<string, number> = new Map(); // robotId -> end time (ms)
  private lastLineCrossingTime: Map<string, number> = new Map(); // robotId -> last crossing time
  private penaltyRobotStates: Map<string, { team: Team; role: RobotRole; x: number; y: number; angle: number }> = new Map(); // robotId -> saved state
  private readonly LINE_CROSSING_THRESHOLD = 3; // Penalty after 3 consecutive crossings
  private readonly PENALTY_DURATION_MS = 5000; // 5 seconds penalty

  // Ball unreachable detection
  private ballLastPosition: { x: number; y: number } | null = null;
  private ballStuckTime: number = 0;
  private readonly BALL_STUCK_THRESHOLD_MS = 10000; // 10 seconds without significant movement
  private readonly BALL_MOVEMENT_THRESHOLD = 5; // cm - ball must move at least this much

  // Robot strategy states (for display)
  private robotStates: Map<string, string> = new Map(); // robotId -> current state
  private robotTargets: Map<string, string> = new Map(); // robotId -> current target

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
    
    // Reset ball tracking
    this.ballStuckTime = 0;
    this.ballLastPosition = null;
    
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
    if (mode === GameMode.SingleBotAttacker) {
      // Single bot attacker
      this.physics.createRobot(
        'blue_attacker',
        'blue',
        'attacker',
        STARTING_POSITIONS.blue.attacker.x,
        STARTING_POSITIONS.blue.attacker.y,
        STARTING_POSITIONS.blue.attacker.angle
      );
    } else if (mode === GameMode.SingleBotDefender) {
      // Single bot defender
      this.physics.createRobot(
        'blue_defender',
        'blue',
        'defender',
        STARTING_POSITIONS.blue.defender.x,
        STARTING_POSITIONS.blue.defender.y,
        STARTING_POSITIONS.blue.defender.angle
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

    // Disabled: Robots should move freely - only their strategy prevents crossing lines
    // this.physics.setOnRobotOutOfBounds((robotId, goalArea) => {
    //   this.handleRobotOutOfBounds(robotId, goalArea);
    // });

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

  // Handle robot out of bounds (in goal area)
  private handleRobotOutOfBounds(robotId: string, goalArea: 'blue' | 'yellow'): void {
    // Immediately move robot outside goal area
    this.physics.moveRobotOutsideGoalArea(robotId, goalArea);
    
    // Reset state machines when robots are artificially moved
    this.resetStrategyStates();
    
    // Log for debugging
    console.log(`[handleRobotOutOfBounds] Robot ${robotId} moved outside ${goalArea} goal area`);
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
    
    // Reset state machines when robots are artificially moved
    this.resetStrategyStates();
    
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
    
    // Reset state machines when robots are artificially moved
    this.resetStrategyStates();
  }
  
  // Reset strategy state machines (called when robots are artificially moved)
  private resetStrategyStates(): void {
    // Clear robot strategy states (for display)
    this.robotStates.clear();
    this.robotTargets.clear();
    
    // Reload strategies to reset their state machines (like power-on reset)
    this.loadStrategies();
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
    // Countdowns use real time (unscaled) so they're not affected by speed multiplier
    const unscaledDelta = deltaTime;

    // Update based on game phase
    switch (this.gameState.phase) {
      case GamePhase.Kickoff:
        this.updateKickoff(unscaledDelta); // Countdown uses real time
        break;
      case GamePhase.Playing:
        this.updatePlaying(scaledDelta, unscaledDelta); // Physics scaled, countdowns unscaled
        break;
      case GamePhase.OutOfBounds:
        this.updateOutOfBounds(unscaledDelta); // Countdown uses real time
        break;
      case GamePhase.Goal:
        this.updateGoal(unscaledDelta); // Countdown uses real time
        break;
      case GamePhase.HalfTime:
        this.updateHalfTime(unscaledDelta); // Countdown uses real time
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
      // Reset ball tracking when play starts
      this.ballStuckTime = 0;
      this.ballLastPosition = null;
      this.onGameEvent?.('kickoff_start', {});
    }
  }

  // Update during active play
  // deltaMs: scaled delta for physics (affected by speed multiplier)
  // unscaledDeltaMs: real time delta for countdowns and timers (not affected by speed multiplier)
  private updatePlaying(deltaMs: number, unscaledDeltaMs: number): void {
    // Update game time (use scaled delta so game time progresses faster at higher speeds)
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

    // Update penalties (check if any penalties have expired)
    // Penalties use real time, not scaled time
    this.updatePenalties(unscaledDeltaMs);

    // Execute strategies and get actions
    const physicsState = this.physics.getState();
    const robots = this.physics.getRobots();

    // Process all active robots (penalized robots are removed from physics, so they won't be here)
    for (const [id, robot] of robots) {
      // Calculate world state for this robot
      const worldState = this.observationSystem.calculateWorldState(
        id,
        physicsState,
        this.gameState.time_elapsed_ms,
        deltaMs / 1000,
        robot.team === 'blue'
      );

      // Line crossing penalties disabled - robots can move freely
      // The checkLineCrossings call is disabled to allow free movement
      // const robotState = physicsState.robots.get(id);
      // if (robotState) {
      //   this.checkLineCrossings(id, robotState.x, robotState.y);
      // }

      // Execute strategy
      const { action, state, target } = this.strategyExecutor.executeStrategy(id, worldState);
      
      // Store state and target for display
      if (state) {
        this.robotStates.set(id, state);
        worldState.state = state;
      }
      if (target) {
        this.robotTargets.set(id, target);
        worldState.target = target;
      }
      
      // Apply action to physics
      this.physics.applyAction(id, action);
    }

    // Step physics (use scaled delta for faster physics at higher speeds)
    this.physics.step(deltaMs);

    // Update referee (check for lack of progress, etc.)
    // Use unscaled time so lack of progress detection isn't affected by speed multiplier
    this.referee.update(unscaledDeltaMs, physicsState.ball);

    // Check for ball unreachable/stuck situation
    // Use unscaled time so ball stuck detection isn't affected by speed multiplier
    this.checkBallUnreachable(unscaledDeltaMs, physicsState.ball);
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

    // Push state immediately so UI updates pause button right away
    this.onStateUpdate?.(this.getSimulationState());
  }

  // Toggle pause
  togglePause(): void {
    if (this.isRunning) {
      this.pause();
    } else {
      this.start();

      // Push state immediately so UI updates play button without waiting a frame
      this.onStateUpdate?.(this.getSimulationState());
    }
  }

  // Reset the simulation
  reset(): void {
    this.pause();
    this.physics.reset();
    
    // Reset penalty tracking
    this.consecutiveLineCrossings.clear();
    this.penaltyEndTimes.clear();
    this.lastLineCrossingTime.clear();
    this.penaltyRobotStates.clear();
    
    // Reset ball tracking
    this.ballStuckTime = 0;
    this.ballLastPosition = null;
    
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
    // Allow speeds from 0.05x (very slow) to 4x (fast)
    this.speedMultiplier = Math.max(0.05, Math.min(4, multiplier));
  }

  // Check for line crossings and apply penalties (only when robot CENTER crosses a line)
  // DISABLED: Robots can now move freely without penalties
  private checkLineCrossings(robotId: string, robotX: number, robotY: number): void {
    // Line crossing penalties disabled - robots can move freely across lines
    // This method is kept for potential future use but does nothing
    return;
  }

  // Apply penalty to a robot - removes it from play
  private applyPenalty(robotId: string): void {
    const endTime = this.gameState.time_elapsed_ms + this.PENALTY_DURATION_MS;
    this.penaltyEndTimes.set(robotId, endTime);
    this.consecutiveLineCrossings.set(robotId, 0); // Reset counter
    
    // Save robot team and role (position will be restored to starting position)
    const robots = this.physics.getRobots();
    const robot = robots.get(robotId);
    if (robot) {
      // Save only team and role - position will be starting position when restored
      this.penaltyRobotStates.set(robotId, {
        team: robot.team,
        role: robot.role,
        x: 0, // Not used - will use starting position
        y: 0, // Not used - will use starting position
        angle: 0, // Not used - will use starting position
      });
      
      // Remove robot from physics world (game continues without it)
      this.physics.removeRobot(robotId);
    }
    
    // Log penalty
    console.log(`[Penalty] Robot ${robotId} removed from play for ${this.PENALTY_DURATION_MS / 1000}s for repeated line crossings`);
    
    this.onGameEvent?.('robot_penalty', { robotId, duration: this.PENALTY_DURATION_MS });
  }

  // Update penalties (check if any have expired and restore robots)
  // DISABLED: Line crossing penalties are disabled - robots can move freely
  private updatePenalties(deltaMs: number): void {
    // Line crossing penalties disabled - restore any penalized robots immediately
    const robots = this.physics.getRobots();
    
    // Restore all penalized robots immediately
    for (const [robotId, savedState] of this.penaltyRobotStates.entries()) {
      // Check if robot exists in physics
      if (!robots.has(robotId)) {
        // Restore at starting position
        const startingPos = this.getStartingPosition(savedState.team, savedState.role);
        this.physics.createRobot(
          robotId,
          savedState.team,
          savedState.role,
          startingPos.x,
          startingPos.y,
          startingPos.angle
        );
        console.log(`[Penalty] Robot ${robotId} restored to play (penalties disabled)`);
      }
      
      this.penaltyRobotStates.delete(robotId);
      this.penaltyEndTimes.delete(robotId);
      this.onGameEvent?.('robot_penalty_expired', { robotId });
    }
    
    // Clear all penalty tracking
    this.consecutiveLineCrossings.clear();
  }

  // Check if a robot is currently penalized
  private isPenalized(robotId: string): boolean {
    return this.penaltyEndTimes.has(robotId);
  }

  // Get penalty time remaining for a robot
  private getPenaltyTimeRemaining(robotId: string): number {
    const endTime = this.penaltyEndTimes.get(robotId);
    if (!endTime) return 0;
    const remaining = endTime - this.gameState.time_elapsed_ms;
    return Math.max(0, remaining);
  }

  // Check if ball is unreachable or stuck
  private checkBallUnreachable(deltaMs: number, ballState: { x: number; y: number; vx: number; vy: number }): void {
    const ballSpeed = Math.sqrt(ballState.vx * ballState.vx + ballState.vy * ballState.vy);
    
    // Check if ball has moved significantly
    if (this.ballLastPosition) {
      const dx = ballState.x - this.ballLastPosition.x;
      const dy = ballState.y - this.ballLastPosition.y;
      const distance = Math.sqrt(dx * dx + dy * dy);
      
      if (distance < this.BALL_MOVEMENT_THRESHOLD && ballSpeed < 1) {
        // Ball hasn't moved much and is slow/stopped
        this.ballStuckTime += deltaMs;
      } else {
        // Ball is moving - reset stuck timer
        this.ballStuckTime = 0;
      }
    }
    
    // Update last position
    this.ballLastPosition = { x: ballState.x, y: ballState.y };
    
    // Check if ball is stuck for too long
    if (this.ballStuckTime >= this.BALL_STUCK_THRESHOLD_MS) {
      // Check if ball is in an unreachable area (corners, behind goals, etc.)
      const halfW = FIELD.WIDTH / 2;
      const halfH = FIELD.HEIGHT / 2;
      const outerW = FIELD.WIDTH / 2 + FIELD.OUTER_WIDTH;
      const outerH = FIELD.HEIGHT / 2 + FIELD.OUTER_WIDTH;
      
      // Check if ball is in outer area (beyond field lines) or in corners
      const inOuterArea = Math.abs(ballState.x) > halfW || Math.abs(ballState.y) > halfH;
      const inCorner = (Math.abs(ballState.x) > halfW - 20 && Math.abs(ballState.y) > halfH - 20) ||
                       (Math.abs(ballState.x) > outerW - 10) || (Math.abs(ballState.y) > outerH - 10);
      
      if (inOuterArea || inCorner) {
        // Ball is stuck in unreachable area - trigger reset
        console.log(`[Ball Unreachable] Ball stuck at (${ballState.x.toFixed(1)}, ${ballState.y.toFixed(1)}) for ${(this.ballStuckTime / 1000).toFixed(1)}s`);
        this.resetMatch();
        this.ballStuckTime = 0;
        this.ballLastPosition = null;
      }
    }
  }

  // Reset match positions (keeps score and game state, just resets positions)
  resetMatch(): void {
    // Restore any penalized robots at starting positions before resetting positions
    for (const [robotId, savedState] of this.penaltyRobotStates.entries()) {
      const startingPos = this.getStartingPosition(savedState.team, savedState.role);
      this.physics.createRobot(
        robotId,
        savedState.team,
        savedState.role,
        startingPos.x,
        startingPos.y,
        startingPos.angle
      );
    }
    
    // Reset positions to starting positions
    this.resetPositions();
    
    // Clear penalties
    this.consecutiveLineCrossings.clear();
    this.penaltyEndTimes.clear();
    this.lastLineCrossingTime.clear();
    this.penaltyRobotStates.clear();
    
    // Reset ball tracking
    this.ballStuckTime = 0;
    this.ballLastPosition = null;
    
    // Reset state machines when robots are artificially moved
    this.resetStrategyStates();
    
    // If paused, resume to kickoff
    if (this.gameState.phase === GamePhase.Playing || this.gameState.phase === GamePhase.Paused) {
      this.gameState.phase = GamePhase.Kickoff;
      this.gameState.countdown_ms = TIMING.KICKOFF_COUNTDOWN;
      this.physics.setOutOfBoundsCheckEnabled(false);
    }
    
    this.onGameEvent?.('match_reset', {});
    this.onStateUpdate?.(this.getSimulationState());
  }

  // Get current simulation state
  getSimulationState(): SimulationState {
    const physicsState = this.physics.getState();
    const robots = this.physics.getRobots();

    // Get active robots (in physics)
    const activeRobotStates = Array.from(robots.entries()).map(([id, robot]) => {
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
        penalized: false,
        penaltyTimeRemaining_ms: 0,
      };
    });

    // Get penalized robots (removed from physics but still tracked)
    const penalizedRobotStates = Array.from(this.penaltyRobotStates.entries()).map(([id, savedState]) => {
      const penaltyTimeRemaining = this.getPenaltyTimeRemaining(id);
      const startingPos = this.getStartingPosition(savedState.team, savedState.role);
      
      return {
        id,
        team: savedState.team,
        role: savedState.role,
        x: startingPos.x, // Show starting position (robot will return here)
        y: startingPos.y,
        angle: startingPos.angle,
        vx: 0,
        vy: 0,
        angularVelocity: 0,
        penalized: true,
        penaltyTimeRemaining_ms: penaltyTimeRemaining,
      };
    });

    // Combine active and penalized robots
    const allRobotStates = [...activeRobotStates, ...penalizedRobotStates];

    return {
      game: { ...this.gameState },
      robots: allRobotStates,
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
    
    // Reset state machines when robots are artificially moved
    this.resetStrategyStates();
    
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

  // Get world states for all active robots
  getWorldStates(): Map<string, WorldState> {
    const worldStates = new Map<string, WorldState>();
    const physicsState = this.physics.getState();
    const robots = this.physics.getRobots();

    for (const [id, robot] of robots) {
      const worldState = this.observationSystem.calculateWorldState(
        id,
        physicsState,
        this.gameState.time_elapsed_ms,
        0.016, // Approximate delta for display
        robot.team === 'blue'
      );
      
      // Include stored robot state and target if available
      const storedState = this.robotStates.get(id);
      if (storedState) {
        worldState.state = storedState;
      }
      const storedTarget = this.robotTargets.get(id);
      if (storedTarget) {
        worldState.target = storedTarget;
      }
      
      worldStates.set(id, worldState);
    }

    return worldStates;
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

