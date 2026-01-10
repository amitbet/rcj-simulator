// ============================================================
// RoboCup Jr. Simulator - Core Type Definitions
// ============================================================

// A generic observation from any sensor/vision module
export interface Observation {
  visible: boolean;        // currently detected
  angle_deg: number;       // -180..180, robot-centric (0 = straight ahead)
  distance: number;        // distance in cm
  confidence: number;      // 0..1

  // Optional raw image info (for debugging / distance-from-size mapping)
  cx: number;              // center x in pixels
  cy: number;              // center y in pixels
  w: number;               // bounding box width (px)
  h: number;               // bounding box height (px)
}

// Core world model consumed by strategy
// Keep it independent of motors/PWM. Strategy should only read this.
export interface WorldState {
  // Time
  t_ms: number;            // current time (millis)
  dt_s: number;            // timestep seconds since last update

  // Robot orientation / motion (from IMU + encoders)
  heading_deg: number;     // yaw in degrees (0..360 or -180..180)
  yaw_rate_dps: number;    // deg/sec
  v_est: number;           // estimated speed

  // Vision / targets
  ball: Observation;
  goal_blue: Observation;
  goal_yellow: Observation;

  // Contact / proximity
  bumper_front: boolean;
  bumper_left: boolean;
  bumper_right: boolean;

  // Line sensors (detect white lines on field)
  line_front: boolean;      // white line detected in front
  line_left: boolean;       // white line detected on left
  line_right: boolean;      // white line detected on right
  line_rear: boolean;       // white line detected behind

  // "Am I stuck?" signals
  stuck: boolean;
  stuck_confidence: number;

  // Game-side info
  we_are_blue: boolean;    // which goal is ours
  kickoff_us: boolean;
  
  // Strategy state (optional, set by strategy)
  state?: string;           // current state machine state
  target?: string;          // current target (e.g., "ball", "blue goal", "yellow goal")
}

// Action output from strategy
export interface Action {
  motor1: number;          // -1 to 1 (front-left for omni)
  motor2: number;          // -1 to 1 (front-right)
  motor3: number;          // -1 to 1 (back-right)
  motor4: number;          // -1 to 1 (back-left)
  kick: boolean;           // trigger kick
}

// Game modes
export enum GameMode {
  SingleBotAttacker = 'single_bot_attacker',
  SingleBotDefender = 'single_bot_defender',
  SingleTeam = 'single_team',
  TwoTeam = 'two_team'
}

// Game phases
export enum GamePhase {
  Setup = 'setup',
  Kickoff = 'kickoff',
  Playing = 'playing',
  Paused = 'paused',
  OutOfBounds = 'out_of_bounds',
  Goal = 'goal',
  HalfTime = 'half_time',
  Finished = 'finished'
}

// Team identifiers
export type Team = 'blue' | 'yellow';

// Robot roles
export type RobotRole = 'attacker' | 'defender';

// Game state
export interface GameState {
  mode: GameMode;
  phase: GamePhase;
  score_blue: number;
  score_yellow: number;
  time_elapsed_ms: number;
  half: 1 | 2;
  countdown_ms: number;
  last_touch_team: Team | null;
  kickoff_team: Team;
  paused: boolean;
}

// Robot state in simulation
export interface RobotState {
  id: string;
  team: Team;
  role: RobotRole;
  x: number;               // position in cm
  y: number;
  angle: number;           // heading in radians
  vx: number;              // velocity
  vy: number;
  angularVelocity: number;
  penalized: boolean;      // true if robot is currently penalized for line crossings
  penaltyTimeRemaining_ms: number; // time remaining in penalty (0 if not penalized)
}

// Ball state
export interface BallState {
  x: number;
  y: number;
  vx: number;
  vy: number;
}

// Complete simulation state
export interface SimulationState {
  game: GameState;
  robots: RobotState[];
  ball: BallState;
  timestamp: number;
}

// Neutral spot for ball placement
export interface NeutralSpot {
  id: string;
  x: number;
  y: number;
}

// Strategy function type
export type StrategyFunction = (worldState: WorldState) => Action;

// Event types for the referee system
export type GameEvent = 
  | { type: 'goal'; team: Team }
  | { type: 'out_of_bounds'; side: 'top' | 'bottom' | 'left' | 'right' }
  | { type: 'kickoff'; team: Team }
  | { type: 'lack_of_progress' }
  | { type: 'half_time' }
  | { type: 'game_end' };

// View mode
export type ViewMode = '2d' | '3d';

// Default observation
export function createDefaultObservation(): Observation {
  return {
    visible: false,
    angle_deg: 0,
    distance: 0,
    confidence: 0,
    cx: 0,
    cy: 0,
    w: 0,
    h: 0,
  };
}

// Default world state
export function createDefaultWorldState(): WorldState {
  return {
    t_ms: 0,
    dt_s: 0,
    heading_deg: 0,
    yaw_rate_dps: 0,
    v_est: 0,
    ball: createDefaultObservation(),
    goal_blue: createDefaultObservation(),
    goal_yellow: createDefaultObservation(),
    bumper_front: false,
    bumper_left: false,
    bumper_right: false,
    line_front: false,
    line_left: false,
    line_right: false,
    line_rear: false,
    stuck: false,
    stuck_confidence: 0,
    we_are_blue: true,
    kickoff_us: false,
    state: undefined,
  };
}

// Default action (no movement)
export function createDefaultAction(): Action {
  return {
    motor1: 0,
    motor2: 0,
    motor3: 0,
    motor4: 0,
    kick: false,
  };
}

