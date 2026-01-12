// ============================================================
// Asterisk Pattern Test Strategy
// Moves in 8 directions (N, NE, E, SE, S, SW, W, NW) then returns to center
// Uses movementToMotors directly with vx, vy, omega values
// ============================================================

// Movement constants
const MOVEMENT_SPEED = 0.5;
const STEP_DURATION_MS = 1000; // 1 second per direction

// Convert desired movement to omni wheel motor speeds
// vx: forward/backward (forward = +), vy: left/right (right = +), omega: rotation (CW = +)
function movementToMotors(vx, vy, omega) {
  return {
    motor1: Math.max(-1, Math.min(1, vx + vy + omega)),
    motor2: Math.max(-1, Math.min(1, -vx + vy + omega)),
    motor3: Math.max(-1, Math.min(1, vx - vy - omega)),
    motor4: Math.max(-1, Math.min(1, -vx - vy - omega))
  };
}

// Asterisk pattern state
var stepIndex = 0;
var stepStartTime = 0;
var startX = 0;
var startY = 0;

// 8 directions: N, NE, E, SE, S, SW, W, NW
// With heading=0° (north):
const sqrt2_over_2 = 0.7071067811865476; // √2/2 for diagonal normalization
const steps = [
  { name: 'north', vx: MOVEMENT_SPEED, vy: 0, omega: 0, duration: STEP_DURATION_MS },
  { name: 'northeast', vx: MOVEMENT_SPEED * sqrt2_over_2, vy: MOVEMENT_SPEED * sqrt2_over_2, omega: 0, duration: STEP_DURATION_MS },
  { name: 'east', vx: 0, vy: MOVEMENT_SPEED, omega: 0, duration: STEP_DURATION_MS },
  { name: 'southeast', vx: -MOVEMENT_SPEED * sqrt2_over_2, vy: MOVEMENT_SPEED * sqrt2_over_2, omega: 0, duration: STEP_DURATION_MS },
  { name: 'south', vx: -MOVEMENT_SPEED, vy: 0, omega: 0, duration: STEP_DURATION_MS },
  { name: 'southwest', vx: -MOVEMENT_SPEED * sqrt2_over_2, vy: -MOVEMENT_SPEED * sqrt2_over_2, omega: 0, duration: STEP_DURATION_MS },
  { name: 'west', vx: 0, vy: -MOVEMENT_SPEED, omega: 0, duration: STEP_DURATION_MS },
  { name: 'northwest', vx: MOVEMENT_SPEED * sqrt2_over_2, vy: -MOVEMENT_SPEED * sqrt2_over_2, omega: 0, duration: STEP_DURATION_MS },
];

function strategy(worldState) {
  const { t_ms } = worldState;
  
  let motor1 = 0, motor2 = 0, motor3 = 0, motor4 = 0;
  let kick = false;
  
  // Check if we need to move to next step
  if (t_ms - stepStartTime >= steps[stepIndex].duration) {
    stepIndex++;
    stepStartTime = t_ms;
    
    // After 8 directions, loop back (will return to center by reversing)
    if (stepIndex >= steps.length) {
      stepIndex = 0; // Loop back to start
    }
  }
  
  // Execute current step using movementToMotors
  const currentStep = steps[stepIndex];
  const motors = movementToMotors(currentStep.vx, currentStep.vy, currentStep.omega);
  motor1 = motors.motor1;
  motor2 = motors.motor2;
  motor3 = motors.motor3;
  motor4 = motors.motor4;
  
  return { motor1, motor2, motor3, motor4, kick };
}
