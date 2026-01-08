// ============================================================
// RoboCup Jr. Simulator - Attacker Strategy
// ============================================================
// Motor layout (viewed from above):
//   motor1 (front-left)    motor2 (front-right)
//          [    KICKER    ]  ← FRONT (forward direction)
//   motor4 (back-left)     motor3 (back-right)
//
// Controls:
//   - All motors positive = drive FORWARD (toward kicker)
//   - Left motors negative, right motors positive = turn RIGHT
//   - Left motors positive, right motors negative = turn LEFT

// Persistent state for search behavior
var searchTime = 0;
var lastBallVisible = true;

function strategy(worldState) {
  const { ball, goal_blue, goal_yellow, we_are_blue, bumper_front, bumper_left, bumper_right, stuck, t_ms, dt_s } = worldState;
  
  // Target goal (opponent's goal - where we want to kick the ball)
  const targetGoal = we_are_blue ? goal_yellow : goal_blue;
  
  // Initialize motors to zero
  let motor1 = 0, motor2 = 0, motor3 = 0, motor4 = 0;
  let kick = false;
  
  // --- HANDLE STUCK/WALL SITUATIONS ---
  if (stuck) {
    // Back up and turn
    motor1 = -0.5;
    motor2 = -0.3;
    motor3 = -0.3;
    motor4 = -0.5;
    return { motor1, motor2, motor3, motor4, kick };
  }
  
  if (bumper_front) {
    // Back up
    motor1 = -0.7;
    motor2 = -0.7;
    motor3 = -0.7;
    motor4 = -0.7;
    return { motor1, motor2, motor3, motor4, kick };
  }
  
  if (bumper_left) {
    // Turn right while backing up slightly
    motor1 = -0.4;
    motor2 = 0.4;
    motor3 = 0.4;
    motor4 = -0.4;
    return { motor1, motor2, motor3, motor4, kick };
  }
  
  if (bumper_right) {
    // Turn left while backing up slightly
    motor1 = 0.4;
    motor2 = -0.4;
    motor3 = -0.4;
    motor4 = 0.4;
    return { motor1, motor2, motor3, motor4, kick };
  }
  
  // --- SEARCH FOR BALL ---
  if (!ball.visible) {
    // Track how long we've been searching
    if (lastBallVisible) {
      searchTime = 0;
    }
    searchTime += dt_s * 1000;
    lastBallVisible = false;
    
    // Alternate search direction based on time
    const searchDirection = (Math_floor(searchTime / 2000) % 2 === 0) ? 1 : -1;
    
    // Spin in place to find ball
    const turnSpeed = 0.6 * searchDirection;
    motor1 = -turnSpeed;
    motor2 = turnSpeed;
    motor3 = turnSpeed;
    motor4 = -turnSpeed;
    
    return { motor1, motor2, motor3, motor4, kick };
  }
  
  // Ball is visible - reset search state
  lastBallVisible = true;
  searchTime = 0;
  
  // --- BALL IS VISIBLE ---
  const ballAngle = ball.angle_deg;  // positive = ball is to our right
  const ballDist = ball.distance;
  
  // CASE 1: Very close to ball - PUSH and KICK!
  if (ballDist < 25) {
    // Drive forward at full speed
    motor1 = 1.0;
    motor2 = 1.0;
    motor3 = 1.0;
    motor4 = 1.0;
    
    // Small steering correction to stay on target
    const steer = clamp(ballAngle / 45, -0.3, 0.3);
    motor1 -= steer;
    motor4 -= steer;
    motor2 += steer;
    motor3 += steer;
    
    // KICK!
    kick = true;
    
    return { motor1, motor2, motor3, motor4, kick };
  }
  
  // CASE 2: Ball is to the side - TURN to face it
  if (Math_abs(ballAngle) > 15) {
    // Calculate turn speed - positive angle means turn right
    const turnSpeed = clamp(ballAngle / 40, -1, 1) * 0.6;
    
    // Also move forward slowly while turning to approach ball
    const forwardSpeed = ballDist > 50 ? 0.2 : 0;
    
    motor1 = forwardSpeed - turnSpeed;
    motor4 = forwardSpeed - turnSpeed;
    motor2 = forwardSpeed + turnSpeed;
    motor3 = forwardSpeed + turnSpeed;
    
    return { motor1, motor2, motor3, motor4, kick };
  }
  
  // CASE 3: Facing the ball - DRIVE toward it
  const speed = clamp(0.4 + ballDist / 200, 0.4, 0.85);
  motor1 = speed;
  motor2 = speed;
  motor3 = speed;
  motor4 = speed;
  
  // Fine steering adjustment
  const steer = clamp(ballAngle / 60, -0.2, 0.2);
  motor1 -= steer;
  motor4 -= steer;
  motor2 += steer;
  motor3 += steer;
  
  return { motor1, motor2, motor3, motor4, kick };
}
