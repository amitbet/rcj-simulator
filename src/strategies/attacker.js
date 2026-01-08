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
  const goalAngle = targetGoal.visible ? targetGoal.angle_deg : 0;

  // CASE 1: Ball far and off to the side -> turn in place first
  if (Math_abs(ballAngle) > 12) {
    const turnSpeed = clamp(ballAngle / 40, -1, 1) * 0.7;
    motor1 = -turnSpeed;
    motor4 = -turnSpeed;
    motor2 = turnSpeed;
    motor3 = turnSpeed;
    // minimal creep only if very far
    if (ballDist > 80) {
      const creep = 0.12;
      motor1 += creep;
      motor2 += creep;
      motor3 += creep;
      motor4 += creep;
    }
    return { motor1, motor2, motor3, motor4, kick };
  }

  // CASE 2: Approach ball when roughly facing it
  if (ballDist > 28) {
    const speed = clamp(0.5 + ballDist / 240, 0.5, 0.9);
    const steer = clamp(ballAngle / 50, -0.15, 0.15);
    motor1 = speed - steer;
    motor4 = speed - steer;
    motor2 = speed + steer;
    motor3 = speed + steer;
    return { motor1, motor2, motor3, motor4, kick };
  }

  // CASE 3: Close to ball - fine align with kicker only
  if (Math_abs(ballAngle) > 5) {
    const turn = clamp(ballAngle / 30, -1, 1) * 0.55;
    motor1 = -turn;
    motor4 = -turn;
    motor2 = turn;
    motor3 = turn;
    return { motor1, motor2, motor3, motor4, kick };
  }

  // CASE 4: Lined up on ball, push and kick toward goal
  const goalBias = targetGoal.visible ? clamp(goalAngle / 70, -0.12, 0.12) : 0;
  const pushSpeed = 0.95;
  motor1 = pushSpeed - goalBias;
  motor4 = pushSpeed - goalBias;
  motor2 = pushSpeed + goalBias;
  motor3 = pushSpeed + goalBias;

  if (ballDist < 22 && Math_abs(ballAngle) < 5) {
    if (!targetGoal.visible || Math_abs(goalAngle) < 30) {
      kick = true;
    }
  }

  return { motor1, motor2, motor3, motor4, kick };
}
