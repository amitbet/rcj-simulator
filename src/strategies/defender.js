// ============================================================
// RoboCup Jr. Simulator - Defender Strategy (State Machine)
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

// ============================================================
// STATE MACHINE STATES
// ============================================================
const STATE = {
  SEARCHING: 'SEARCHING',
  DEFENDING: 'DEFENDING',
  DEFLECTING: 'DEFLECTING',
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
var resetTargetGoalIsBlue = null; // true = blue goal, false = yellow goal, null = not set
var resetRotationAccumulated = 0; // Track accumulated rotation during RESET_POSITION (degrees)
var resetLastHeading = null; // Track last heading to calculate rotation
var resetDistanceMoved = 0; // Track distance moved toward target goal during RESET_POSITION (cm)
var resetInitialDistance = null; // Initial distance to goal when entering RESET_POSITION

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
  
  // Our goal (the one we defend)
  const ownGoal = we_are_blue ? goal_blue : goal_yellow;
  // Opponent goal (where we want to push the ball)
  const opponentGoal = we_are_blue ? goal_yellow : goal_blue;
  
  let motor1 = 0, motor2 = 0, motor3 = 0, motor4 = 0;
  let kick = false;
  
  // Defense zone - stay within 50cm of own goal
  const MAX_DISTANCE_FROM_GOAL = 50;
  
  // Helper: clamp value
  function clamp(val, min, max) {
    return Math_max(min, Math_min(max, val));
  }
  
  // ============================================================
  // STATE: RESET_POSITION (Ignore all lines, navigate toward OWN goal only)
  // ============================================================
  if (currentState === STATE.RESET_POSITION) {
    // Ignore all line detection
    ignoreLineDetection = true;
    
    // CRITICAL: Defenders should ALWAYS move toward their OWN goal, never the opponent's goal
    // This prevents defenders from crossing to the other half of the field
    if (resetTargetGoalIsBlue === null) {
      // Always target own goal (not furthest goal)
      resetTargetGoalIsBlue = we_are_blue;
      currentTarget = we_are_blue ? 'blue goal' : 'yellow goal';
      resetInitialDistance = ownGoal.distance;
      // Reset rotation tracking (not needed for omni but kept for compatibility)
      resetRotationAccumulated = 0;
      resetLastHeading = null;
      resetDistanceMoved = 0; // Reset distance tracking
      
      // #region agent log
      fetch('http://127.0.0.1:7244/ingest/e757a59f-ea0f-41f7-a3ef-6d61b5471d67',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'defender.js:110',message:'RESET_POSITION initialized',data:{resetTargetGoalIsBlue,resetInitialDistance,ownGoalDist:ownGoal.distance,ownGoalVis:ownGoal.visible,we_are_blue},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'U'})}).catch(()=>{});
      // #endregion
      
      // If already very close to goal (<40cm) when entering RESET_POSITION, exit immediately
      // This prevents defenders from getting stuck trying to move into their own goal
      // Increased threshold from 30cm to 40cm to provide more safety margin
      if (ownGoal.visible && ownGoal.distance < 40) {
        // #region agent log
        fetch('http://127.0.0.1:7244/ingest/e757a59f-ea0f-41f7-a3ef-6d61b5471d67',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'defender.js:118',message:'RESET_POSITION exiting immediately - too close to goal at entry',data:{ownGoalDist:ownGoal.distance},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'V'})}).catch(()=>{});
        // #endregion
        ignoreLineDetection = false;
        resetEvents = [];
        resetTargetGoalIsBlue = null;
        resetRotationAccumulated = 0;
        resetLastHeading = null;
        resetDistanceMoved = 0;
        resetInitialDistance = null;
        currentState = STATE.DEFENDING;
        return { motor1, motor2, motor3, motor4, kick };
      }
    }
    
    // Always set target to own goal (never ball, never opponent goal) in RESET_POSITION
    currentTarget = we_are_blue ? 'blue goal' : 'yellow goal';
    
    // Get fresh distance from own goal observations (they update each frame)
    const ownGoalDist = ownGoal.distance;
    const ownGoalVis = ownGoal.visible;
    const ownGoalAngle = ownGoal.angle_deg;
    
    // #region agent log
    fetch('http://127.0.0.1:7244/ingest/e757a59f-ea0f-41f7-a3ef-6d61b5471d67',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'defender.js:137',message:'RESET_POSITION active',data:{ownGoalDist,ownGoalVis,resetInitialDistance,resetDistanceMoved,we_are_blue},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'W'})}).catch(()=>{});
    // #endregion
    
    // Calculate distance moved toward own goal (difference from initial distance)
    // Only update if goal is visible - if not visible, keep last known value
    if (resetInitialDistance !== null && ownGoalVis) {
      resetDistanceMoved = resetInitialDistance - ownGoalDist;
      // Ensure distance moved is non-negative (we're moving toward goal, not away)
      if (resetDistanceMoved < 0) {
        resetDistanceMoved = 0; // Reset if we somehow moved away
      }
    }
    
    // #region agent log
    fetch('http://127.0.0.1:7244/ingest/e757a59f-ea0f-41f7-a3ef-6d61b5471d67',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'defender.js:126',message:'RESET_POSITION distance tracking (toward own goal)',data:{resetInitialDistance,ownGoalDist,resetDistanceMoved,ownGoalVis,we_are_blue,exitCondition60:resetDistanceMoved >= 60},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'R'})}).catch(()=>{});
    // #endregion
    
    // Exit reset after moving 60cm toward own goal OR if we're already very close to goal (<40cm)
    // If already close to goal, don't try to move closer - just exit immediately
    // This prevents defenders from getting stuck trying to move into their own goal
    // Increased threshold from 30cm to 40cm to provide more safety margin
    
    // #region agent log
    fetch('http://127.0.0.1:7244/ingest/e757a59f-ea0f-41f7-a3ef-6d61b5471d67',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'defender.js:164',message:'RESET_POSITION exit check',data:{resetDistanceMoved,ownGoalDist,ownGoalVis,check60:resetDistanceMoved >= 60,check40:ownGoalVis && ownGoalDist < 40,willExit:resetDistanceMoved >= 60 || (ownGoalVis && ownGoalDist < 40)},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'X'})}).catch(()=>{});
    // #endregion
    
    if (resetDistanceMoved >= 60 || (ownGoalVis && ownGoalDist < 40)) {
      // #region agent log
      fetch('http://127.0.0.1:7244/ingest/e757a59f-ea0f-41f7-a3ef-6d61b5471d67',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'defender.js:172',message:'RESET_POSITION exiting',data:{resetDistanceMoved,ownGoalDist,ownGoalVis,exitReason:resetDistanceMoved >= 60 ? 'moved60cm' : 'tooCloseToGoal'},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'S'})}).catch(()=>{});
      // #endregion
      ignoreLineDetection = false;
      resetEvents = []; // Clear reset events
      resetTargetGoalIsBlue = null; // Clear locked goal
      resetRotationAccumulated = 0;
      resetLastHeading = null;
      resetDistanceMoved = 0;
      resetInitialDistance = null;
      // Transition to DEFENDING state (defender preference)
      currentState = STATE.DEFENDING;
      return { motor1, motor2, motor3, motor4, kick };
    }
    
    // Safety check: If we're very close to goal (<30cm), don't move forward - just turn or stop
    // This prevents defenders from ramming into their own goal
    // Increased threshold from 20cm to 30cm to provide more safety margin
    if (ownGoalVis && ownGoalDist < 30) {
      // #region agent log
      fetch('http://127.0.0.1:7244/ingest/e757a59f-ea0f-41f7-a3ef-6d61b5471d67',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'defender.js:152',message:'RESET_POSITION too close to goal, stopping forward movement',data:{ownGoalDist,ownGoalAngle},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'T'})}).catch(()=>{});
      // #endregion
      // Too close - just turn in place or stop, don't move forward
      const goalAngle = ownGoalAngle;
      if (Math_abs(goalAngle) > 15) {
        // Turn away from goal slightly
        const turnSpeed = clamp(goalAngle / 60, -1, 1) * 0.3;
        motor1 = -turnSpeed;
        motor4 = -turnSpeed;
        motor2 = turnSpeed;
        motor3 = turnSpeed;
      } else {
        // Facing goal - stop all movement
        motor1 = 0;
        motor2 = 0;
        motor3 = 0;
        motor4 = 0;
      }
      return { motor1, motor2, motor3, motor4, kick };
    }
    
    // Move toward own goal using differential drive (turn + forward)
    // Physics engine uses differential drive, not true omnidirectional
    if (ownGoalVis) {
      // Own goal is visible - turn toward it and move forward
      const goalAngle = ownGoalAngle;
      const goalDist = ownGoalDist;
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
    if (resetEvents.length >= RESET_EVENT_THRESHOLD) {
      currentState = STATE.RESET_POSITION;
      ignoreLineDetection = true;
      resetEvents = []; // Clear events
      resetRotationAccumulated = 0;
      resetLastHeading = null;
      resetDistanceMoved = 0;
      // CRITICAL: Defenders always move toward OWN goal, never opponent goal
      resetTargetGoalIsBlue = we_are_blue;
      currentTarget = we_are_blue ? 'blue goal' : 'yellow goal';
      resetInitialDistance = ownGoal.distance; // CRITICAL: Set initial distance to own goal
      return { motor1, motor2, motor3, motor4, kick };
    }
    
    // Safety check: ensure reverseDirection is set (should be set when entering this state)
    if (!reverseDirection || (reverseDirection.x === 0 && reverseDirection.y === 0)) {
      // Default to backing up if direction not set
      reverseDirection = { x: 0, y: -1 }; // Back away
      backoffDistance = 0; // Reset since we're starting fresh
    }
    
    // Estimate distance moved based on speed and time
    const BACKOFF_MOTOR_VALUE = 0.6;
    const BACKOFF_SPEED_CM_S = BACKOFF_MOTOR_VALUE * 150; // motor value * max speed
    backoffDistance += BACKOFF_SPEED_CM_S * dt_s;
    
    // Continue reversing until we've moved 10cm
    if (backoffDistance >= BACKOFF_TARGET_CM) {
      // Done reversing - clear line memory and transition back to previous state
      backoffDistance = 0;
      reverseDirection = { x: 0, y: 0 }; // Reset direction
      ignoreLineDetection = false;
      lineSensorMemory = {
        front: { active: false, direction: null },
        left: { active: false, direction: null },
        right: { active: false, direction: null },
        rear: { active: false, direction: null }
      };
      // Reset lastLineState to all false - we ignored all line sensors during reverse
      lastLineState = { front: false, left: false, right: false, rear: false };
      
      // Transition back to defending or searching based on ball visibility
      if (ball.visible) {
        currentState = STATE.DEFENDING;
      } else {
        currentState = STATE.SEARCHING;
      }
    } else {
      // Still reversing - continue moving in opposite direction
      const forwardSpeed = reverseDirection.y * BACKOFF_MOTOR_VALUE;
      const strafeSpeed = reverseDirection.x * BACKOFF_MOTOR_VALUE * 0.7;
      
      // Reset motors first
      motor1 = 0;
      motor2 = 0;
      motor3 = 0;
      motor4 = 0;
      
      // Apply strafe (sideways) movement if needed
      if (Math_abs(strafeSpeed) > 0.1) {
        motor1 = strafeSpeed;
        motor2 = -strafeSpeed;
        motor3 = strafeSpeed;
        motor4 = -strafeSpeed;
      }
      // Apply forward/backward movement if needed
      if (Math_abs(forwardSpeed) > 0.1) {
        motor1 += forwardSpeed;
        motor2 += forwardSpeed;
        motor3 += forwardSpeed;
        motor4 += forwardSpeed;
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
    } else if (ownGoal.visible) {
      const goalAngleRad = (ownGoal.angle_deg * Math_PI) / 180;
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
        memory.active = true;
        memory.direction = { x: currentDirection.x, y: currentDirection.y };
      }
      
      // If sensor is active in memory, check if direction changed by 120+ degrees
      if (memory.active && memory.direction) {
        const rememberedDir = memory.direction;
        const dot = rememberedDir.x * currentDirection.x + rememberedDir.y * currentDirection.y;
        const angleDeg = Math_acos(Math_max(-1, Math_min(1, dot))) * 180 / Math_PI;
        
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
          // For defenders near goal, move sideways instead of forward
          const veryCloseToGoal = ownGoal.visible && ownGoal.distance < 30;
          if (veryCloseToGoal) {
            const goalSide = ownGoal.visible && ownGoal.angle_deg !== undefined ? 
                           (ownGoal.angle_deg > 0 ? 1 : -1) : 1;
            reverseDirection = { x: goalSide, y: 0 }; // Move sideways
          } else {
            reverseDirection = { x: 0, y: 1 }; // Move forward
          }
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
    
    // If no longer stuck, transition back to appropriate state
    if (!stuck && !bumper_front && !bumper_left && !bumper_right) {
      ignoreLineDetection = false;
      // Transition back based on ball visibility
      if (ball.visible) {
        currentState = STATE.DEFENDING;
      } else {
        currentState = STATE.SEARCHING;
      }
    } else {
      // Still stuck - handle stuck behavior
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
    }
  }
  
  // Check if we just became stuck (not already in STUCK state)
  if (currentState !== STATE.STUCK && (stuck || bumper_front || bumper_left || bumper_right)) {
    currentState = STATE.STUCK;
    ignoreLineDetection = true;
    
    // Record stuck event
    resetEvents.push({ time: t_ms, type: 'stuck' });
    // Remove events older than window
    resetEvents = resetEvents.filter(e => t_ms - e.time < RESET_EVENT_WINDOW_MS);
    
    // Check if we should go to RESET_POSITION
    if (resetEvents.length >= RESET_EVENT_THRESHOLD) {
      currentState = STATE.RESET_POSITION;
      ignoreLineDetection = true;
      resetEvents = []; // Clear events
      resetRotationAccumulated = 0;
      resetLastHeading = null;
      resetDistanceMoved = 0;
      // CRITICAL: Defenders always move toward OWN goal, never opponent goal
      resetTargetGoalIsBlue = we_are_blue;
      currentTarget = we_are_blue ? 'blue goal' : 'yellow goal';
      resetInitialDistance = ownGoal.distance; // CRITICAL: Set initial distance to own goal
      return { motor1, motor2, motor3, motor4, kick };
    }
    
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
  }
  
  // Ensure line detection is enabled for normal states (unless explicitly disabled above)
  if (currentState !== STATE.UNCROSSING_LINE && currentState !== STATE.STUCK && currentState !== STATE.RESET_POSITION) {
    ignoreLineDetection = false;
  }
  
  // ============================================================
  // STATE: SEARCHING (Look for own goal, then priority2 = ball)
  // ============================================================
  if (currentState === STATE.SEARCHING) {
    // Set target for display
    if (ball.visible) {
      currentTarget = 'ball';
    } else if (ownGoal.visible) {
      currentTarget = we_are_blue ? 'blue goal' : 'yellow goal';
    } else {
      currentTarget = null;
    }
    
  if (!ball.visible) {
    if (lastBallVisible) {
      searchTime = 0;
    }
    searchTime += dt_s * 1000;
    lastBallVisible = false;
    
      // If too far from goal, move back
    if (ownGoal.visible && ownGoal.distance > MAX_DISTANCE_FROM_GOAL) {
      // #region agent log
      fetch('http://127.0.0.1:7244/ingest/e757a59f-ea0f-41f7-a3ef-6d61b5471d67',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'defender.js:545',message:'SEARCHING too far from goal, backing up',data:{distanceFromGoal:ownGoal.distance,MAX_DISTANCE_FROM_GOAL},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'H'})}).catch(()=>{});
      // #endregion
      if (Math_abs(ownGoal.angle_deg) > 25) {
        const turn = clamp(ownGoal.angle_deg / 50, -1, 1) * 0.5;
        motor1 = -turn - 0.5; // Back up while turning
        motor4 = -turn - 0.5;
        motor2 = turn - 0.5;
        motor3 = turn - 0.5;
      } else {
        motor1 = -0.6; // Back up straight
        motor2 = -0.6;
        motor3 = -0.6;
        motor4 = -0.6;
      }
    } else {
        // Search for ball: turn in place or move backward slightly, never forward
      const searchDirection = (Math_floor(searchTime / 1500) % 2 === 0) ? 1 : -1;
        const turnSpeed = 0.4 * searchDirection;
        const backSpeed = -0.1; // Small backward movement to stay within bounds
        
        motor1 = backSpeed - turnSpeed;
        motor4 = backSpeed - turnSpeed;
        motor2 = backSpeed + turnSpeed;
        motor3 = backSpeed + turnSpeed;
      }
      return { motor1, motor2, motor3, motor4, kick };
    } else {
      // Ball found - transition to DEFENDING
      lastBallVisible = true;
      searchTime = 0;
      currentState = STATE.DEFENDING;
    }
  }
  
  // ============================================================
  // STATE: DEFENDING (Track own goal, stay within 50cm, track ball within bounds)
  // ============================================================
  if (currentState === STATE.DEFENDING) {
    // Set target for display
    if (ball.visible) {
      currentTarget = 'ball';
    } else if (ownGoal.visible) {
      currentTarget = we_are_blue ? 'blue goal' : 'yellow goal';
    } else {
      currentTarget = null;
    }
    
    const distanceFromGoal = ownGoal.visible ? ownGoal.distance : 999;
    
    // #region agent log
    fetch('http://127.0.0.1:7244/ingest/e757a59f-ea0f-41f7-a3ef-6d61b5471d67',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'defender.js:591',message:'DEFENDING state entry',data:{distanceFromGoal,MAX_DISTANCE_FROM_GOAL,ballVisible:ball.visible,ownGoalVisible:ownGoal.visible},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
    // #endregion
    
    // Check if ball is close - transition to DEFLECTING if ball is within 40cm (even if we're far from goal)
    if (ball.visible && ball.distance < 40) {
      // #region agent log
      fetch('http://127.0.0.1:7244/ingest/e757a59f-ea0f-41f7-a3ef-6d61b5471d67',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'defender.js:597',message:'DEFENDING transitioning to DEFLECTING (ball close)',data:{ballDist:ball.distance,distanceFromGoal},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'M'})}).catch(()=>{});
      // #endregion
      currentState = STATE.DEFLECTING;
      return { motor1, motor2, motor3, motor4, kick };
    }
    
    // CRITICAL: Always stay within 50cm of own goal, but also don't get too close (<40cm)
    // If too close to goal, move away (forward) to prevent getting stuck inside goal
    if (ownGoal.visible && distanceFromGoal < 40) {
      // #region agent log
      fetch('http://127.0.0.1:7244/ingest/e757a59f-ea0f-41f7-a3ef-6d61b5471d67',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'defender.js:666',message:'DEFENDING too close to goal, moving away',data:{distanceFromGoal},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'Y'})}).catch(()=>{});
      // #endregion
      // Too close to goal - move away from it (forward movement)
      const goalAngle = ownGoal.angle_deg;
      if (Math_abs(goalAngle) > 20) {
        // Turn away from goal while moving forward
        const turnSpeed = clamp(-goalAngle / 50, -1, 1) * 0.4; // Turn away from goal
        const forwardSpeed = 0.5; // Move forward away from goal
        motor1 = forwardSpeed - turnSpeed;
        motor4 = forwardSpeed - turnSpeed;
        motor2 = forwardSpeed + turnSpeed;
        motor3 = forwardSpeed + turnSpeed;
      } else {
        // Facing goal - move straight forward away from it
        motor1 = 0.6;
        motor2 = 0.6;
        motor3 = 0.6;
        motor4 = 0.6;
      }
      return { motor1, motor2, motor3, motor4, kick };
    }
    
    // CRITICAL: Always stay within 50cm of own goal
    if (distanceFromGoal > MAX_DISTANCE_FROM_GOAL) {
      // #region agent log
      fetch('http://127.0.0.1:7244/ingest/e757a59f-ea0f-41f7-a3ef-6d61b5471d67',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'defender.js:690',message:'DEFENDING too far from goal, backing up',data:{distanceFromGoal,MAX_DISTANCE_FROM_GOAL},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
      // #endregion
      // Too far from goal - move back toward it immediately
      if (ownGoal.visible) {
        const goalAngle = ownGoal.angle_deg;
        if (Math_abs(goalAngle) > 20) {
          // Turn toward goal while backing up
          const turn = clamp(goalAngle / 40, -1, 1) * 0.7;
          motor1 = -turn - 0.7;
          motor4 = -turn - 0.7;
          motor2 = turn - 0.7;
          motor3 = turn - 0.7;
        } else {
          // Facing goal - back up straight
          motor1 = -0.8;
          motor2 = -0.8;
          motor3 = -0.8;
          motor4 = -0.8;
        }
      } else {
        // Goal not visible - back up and search
        motor1 = -0.6;
        motor2 = -0.6;
        motor3 = -0.6;
        motor4 = -0.6;
        motor1 += 0.3;
        motor4 += 0.3;
        motor2 -= 0.3;
        motor3 -= 0.3;
      }
      return { motor1, motor2, motor3, motor4, kick };
    }
    
    // Within bounds - track ball and position defensively
    // CRITICAL: Never move in a way that would take us outside 50cm radius
    // Always prioritize staying within bounds over ball tracking
    
    if (ball.visible && ownGoal.visible) {
      const ballAngle = ball.angle_deg;
      const ballDist = ball.distance;
      const goalAngle = ownGoal.angle_deg;
      
      // Calculate desired position: between ball and goal, within 50cm of goal
      // Position closer to goal (30-40cm) to intercept ball path
      const desiredDistanceFromGoal = 35; // cm - optimal defensive position
      const SAFE_DISTANCE_THRESHOLD = MAX_DISTANCE_FROM_GOAL - 5; // 45cm - safety margin
      
      // CRITICAL: If we're near the boundary, only allow movements that keep us within bounds
      if (distanceFromGoal > SAFE_DISTANCE_THRESHOLD) {
        // #region agent log
        fetch('http://127.0.0.1:7244/ingest/e757a59f-ea0f-41f7-a3ef-6d61b5471d67',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'defender.js:648',message:'DEFENDING near boundary',data:{distanceFromGoal,SAFE_DISTANCE_THRESHOLD,MAX_DISTANCE_FROM_GOAL},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
        // #endregion
        // Too close to boundary - only allow backward movement or turning in place
        if (distanceFromGoal > MAX_DISTANCE_FROM_GOAL - 2) {
          // Very close to boundary - only back up
          const goalAngle = ownGoal.angle_deg;
          if (Math_abs(goalAngle) > 20) {
            const turn = clamp(goalAngle / 40, -1, 1) * 0.5;
            motor1 = -turn - 0.5;
            motor4 = -turn - 0.5;
            motor2 = turn - 0.5;
            motor3 = turn - 0.5;
          } else {
            motor1 = -0.6;
            motor2 = -0.6;
            motor3 = -0.6;
            motor4 = -0.6;
          }
        } else {
          // Near boundary - turn toward goal while staying in place or backing up slightly
          const goalAngle = ownGoal.angle_deg;
          if (Math_abs(goalAngle) > 15) {
            const turn = clamp(goalAngle / 40, -1, 1) * 0.4;
            motor1 = -turn - 0.2; // Small backward movement
            motor4 = -turn - 0.2;
            motor2 = turn - 0.2;
            motor3 = turn - 0.2;
          } else {
            // Facing goal - minimal movement, mostly turning to track ball
            const sideTurn = clamp(ballAngle / 80, -0.3, 0.3);
            motor1 = -sideTurn - 0.1; // Slight backward bias
            motor4 = -sideTurn - 0.1;
            motor2 = sideTurn - 0.1;
            motor3 = sideTurn - 0.1;
          }
        }
        return { motor1, motor2, motor3, motor4, kick };
      }
      
      // Safe distance from boundary - can move more freely
      // If we're too close to goal, move forward slightly
      if (distanceFromGoal < desiredDistanceFromGoal - 10) {
        // Only move forward if it won't take us too far
        const forwardSpeed = 0.2; // Reduced speed
        // #region agent log
        fetch('http://127.0.0.1:7244/ingest/e757a59f-ea0f-41f7-a3ef-6d61b5471d67',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'defender.js:682',message:'DEFENDING moving forward (too close to goal)',data:{distanceFromGoal,desiredDistanceFromGoal,forwardSpeed},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'D'})}).catch(()=>{});
        // #endregion
        motor1 = forwardSpeed;
        motor2 = forwardSpeed;
        motor3 = forwardSpeed;
        motor4 = forwardSpeed;
        return { motor1, motor2, motor3, motor4, kick };
      }
      
      // At good distance - try to position between ball and goal, but stay within bounds
      // Calculate angle between ball and goal
      const ballAngleRad = (ballAngle * Math_PI) / 180;
      const goalAngleRad = (goalAngle * Math_PI) / 180;
      
      // Direction from goal to ball
      const ballDirX = Math_sin(ballAngleRad);
      const ballDirY = Math_cos(ballAngleRad);
      const goalDirX = Math_sin(goalAngleRad);
      const goalDirY = Math_cos(goalAngleRad);
      
      // Desired position: between ball and goal (closer to goal)
      const desiredDirX = goalDirX * 0.6 + ballDirX * 0.4;
      const desiredDirY = goalDirY * 0.6 + ballDirY * 0.4;
      
      // Normalize
      const dirLen = Math_sqrt(desiredDirX * desiredDirX + desiredDirY * desiredDirY);
      if (dirLen > 0.01) {
        const normalizedX = desiredDirX / dirLen;
        const normalizedY = desiredDirY / dirLen;
        const desiredAngle = Math_atan2(normalizedX, normalizedY) * 180 / Math_PI;
        
        // Turn toward desired position (in place, no forward movement)
        if (Math_abs(desiredAngle) > 15) {
          const turn = clamp(desiredAngle / 40, -1, 1) * 0.4;
          motor1 = -turn;
          motor4 = -turn;
          motor2 = turn;
          motor3 = turn;
        } else {
          // Facing desired direction - maintain position or adjust slightly
          if (distanceFromGoal > desiredDistanceFromGoal + 5) {
            // Too far - move back slightly
            motor1 = -0.3;
            motor2 = -0.3;
            motor3 = -0.3;
            motor4 = -0.3;
          } else if (distanceFromGoal < desiredDistanceFromGoal - 5) {
            // Too close - move forward slightly (only if safe)
            if (distanceFromGoal < SAFE_DISTANCE_THRESHOLD) {
              // #region agent log
              fetch('http://127.0.0.1:7244/ingest/e757a59f-ea0f-41f7-a3ef-6d61b5471d67',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'defender.js:737',message:'DEFENDING moving forward (adjusting position)',data:{distanceFromGoal,desiredDistanceFromGoal,SAFE_DISTANCE_THRESHOLD},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'E'})}).catch(()=>{});
              // #endregion
              motor1 = 0.2;
              motor2 = 0.2;
              motor3 = 0.2;
              motor4 = 0.2;
            } else {
              // Too close to boundary - don't move forward
              // #region agent log
              fetch('http://127.0.0.1:7244/ingest/e757a59f-ea0f-41f7-a3ef-6d61b5471d67',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'defender.js:745',message:'DEFENDING blocked forward movement (near boundary)',data:{distanceFromGoal,SAFE_DISTANCE_THRESHOLD},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'F'})}).catch(()=>{});
              // #endregion
              motor1 = 0;
              motor2 = 0;
              motor3 = 0;
              motor4 = 0;
            }
          } else {
            // Good position - minimal side movement to track ball (no forward movement)
            const sideMovement = clamp(ballAngle / 60, -0.15, 0.15);
            motor1 = sideMovement;
            motor2 = -sideMovement;
            motor3 = sideMovement;
            motor4 = -sideMovement;
          }
        }
      } else {
        // Default: maintain position (no movement)
        motor1 = 0;
        motor2 = 0;
        motor3 = 0;
        motor4 = 0;
      }
    } else if (ownGoal.visible) {
      // Only goal visible - maintain position near goal (30-40cm)
      const desiredDistance = 35;
      const SAFE_DISTANCE_THRESHOLD = MAX_DISTANCE_FROM_GOAL - 5; // 45cm
      
      if (distanceFromGoal > SAFE_DISTANCE_THRESHOLD) {
        // Too close to boundary - only back up
        const goalAngle = ownGoal.angle_deg;
        if (Math_abs(goalAngle) > 20) {
          const turn = clamp(goalAngle / 40, -1, 1) * 0.5;
          motor1 = -turn - 0.5;
          motor4 = -turn - 0.5;
          motor2 = turn - 0.5;
          motor3 = turn - 0.5;
        } else {
          motor1 = -0.6;
          motor2 = -0.6;
          motor3 = -0.6;
          motor4 = -0.6;
        }
      } else if (distanceFromGoal > desiredDistance + 5) {
        // Too far - move back
        const goalAngle = ownGoal.angle_deg;
        if (Math_abs(goalAngle) > 20) {
          const turn = clamp(goalAngle / 40, -1, 1) * 0.4;
          motor1 = -turn - 0.3;
          motor4 = -turn - 0.3;
          motor2 = turn - 0.3;
          motor3 = turn - 0.3;
        } else {
          motor1 = -0.4;
          motor2 = -0.4;
          motor3 = -0.4;
          motor4 = -0.4;
        }
      } else if (distanceFromGoal < desiredDistance - 5) {
        // Too close - move forward slightly (only if safe)
        if (distanceFromGoal < SAFE_DISTANCE_THRESHOLD) {
          motor1 = 0.2;
          motor2 = 0.2;
          motor3 = 0.2;
          motor4 = 0.2;
        } else {
          // Too close to boundary - don't move forward
          motor1 = 0;
          motor2 = 0;
          motor3 = 0;
          motor4 = 0;
        }
      } else {
        // Good position - turn to search for ball (in place)
        const turnSpeed = 0.3;
        motor1 = -turnSpeed;
        motor4 = -turnSpeed;
        motor2 = turnSpeed;
        motor3 = turnSpeed;
      }
    } else {
      // No goal visible - back up and search (don't move forward)
      const turnSpeed = 0.4;
      const backSpeed = -0.3;
      motor1 = backSpeed - turnSpeed;
      motor4 = backSpeed - turnSpeed;
      motor2 = backSpeed + turnSpeed;
      motor3 = backSpeed + turnSpeed;
    }
    
    // #region agent log
    fetch('http://127.0.0.1:7244/ingest/e757a59f-ea0f-41f7-a3ef-6d61b5471d67',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'defender.js:827',message:'DEFENDING motors set',data:{motor1,motor2,motor3,motor4,distanceFromGoal,MAX_DISTANCE_FROM_GOAL},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'G'})}).catch(()=>{});
    // #endregion
    
    return { motor1, motor2, motor3, motor4, kick };
  }
  
  // ============================================================
  // STATE: DEFLECTING (Push ball toward opponent goal while staying within 50cm of own goal)
  // ============================================================
  if (currentState === STATE.DEFLECTING) {
    // Set target for display
    currentTarget = 'ball';
    
    // If ball lost or too far, transition back to DEFENDING
    // Use a larger threshold (70cm) to prevent premature exit when ball is slightly out of range
    // #region agent log
    fetch('http://127.0.0.1:7244/ingest/e757a59f-ea0f-41f7-a3ef-6d61b5471d67',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'defender.js:952',message:'DEFLECTING exit check',data:{ballVisible:ball.visible,ballDist:ball.visible ? ball.distance : null,willExit:!ball.visible || (ball.visible && ball.distance > 70)},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'J'})}).catch(()=>{});
    // #endregion
    if (!ball.visible || ball.distance > 70) {
      // #region agent log
      fetch('http://127.0.0.1:7244/ingest/e757a59f-ea0f-41f7-a3ef-6d61b5471d67',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'defender.js:955',message:'DEFLECTING exiting to DEFENDING',data:{ballVisible:ball.visible,ballDist:ball.visible ? ball.distance : null,exitReason:!ball.visible ? 'ballLost' : 'ballTooFar'},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'K'})}).catch(()=>{});
      // #endregion
      currentState = STATE.DEFENDING;
      return { motor1, motor2, motor3, motor4, kick };
    }
    
    const distanceFromGoal = ownGoal.visible ? ownGoal.distance : 999;
    const ballAngle = ball.angle_deg;
    const ballDist = ball.distance;
    
    // #region agent log
    fetch('http://127.0.0.1:7244/ingest/e757a59f-ea0f-41f7-a3ef-6d61b5471d67',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'defender.js:862',message:'DEFLECTING state entry',data:{distanceFromGoal,MAX_DISTANCE_FROM_GOAL,ballDist},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'K'})}).catch(()=>{});
    // #endregion
    
    // In DEFLECTING state, we prioritize deflecting the ball toward opponent goal
    // We can be outside 50cm radius, but should try to stay within bounds when possible
    
    // Calculate direction to push ball (toward opponent goal)
    const opponentGoalAngle = opponentGoal.visible ? opponentGoal.angle_deg : null;
    const opponentGoalDist = opponentGoal.visible ? opponentGoal.distance : null;
    
    // Safety threshold - if we're very far from goal (>60cm), try to move back while deflecting
    // But don't exit DEFLECTING state - we need to deflect the ball
    const VERY_FAR_THRESHOLD = 60; // cm
    
    // If very far from goal (>60cm), prioritize returning to goal while deflecting
    if (distanceFromGoal > VERY_FAR_THRESHOLD && ownGoal.visible) {
      const goalAngle = ownGoal.angle_deg;
      // Move backward more strongly to return to goal area
      const backSpeed = -0.5; // Strong backward speed
      
      // #region agent log
      fetch('http://127.0.0.1:7244/ingest/e757a59f-ea0f-41f7-a3ef-6d61b5471d67',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'defender.js:898',message:'DEFLECTING very far from goal (>60cm)',data:{distanceFromGoal,VERY_FAR_THRESHOLD,ballDist,ballAngle,goalAngle},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'P'})}).catch(()=>{});
      // #endregion
      
      if (Math_abs(ballAngle) > 25) {
        // Turn toward ball first, but with strong backward bias
        const turn = clamp(ballAngle / 40, -1, 1) * 0.3;
        motor1 = backSpeed - turn;
        motor4 = backSpeed - turn;
        motor2 = backSpeed + turn;
        motor3 = backSpeed + turn;
      } else {
        // Ball is in front - try to deflect while backing up strongly
        // Prioritize returning to goal over pushing ball forward
        let pushAngle = ballAngle;
        if (opponentGoal.visible && opponentGoalAngle !== null) {
          pushAngle = ballAngle * 0.3 + opponentGoalAngle * 0.7;
        }
        const steer = clamp(pushAngle / 50, -0.15, 0.15); // Small steer
        motor1 = backSpeed - steer;
        motor4 = backSpeed - steer;
        motor2 = backSpeed + steer;
        motor3 = backSpeed + steer;
        
        // Kick when very close to ball (even while backing up)
        if (ballDist < 15) {
          kick = true;
        }
      }
      return { motor1, motor2, motor3, motor4, kick };
    }
    
    // Within reasonable distance - normal deflection behavior
    const SAFE_DISTANCE_THRESHOLD = MAX_DISTANCE_FROM_GOAL - 5; // 45cm
    
    // If close to boundary, prefer backing up slightly while deflecting
    if (distanceFromGoal > SAFE_DISTANCE_THRESHOLD && ownGoal.visible) {
      const goalAngle = ownGoal.angle_deg;
      // Small backward bias while deflecting
      const backBias = -0.2;
      
      if (Math_abs(ballAngle) > 25) {
        const turn = clamp(ballAngle / 40, -1, 1) * 0.5;
        motor1 = backBias - turn;
        motor4 = backBias - turn;
        motor2 = backBias + turn;
        motor3 = backBias + turn;
      } else {
        // Push ball toward opponent goal, but prioritize staying within bounds
        // When near boundary, use minimal forward movement or even backward movement
        let pushAngle = ballAngle;
        if (opponentGoal.visible && opponentGoalAngle !== null) {
          pushAngle = ballAngle * 0.4 + opponentGoalAngle * 0.6;
        }
        
        // #region agent log
        fetch('http://127.0.0.1:7244/ingest/e757a59f-ea0f-41f7-a3ef-6d61b5471d67',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'defender.js:946',message:'DEFLECTING near boundary (45-60cm)',data:{distanceFromGoal,SAFE_DISTANCE_THRESHOLD,ballDist,ballAngle,pushAngle},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'N'})}).catch(()=>{});
        // #endregion
        
        // When near boundary, use very small forward speed or even backward
        const forwardSpeed = 0.15; // Very small forward speed
        const steer = clamp(pushAngle / 50, -0.2, 0.2);
        motor1 = forwardSpeed + backBias - steer;
        motor4 = forwardSpeed + backBias - steer;
        motor2 = forwardSpeed + backBias + steer;
        motor3 = forwardSpeed + backBias + steer;
        
        if (ballDist < 20) {
          kick = true;
        }
      }
      return { motor1, motor2, motor3, motor4, kick };
    }
    
    // Within safe bounds (<45cm) - normal deflection behavior
    // Push ball toward opponent goal while staying within bounds
    // Strategy: Turn toward ball, then push it in the direction of opponent goal
    
    // #region agent log
    fetch('http://127.0.0.1:7244/ingest/e757a59f-ea0f-41f7-a3ef-6d61b5471d67',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'defender.js:965',message:'DEFLECTING within safe bounds',data:{distanceFromGoal,MAX_DISTANCE_FROM_GOAL,ballDist,ballAngle},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'O'})}).catch(()=>{});
    // #endregion
    
    if (Math_abs(ballAngle) > 25) {
      // Turn toward ball first
      const turn = clamp(ballAngle / 40, -1, 1) * 0.6;
      motor1 = -turn;
      motor4 = -turn;
      motor2 = turn;
      motor3 = turn;
    } else {
      // Ball is in front - push it toward opponent goal
      // Calculate desired push direction (toward opponent goal)
      let pushAngle = ballAngle; // Default: push straight ahead
      
      if (opponentGoal.visible && opponentGoalAngle !== null) {
        // Try to push ball toward opponent goal
        // Blend ball direction with opponent goal direction (more weight on opponent goal)
        pushAngle = ballAngle * 0.4 + opponentGoalAngle * 0.6;
      }
      
      // Move forward to push ball, but limit speed based on distance from own goal
      // Even within safe bounds, don't move too fast forward
      const speedMultiplier = Math_max(0.4, 1 - (distanceFromGoal / MAX_DISTANCE_FROM_GOAL) * 0.6);
      const forwardSpeed = 0.4 * speedMultiplier; // Reduced max speed
      
      // Steer toward push direction
      const steer = clamp(pushAngle / 50, -0.3, 0.3);
      
      motor1 = forwardSpeed - steer;
      motor4 = forwardSpeed - steer;
      motor2 = forwardSpeed + steer;
      motor3 = forwardSpeed + steer;
      
      // Kick when very close to ball
      if (ballDist < 20) {
        kick = true;
      }
    }
    
    return { motor1, motor2, motor3, motor4, kick };
  }
  
  return { motor1, motor2, motor3, motor4, kick };
}
