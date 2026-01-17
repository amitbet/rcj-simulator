// ============================================================
// RoboCup Jr. Simulator - Attacker Strategy (State Machine)
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

// ============================================================
// STATE MACHINE STATES
// ============================================================
const STATE = {
  SEARCHING: 'SEARCHING',
  ATTACKING: 'ATTACKING',
  UNCROSSING_LINE: 'UNCROSSING_LINE',
  STUCK: 'STUCK',
  RESET_POSITION: 'RESET_POSITION'
};

// Current state
var currentState = STATE.SEARCHING;

// Current target (for display)
var currentTarget = null;

// State-specific persistent variables
var searchTime = 0;
var lastBallVisible = true;

// Line detection control
var ignoreLineDetection = false; // Single boolean to ignore all line detection

// Line crossing state
var backoffDistance = 0; // cm moved in reverse direction so far
var reverseDirection = { x: 0, y: 0 }; // Direction to reverse (normalized)
const BACKOFF_TARGET_CM = 10; // Move 10cm in opposite direction before resuming

// Reset position tracking - track stuck/uncrossing events
var resetEvents = []; // Array of { time: number, type: 'stuck' | 'uncrossing' }
const RESET_EVENT_WINDOW_MS = 5000; // 5 seconds window
const RESET_EVENT_THRESHOLD = 3; // Need 3 events within window to trigger reset
var stuckEntryTime = null; // Track when we entered STUCK state to prevent rapid oscillation
const MIN_STUCK_TIME_MS = 300; // Minimum time to stay in STUCK state before allowing exit
var resetTargetGoalIsBlue = null; // true = blue goal, false = yellow goal, null = not set
var resetDistanceMoved = 0; // Track distance moved toward target goal during RESET_POSITION (cm)
var resetInitialDistance = null; // Initial distance to goal when entering RESET_POSITION
var resetRotationAccumulated = 0; // Track accumulated rotation during RESET_POSITION (degrees)
var resetLastHeading = null; // Track last heading to calculate rotation

// Line sensor memory - remember when line was detected and direction
var lineSensorMemory = {
  front: { active: false, direction: null },
  left: { active: false, direction: null },
  right: { active: false, direction: null },
  rear: { active: false, direction: null }
};

// Line sensor trigger tracking - turn to own goal after 3 triggers
var lineTriggerCounts = { front: 0, left: 0, right: 0, rear: 0 };
var lastLineState = { front: false, left: false, right: false, rear: false };
var turningToOwnGoal = false;
var ownGoalTurnComplete = false;
var distanceMovedToGoal = 0; // Track distance moved towards own goal
const GOAL_ADVANCE_DISTANCE_CM = 50; // Move 50cm towards own goal

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
    setMotors(speed, -speed, speed, -speed);
  }
  
  // Helper: clamp value
  function clamp(val, min, max) {
    return Math_max(min, Math_min(max, val));
  }
  
  // ============================================================
  // STATE: RESET_POSITION (Ignore all lines, navigate to furthest goal)
  // ============================================================
  if (currentState === STATE.RESET_POSITION) {
    // Ignore all line detection
    ignoreLineDetection = true;
    
    // Lock onto the furthest goal when first entering this state
    if (resetTargetGoalIsBlue === null) {
      // Find the goal that is furthest from the robot's current position
      // Compare distances (always calculated, even if not visible)
      if (goal_blue.distance > goal_yellow.distance) {
        resetTargetGoalIsBlue = true;
        currentTarget = 'blue goal';
        resetInitialDistance = goal_blue.distance;
      } else {
        resetTargetGoalIsBlue = false;
        currentTarget = 'yellow goal';
        resetInitialDistance = goal_yellow.distance;
      }
      // Reset rotation tracking (not needed for omni but kept for compatibility)
      resetRotationAccumulated = 0;
      resetLastHeading = null;
      resetDistanceMoved = 0; // Reset distance tracking
    }
    
    // Always set target to goal (never ball) in RESET_POSITION
    currentTarget = resetTargetGoalIsBlue ? 'blue goal' : 'yellow goal';
    
    // Get fresh distance from current goal observations (they update each frame)
    const furthestGoalDist = resetTargetGoalIsBlue ? goal_blue.distance : goal_yellow.distance;
    const furthestGoalVis = resetTargetGoalIsBlue ? goal_blue.visible : goal_yellow.visible;
    const furthestGoalAngle = resetTargetGoalIsBlue ? goal_blue.angle_deg : goal_yellow.angle_deg;
    
    // Calculate distance moved toward goal (difference from initial distance)
    // Only update if goal is visible - if not visible, keep last known value
    if (resetInitialDistance !== null && furthestGoalVis) {
      resetDistanceMoved = resetInitialDistance - furthestGoalDist;
      // Ensure distance moved is non-negative (we're moving toward goal, not away)
      if (resetDistanceMoved < 0) {
        resetDistanceMoved = 0; // Reset if we somehow moved away
      }
    }
    
    
    // Exit reset after moving 60cm toward the target goal
    // REMOVED fallback condition - we should only exit after moving 60cm, not when reaching goal
    // This ensures we move exactly 60cm toward the goal, regardless of how close we get
    if (resetDistanceMoved >= 60) {
      ignoreLineDetection = false;
      resetEvents = []; // Clear reset events
      resetTargetGoalIsBlue = null; // Clear locked goal
      resetRotationAccumulated = 0;
      resetLastHeading = null;
      resetDistanceMoved = 0;
      resetInitialDistance = null;
      // Transition to ATTACKING state (attacker preference)
      currentState = STATE.ATTACKING;
      return { motor1, motor2, motor3, motor4, kick };
    }
    
    // Move toward goal using differential drive (turn + forward)
    // Physics engine uses differential drive, not true omnidirectional
    if (furthestGoalVis) {
      // Goal is visible - turn toward it and move forward
      const goalAngle = furthestGoalAngle;
      const goalDist = furthestGoalDist;
      const absAngle = Math_abs(goalAngle);
      
      // If goal is behind (>90° or <-90°), turn in place first
      if (absAngle > 90) {
        // Turn in place (no forward movement) - goal is behind
        const turnSpeed = clamp(goalAngle / 60, -1, 1) * 0.8; // Slower turn when behind
        
        motor1 = -turnSpeed; // Left side
        motor4 = -turnSpeed;
        motor2 = turnSpeed; // Right side
        motor3 = turnSpeed;
      } else if (absAngle > 15) {
        // Goal is to the side - turn while moving forward slowly
        const turnSpeed = clamp(goalAngle / 50, -1, 1) * 0.6;
        const forwardSpeed = 0.4; // Moderate forward speed while turning
        
        motor1 = forwardSpeed - turnSpeed; // Left side
        motor4 = forwardSpeed - turnSpeed;
        motor2 = forwardSpeed + turnSpeed; // Right side
        motor3 = forwardSpeed + turnSpeed;
      } else {
        // Goal is aligned - move straight forward
        const forwardSpeed = 0.7;
        motor1 = forwardSpeed;
        motor2 = forwardSpeed;
        motor3 = forwardSpeed;
        motor4 = forwardSpeed;
      }
    } else {
      // Goal not visible - move forward in current direction (should become visible soon with 360 camera)
      const forwardSpeed = 0.6;
      motor1 = forwardSpeed;
      motor2 = forwardSpeed;
      motor3 = forwardSpeed;
      motor4 = forwardSpeed;
    }
    
    return { motor1, motor2, motor3, motor4, kick };
  }
  
  // ============================================================
  // STATE: UNCROSSING_LINE (Highest Priority)
  // ============================================================
  if (currentState === STATE.UNCROSSING_LINE) {
    // Ignore all line detection while uncrossing
    ignoreLineDetection = true;
    
    // Set target for display
    currentTarget = null;
    
    // Remove events older than window (event was already recorded when entering this state)
    resetEvents = resetEvents.filter(e => t_ms - e.time < RESET_EVENT_WINDOW_MS);
    
    // Check if we should go to RESET_POSITION
    // CRITICAL: Don't enter RESET_POSITION if ball is visible and close - prioritize attacking!
    // Attackers should only reset when truly stuck, not when they can see the ball
    const ballVisibleAndClose = ball.visible && ball.distance < 80; // Ball within 80cm
    
    // Count event types for debugging
    const stuckCount = resetEvents.filter(e => e.type === 'stuck').length;
    const uncrossingCount = resetEvents.filter(e => e.type === 'uncrossing').length;
    
    
    // Enter RESET_POSITION if we have 3+ uncrossing events (regardless of ball visibility)
    // This ensures we reset after multiple line crossings
    if (uncrossingCount >= RESET_EVENT_THRESHOLD) {
      currentState = STATE.RESET_POSITION;
      ignoreLineDetection = true;
      resetEvents = []; // Clear events
      resetRotationAccumulated = 0;
      resetLastHeading = null;
      resetDistanceMoved = 0;
      // Set target immediately to furthest goal (never ball) and initialize distance tracking
      if (goal_blue.distance > goal_yellow.distance) {
        resetTargetGoalIsBlue = true;
        currentTarget = 'blue goal';
        resetInitialDistance = goal_blue.distance; // CRITICAL: Set initial distance here
      } else {
        resetTargetGoalIsBlue = false;
        currentTarget = 'yellow goal';
        resetInitialDistance = goal_yellow.distance; // CRITICAL: Set initial distance here
      }
      return { motor1, motor2, motor3, motor4, kick };
  }
  
    // Estimate distance moved based on speed and time
    const BACKOFF_MOTOR_VALUE = 0.6;
    const BACKOFF_SPEED_CM_S = BACKOFF_MOTOR_VALUE * 150; // motor value * max speed
    backoffDistance += BACKOFF_SPEED_CM_S * dt_s;
    
    // Continue reversing until we've moved 10cm
    if (backoffDistance >= BACKOFF_TARGET_CM) {
      // Done reversing - clear line memory and transition back to previous state
      backoffDistance = 0;
      ignoreLineDetection = false;
      lineSensorMemory = {
        front: { active: false, direction: null },
        left: { active: false, direction: null },
        right: { active: false, direction: null },
        rear: { active: false, direction: null }
      };
      // Reset lastLineState to all false - we ignored all line sensors during reverse
      lastLineState = { front: false, left: false, right: false, rear: false };
      
      // Transition back to attacking or searching based on ball visibility
      if (ball.visible) {
        currentState = STATE.ATTACKING;
      } else {
        currentState = STATE.SEARCHING;
      }
    } else {
      // Still reversing - continue moving in opposite direction
      const forwardSpeed = reverseDirection.y * BACKOFF_MOTOR_VALUE;
      const strafeSpeed = reverseDirection.x * BACKOFF_MOTOR_VALUE * 0.7;
      
      if (Math_abs(strafeSpeed) > 0.1) {
        setMotors(strafeSpeed, -strafeSpeed, strafeSpeed, -strafeSpeed);
      }
      if (Math_abs(forwardSpeed) > 0.1) {
        drive(forwardSpeed);
      }
      
      // CRITICAL: ALL line detection logic is disabled while reversing
    return { motor1, motor2, motor3, motor4, kick };
    }
  }
  
  // ============================================================
  // LINE DETECTION (Check for line crossing - triggers UNCROSSING_LINE state)
  // Skip if line detection is disabled
  // ============================================================
  if (!ignoreLineDetection) {
    // Calculate current movement direction based on ball or goal
    var currentDirection = { x: 0, y: 1 }; // Default: forward
    if (ball.visible) {
      const ballAngleRad = (ball.angle_deg * Math_PI) / 180;
      currentDirection = {
        x: Math_sin(ballAngleRad),
        y: Math_cos(ballAngleRad)
      };
    } else if (targetGoal.visible) {
      const goalAngleRad = (targetGoal.angle_deg * Math_PI) / 180;
      currentDirection = {
        x: Math_sin(goalAngleRad),
        y: Math_cos(goalAngleRad)
      };
    }
    
    // Normalize direction
    const dirLen = Math_sqrt(currentDirection.x * currentDirection.x + currentDirection.y * currentDirection.y);
    if (dirLen > 0.01) {
      currentDirection.x /= dirLen;
      currentDirection.y /= dirLen;
    }
    
    // Check for line sensor transitions and update memory
    const sensors = [
      { name: 'front', value: line_front },
      { name: 'left', value: line_left },
      { name: 'right', value: line_right },
      { name: 'rear', value: line_rear }
    ];
    
    for (const sensor of sensors) {
      const memory = lineSensorMemory[sensor.name];
      const lastValue = lastLineState[sensor.name];
      
      // If sensor just triggered (went from false to true)
      if (sensor.value && !lastValue) {
        // Remember this line detection and the current direction
        memory.active = true;
        memory.direction = { x: currentDirection.x, y: currentDirection.y };
      }
      
      // If sensor is active in memory, check if direction changed by 120+ degrees
      if (memory.active && memory.direction) {
        const rememberedDir = memory.direction;
        const dot = rememberedDir.x * currentDirection.x + rememberedDir.y * currentDirection.y;
        const angleDeg = Math_acos(Math_max(-1, Math_min(1, dot))) * 180 / Math_PI;
        
        // If direction changed by more than 120 degrees, clear memory
        if (angleDeg > 120) {
          memory.active = false;
          memory.direction = null;
        }
      }
      
      // If sensor goes to 0 (off) while still in memory, trigger UNCROSSING_LINE state
      if (!sensor.value && memory.active) {
        // Sensor went off before direction changed - line was crossed
        // Transition directly to UNCROSSING_LINE state
        backoffDistance = 0;
        
        // Determine reverse direction based on which sensor triggered
        if (sensor.name === 'front') {
          reverseDirection = { x: 0, y: -1 }; // Back away
        } else if (sensor.name === 'rear') {
          reverseDirection = { x: 0, y: 1 }; // Move forward
        } else if (sensor.name === 'left') {
          reverseDirection = { x: 1, y: 0 }; // Move right
        } else if (sensor.name === 'right') {
          reverseDirection = { x: -1, y: 0 }; // Move left
        }
        
        // Clear memory for this sensor
        memory.active = false;
        memory.direction = null;
        
        // Transition to UNCROSSING_LINE state
        currentState = STATE.UNCROSSING_LINE;
        
        // Record uncrossing event (only once when entering this state)
        resetEvents.push({ time: t_ms, type: 'uncrossing' });
        // Remove events older than window
        resetEvents = resetEvents.filter(e => t_ms - e.time < RESET_EVENT_WINDOW_MS);
        
        
        // Start reversing immediately
        const BACKOFF_MOTOR_VALUE = 0.6;
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
    
    // Update last line state
    lastLineState = { front: line_front, left: line_left, right: line_right, rear: line_rear };
  }
  
  // ============================================================
  // STATE: STUCK (Bumper/Wall contact) - Check BEFORE other states
  // ============================================================
  // Check if we're currently in STUCK state
  if (currentState === STATE.STUCK) {
    // Ignore all line detection while stuck
    ignoreLineDetection = true;
    
    // Set target for display
    currentTarget = null;
    
    // Initialize stuck entry time if not set
    if (stuckEntryTime === null) {
      stuckEntryTime = t_ms;
    }
    
    // If no longer stuck AND minimum time has passed, transition back to appropriate state
    const timeInStuck = t_ms - stuckEntryTime;
    const canExit = !stuck && !bumper_front && !bumper_left && !bumper_right && timeInStuck >= MIN_STUCK_TIME_MS;
    if (canExit) {
      stuckEntryTime = null; // Reset stuck entry time
      ignoreLineDetection = false;
      // Transition back based on ball visibility
      if (ball.visible) {
        currentState = STATE.ATTACKING;
      } else {
        currentState = STATE.SEARCHING;
      }
    } else {
      // Still stuck - handle stuck behavior
      if (stuck || bumper_front) {
    drive(-0.5);
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
    }
  }
  
  // Check if we just became stuck (not already in STUCK state)
  if (currentState !== STATE.STUCK && (stuck || bumper_front || bumper_left || bumper_right)) {
    currentState = STATE.STUCK;
    stuckEntryTime = t_ms; // Record when we entered STUCK
    ignoreLineDetection = true;
    
    // Record stuck event
    resetEvents.push({ time: t_ms, type: 'stuck' });
    // Remove events older than window
    resetEvents = resetEvents.filter(e => t_ms - e.time < RESET_EVENT_WINDOW_MS);
    
    // Check if we should go to RESET_POSITION
    // CRITICAL: Don't enter RESET_POSITION if ball is visible and close - prioritize attacking!
    // Attackers should only reset when truly stuck, not when they can see the ball
    const ballVisibleAndClose = ball.visible && ball.distance < 80; // Ball within 80cm
    
    // Count event types for debugging
    const stuckCount = resetEvents.filter(e => e.type === 'stuck').length;
    const uncrossingCount = resetEvents.filter(e => e.type === 'uncrossing').length;
    
    
    if (resetEvents.length >= RESET_EVENT_THRESHOLD && !ballVisibleAndClose) {
      currentState = STATE.RESET_POSITION;
      ignoreLineDetection = true;
      resetEvents = []; // Clear events
      resetRotationAccumulated = 0;
      resetLastHeading = null;
      resetDistanceMoved = 0;
      // Set target immediately to furthest goal (never ball) and initialize distance tracking
      if (goal_blue.distance > goal_yellow.distance) {
        resetTargetGoalIsBlue = true;
        currentTarget = 'blue goal';
        resetInitialDistance = goal_blue.distance; // CRITICAL: Set initial distance here
      } else {
        resetTargetGoalIsBlue = false;
        currentTarget = 'yellow goal';
        resetInitialDistance = goal_yellow.distance; // CRITICAL: Set initial distance here
      }
      return { motor1, motor2, motor3, motor4, kick };
    }
    
    if (stuck || bumper_front) {
      drive(-0.5);
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
  }
  
  // Ensure line detection is enabled for normal states (unless explicitly disabled above)
  if (currentState !== STATE.UNCROSSING_LINE && currentState !== STATE.STUCK && currentState !== STATE.RESET_POSITION) {
    ignoreLineDetection = false;
  }
  
  // ============================================================
  // GLOBAL CHECK: RESET_POSITION after 3+ uncrossing events
  // ============================================================
  // Check if we should enter RESET_POSITION due to multiple line crossings
  // This check runs in all states (except RESET_POSITION itself) to catch cases where
  // we exited UNCROSSING_LINE before accumulating 3 events
  if (currentState !== STATE.RESET_POSITION && currentState !== STATE.UNCROSSING_LINE && currentState !== STATE.STUCK) {
    // Remove events older than window
    resetEvents = resetEvents.filter(e => t_ms - e.time < RESET_EVENT_WINDOW_MS);
    
    // Count uncrossing events specifically
    const uncrossingCount = resetEvents.filter(e => e.type === 'uncrossing').length;
    
    // If we have 3+ uncrossing events, enter RESET_POSITION (regardless of ball visibility)
    // This ensures we reset after multiple line crossings even if ball is visible
    if (uncrossingCount >= RESET_EVENT_THRESHOLD) {
      currentState = STATE.RESET_POSITION;
      ignoreLineDetection = true;
      resetEvents = []; // Clear events
      resetRotationAccumulated = 0;
      resetLastHeading = null;
      resetDistanceMoved = 0;
      // Set target immediately to furthest goal (never ball) and initialize distance tracking
      if (goal_blue.distance > goal_yellow.distance) {
        resetTargetGoalIsBlue = true;
        currentTarget = 'blue goal';
        resetInitialDistance = goal_blue.distance;
      } else {
        resetTargetGoalIsBlue = false;
        currentTarget = 'yellow goal';
        resetInitialDistance = goal_yellow.distance;
      }
      return { motor1, motor2, motor3, motor4, kick };
    }
  }
  
  // ============================================================
  // STATE: SEARCHING (Look for ball, if not found look for goal)
  // ============================================================
  if (currentState === STATE.SEARCHING) {
    // Set target for display
    if (ball.visible) {
      currentTarget = 'ball';
    } else if (targetGoal.visible) {
      currentTarget = we_are_blue ? 'yellow goal' : 'blue goal';
    } else {
      currentTarget = null;
    }
    
  if (!ball.visible) {
    if (lastBallVisible) {
      searchTime = 0;
    }
    searchTime += dt_s * 1000;
    lastBallVisible = false;
    
      // Search pattern: turn while moving forward to cover more area
    const searchDir = (Math_floor(searchTime / 2000) % 2 === 0) ? 1 : -1;
      const turnSpeed = 0.5 * searchDir;
      const forwardSpeed = 0.4; // Move forward while searching
      
      // Combine turning and forward movement
      motor1 = forwardSpeed - turnSpeed;
      motor4 = forwardSpeed - turnSpeed;
      motor2 = forwardSpeed + turnSpeed;
      motor3 = forwardSpeed + turnSpeed;
      
    return { motor1, motor2, motor3, motor4, kick };
    } else {
      // Ball found - transition to ATTACKING
      lastBallVisible = true;
      searchTime = 0;
      currentState = STATE.ATTACKING;
    }
  }
  
  // ============================================================
  // STATE: ATTACKING (Go for ball)
  // ============================================================
  if (currentState === STATE.ATTACKING) {
    // Set target for display
    currentTarget = 'ball';
    
    // If ball lost, transition to SEARCHING
    if (!ball.visible) {
      currentState = STATE.SEARCHING;
      return { motor1, motor2, motor3, motor4, kick };
    }
    
    const ballAngle = ball.angle_deg;
  const ballDist = ball.distance;
  const goalVisible = targetGoal.visible;
  const goalAngle = goalVisible ? targetGoal.angle_deg : 0;
  
  // Check own goal position (CRITICAL: avoid scoring in our own goal!)
  const ownGoalVisible = ownGoal.visible;
  const ownGoalAngle = ownGoalVisible ? ownGoal.angle_deg : 0;
  const alignedWithOwnGoal = ownGoalVisible && Math_abs(ownGoalAngle) < 30;
  const ownGoalInFront = ownGoalVisible && Math_abs(ownGoalAngle) < 60;
  
  // Check if we're on the wrong side of the ball
  const ballInFront = Math_abs(ballAngle) < 45;
  const goalBehind = goalVisible && Math_abs(goalAngle) > 120;
  const goalFarSide = goalVisible && Math_abs(goalAngle) > 70;
  
  // CRITICAL: If we're close to ball and aligned with our own goal, reposition immediately!
  const dangerZone = ballDist < 40 && alignedWithOwnGoal;
  
    // --- DANGER ZONE: Reposition if aligned with own goal ---
  if (dangerZone) {
    // We're in danger of scoring in our own goal! Reposition immediately
      const turnAway = ownGoalAngle > 0 ? -1 : 1;
    const backSpeed = -0.7;
    const turnSpeed = 0.8 * turnAway;
    
    motor1 = backSpeed - turnSpeed;
    motor4 = backSpeed - turnSpeed;
    motor2 = backSpeed + turnSpeed;
    motor3 = backSpeed + turnSpeed;
    
    return { motor1, motor2, motor3, motor4, kick };
  }
  
  // --- Ball lost: Transition to SEARCHING ---
  // If ball is not visible, transition to SEARCHING state
  if (!ball.visible && currentState === STATE.ATTACKING) {
    currentState = STATE.SEARCHING;
    return { motor1, motor2, motor3, motor4, kick };
  }
  
  // --- APPROACH: Ball is far, turn to face it ---
  if (Math_abs(ballAngle) > 15) {
    // If own goal is in front and we're turning toward it, turn the other way
    if (ownGoalInFront && ballDist < 50) {
      const turnAway = ownGoalAngle > 0 ? -1 : 1;
      turn(0.7 * turnAway);
    } else {
      const turnSpeed = clamp(ballAngle / 35, -1, 1) * 0.7;
      turn(turnSpeed);
    }
    
      // Always add forward motion when turning toward ball (unless aligned with own goal)
      if (!alignedWithOwnGoal) {
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
    if (goalVisible && Math_abs(goalAngle) > 30 && ballDist < 20 && !alignedWithOwnGoal) {
      const turnSpeed = clamp(goalAngle / 40, -1, 1) * 0.4;
      const fwdSpeed = 0.3;
      
      motor1 = fwdSpeed - turnSpeed;
      motor4 = fwdSpeed - turnSpeed;
      motor2 = fwdSpeed + turnSpeed;
      motor3 = fwdSpeed + turnSpeed;
    
    return { motor1, motor2, motor3, motor4, kick };
  }
  
  // --- PUSH AND KICK ---
  // CRITICAL: Never push/kick if aligned with own goal!
  if (alignedWithOwnGoal && ballDist < 30) {
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
    if (goalVisible && Math_abs(goalAngle) < 45) {
      kick = true;
    } else if (!ownGoalVisible || Math_abs(ownGoalAngle) > 45) {
      kick = true;
    }
    }
    
    return { motor1, motor2, motor3, motor4, kick };
  }
  
  return { motor1, motor2, motor3, motor4, kick };
}
