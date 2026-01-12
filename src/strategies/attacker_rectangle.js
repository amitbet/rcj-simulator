// ============================================================
// Rectangle Pattern Test Strategy
// Moves in a rectangle: forward (north), right (east), backward (south), left (west)
// Uses movementToMotors directly with vx, vy, omega values
// ============================================================

// Movement constants
const MOVEMENT_SPEED = 0.5;
const STEP_DURATION_MS = 1000; // 1 second per side

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

// Rectangle pattern state
var stepIndex = 0;
var stepStartTime = 0;

// Steps: forward (north), right (east), backward (south), left (west)
// Robot frame: vx = forward/backward, vy = left/right
// With heading=0° (north): forward=vx>0 (north), right=vy>0 (east), backward=vx<0 (south), left=vy<0 (west)
const steps = [
  { name: 'forward', vx: MOVEMENT_SPEED, vy: 0, omega: 0, duration: STEP_DURATION_MS }, // North
  { name: 'right', vx: 0, vy: MOVEMENT_SPEED, omega: 0, duration: STEP_DURATION_MS }, // East
  { name: 'backward', vx: -MOVEMENT_SPEED, vy: 0, omega: 0, duration: STEP_DURATION_MS }, // South
  { name: 'left', vx: 0, vy: -MOVEMENT_SPEED, omega: 0, duration: STEP_DURATION_MS }, // West
];

function strategy(worldState) {
  const { t_ms } = worldState;
  
  let motor1 = 0, motor2 = 0, motor3 = 0, motor4 = 0;
  let kick = false;
  
  // Check if we need to move to next step
  if (t_ms - stepStartTime >= steps[stepIndex].duration) {
    stepIndex = (stepIndex + 1) % steps.length;
    stepStartTime = t_ms;
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
