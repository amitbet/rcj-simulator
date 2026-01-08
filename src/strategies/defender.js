// ============================================================
// RoboCup Jr. Simulator - Defender Strategy (Simplified)
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

// Line crossing backoff state
var backingUpFromLine = false;
var backoffDistance = 0; // cm moved in reverse direction so far
var reverseDirection = { x: 0, y: 0 }; // Direction to reverse (normalized)
const BACKOFF_TARGET_CM = 5; // Move 10cm in opposite direction before resuming

function strategy(worldState) {
  const { ball, goal_blue, goal_yellow, we_are_blue, bumper_front, bumper_left, bumper_right,
          line_front, line_left, line_right, line_rear, stuck, dt_s } = worldState;
  
  // Our goal (the one we defend)
  const ownGoal = we_are_blue ? goal_blue : goal_yellow;
  
  let motor1 = 0, motor2 = 0, motor3 = 0, motor4 = 0;
  let kick = false;
  
  // Defense zone - stay in our half
  // Field is 243cm tall, center line is at ~121cm from each goal
  // Keep defenders well within their half (max 70cm from goal = ~50cm from center)
  const MAX_DISTANCE_FROM_GOAL = 70;
  
  // Check if we're too far forward - CRITICAL: Always check this first
  const distanceFromGoal = ownGoal.visible ? ownGoal.distance : 0;
  const tooFarForward = distanceFromGoal > MAX_DISTANCE_FROM_GOAL;
  const nearCenterLine = distanceFromGoal > MAX_DISTANCE_FROM_GOAL * 0.8; // Within 80% of max = near center
  
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
        // Line behind - for defenders near goal, move sideways instead of forward
        // Check if we're very close to our own goal (within 30cm)
        const veryCloseToGoal = ownGoal.visible && ownGoal.distance < 30;
        if (veryCloseToGoal) {
          // Near goal - move sideways away from goal center instead of forward
          // This prevents backing into the goal
          if (line_left) {
            reverseDirection = { x: 1, y: 0 }; // Move right
          } else if (line_right) {
            reverseDirection = { x: -1, y: 0 }; // Move left
          } else {
            // No side line - move sideways based on goal position
            const goalSide = ownGoal.visible && ownGoal.angle_deg !== undefined ? 
                           (ownGoal.angle_deg > 0 ? 1 : -1) : 1;
            reverseDirection = { x: goalSide, y: 0 }; // Move away from goal center
          }
        } else {
          // Not near goal - move forward (away from line)
          reverseDirection = { x: 0, y: 1 };
        }
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
    if (lastBallVisible) {
      searchTime = 0;
    }
    searchTime += dt_s * 1000;
    lastBallVisible = false;
    
    // If too far from goal, move back
    if (ownGoal.visible && ownGoal.distance > MAX_DISTANCE_FROM_GOAL) {
      if (Math_abs(ownGoal.angle_deg) > 25) {
        const turn = clamp(ownGoal.angle_deg / 50, -1, 1) * 0.5;
        motor1 = -turn;
        motor4 = -turn;
        motor2 = turn;
        motor3 = turn;
      } else {
        motor1 = 0.5;
        motor2 = 0.5;
        motor3 = 0.5;
        motor4 = 0.5;
      }
    } else {
      // Spin to find ball
      const searchDirection = (Math_floor(searchTime / 1500) % 2 === 0) ? 1 : -1;
      const turnSpeed = 0.5 * searchDirection;
      motor1 = -turnSpeed;
      motor2 = turnSpeed;
      motor3 = turnSpeed;
      motor4 = -turnSpeed;
    }
    return { motor1, motor2, motor3, motor4, kick };
  }
  
  // Ball visible
  lastBallVisible = true;
  searchTime = 0;
  
  const ballAngle = ball.angle_deg;
  const ballDist = ball.distance;
  
  // CRITICAL: If too far forward, IMMEDIATELY get back - no exceptions!
  if (tooFarForward) {
    // Back up aggressively toward goal
    if (ownGoal.visible) {
      if (Math_abs(ownGoal.angle_deg) > 20) {
        // Turn toward goal while backing up
        const turn = clamp(ownGoal.angle_deg / 40, -1, 1) * 0.8;
        motor1 = -turn - 0.7; // Back up fast
        motor4 = -turn - 0.7;
        motor2 = turn - 0.7;
        motor3 = turn - 0.7;
      } else {
        // Face goal - back up fast
        motor1 = -0.8;
        motor2 = -0.8;
        motor3 = -0.8;
        motor4 = -0.8;
      }
    } else {
      // Goal not visible - back up and turn to find it
      motor1 = -0.6;
      motor2 = -0.6;
      motor3 = -0.6;
      motor4 = -0.6;
      // Add turning to search
      motor1 += 0.3;
      motor4 += 0.3;
      motor2 -= 0.3;
      motor3 -= 0.3;
    }
    return { motor1, motor2, motor3, motor4, kick };
  }
  
  // Ball is close - intercept BUT only if we're safely in our half
  // Check distance BEFORE moving forward
  if (ballDist < 50 && distanceFromGoal < MAX_DISTANCE_FROM_GOAL * 0.9) {
    if (Math_abs(ballAngle) > 20) {
      // Turn to face ball
      const turn = clamp(ballAngle / 40, -1, 1) * 0.7;
      motor1 = -turn;
      motor4 = -turn;
      motor2 = turn;
      motor3 = turn;
      
      // Add forward motion only if we're not too close to center
      if (distanceFromGoal < MAX_DISTANCE_FROM_GOAL * 0.8) {
        const forwardSpeed = 0.3;
        motor1 += forwardSpeed;
        motor2 += forwardSpeed;
        motor3 += forwardSpeed;
        motor4 += forwardSpeed;
      }
    } else {
      // Facing ball - move forward but slow down near center
      const speedMultiplier = 1 - (distanceFromGoal / MAX_DISTANCE_FROM_GOAL) * 0.8;
      const forwardSpeed = 0.7 * speedMultiplier;
      motor1 = forwardSpeed;
      motor2 = forwardSpeed;
      motor3 = forwardSpeed;
      motor4 = forwardSpeed;
      
      // Fine steering
      const steer = clamp(ballAngle / 45, -0.2, 0.2);
      motor1 -= steer;
      motor4 -= steer;
      motor2 += steer;
      motor3 += steer;
      
      // Kick when close
      if (ballDist < 25) {
        kick = true;
      }
    }
    return { motor1, motor2, motor3, motor4, kick };
  }
  
  // If ball is close but we're near center line, back up instead
  if (ballDist < 50 && distanceFromGoal >= MAX_DISTANCE_FROM_GOAL * 0.9) {
    motor1 = -0.6;
    motor2 = -0.6;
    motor3 = -0.6;
    motor4 = -0.6;
    return { motor1, motor2, motor3, motor4, kick };
  }
  
  // Ball is far - defensive positioning
  // CRITICAL: Check distance BEFORE any forward movement
  const goalBehind = ownGoal.visible && Math_abs(ownGoal.angle_deg) > 100;
  
  // If near center line (80% of max), back up immediately
  if (distanceFromGoal >= MAX_DISTANCE_FROM_GOAL * 0.8) {
    // Back up toward goal
    if (ownGoal.visible) {
      if (Math_abs(ownGoal.angle_deg) > 20) {
        const turn = clamp(ownGoal.angle_deg / 40, -1, 1) * 0.8;
        motor1 = -turn - 0.6;
        motor4 = -turn - 0.6;
        motor2 = turn - 0.6;
        motor3 = turn - 0.6;
      } else {
        motor1 = -0.7;
        motor2 = -0.7;
        motor3 = -0.7;
        motor4 = -0.7;
      }
    } else {
      motor1 = -0.5;
      motor2 = -0.5;
      motor3 = -0.5;
      motor4 = -0.5;
    }
    return { motor1, motor2, motor3, motor4, kick };
  }
  
  // We're safely in our half - can approach ball
  if (goalBehind) {
    // Good position - goal is behind us
    // Turn to face ball first
    if (Math_abs(ballAngle) > 15) {
      const turnSpeed = clamp(ballAngle / 40, -1, 1) * 0.6;
      motor1 = -turnSpeed;
      motor4 = -turnSpeed;
      motor2 = turnSpeed;
      motor3 = turnSpeed;
      
      // Add forward motion while turning (reduce as we approach center)
      const speedMultiplier = 1 - (distanceFromGoal / MAX_DISTANCE_FROM_GOAL) * 0.7;
      const forwardSpeed = 0.3 * speedMultiplier;
      motor1 += forwardSpeed;
      motor2 += forwardSpeed;
      motor3 += forwardSpeed;
      motor4 += forwardSpeed;
    } else {
      // Facing ball - move forward (slow down near center)
      const speedMultiplier = 1 - (distanceFromGoal / MAX_DISTANCE_FROM_GOAL) * 0.8;
      const forwardSpeed = clamp(ballDist / 150, 0.4, 0.7) * speedMultiplier;
      motor1 = forwardSpeed;
      motor2 = forwardSpeed;
      motor3 = forwardSpeed;
      motor4 = forwardSpeed;
      
      // Fine steering
      const steer = clamp(ballAngle / 50, -0.2, 0.2);
      motor1 -= steer;
      motor4 -= steer;
      motor2 += steer;
      motor3 += steer;
    }
  } else {
    // Need to get goal behind us first
    if (ownGoal.visible) {
      if (Math_abs(ownGoal.angle_deg) > 25) {
        const turn = clamp(ownGoal.angle_deg / 50, -1, 1) * 0.6;
        motor1 = -turn;
        motor4 = -turn;
        motor2 = turn;
        motor3 = turn;
        
        // Add forward motion (reduce near center)
        const speedMultiplier = 1 - (distanceFromGoal / MAX_DISTANCE_FROM_GOAL) * 0.6;
        const forwardSpeed = 0.2 * speedMultiplier;
        motor1 += forwardSpeed;
        motor2 += forwardSpeed;
        motor3 += forwardSpeed;
        motor4 += forwardSpeed;
      } else {
        // Move toward goal (reduce speed near center)
        const speedMultiplier = 1 - (distanceFromGoal / MAX_DISTANCE_FROM_GOAL) * 0.6;
        const speed = 0.6 * speedMultiplier;
        motor1 = speed;
        motor2 = speed;
        motor3 = speed;
        motor4 = speed;
      }
    } else {
      // Turn toward ball if goal not visible
      if (Math_abs(ballAngle) > 20) {
        const turn = clamp(ballAngle / 40, -1, 1) * 0.5;
        motor1 = -turn;
        motor4 = -turn;
        motor2 = turn;
        motor3 = turn;
        
        // Only move forward if safely in our half
        if (distanceFromGoal < MAX_DISTANCE_FROM_GOAL * 0.7) {
          const forwardSpeed = 0.3;
          motor1 += forwardSpeed;
          motor2 += forwardSpeed;
          motor3 += forwardSpeed;
          motor4 += forwardSpeed;
        }
      } else {
        // Move forward (but reduce near center)
        const speedMultiplier = 1 - (distanceFromGoal / MAX_DISTANCE_FROM_GOAL) * 0.7;
        const speed = 0.5 * speedMultiplier;
        motor1 = speed;
        motor2 = speed;
        motor3 = speed;
        motor4 = speed;
      }
    }
  }
  
  return { motor1, motor2, motor3, motor4, kick };
}
