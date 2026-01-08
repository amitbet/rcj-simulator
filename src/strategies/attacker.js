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
//   - All motors negative = drive BACKWARD
//   - Left motors negative, right motors positive = turn RIGHT
//   - Left motors positive, right motors negative = turn LEFT

// Persistent state
var searchTime = 0;
var lastBallVisible = true;
var repositionDir = 1; // 1 = go right, -1 = go left

function strategy(worldState) {
  const { ball, goal_blue, goal_yellow, we_are_blue, bumper_front, bumper_left, bumper_right, 
          line_front, line_left, line_right, line_rear, stuck, t_ms, dt_s } = worldState;
  
  // Target goal (opponent's goal - where we want to kick the ball)
  const targetGoal = we_are_blue ? goal_yellow : goal_blue;
  
  let motor1 = 0, motor2 = 0, motor3 = 0, motor4 = 0;
  let kick = false;
  
  // Helper: set all motors
  function setMotors(fl, fr, br, bl) {
    motor1 = fl; motor2 = fr; motor3 = br; motor4 = bl;
  }
  
  // Helper: turn in place (positive = turn right)
  function turn(speed) {
    setMotors(-speed, speed, speed, -speed);
  }
  
  // Helper: drive forward/backward
  function drive(speed) {
    setMotors(speed, speed, speed, speed);
  }
  
  // Helper: strafe (positive = move right)
  function strafe(speed) {
    // Omni-wheel strafe: diagonal motors work together
    setMotors(speed, -speed, speed, -speed);
  }
  
  // --- HANDLE LINE SENSORS - AVOID CROSSING WHITE LINES ---
  // Line sensors detect white lines (field boundaries and goal area lines)
  // Back up and turn away when a line is detected
  if (line_front) {
    // Line detected in front - back up and turn away
    drive(-0.6);
    if (line_left) {
      turn(0.5); // Turn right if line also on left
    } else if (line_right) {
      turn(-0.5); // Turn left if line also on right
    } else {
      turn(0.3); // Default turn right
    }
    return { motor1, motor2, motor3, motor4, kick };
  }
  
  if (line_left) {
    // Line detected on left - turn right and move forward slightly
    turn(0.5);
    drive(0.2);
    return { motor1, motor2, motor3, motor4, kick };
  }
  
  if (line_right) {
    // Line detected on right - turn left and move forward slightly
    turn(-0.5);
    drive(0.2);
    return { motor1, motor2, motor3, motor4, kick };
  }
  
  if (line_rear) {
    // Line detected behind - move forward (we're backing into a line)
    drive(0.4);
    return { motor1, motor2, motor3, motor4, kick };
  }
  
  // --- HANDLE STUCK/WALL SITUATIONS ---
  if (stuck) {
    drive(-0.5);
    return { motor1, motor2, motor3, motor4, kick };
  }
  
  if (bumper_front) {
    drive(-0.7);
    return { motor1, motor2, motor3, motor4, kick };
  }
  
  if (bumper_left) {
    turn(0.5);
    return { motor1, motor2, motor3, motor4, kick };
  }
  
  if (bumper_right) {
    turn(-0.5);
    return { motor1, motor2, motor3, motor4, kick };
  }
  
  // --- SEARCH FOR BALL ---
  if (!ball.visible) {
    if (lastBallVisible) {
      searchTime = 0;
    }
    searchTime += dt_s * 1000;
    lastBallVisible = false;
    
    const searchDir = (Math_floor(searchTime / 2000) % 2 === 0) ? 1 : -1;
    turn(0.6 * searchDir);
    return { motor1, motor2, motor3, motor4, kick };
  }
  
  lastBallVisible = true;
  searchTime = 0;
  
  // --- BALL IS VISIBLE ---
  const ballAngle = ball.angle_deg;  // positive = ball is to our right
  const ballDist = ball.distance;
  const goalVisible = targetGoal.visible;
  const goalAngle = goalVisible ? targetGoal.angle_deg : 0;
  const goalDist = goalVisible ? targetGoal.distance : 200;
  
  // Check if we're on the wrong side of the ball
  // If ball is in front but goal is behind us (or very far to the side), we need to reposition
  const ballInFront = Math_abs(ballAngle) < 45;
  const goalBehind = goalVisible && Math_abs(goalAngle) > 120;
  const goalFarSide = goalVisible && Math_abs(goalAngle) > 70;
  const needsRepositioning = ballInFront && ballDist < 60 && (goalBehind || goalFarSide);
  
  // --- REPOSITIONING: Go around the ball to get behind it ---
  if (needsRepositioning) {
    // Choose which side to go around (opposite of where goal is)
    if (goalVisible) {
      repositionDir = goalAngle > 0 ? -1 : 1; // go opposite side of goal
    }
    
    // Back up while turning to circle around
    const backSpeed = -0.5;
    const turnSpeed = 0.6 * repositionDir;
    
    motor1 = backSpeed - turnSpeed;
    motor4 = backSpeed - turnSpeed;
    motor2 = backSpeed + turnSpeed;
    motor3 = backSpeed + turnSpeed;
    
    return { motor1, motor2, motor3, motor4, kick };
  }
  
  // --- APPROACH: Ball is far, turn to face it ---
  if (Math_abs(ballAngle) > 15) {
    const turnSpeed = clamp(ballAngle / 35, -1, 1) * 0.7;
    turn(turnSpeed);
    
    // Add small forward motion if ball is far
    if (ballDist > 70) {
      const fwd = 0.15;
      motor1 += fwd; motor2 += fwd; motor3 += fwd; motor4 += fwd;
    }
    return { motor1, motor2, motor3, motor4, kick };
  }
  
  // --- APPROACH: Facing ball, drive toward it ---
  if (ballDist > 25) {
    const speed = clamp(0.5 + ballDist / 200, 0.5, 0.85);
    const steer = clamp(ballAngle / 50, -0.2, 0.2);
    
    motor1 = speed - steer;
    motor4 = speed - steer;
    motor2 = speed + steer;
    motor3 = speed + steer;
    
    return { motor1, motor2, motor3, motor4, kick };
  }
  
  // --- CLOSE TO BALL: Fine-tune alignment ---
  // If goal is visible and off to the side, try to align robot-ball-goal
  if (goalVisible && Math_abs(goalAngle) > 20 && ballDist < 30) {
    // We want to position so that ball is between us and goal
    // Turn toward the goal while backing up slightly to adjust position
    const turnSpeed = clamp(goalAngle / 40, -1, 1) * 0.5;
    const backSpeed = -0.3;
    
    motor1 = backSpeed - turnSpeed;
    motor4 = backSpeed - turnSpeed;
    motor2 = backSpeed + turnSpeed;
    motor3 = backSpeed + turnSpeed;
    
    return { motor1, motor2, motor3, motor4, kick };
  }
  
  // --- PUSH AND KICK ---
  // We're close to ball and roughly aligned with goal (or goal not visible)
  const goalBias = goalVisible ? clamp(goalAngle / 60, -0.15, 0.15) : 0;
  const pushSpeed = 0.9;
  
  motor1 = pushSpeed - goalBias;
  motor4 = pushSpeed - goalBias;
  motor2 = pushSpeed + goalBias;
  motor3 = pushSpeed + goalBias;
  
  // Kick when aligned and close
  if (ballDist < 20 && Math_abs(ballAngle) < 8) {
    kick = true;
  }
  
  return { motor1, motor2, motor3, motor4, kick };
}
