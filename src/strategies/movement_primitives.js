// ============================================================
// RoboCup Jr. Simulator - Movement Primitives Library
// Reusable movement functions for omni wheel robots
// Version: 2025-01-15
// ============================================================
// Motor layout (from Arduino mapping, viewed from above, front at top):
//   motor1 (Front Left, 135°)    motor2 (Front Right, 45°)
//          [    KICKER    ]  ← FRONT (forward direction)
//   motor4 (Back Left, 225°)    motor3 (Back Right, 315°)
// Forward movement: [-1, +1, +1, -1] = [motor1, motor2, motor3, motor4]
//
// Omni wheel system (4 wheels at 45-degree angles):
//   Forward kinematics: m1 = vx + vy + omega, m2 = -vx + vy + omega, m3 = vx - vy - omega, m4 = -vx - vy - omega
//   Where: vx = forward/backward (forward = +), vy = left/right (right = +), omega = rotation (CW = +)

// Movement constants
const MOVEMENT_SPEED = 0.6;
const MAX_SPEED_CM_PER_S = 150; // cm/s (from ROBOT.MAX_SPEED)
const FPS = 60;
const DT_MS = 1000 / FPS; // ~16.67ms per frame
const CM_PER_FRAME = (MAX_SPEED_CM_PER_S * MOVEMENT_SPEED) / FPS; // ~1.5 cm/frame at 0.6 speed

// ============================================================
// Helper Functions
// ============================================================

// Calculate duration in ms for a given distance in cm
function durationForDistanceCm(distanceCm) {
  // Duration = distance / (speed * frames_per_second)
  // Speed = MOVEMENT_SPEED * MAX_SPEED_CM_PER_S (cm/s)
  // Duration in seconds = distanceCm / (MOVEMENT_SPEED * MAX_SPEED_CM_PER_S)
  // Duration in ms = (distanceCm / (MOVEMENT_SPEED * MAX_SPEED_CM_PER_S)) * 1000
  return (distanceCm / (MOVEMENT_SPEED * MAX_SPEED_CM_PER_S)) * 1000;
}

// Clamp value between min and max
function clamp(val, min, max) {
  return Math_max(min, Math_min(max, val));
}

// Convert desired movement to omni wheel motor speeds
// vx: forward/backward (forward = +), vy: left/right (right = +), omega: rotation (CW = +)
// Forward movement = [+1, -1, +1, -1] (from Arduino: motor1=Front Left=+, motor2=Front Right=-, motor3=Back Right=+, motor4=Back Left=-)
// Plus direction = CCW rotation
// Forward kinematics from Arduino pattern:
// m1 = vx + vy + omega (Front Left)
// m2 = -vx + vy + omega (Front Right)
// m3 = vx - vy - omega (Back Right)
// m4 = -vx - vy - omega (Back Left)
function movementToMotors(vx, vy, omega) {
  return {
    motor1: clamp(vx + vy + omega, -1, 1),   // Front Left
    motor2: clamp(-vx + vy + omega, -1, 1),  // Front Right
    motor3: clamp(vx - vy - omega, -1, 1),   // Back Right
    motor4: clamp(-vx - vy - omega, -1, 1)  // Back Left
  };
}

// ============================================================
// Movement Primitives
// ============================================================

// Rotate to a target angle (degrees)
// Returns: { motors: {motor1, motor2, motor3, motor4}, duration: ms }
function rotateToAngle(currentAngle_deg, targetAngle_deg) {
  // Normalize angles to -180 to 180
  function normalizeAngle(angle) {
    while (angle > 180) angle -= 360;
    while (angle < -180) angle += 360;
    return angle;
  }
  
  const currentNorm = normalizeAngle(currentAngle_deg);
  const targetNorm = normalizeAngle(targetAngle_deg);
  
  let angleDiff = normalizeAngle(targetNorm - currentNorm);
  
  // Determine rotation direction (positive = CW, negative = CCW)
  const rotationSpeed = 0.8; // Speed for rotation
  let motorSpeed = 0;
  
  if (Math_abs(angleDiff) < 5) {
    // Already aligned (within 5 degrees)
    motorSpeed = 0;
  } else if (angleDiff > 0) {
    // Rotate clockwise: [1, 1, -1, -1] pattern
    motorSpeed = rotationSpeed;
  } else {
    // Rotate counter-clockwise: [-1, -1, 1, 1] pattern
    motorSpeed = -rotationSpeed;
  }
  
  // Pure rotation pattern from Arduino: CW=[1,1,-1,-1], CCW=[-1,-1,1,1]
  const motors = {
    motor1: clamp(motorSpeed, -1, 1),
    motor2: clamp(motorSpeed, -1, 1),
    motor3: clamp(-motorSpeed, -1, 1), // Opposite sign for back motors
    motor4: clamp(-motorSpeed, -1, 1)  // Opposite sign for back motors
  };
  
  // Calculate duration: angular speed = MAX_ANGULAR_SPEED * rotationSpeed
  // MAX_ANGULAR_SPEED = 540 deg/s, so at 0.8 speed: 432 deg/s
  // Duration = angleDiff / angular_speed
  const angularSpeed_deg_per_s = 540 * rotationSpeed; // deg/s
  const duration_ms = (Math_abs(angleDiff) / angularSpeed_deg_per_s) * 1000;
  
  return {
    motors: motors,
    duration: Math_max(duration_ms, 100) // Minimum 100ms
  };
}

// Move forward/backward in world-relative direction (distance in cm)
// direction: 'north' or 'south'
// Returns: { motors: {motor1, motor2, motor3, motor4}, duration: ms }
function moveForwardCm(distanceCm, direction, robotAngle_deg) {
  const robotAngle_rad = robotAngle_deg * Math_PI / 180;
  let worldDirY = 0;
  
  if (direction === 'north') {
    worldDirY = 1; // Move north: will produce moveY=-1 in physics engine
  } else if (direction === 'south') {
    worldDirY = -1; // Move south: will produce moveY=1 in physics engine
  }
  
  // Convert world direction to robot-relative vx/vy
  const vx_robot = (worldDirY * Math_cos(robotAngle_rad)) * MOVEMENT_SPEED;
  const vy_robot = (-worldDirY * Math_sin(robotAngle_rad)) * MOVEMENT_SPEED;
  
  return {
    motors: movementToMotors(vx_robot, vy_robot, 0),
    duration: durationForDistanceCm(Math_abs(distanceCm))
  };
}

// Strafe left/right in world-relative direction (distance in cm)
// direction: 'east' or 'west'
// Returns: { motors: {motor1, motor2, motor3, motor4}, duration: ms }
function moveStrafeCm(distanceCm, direction, robotAngle_deg) {
  const robotAngle_rad = robotAngle_deg * Math_PI / 180;
  let worldDirX = 0;
  
  if (direction === 'east') {
    worldDirX = 1; // Strafe right (east)
  } else if (direction === 'west') {
    worldDirX = -1; // Strafe left (west)
  }
  
  // Convert world direction to robot-relative vx/vy
  const vx_robot = (worldDirX * Math_sin(robotAngle_rad)) * MOVEMENT_SPEED;
  const vy_robot = (worldDirX * Math_cos(robotAngle_rad)) * MOVEMENT_SPEED;
  
  return {
    motors: movementToMotors(vx_robot, vy_robot, 0),
    duration: durationForDistanceCm(Math_abs(distanceCm))
  };
}

// Move diagonally in world-relative direction (distance in cm per axis)
// direction: 'northeast', 'southeast', 'southwest', 'northwest'
// Returns: { motors: {motor1, motor2, motor3, motor4}, duration: ms }
function moveDiagonalCm(distanceCm, direction, robotAngle_deg) {
  const robotAngle_rad = robotAngle_deg * Math_PI / 180;
  let worldDirX = 0;
  let worldDirY = 0;
  
  if (direction === 'northeast') {
    worldDirX = 1; // East
    worldDirY = 1; // North
  } else if (direction === 'southeast') {
    worldDirX = 1; // East
    worldDirY = -1; // South
  } else if (direction === 'southwest') {
    worldDirX = -1; // West
    worldDirY = -1; // South
  } else if (direction === 'northwest') {
    worldDirX = -1; // West
    worldDirY = 1; // North
  }
  
  // Convert world direction to robot-relative vx/vy
  // Diagonal distance = sqrt(distanceCm^2 + distanceCm^2) = distanceCm * sqrt(2)
  const vx_robot = (worldDirX * Math_sin(robotAngle_rad) + worldDirY * Math_cos(robotAngle_rad)) * MOVEMENT_SPEED;
  const vy_robot = (worldDirX * Math_cos(robotAngle_rad) - worldDirY * Math_sin(robotAngle_rad)) * MOVEMENT_SPEED;
  
  const diagonalDistance = distanceCm * Math_sqrt(2); // Actual distance traveled
  
  return {
    motors: movementToMotors(vx_robot, vy_robot, 0),
    duration: durationForDistanceCm(diagonalDistance)
  };
}

// Move in a quarter arc (90 degrees) with given radius (distance in cm)
// direction: 'cw' (clockwise) or 'ccw' (counter-clockwise)
// moveBackward: if true, move backward instead of forward (for returning arcs)
// Returns: { motors: {motor1, motor2, motor3, motor4}, duration: ms }
function moveQuarterArcCm(radiusCm, direction, robotAngle_deg, moveBackward = false) {
  // Quarter arc = 90 degrees = π/2 radians
  // For a proper arc, we need to move forward while rotating
  // The relationship: v_forward = radius * omega (tangential velocity)
  // To maintain constant radius: omega = v_forward / radius
  
  const robotAngle_rad = robotAngle_deg * Math_PI / 180;
  
  // Calculate duration based on rotation: we need to complete 90° rotation
  // Duration = angle (rad) / (omega_normalized * MAX_ANGULAR_SPEED)
  // We'll use a moderate rotation speed and calculate forward speed to match
  const MAX_ANGULAR_RAD_PER_S = 540 * Math_PI / 180; // ~9.42 rad/s
  const targetOmegaNormalized = 0.4; // Moderate rotation speed (40% of max)
  const omega_rad_per_s = targetOmegaNormalized * MAX_ANGULAR_RAD_PER_S; // rad/s
  
  // Calculate forward speed to maintain radius: v_forward = radius * omega
  const v_forward_cm_per_s = radiusCm * omega_rad_per_s; // cm/s
  const forwardSpeed = v_forward_cm_per_s / MAX_SPEED_CM_PER_S; // Normalized speed
  
  // Duration to complete 90° rotation
  const angle_rad = Math_PI / 2; // 90 degrees
  const duration_ms = (angle_rad / omega_rad_per_s) * 1000; // ms
  
  let omega = 0;
  if (direction === 'cw') {
    // Clockwise arc: rotate CW (positive omega) while moving forward
    omega = targetOmegaNormalized;
  } else if (direction === 'ccw') {
    // Counter-clockwise arc: rotate CCW (negative omega) while moving forward
    omega = -targetOmegaNormalized;
  }
  
  // Move forward or backward in robot's current facing direction while rotating
  // vx_robot and vy_robot are robot-relative: vx = forward/backward, vy = left/right strafe
  // The physics engine transforms these to world coordinates based on robot's angle
  // For returning arcs, move backward to reverse the path
  const vx_robot = moveBackward ? -forwardSpeed : forwardSpeed; // Forward or backward in robot's frame
  const vy_robot = 0; // No strafe component
  
  const motors = movementToMotors(vx_robot, vy_robot, omega);
  
  return {
    motors: motors,
    duration: duration_ms
  };
}

