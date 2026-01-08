// ============================================================
// RoboCup Jr. Simulator - Field and Game Constants
// Based on RoboCup Junior Soccer Open 2025 Specifications
// ============================================================

// Field dimensions (in cm)
// Soccer Open field: typically 182cm x 243cm (6ft x 8ft)
// Goals are on the shorter sides (WIDTH), field is longer (HEIGHT = goal-to-goal)
export const FIELD = {
  // Playing field dimensions (the green area with lines)
  WIDTH: 182,              // 182 cm (6 ft) - side to side
  HEIGHT: 243,             // 243 cm (8 ft) - goal to goal
  
  // Outer area / border (area beyond field lines where robots can roam)
  // Walls are at the outer edge of this area
  OUTER_WIDTH: 30,         // 30 cm outer area on each side
  
  // Total dimensions including outer area (where walls are)
  TOTAL_WIDTH: 242,        // 182 + 2*30
  TOTAL_HEIGHT: 303,       // 243 + 2*30
  
  // Wall height
  WALL_HEIGHT: 14,         // 14 cm minimum recommended
  
  // Corner cuts (to help ball retrieval)
  CORNER_CUT: 14,          // 14 cm diagonal corner cuts
  
  // Center circle
  CENTER_CIRCLE_RADIUS: 30, // 30 cm radius (60 cm diameter)
  
  // Penalty area (optional, not always used in Open)
  PENALTY_AREA_WIDTH: 90,  // 90 cm
  PENALTY_AREA_DEPTH: 30,  // 30 cm from goal line
  
  // Line width
  LINE_WIDTH: 2,           // 2 cm white lines
};

// Goal dimensions (in cm) - Based on user specifications for Open league
// Goals are on the short sides of the field (FIELD.WIDTH side)
export const GOAL = {
  WIDTH: 70,               // 70 cm (700 mm) internal width
  HEIGHT: 20,              // 20 cm (200 mm) crossbar height
  DEPTH: 18,               // 18 cm (180 mm) internal depth
  WALL_THICKNESS: 2,       // 2 cm goal wall thickness
};

// Ball dimensions (passive orange golf ball, in cm)
export const BALL = {
  DIAMETER: 4.267,         // 42.67 mm standard golf ball
  RADIUS: 2.1335,
  MASS: 0.0459,            // 45.9 grams
};

// Robot dimensions (in cm) - RCJ Soccer Open specifications
export const ROBOT = {
  DIAMETER: 22,            // 22 cm (220 mm) max diameter
  RADIUS: 11,              // 11 cm radius
  HEIGHT: 22,              // 22 cm (220 mm) max height
  NOTCH_ANGLE: 50,         // degrees for pac-man notch (kicker area)
  NOTCH_DEPTH: 4,          // cm depth of kicker notch
  MASS: 2.5,               // kg (typical weight ~2-3kg)
  
  // Kicker
  KICKER_RANGE: 5,         // cm from robot edge to detect ball for kick
  KICK_FORCE: 300,         // impulse force for kick (reduced for realistic physics)
  
  // Motor limits (realistic for Open league robots)
  MAX_SPEED: 150,          // cm/s max linear speed
  MAX_ANGULAR_SPEED: 540,  // deg/s max rotation speed (1.5 rotations/sec)
};

// Neutral spot positions (in cm, relative to field center)
// Based on RCJ rules: spots for ball placement after out-of-bounds
// Positions are well inside field boundaries (at least 40cm from edges) to prevent false out-of-bounds
export const NEUTRAL_SPOTS = [
  // Corner spots (near each corner of field, well inside boundaries)
  { id: 'TL', x: -FIELD.WIDTH / 2 + 50, y: -FIELD.HEIGHT / 2 + 60 },
  { id: 'TR', x: FIELD.WIDTH / 2 - 50, y: -FIELD.HEIGHT / 2 + 60 },
  { id: 'BL', x: -FIELD.WIDTH / 2 + 50, y: FIELD.HEIGHT / 2 - 60 },
  { id: 'BR', x: FIELD.WIDTH / 2 - 50, y: FIELD.HEIGHT / 2 - 60 },
  // Mid-field spots (for side out-of-bounds) - well inside boundaries
  { id: 'ML', x: -FIELD.WIDTH / 2 + 50, y: 0 },
  { id: 'MR', x: FIELD.WIDTH / 2 - 50, y: 0 },
  // Center spot
  { id: 'C', x: 0, y: 0 },
];

// Game timing (in ms)
export const TIMING = {
  HALF_DURATION: 10 * 60 * 1000,  // 10 minutes per half
  KICKOFF_COUNTDOWN: 3000,         // 3 seconds before kickoff
  OUT_OF_BOUNDS_COUNTDOWN: 3000,   // 3 seconds for out of bounds restart
  GOAL_CELEBRATION: 3000,          // 3 seconds after goal
  LACK_OF_PROGRESS: 10000,         // 10 seconds for lack of progress
  
  // Simulation timing
  PHYSICS_STEP: 1000 / 60,         // 60 FPS physics
  RENDER_STEP: 1000 / 60,          // 60 FPS render
};

// Physics constants
export const PHYSICS = {
  // Friction (carpet surface)
  BALL_FRICTION: 0.02,
  BALL_AIR_FRICTION: 0.002,
  ROBOT_FRICTION: 0.1,
  
  // Restitution (bounciness)
  BALL_RESTITUTION: 0.6,
  WALL_RESTITUTION: 0.4,
  ROBOT_RESTITUTION: 0.2,
  
  // Scale factor (cm to physics units)
  SCALE: 1,
};

// Colors
export const COLORS = {
  // Field
  FIELD_GREEN: '#1a5f1a',
  FIELD_DARK_GREEN: '#145214',
  LINE_WHITE: '#ffffff',
  WALL_BLACK: '#1a1a1a',
  
  // Goals (RCJ standard: cyan and yellow)
  GOAL_BLUE: '#00cccc',    // Cyan
  GOAL_YELLOW: '#ffcc00',  // Yellow
  
  // Ball
  BALL_ORANGE: '#ff6600',
  
  // Teams
  TEAM_BLUE: '#2196F3',
  TEAM_BLUE_LIGHT: '#64B5F6',
  TEAM_YELLOW: '#FFC107',
  TEAM_YELLOW_LIGHT: '#FFE082',
  
  // UI
  UI_BACKGROUND: '#0a0a0f',
  UI_PANEL: '#1a1a2e',
  UI_ACCENT: '#00d4ff',
  UI_TEXT: '#e0e0e0',
  UI_ERROR: '#ff4444',
  UI_SUCCESS: '#44ff44',
};

// Starting positions (in cm, relative to field center)
// Blue team defends the top goal (negative Y), Yellow defends bottom (positive Y)
// Robots face toward the ball/center at start (angle points where kicker faces)
export const STARTING_POSITIONS = {
  blue: {
    // Blue attacks toward positive Y (yellow goal)
    // Attacker starts near center, faces ball (at 0,0) so angle toward ball
    attacker: { x: -30, y: -40, angle: Math.PI / 4 },  // Offset left, facing toward center
    // Defender near own goal, facing toward ball
    defender: { x: 30, y: -FIELD.HEIGHT / 2 + 40, angle: Math.PI / 2 },  // Near own goal, facing center
  },
  yellow: {
    // Yellow attacks toward negative Y (blue goal)
    attacker: { x: 30, y: 40, angle: -Math.PI * 3 / 4 },  // Offset right, facing toward center
    defender: { x: -30, y: FIELD.HEIGHT / 2 - 40, angle: -Math.PI / 2 },  // Near own goal, facing center
  },
  ball: { x: 0, y: 0 },
};

// Camera settings for 3D view (adjusted for larger field)
export const CAMERA = {
  FOV: 50,
  NEAR: 1,
  FAR: 2000,
  INITIAL_POSITION: { x: 0, y: 350, z: 280 },  // Higher and further back
  LOOK_AT: { x: 0, y: 0, z: 0 },
};

// ============================================================
// Proportional Reference (for verification):
// ============================================================
// Field: 182cm x 243cm
// Robot diameter: 22cm = 12% of field width, 9% of field length
// Ball diameter: 4.27cm = 2.3% of field width
// Goal width: 70cm = 38% of field width
// This means ~8 robots can fit side-by-side across field width
// And ~11 robots can fit goal-to-goal
// ============================================================
