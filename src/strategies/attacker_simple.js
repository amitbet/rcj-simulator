// ============================================================
// Simple Attacker Strategy - Ball Approach
// Uses tested movement primitives to approach the ball
// ============================================================

// Movement constants
const MOVEMENT_SPEED = 0.5;
const ROTATION_SPEED = 0.7;
const ALIGNMENT_THRESHOLD_START = 15; // degrees - start rotating if ball angle >= this
const ALIGNMENT_THRESHOLD_STOP = 8; // degrees - stop rotating and move forward if ball angle <= this
const APPROACH_DISTANCE = 15; // cm - stop approaching when this close

// Clamp value between min and max
function clamp(val, min, max) {
  return Math_max(min, Math_min(max, val));
}

// Simple movement functions - direct motor patterns
// Tested with headless test - robot at (0,0) facing north (0°)
// Forward = North (0°), Backward = South (180°), Left = West (-90°), Right = East (90°)

function moveForward(speed) {
  // Forward (toward kicker): Standard forward pattern
  // This moves forward relative to robot's heading
  // If robot visual heading is southeast (135°), this should move southeast
  // Pattern: [speed, -speed, speed, -speed]
  const motors = movementToMotors(speed, 0, 0);
  return motors;
}

function moveBackward(speed) {
  // Backward (away from kicker/south): [-speed, 0, -speed, 0]
  // Test showed [speed, 0, speed, 0] moves North, so invert to get South
  return {
    motor1: -speed,
    motor2: 0,
    motor3: -speed,
    motor4: 0
  };
}

function strafeLeft(speed) {
  // Strafe left (west): Use movementToMotors with vy=-1 (left strafe)
  // This should produce pure strafe without rotation
  // vy=-1 means strafe left in robot frame
  const motors = movementToMotors(0, -speed, 0);
  return motors;
}

function strafeRight(speed) {
  // Strafe right (east): Use movementToMotors with vy=1 (right strafe)
  // This should produce pure strafe without rotation
  // vy=1 means strafe right in robot frame
  const motors = movementToMotors(0, speed, 0);
  return motors;
}

// Convert desired movement to omni wheel motor speeds
// Forward movement = [+1, -1, +1, -1] (from Arduino: motor1=Front Left=+, motor2=Front Right=-, motor3=Back Right=+, motor4=Back Left=-)
// Plus direction = CCW rotation
// Forward kinematics from Arduino pattern:
// m1 = vx + vy + omega (Front Left)
// m2 = -vx + vy + omega (Front Right)
// m3 = vx - vy - omega (Back Right)
// m4 = -vx - vy - omega (Back Left)
function movementToMotors(vx, vy, omega) {
  // Standard forward kinematics from Arduino pattern:
  // m1 = vx + vy + omega (Front Left)
  // m2 = -vx + vy + omega (Front Right)
  // m3 = vx - vy - omega (Back Right)
  // m4 = -vx - vy - omega (Back Left)
  return {
    motor1: clamp(vx + vy + omega, -1, 1),
    motor2: clamp(-vx + vy + omega, -1, 1),
    motor3: clamp(vx - vy - omega, -1, 1),
    motor4: clamp(-vx - vy - omega, -1, 1)
  };
}

// Rotate toward target angle (degrees)
function rotateTowardAngle(currentAngle_deg, targetAngle_deg, speed) {
  // Normalize angles to -180 to 180
  function normalizeAngle(angle) {
    while (angle > 180) angle -= 360;
    while (angle < -180) angle += 360;
    return angle;
  }
  
  const currentNorm = normalizeAngle(currentAngle_deg);
  const targetNorm = normalizeAngle(targetAngle_deg);
  let angleDiff = normalizeAngle(targetNorm - currentNorm);
  
  if (Math_abs(angleDiff) < 5) {
    // Already aligned
    return { motor1: 0, motor2: 0, motor3: 0, motor4: 0 };
  }
  
  // Determine rotation direction and speed
  const turnSpeed = clamp(Math_abs(angleDiff) / 30, 0.3, speed);
  const dir = angleDiff > 0 ? 1 : -1;
  
  // Pure rotation pattern: CW [1,1,-1,-1], CCW [-1,-1,1,1]
  return {
    motor1: turnSpeed * dir,
    motor2: turnSpeed * dir,
    motor3: -turnSpeed * dir,
    motor4: -turnSpeed * dir
  };
}

// Note: moveForward() is now defined above as a simple motor pattern function
// The old moveForward(speed, robotAngle_deg) function is removed - use moveForward(speed) instead

// Search pattern - rotate in place
function searchPattern(t_ms) {
  const searchPhase = Math_floor((t_ms / 1000) % 4);
  if (searchPhase === 0 || searchPhase === 2) {
    // Rotate CW or CCW
    const dir = (searchPhase === 0) ? 1 : -1;
    return {
      motor1: ROTATION_SPEED * dir,
      motor2: ROTATION_SPEED * dir,
      motor3: -ROTATION_SPEED * dir,
      motor4: -ROTATION_SPEED * dir
    };
  } else {
    // Move forward briefly
    const searchMotors = moveForward(MOVEMENT_SPEED * 0.5);
    return searchMotors;
  }
}

// State tracking
var lastBallVisible = false;
var searchTime = 0;

function strategy(worldState) {
  const { t_ms, dt_s, heading_deg, ball } = worldState;
  
  let motor1 = 0, motor2 = 0, motor3 = 0, motor4 = 0;
  let kick = false;
  
  // Check if ball is visible
  if (!ball.visible) {
    // Ball not visible - search pattern
    if (lastBallVisible) {
      searchTime = 0; // Reset search when ball disappears
    }
    searchTime += dt_s * 1000;
    lastBallVisible = false;
    
    const searchMotors = searchPattern(t_ms);
    motor1 = searchMotors.motor1;
    motor2 = searchMotors.motor2;
    motor3 = searchMotors.motor3;
    motor4 = searchMotors.motor4;
    
    return { motor1, motor2, motor3, motor4, kick };
  }
  
  // Ball is visible
  lastBallVisible = true;
  searchTime = 0;
  
  const ballAngle = ball.angle_deg;
  const ballDist = ball.distance;
  
  // If ball is very close, stop and kick
  if (ballDist < APPROACH_DISTANCE) {
    // Stop movement
    motor1 = 0;
    motor2 = 0;
    motor3 = 0;
    motor4 = 0;
    kick = true; // Kick the ball
    return { motor1, motor2, motor3, motor4, kick };
  }
  
  // Simple strategy: Rotate toward ball, then move forward relative to robot
  // Front wheels spin toward each other, back wheels spin away from each other = forward
  
  // Simple strategy: Rotate toward ball, then move forward relative to robot
  // CORRECTED forward pattern: front-right=+, front-left=-, back-right=-, back-left=+
  // Forward = [-speed, +speed, -speed, +speed]
  
  // Simple strategy: Rotate until very well aligned, then move forward
  // CORRECTED forward pattern: [-speed, +speed, -speed, +speed]
  
  // Simple forward movement - don't look at ball, just go forward
  // Use simple moveForward function
  const baseSpeed = MOVEMENT_SPEED;
  const motors = moveForward(baseSpeed);
  motor1 = motors.motor1;
  motor2 = motors.motor2;
  motor3 = motors.motor3;
  motor4 = motors.motor4;
  
  return { motor1, motor2, motor3, motor4, kick };
}
