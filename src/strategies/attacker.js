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

// Line crossing backoff state
var backingUpFromLine = false;
var backoffDistance = 0; // cm moved in reverse direction so far
var reverseDirection = { x: 0, y: 0 }; // Direction to reverse (normalized)
const BACKOFF_TARGET_CM = 5; // Move 10cm in opposite direction before resuming
var lastMovementDirection = { x: 0, y: 0 }; // Track last movement direction

function strategy(worldState) {
  const { ball, goal_blue, goal_yellow, we_are_blue, bumper_front, bumper_left, bumper_right, 
          line_front, line_left, line_right, line_rear, stuck, t_ms, dt_s } = worldState;
  
  // Target goal (opponent's goal - where we want to kick the ball)
  const targetGoal = we_are_blue ? goal_yellow : goal_blue;
  // Own goal (the one we're defending - must avoid scoring here!)
  const ownGoal = we_are_blue ? goal_blue : goal_yellow;
  
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
  
  // --- HANDLE LINE SENSORS - HIGHEST PRIORITY: Never cross lines ---
  // If ANY line is detected, immediately back away and don't resume until line is clear
  if (line_front || line_left || line_right || line_rear) {
    // Start or continue backing away
    if (!backingUpFromLine) {
      backingUpFromLine = true;
      backoffDistance = 0;
      
      // Determine reverse direction based on which line was hit
      if (line_front) {
        // Line in front - back away
        reverseDirection = { x: 0, y: -1 };
        if (line_left) reverseDirection = { x: 0.5, y: -0.5 }; // Back and right
        else if (line_right) reverseDirection = { x: -0.5, y: -0.5 }; // Back and left
      } else if (line_rear) {
        // Line behind - move forward
        reverseDirection = { x: 0, y: 1 };
      } else if (line_left) {
        // Line on left - move right
        reverseDirection = { x: 1, y: 0 };
      } else if (line_right) {
        // Line on right - move left
        reverseDirection = { x: -1, y: 0 };
      }
    }
    
    // Continue backing away while line is detected
    const BACKOFF_MOTOR_VALUE = 0.6; // Faster backoff
    const forwardSpeed = reverseDirection.y * BACKOFF_MOTOR_VALUE;
    const strafeSpeed = reverseDirection.x * BACKOFF_MOTOR_VALUE * 0.7;
    
    // Apply movement away from line
    if (Math_abs(strafeSpeed) > 0.1) {
      setMotors(strafeSpeed, -strafeSpeed, strafeSpeed, -strafeSpeed);
    }
    if (Math_abs(forwardSpeed) > 0.1) {
      drive(forwardSpeed);
    }
    
    // CRITICAL: Don't resume normal strategy while ANY line is detected
    return { motor1, motor2, motor3, motor4, kick };
  } else {
    // No line detected - reset backoff state
    if (backingUpFromLine) {
      // Just cleared the line - continue backing a bit more to ensure we're clear
      backoffDistance += 0.5; // Small increment
      if (backoffDistance >= BACKOFF_TARGET_CM) {
        backingUpFromLine = false;
        backoffDistance = 0;
      } else {
        // Still backing away after line cleared
        const BACKOFF_MOTOR_VALUE = 0.4;
        const forwardSpeed = reverseDirection.y * BACKOFF_MOTOR_VALUE;
        const strafeSpeed = reverseDirection.x * BACKOFF_MOTOR_VALUE * 0.7;
        if (Math_abs(strafeSpeed) > 0.1) {
          setMotors(strafeSpeed, -strafeSpeed, strafeSpeed, -strafeSpeed);
        }
        if (Math_abs(forwardSpeed) > 0.1) {
          drive(forwardSpeed);
        }
        return { motor1, motor2, motor3, motor4, kick };
      }
    }
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
  
  // Check own goal position (CRITICAL: avoid scoring in our own goal!)
  const ownGoalVisible = ownGoal.visible;
  const ownGoalAngle = ownGoalVisible ? ownGoal.angle_deg : 0;
  const ownGoalDist = ownGoalVisible ? ownGoal.distance : 200;
  
  // Check if we're aligned with our own goal (dangerous - don't kick!)
  const alignedWithOwnGoal = ownGoalVisible && Math_abs(ownGoalAngle) < 30;
  const ownGoalInFront = ownGoalVisible && Math_abs(ownGoalAngle) < 60;
  
  // Check if we're on the wrong side of the ball
  // If ball is in front but goal is behind us (or very far to the side), we need to reposition
  const ballInFront = Math_abs(ballAngle) < 45;
  const goalBehind = goalVisible && Math_abs(goalAngle) > 120;
  const goalFarSide = goalVisible && Math_abs(goalAngle) > 70;
  const needsRepositioning = ballInFront && ballDist < 60 && (goalBehind || goalFarSide);
  
  // CRITICAL: If we're close to ball and aligned with our own goal, reposition immediately!
  const dangerZone = ballDist < 40 && alignedWithOwnGoal;
  
  // --- CRITICAL: AVOID OWN GOAL - Reposition if aligned with own goal ---
  if (dangerZone) {
    // We're in danger of scoring in our own goal! Reposition immediately
    // Turn away from own goal and back up
    const turnAway = ownGoalAngle > 0 ? -1 : 1; // Turn opposite direction of own goal
    const backSpeed = -0.7;
    const turnSpeed = 0.8 * turnAway;
    
    motor1 = backSpeed - turnSpeed;
    motor4 = backSpeed - turnSpeed;
    motor2 = backSpeed + turnSpeed;
    motor3 = backSpeed + turnSpeed;
    
    return { motor1, motor2, motor3, motor4, kick };
  }
  
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
    // If own goal is in front and we're turning toward it, turn the other way
    if (ownGoalInFront && ballDist < 50) {
      // Turn away from own goal
      const turnAway = ownGoalAngle > 0 ? -1 : 1;
      turn(0.7 * turnAway);
    } else {
      const turnSpeed = clamp(ballAngle / 35, -1, 1) * 0.7;
      turn(turnSpeed);
    }
    
    // Always add forward motion when turning toward ball (unless aligned with own goal)
    if (!alignedWithOwnGoal) {
      // More forward motion when ball is farther away
      const fwd = clamp(ballDist / 150, 0.2, 0.5);
      motor1 += fwd; motor2 += fwd; motor3 += fwd; motor4 += fwd;
    }
    return { motor1, motor2, motor3, motor4, kick };
  }
  
  // --- APPROACH: Facing ball, drive toward it ---
  if (ballDist > 25) {
    // Don't approach if we're aligned with own goal - reposition instead
    if (alignedWithOwnGoal) {
      const turnAway = ownGoalAngle > 0 ? -1 : 1;
      const backSpeed = -0.5;
      const turnSpeed = 0.6 * turnAway;
      
      motor1 = backSpeed - turnSpeed;
      motor4 = backSpeed - turnSpeed;
      motor2 = backSpeed + turnSpeed;
      motor3 = backSpeed + turnSpeed;
      
      return { motor1, motor2, motor3, motor4, kick };
    }
    
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
  // BUT: Never align with our own goal!
  // Only do fine-tuning if very close and goal is significantly off to the side
  if (goalVisible && Math_abs(goalAngle) > 30 && ballDist < 20 && !alignedWithOwnGoal) {
    // We want to position so that ball is between us and goal
    // Turn toward the goal while moving forward slightly to maintain contact
    const turnSpeed = clamp(goalAngle / 40, -1, 1) * 0.4;
    const fwdSpeed = 0.3; // Keep moving forward to stay with ball
    
    motor1 = fwdSpeed - turnSpeed;
    motor4 = fwdSpeed - turnSpeed;
    motor2 = fwdSpeed + turnSpeed;
    motor3 = fwdSpeed + turnSpeed;
    
    return { motor1, motor2, motor3, motor4, kick };
  }
  
  // --- PUSH AND KICK ---
  // We're close to ball and roughly aligned with goal (or goal not visible)
  // CRITICAL: Never push/kick if aligned with own goal!
  if (alignedWithOwnGoal && ballDist < 30) {
    // Turn away from own goal and back up
    const turnAway = ownGoalAngle > 0 ? -1 : 1;
    const backSpeed = -0.6;
    const turnSpeed = 0.7 * turnAway;
    
    motor1 = backSpeed - turnSpeed;
    motor4 = backSpeed - turnSpeed;
    motor2 = backSpeed + turnSpeed;
    motor3 = backSpeed + turnSpeed;
    
    return { motor1, motor2, motor3, motor4, kick };
  }
  
  const goalBias = goalVisible ? clamp(goalAngle / 60, -0.15, 0.15) : 0;
  const pushSpeed = 0.9;
  
  motor1 = pushSpeed - goalBias;
  motor4 = pushSpeed - goalBias;
  motor2 = pushSpeed + goalBias;
  motor3 = pushSpeed + goalBias;
  
  // Kick when aligned with TARGET goal and close, but NEVER when aligned with own goal
  if (ballDist < 20 && Math_abs(ballAngle) < 8 && !alignedWithOwnGoal) {
    // Double-check: make sure target goal is in front, not own goal
    if (goalVisible && Math_abs(goalAngle) < 45) {
      kick = true;
    } else if (!ownGoalVisible || Math_abs(ownGoalAngle) > 45) {
      // Safe to kick if own goal is not visible or far to the side
      kick = true;
    }
  }
  
  return { motor1, motor2, motor3, motor4, kick };
}
