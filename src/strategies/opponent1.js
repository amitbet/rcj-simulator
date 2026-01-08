// ============================================================
// RoboCup Jr. Simulator - Opponent Attacker Strategy
// ============================================================
// Yellow team attacker - attacks blue goal
// Same logic as blue attacker with alternating search

var searchTime = 0;
var lastBallVisible = true;

// Line crossing backoff state
var backingUpFromLine = false;
var backoffDistance = 0; // cm moved in reverse direction so far
var reverseDirection = { x: 0, y: 0 }; // Direction to reverse (normalized)
const BACKOFF_TARGET_CM = 5; // Move 10cm in opposite direction before resuming

function strategy(worldState) {
  const { ball, goal_blue, bumper_front, bumper_left, bumper_right, 
          line_front, line_left, line_right, line_rear, stuck, dt_s } = worldState;
  
  let motor1 = 0, motor2 = 0, motor3 = 0, motor4 = 0;
  let kick = false;
  
  // --- HANDLE LINE SENSORS - Reverse direction 10cm when line crossed ---
  // Motor value 0.5 with max speed 150cm/s = 75cm/s
  const BACKOFF_MOTOR_VALUE = 0.5;
  const MAX_ROBOT_SPEED_CM_S = 150;
  const BACKOFF_SPEED_CM_S = BACKOFF_MOTOR_VALUE * MAX_ROBOT_SPEED_CM_S; // 75 cm/s
  const BACKOFF_DISTANCE_PER_STEP = BACKOFF_SPEED_CM_S * dt_s; // Distance moved this step (cm)
  
  // Estimate current movement direction
  let currentDirection = { x: 0, y: 1 }; // Default: forward
  if (ball.visible) {
    const ballAngleRad = (ball.angle_deg * Math_PI) / 180;
    currentDirection = {
      x: Math_sin(ballAngleRad),
      y: Math_cos(ballAngleRad)
    };
  }
  
  // --- HANDLE LINE SENSORS - HIGHEST PRIORITY: Never cross lines ---
  // If ANY line is detected, immediately back away and don't resume until line is clear
  if (line_front || line_left || line_right || line_rear) {
    // Start or continue backing away
    if (!backingUpFromLine) {
      backingUpFromLine = true;
      backoffDistance = 0;
      
      // Determine reverse direction based on which line was hit
      if (line_front) {
        reverseDirection = { x: 0, y: -1 }; // Back away
        if (line_left) reverseDirection = { x: 0.5, y: -0.5 };
        else if (line_right) reverseDirection = { x: -0.5, y: -0.5 };
      } else if (line_rear) {
        reverseDirection = { x: 0, y: 1 }; // Move forward
      } else if (line_left) {
        reverseDirection = { x: 1, y: 0 }; // Move right
      } else if (line_right) {
        reverseDirection = { x: -1, y: 0 }; // Move left
      }
    }
    
    // Continue backing away while line is detected
    const BACKOFF_MOTOR_VALUE = 0.6;
    const forwardSpeed = reverseDirection.y * BACKOFF_MOTOR_VALUE;
    const strafeSpeed = reverseDirection.x * BACKOFF_MOTOR_VALUE * 0.7;
    
    if (Math_abs(strafeSpeed) > 0.1) {
      motor1 = strafeSpeed;
      motor2 = -strafeSpeed;
      motor3 = strafeSpeed;
      motor4 = -strafeSpeed;
    }
    if (Math_abs(forwardSpeed) > 0.1) {
      motor1 += forwardSpeed;
      motor2 += forwardSpeed;
      motor3 += forwardSpeed;
      motor4 += forwardSpeed;
    }
    
    // CRITICAL: Don't resume normal strategy while ANY line is detected
    return { motor1, motor2, motor3, motor4, kick };
  } else {
    // No line detected - reset backoff state
    if (backingUpFromLine) {
      backoffDistance += 0.5;
      if (backoffDistance >= BACKOFF_TARGET_CM) {
        backingUpFromLine = false;
        backoffDistance = 0;
      } else {
        const BACKOFF_MOTOR_VALUE = 0.4;
        const forwardSpeed = reverseDirection.y * BACKOFF_MOTOR_VALUE;
        const strafeSpeed = reverseDirection.x * BACKOFF_MOTOR_VALUE * 0.7;
        if (Math_abs(strafeSpeed) > 0.1) {
          motor1 = strafeSpeed;
          motor2 = -strafeSpeed;
          motor3 = strafeSpeed;
          motor4 = -strafeSpeed;
        }
        if (Math_abs(forwardSpeed) > 0.1) {
          motor1 += forwardSpeed;
          motor2 += forwardSpeed;
          motor3 += forwardSpeed;
          motor4 += forwardSpeed;
        }
        return { motor1, motor2, motor3, motor4, kick };
      }
    }
  }
  
  // Handle stuck/wall
  if (stuck) {
    motor1 = -0.5;
    motor2 = -0.3;
    motor3 = -0.3;
    motor4 = -0.5;
    return { motor1, motor2, motor3, motor4, kick };
  }
  
  if (bumper_front) {
    motor1 = -0.7;
    motor2 = -0.7;
    motor3 = -0.7;
    motor4 = -0.7;
    return { motor1, motor2, motor3, motor4, kick };
  }
  
  if (bumper_left) {
    motor1 = -0.4;
    motor2 = 0.4;
    motor3 = 0.4;
    motor4 = -0.4;
    return { motor1, motor2, motor3, motor4, kick };
  }
  
  if (bumper_right) {
    motor1 = 0.4;
    motor2 = -0.4;
    motor3 = -0.4;
    motor4 = 0.4;
    return { motor1, motor2, motor3, motor4, kick };
  }
  
  // Search for ball with alternating direction
  if (!ball.visible) {
    if (lastBallVisible) {
      searchTime = 0;
    }
    searchTime += dt_s * 1000;
    lastBallVisible = false;
    
    const searchDirection = (Math_floor(searchTime / 2000) % 2 === 0) ? -1 : 1;
    const turnSpeed = 0.6 * searchDirection;
    motor1 = -turnSpeed;
    motor2 = turnSpeed;
    motor3 = turnSpeed;
    motor4 = -turnSpeed;
    return { motor1, motor2, motor3, motor4, kick };
  }
  
  lastBallVisible = true;
  searchTime = 0;
  
  const ballAngle = ball.angle_deg;
  const ballDist = ball.distance;
  
  // Close to ball - push and kick
  if (ballDist < 25) {
    motor1 = 1.0;
    motor2 = 1.0;
    motor3 = 1.0;
    motor4 = 1.0;
    
    const steer = clamp(ballAngle / 45, -0.3, 0.3);
    motor1 -= steer;
    motor4 -= steer;
    motor2 += steer;
    motor3 += steer;
    
    kick = true;
    return { motor1, motor2, motor3, motor4, kick };
  }
  
  // Turn to face ball
  if (Math_abs(ballAngle) > 15) {
    const turn = clamp(ballAngle / 40, -1, 1) * 0.6;
    // Always add forward motion when turning toward ball (more when ball is farther)
    const forwardSpeed = clamp(ballDist / 150, 0.2, 0.5);
    motor1 = forwardSpeed - turn;
    motor4 = forwardSpeed - turn;
    motor2 = forwardSpeed + turn;
    motor3 = forwardSpeed + turn;
    return { motor1, motor2, motor3, motor4, kick };
  }
  
  // Drive toward ball
  const speed = clamp(0.4 + ballDist / 200, 0.4, 0.85);
  motor1 = speed;
  motor2 = speed;
  motor3 = speed;
  motor4 = speed;
  
  const steer = clamp(ballAngle / 60, -0.2, 0.2);
  motor1 -= steer;
  motor4 -= steer;
  motor2 += steer;
  motor3 += steer;
  
  return { motor1, motor2, motor3, motor4, kick };
}
