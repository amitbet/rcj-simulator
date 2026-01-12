// ============================================================
// Circle Pattern Test Strategy
// Moves in a circle by rotating while moving forward
// Uses movementToMotors with forward movement + rotation
// ============================================================

// Movement constants
const MOVEMENT_SPEED = 0.4; // Forward speed
const ROTATION_SPEED = 0.3; // Rotation speed (omega)

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

function strategy(worldState) {
  const { t_ms } = worldState;
  
  // Move forward while rotating clockwise
  // vx = forward speed, vy = 0 (no strafe), omega = rotation speed (CW = positive)
  const motors = movementToMotors(MOVEMENT_SPEED, 0, ROTATION_SPEED);
  
  return {
    motor1: motors.motor1,
    motor2: motors.motor2,
    motor3: motors.motor3,
    motor4: motors.motor4,
    kick: false
  };
}
