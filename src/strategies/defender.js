// ============================================================
// RoboCup Jr. Simulator - Defender Strategy
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

var searchTime = 0;
var lastBallVisible = true;

function strategy(worldState) {
  const { ball, goal_blue, goal_yellow, we_are_blue, bumper_front, bumper_left, bumper_right,
          line_front, line_left, line_right, line_rear, stuck, dt_s } = worldState;
  
  // Our goal (the one we defend)
  const ownGoal = we_are_blue ? goal_blue : goal_yellow;
  
  let motor1 = 0, motor2 = 0, motor3 = 0, motor4 = 0;
  let kick = false;
  
  // Defense zone - don't go too far from goal
  const MAX_DISTANCE_FROM_GOAL = 80;
  
  // --- HANDLE LINE SENSORS - AVOID CROSSING WHITE LINES ---
  if (line_front) {
    // Line detected in front - back up and turn away
    motor1 = -0.6;
    motor2 = -0.6;
    motor3 = -0.6;
    motor4 = -0.6;
    if (line_left) {
      motor1 += 0.4; motor4 += 0.4; motor2 -= 0.4; motor3 -= 0.4; // Turn right
    } else if (line_right) {
      motor1 -= 0.4; motor4 -= 0.4; motor2 += 0.4; motor3 += 0.4; // Turn left
    } else {
      motor1 += 0.3; motor4 += 0.3; motor2 -= 0.3; motor3 -= 0.3; // Default turn right
    }
    return { motor1, motor2, motor3, motor4, kick };
  }
  
  if (line_left) {
    // Line detected on left - turn right and move forward slightly
    motor1 = -0.4;
    motor4 = -0.4;
    motor2 = 0.4;
    motor3 = 0.4;
    motor1 += 0.2; motor2 += 0.2; motor3 += 0.2; motor4 += 0.2; // Add forward motion
    return { motor1, motor2, motor3, motor4, kick };
  }
  
  if (line_right) {
    // Line detected on right - turn left and move forward slightly
    motor1 = 0.4;
    motor4 = 0.4;
    motor2 = -0.4;
    motor3 = -0.4;
    motor1 += 0.2; motor2 += 0.2; motor3 += 0.2; motor4 += 0.2; // Add forward motion
    return { motor1, motor2, motor3, motor4, kick };
  }
  
  if (line_rear) {
    // Line detected behind - move forward (we're backing into a line)
    motor1 = 0.4;
    motor2 = 0.4;
    motor3 = 0.4;
    motor4 = 0.4;
    return { motor1, motor2, motor3, motor4, kick };
  }
  
  // --- HANDLE STUCK/WALL SITUATIONS ---
  if (stuck || bumper_front) {
    motor1 = -0.6;
    motor2 = -0.6;
    motor3 = -0.6;
    motor4 = -0.6;
    return { motor1, motor2, motor3, motor4, kick };
  }
  
  if (bumper_left) {
    motor1 = -0.3;
    motor2 = 0.3;
    motor3 = 0.3;
    motor4 = -0.3;
    return { motor1, motor2, motor3, motor4, kick };
  }
  
  if (bumper_right) {
    motor1 = 0.3;
    motor2 = -0.3;
    motor3 = -0.3;
    motor4 = 0.3;
    return { motor1, motor2, motor3, motor4, kick };
  }
  
  // --- BALL NOT VISIBLE ---
  if (!ball.visible) {
    // Track search time
    if (lastBallVisible) {
      searchTime = 0;
    }
    searchTime += dt_s * 1000;
    lastBallVisible = false;
    
    // If too far from goal, move back toward it
    if (ownGoal.visible && ownGoal.distance > MAX_DISTANCE_FROM_GOAL) {
      if (Math_abs(ownGoal.angle_deg) > 25) {
        // Turn toward goal
        const turn = clamp(ownGoal.angle_deg / 50, -1, 1) * 0.5;
        motor1 = -turn;
        motor4 = -turn;
        motor2 = turn;
        motor3 = turn;
      } else {
        // Drive toward goal
        motor1 = 0.5;
        motor2 = 0.5;
        motor3 = 0.5;
        motor4 = 0.5;
      }
    } else {
      // Spin to find ball with alternating direction
      const searchDirection = (Math_floor(searchTime / 1500) % 2 === 0) ? 1 : -1;
      const turnSpeed = 0.5 * searchDirection;
      motor1 = -turnSpeed;
      motor2 = turnSpeed;
      motor3 = turnSpeed;
      motor4 = -turnSpeed;
    }
    return { motor1, motor2, motor3, motor4, kick };
  }
  
  // Ball visible - reset search state
  lastBallVisible = true;
  searchTime = 0;
  
  // --- BALL IS VISIBLE ---
  const ballAngle = ball.angle_deg;
  const ballDist = ball.distance;
  
  // Is goal behind us? (good defensive position)
  const goalBehind = ownGoal.visible && Math_abs(ownGoal.angle_deg) > 120;
  
  // CASE 1: Ball is CLOSE - intercept and clear!
  if (ballDist < 50) {
    if (Math_abs(ballAngle) > 25) {
      // Turn to face ball
      const turn = clamp(ballAngle / 40, -1, 1) * 0.7;
      motor1 = -turn;
      motor4 = -turn;
      motor2 = turn;
      motor3 = turn;
    } else {
      // Rush toward ball
      motor1 = 0.9;
      motor2 = 0.9;
      motor3 = 0.9;
      motor4 = 0.9;
      
      // Steering
      const steer = clamp(ballAngle / 45, -0.2, 0.2);
      motor1 -= steer;
      motor4 -= steer;
      motor2 += steer;
      motor3 += steer;
      
      // Kick to clear when close
      if (ballDist < 25) {
        kick = true;
      }
    }
    return { motor1, motor2, motor3, motor4, kick };
  }
  
  // CASE 2: Ball is FAR - defensive positioning
  if (goalBehind) {
    // Good position - strafe to track ball
    // Strafe right if ball is to the right, left if ball is to the left
    const strafeSpeed = clamp(ballAngle / 50, -1, 1) * 0.5;
    
    // Strafe: move sideways without rotating
    // Left motors and right motors move same direction = strafe
    motor1 = strafeSpeed;
    motor4 = -strafeSpeed;
    motor2 = -strafeSpeed;
    motor3 = strafeSpeed;
    
    // Back up if too far from goal
    if (ownGoal.visible && ownGoal.distance > MAX_DISTANCE_FROM_GOAL - 10) {
      motor1 -= 0.2;
      motor2 -= 0.2;
      motor3 -= 0.2;
      motor4 -= 0.2;
    }
  } else {
    // Need to reposition - get back to goal
    if (ownGoal.visible) {
      if (Math_abs(ownGoal.angle_deg) > 25) {
        const turn = clamp(ownGoal.angle_deg / 50, -1, 1) * 0.6;
        motor1 = -turn;
        motor4 = -turn;
        motor2 = turn;
        motor3 = turn;
      } else {
        motor1 = 0.6;
        motor2 = 0.6;
        motor3 = 0.6;
        motor4 = 0.6;
      }
    } else {
      // Turn to find goal
      motor1 = 0.4;
      motor2 = -0.4;
      motor3 = -0.4;
      motor4 = 0.4;
    }
  }
  
  return { motor1, motor2, motor3, motor4, kick };
}
