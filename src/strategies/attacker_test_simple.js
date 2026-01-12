// ============================================================
// Simple Test Attacker - Pure Directions (North, East, South, West)
// Time-based tracking (WorldState doesn't include position)
// ============================================================

// Movement constants
const MOVEMENT_SPEED = 0.5;
const MAX_SPEED_CM_PER_S = 150;
const FPS = 60;
const DT_MS = 1000 / FPS;

// Calculate duration (ms) for a given distance (cm) at a given speed (normalized 0-1)
function durationForDistanceCm(distanceCm, speed = 0.5) {
  const speedCmPerS = speed * MAX_SPEED_CM_PER_S;
  return (distanceCm / speedCmPerS) * 1000; // Convert to ms
}

// Clamp value between min and max
function clamp(val, min, max) {
  return Math_max(min, Math_min(max, val));
}

// Convert desired movement to omni wheel motor speeds
function movementToMotors(vx, vy, omega) {
  return {
    motor1: clamp(vx + vy + omega, -1, 1),
    motor2: clamp(-vx + vy + omega, -1, 1),
    motor3: clamp(vx - vy - omega, -1, 1),
    motor4: clamp(-vx - vy - omega, -1, 1)
  };
}

// Move in world-relative direction (north/south/east/west)
// Uses the EXACT same formula as movement_primitives.js that worked
function moveWorldDirection(direction, speed, robotAngle_deg) {
  const robotAngle_rad = robotAngle_deg * Math_PI / 180;
  let worldDirX = 0;
  let worldDirY = 0;
  
  if (direction === 'north') {
    worldDirY = 1;
  } else if (direction === 'south') {
    worldDirY = -1;
  } else if (direction === 'east') {
    worldDirX = 1;
  } else if (direction === 'west') {
    worldDirX = -1;
  }
  
  // EXACT formula from movement_primitives.js moveStrafeCm and moveForwardCm
  // For north/south (forward movement):
  if (worldDirX === 0) {
    const vx_robot = (worldDirY * Math_cos(robotAngle_rad)) * speed;
    const vy_robot = (-worldDirY * Math_sin(robotAngle_rad)) * speed;
    return movementToMotors(vx_robot, vy_robot, 0);
  }
  // For east/west (strafe movement):
  else {
    const vx_robot = (worldDirX * Math_sin(robotAngle_rad)) * speed;
    const vy_robot = (worldDirX * Math_cos(robotAngle_rad)) * speed;
    return movementToMotors(vx_robot, vy_robot, 0);
  }
}

// Time-based state machine for rectangle pattern
var stepIndex = 0;
var stepStartTime = 0;
var currentStep = null;

// Rectangle pattern: move in pure directions
// Field dimensions: 158cm (width) × 219cm (height)
// Use 2% of field width = ~3.16cm
const FIELD_WIDTH_CM = 158;
const DISTANCE_PERCENT = 0.02; // 2% of field width
const DISTANCE_CM = FIELD_WIDTH_CM * DISTANCE_PERCENT; // ~3.16cm
const MOVEMENT_SPEED_STAR = 0.5;
const STEP_DURATION_MS = durationForDistanceCm(DISTANCE_CM, MOVEMENT_SPEED_STAR);

const steps = [
  // Rectangle: start with east (away from goal), then north, west, south
  { type: 'world_move', direction: 'east', speed: MOVEMENT_SPEED_STAR, duration: STEP_DURATION_MS },
  { type: 'world_move', direction: 'north', speed: MOVEMENT_SPEED_STAR, duration: STEP_DURATION_MS },
  { type: 'world_move', direction: 'west', speed: MOVEMENT_SPEED_STAR, duration: STEP_DURATION_MS },
  { type: 'world_move', direction: 'south', speed: MOVEMENT_SPEED_STAR, duration: STEP_DURATION_MS },
];

function strategy(worldState) {
  const { t_ms, dt_s, heading_deg } = worldState;
  
  let motor1 = 0, motor2 = 0, motor3 = 0, motor4 = 0;
  let kick = false;
  
  // Initialize step or check if duration has elapsed
  if (currentStep === null || t_ms - stepStartTime >= currentStep.duration) {
    // Move to next step
    if (stepIndex >= steps.length) {
      stepIndex = 0; // Loop back to start
    }
    currentStep = steps[stepIndex];
    stepStartTime = t_ms;
    stepIndex++;
  }
  
  // Execute current step
  if (currentStep.type === 'world_move') {
    const motors = moveWorldDirection(currentStep.direction, currentStep.speed, heading_deg);
    motor1 = motors.motor1;
    motor2 = motors.motor2;
    motor3 = motors.motor3;
    motor4 = motors.motor4;
  }
  
  return { motor1, motor2, motor3, motor4, kick };
}
