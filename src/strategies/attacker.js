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
var resetDistanceMoved = 0; // Track distance moved toward target goal during RESET_POSITION (cm)
var resetInitialDistance = null; // Initial distance to goal when entering RESET_POSITION
var resetRotationAccumulated = 0; // Track accumulated rotation during RESET_POSITION (degrees)
var resetLastHeading = null; // Track last heading to calculate rotation
var resetStuckCount = 0; // Count consecutive calls without movement
var resetCurrentDirection = -1; // -1 = backward, 1 = forward
var resetLastSwitchTime = 0; // Time when we last switched direction
const RESET_STUCK_THRESHOLD = 20; // Number of calls without movement before switching direction
const RESET_MIN_SPEED_THRESHOLD = 2; // Minimum speed (cm/s) to count as moving
const RESET_SWITCH_COOLDOWN_MS = 2000; // Minimum time between direction switches (ms)

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

// Mental map / Odometry system
// Track goal positions in robot-relative coordinates (polar: distance, angle)
// Establish fixed coordinate system based on goal observations
var mentalMap = {
  blueGoal: { 
    distance: null, 
    angle_deg: null, 
    lastSeen: 0, 
    confidence: 0,
    worldX: null,  // Fixed world X position (cm) - locked when coordinate system established
    worldY: null   // Fixed world Y position (cm) - locked when coordinate system established
  },
  yellowGoal: { 
    distance: null, 
    angle_deg: null, 
    lastSeen: 0, 
    confidence: 0,
    worldX: null,  // Fixed world X position (cm) - locked when coordinate system established
    worldY: null   // Fixed world Y position (cm) - locked when coordinate system established
  },
  lastHeading: null,
  lastPosition: { x: 0, y: 0 }, // Robot position estimate (field-relative, cm)
  fieldCenter: { x: 0, y: 0 }, // Calculated field center
  fieldBounds: { width: 158, height: 219 }, // Field dimensions (cm)
  coordinateSystemEstablished: false // True when goals are locked to fixed positions
};

function strategy(worldState) {
  const { ball, goal_blue, goal_yellow, we_are_blue, bumper_front, bumper_left, bumper_right, 
          line_front, line_left, line_right, line_rear, stuck, t_ms, dt_s, heading_deg, v_est } = worldState;
  
  // Update mental map with current observations and IMU data
  // Convert heading to -180..180 range for consistency
  let normalizedHeading = heading_deg;
  while (normalizedHeading > 180) normalizedHeading -= 360;
  while (normalizedHeading < -180) normalizedHeading += 360;
  
  const headingRad = (normalizedHeading * Math_PI) / 180;
  const headingChange = mentalMap.lastHeading !== null ? normalizedHeading - mentalMap.lastHeading : 0;
  
  // Normalize heading change to -180..180
  let normalizedHeadingChange = headingChange;
  while (normalizedHeadingChange > 180) normalizedHeadingChange -= 360;
  while (normalizedHeadingChange < -180) normalizedHeadingChange += 360;
  
  // Update goal observations in mental map (robot-relative: distance, angle)
  if (goal_blue.visible) {
    // Goal is visible - update directly
    mentalMap.blueGoal.distance = goal_blue.distance;
    mentalMap.blueGoal.angle_deg = goal_blue.angle_deg;
    mentalMap.blueGoal.lastSeen = t_ms;
    mentalMap.blueGoal.confidence = 1.0;
  } else if (mentalMap.blueGoal.distance !== null && mentalMap.lastHeading !== null) {
    // Goal not visible - update using dead reckoning
    // Rotate the stored angle by the heading change
    mentalMap.blueGoal.angle_deg = mentalMap.blueGoal.angle_deg - normalizedHeadingChange;
    
    // Confidence decays over time
    const timeSinceSeen = t_ms - mentalMap.blueGoal.lastSeen;
    mentalMap.blueGoal.confidence = Math_max(0, 1.0 - (timeSinceSeen / 5000)); // Decay over 5 seconds
  }
  
  if (goal_yellow.visible) {
    // Goal is visible - update directly
    mentalMap.yellowGoal.distance = goal_yellow.distance;
    mentalMap.yellowGoal.angle_deg = goal_yellow.angle_deg;
    mentalMap.yellowGoal.lastSeen = t_ms;
    mentalMap.yellowGoal.confidence = 1.0;
  } else if (mentalMap.yellowGoal.distance !== null && mentalMap.lastHeading !== null) {
    // Goal not visible - update using dead reckoning
    mentalMap.yellowGoal.angle_deg = mentalMap.yellowGoal.angle_deg - normalizedHeadingChange;
    
    // Confidence decays over time
    const timeSinceSeen = t_ms - mentalMap.yellowGoal.lastSeen;
    mentalMap.yellowGoal.confidence = Math_max(0, 1.0 - (timeSinceSeen / 5000));
  }
  
  // Establish fixed coordinate system and lock goals to known positions
  // Known goal positions: Blue goal at (0, -113.2), Yellow goal at (0, 113.2)
  const BLUE_GOAL_Y = -113.2; // Blue goal Y position (top/back of field)
  const YELLOW_GOAL_Y = 113.2; // Yellow goal Y position (bottom/front of field)
  const FIELD_LENGTH = 226.4; // Distance between goals (113.2 * 2)
  
  // Step 1: If first goal is seen, establish initial coordinate system
  if (!mentalMap.coordinateSystemEstablished) {
    if (goal_blue.visible) {
      // First time seeing blue goal - establish coordinate system
      // Place blue goal at its known position (back/home goal)
      mentalMap.blueGoal.worldX = 0;
      mentalMap.blueGoal.worldY = BLUE_GOAL_Y;
      mentalMap.coordinateSystemEstablished = true;
      
      // Calculate robot position from blue goal
      const goalAngleRad = (goal_blue.angle_deg * Math_PI) / 180;
      const worldAngleRad = goalAngleRad + headingRad;
      mentalMap.lastPosition.x = mentalMap.blueGoal.worldX - goal_blue.distance * Math_sin(worldAngleRad);
      mentalMap.lastPosition.y = mentalMap.blueGoal.worldY - goal_blue.distance * Math_cos(worldAngleRad);
    } else if (goal_yellow.visible) {
      // First time seeing yellow goal - establish coordinate system
      // Place yellow goal at its known position (front/opponent goal)
      mentalMap.yellowGoal.worldX = 0;
      mentalMap.yellowGoal.worldY = YELLOW_GOAL_Y;
      mentalMap.coordinateSystemEstablished = true;
      
      // Calculate robot position from yellow goal
      const goalAngleRad = (goal_yellow.angle_deg * Math_PI) / 180;
      const worldAngleRad = goalAngleRad + headingRad;
      mentalMap.lastPosition.x = mentalMap.yellowGoal.worldX - goal_yellow.distance * Math_sin(worldAngleRad);
      mentalMap.lastPosition.y = mentalMap.yellowGoal.worldY - goal_yellow.distance * Math_cos(worldAngleRad);
    }
  }
  
  // Step 2: When both goals are visible, lock both to fixed positions and establish field scale
  if (goal_blue.visible && goal_yellow.visible) {
    const blueAngleRad = (goal_blue.angle_deg * Math_PI) / 180;
    const yellowAngleRad = (goal_yellow.angle_deg * Math_PI) / 180;
    
    // Convert robot-relative goal positions to Cartesian
    const blueRelX = goal_blue.distance * Math_sin(blueAngleRad);
    const blueRelY = goal_blue.distance * Math_cos(blueAngleRad);
    const yellowRelX = goal_yellow.distance * Math_sin(yellowAngleRad);
    const yellowRelY = goal_yellow.distance * Math_cos(yellowAngleRad);
    
    // Calculate distance between goals in robot-relative space
    const goalSeparationRel = Math_sqrt(
      (blueRelX - yellowRelX) * (blueRelX - yellowRelX) + (blueRelY - yellowRelY) * (blueRelY - yellowRelY)
    );
    
    // Lock both goals to their fixed positions
    mentalMap.blueGoal.worldX = 0;
    mentalMap.blueGoal.worldY = BLUE_GOAL_Y;
    mentalMap.yellowGoal.worldX = 0;
    mentalMap.yellowGoal.worldY = YELLOW_GOAL_Y;
    mentalMap.coordinateSystemEstablished = true;
    
    // Use triangulation to calculate robot position from both fixed goal positions
    const blueWorldAngleRad = blueAngleRad + headingRad;
    const yellowWorldAngleRad = yellowAngleRad + headingRad;
    
    const robotXFromBlue = mentalMap.blueGoal.worldX - goal_blue.distance * Math_sin(blueWorldAngleRad);
    const robotYFromBlue = mentalMap.blueGoal.worldY - goal_blue.distance * Math_cos(blueWorldAngleRad);
    
    const robotXFromYellow = mentalMap.yellowGoal.worldX - goal_yellow.distance * Math_sin(yellowWorldAngleRad);
    const robotYFromYellow = mentalMap.yellowGoal.worldY - goal_yellow.distance * Math_cos(yellowWorldAngleRad);
    
    // Average the two estimates (triangulation)
    mentalMap.lastPosition.x = (robotXFromBlue + robotXFromYellow) / 2;
    mentalMap.lastPosition.y = (robotYFromBlue + robotYFromYellow) / 2;
  } else if (goal_blue.visible && mentalMap.coordinateSystemEstablished) {
    // Only blue goal visible, but coordinate system is established - use fixed position
    const goalAngleRad = (goal_blue.angle_deg * Math_PI) / 180;
    const worldAngleRad = goalAngleRad + headingRad;
    mentalMap.blueGoal.worldX = 0;
    mentalMap.blueGoal.worldY = BLUE_GOAL_Y;
    
    // Calculate robot position from blue goal using standard triangulation
    mentalMap.lastPosition.x = mentalMap.blueGoal.worldX - goal_blue.distance * Math_sin(worldAngleRad);
    mentalMap.lastPosition.y = mentalMap.blueGoal.worldY - goal_blue.distance * Math_cos(worldAngleRad);
    
    // For defenders seeing their own goal: use angle information to improve X position estimate
    // When goal is behind us, the X position calculation is more sensitive to heading errors
    // Use the fact that goal is at X=0 and the perpendicular component of distance
    if (we_are_blue) {
      // Blue defender seeing own goal (blue goal)
      // Goal is at X=0, so our X offset is the perpendicular distance
      // X = distance * sin(robot-relative angle) when goal is at X=0
      // This is more stable than using world angle when goal is behind
      const absGoalAngle = Math_abs(goal_blue.angle_deg);
      if (absGoalAngle > 45) {
        // Goal is to the side or behind - use perpendicular component for X
        // This reduces sensitivity to heading errors
        const perpX = goal_blue.distance * Math_sin(goalAngleRad);
        // Blend with calculated X position (weighted by angle - more weight when goal is more to the side)
        const angleWeight = Math_min(1.0, (absGoalAngle - 45) / 45); // 0 at 45°, 1 at 90°+
        mentalMap.lastPosition.x = (1 - angleWeight) * mentalMap.lastPosition.x + angleWeight * perpX;
      }
    }
  } else if (goal_yellow.visible && mentalMap.coordinateSystemEstablished) {
    // Only yellow goal visible, but coordinate system is established - use fixed position
    const goalAngleRad = (goal_yellow.angle_deg * Math_PI) / 180;
    const worldAngleRad = goalAngleRad + headingRad;
    mentalMap.yellowGoal.worldX = 0;
    mentalMap.yellowGoal.worldY = YELLOW_GOAL_Y;
    
    // Calculate robot position from yellow goal using standard triangulation
    mentalMap.lastPosition.x = mentalMap.yellowGoal.worldX - goal_yellow.distance * Math_sin(worldAngleRad);
    mentalMap.lastPosition.y = mentalMap.yellowGoal.worldY - goal_yellow.distance * Math_cos(worldAngleRad);
    
    // For defenders seeing their own goal: use angle information to improve X position estimate
    if (!we_are_blue) {
      // Yellow defender seeing own goal (yellow goal)
      const absGoalAngle = Math_abs(goal_yellow.angle_deg);
      if (absGoalAngle > 45) {
        // Goal is to the side or behind - use perpendicular component for X
        const perpX = goal_yellow.distance * Math_sin(goalAngleRad);
        // Blend with calculated X position (weighted by angle)
        const angleWeight = Math_min(1.0, (absGoalAngle - 45) / 45);
        mentalMap.lastPosition.x = (1 - angleWeight) * mentalMap.lastPosition.x + angleWeight * perpX;
      }
    }
  }
  // If coordinate system not established and no goals visible, keep last position estimate
  
  // Calculate field center from mental map
  // Field center is midpoint between goals (in robot-relative coordinates)
  if (mentalMap.blueGoal.distance !== null && mentalMap.yellowGoal.distance !== null) {
    // Convert goal positions to robot-relative coordinates
    // Note: angle_deg is already robot-relative (0° = forward, 90° = right)
    const blueAngleRad = (mentalMap.blueGoal.angle_deg * Math_PI) / 180;
    const yellowAngleRad = (mentalMap.yellowGoal.angle_deg * Math_PI) / 180;
    
    // Calculate goal positions relative to robot (robot at origin, facing forward = +Y)
    const blueGoalRelX = mentalMap.blueGoal.distance * Math_sin(blueAngleRad);
    const blueGoalRelY = mentalMap.blueGoal.distance * Math_cos(blueAngleRad);
    const yellowGoalRelX = mentalMap.yellowGoal.distance * Math_sin(yellowAngleRad);
    const yellowGoalRelY = mentalMap.yellowGoal.distance * Math_cos(yellowAngleRad);
    
    // Field center is midpoint (robot-relative)
    mentalMap.fieldCenter.x = (blueGoalRelX + yellowGoalRelX) / 2;
    mentalMap.fieldCenter.y = (blueGoalRelY + yellowGoalRelY) / 2;
  }
  
  // Update last heading for next iteration
  mentalMap.lastHeading = normalizedHeading;
  
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
  // STATE: RESET_POSITION (Navigate to middle of field using mental map)
  // ============================================================
  if (currentState === STATE.RESET_POSITION) {
    // Ignore all line detection
    ignoreLineDetection = true;
    
    // Set target for display
    currentTarget = null;
    
    // Use mental map to navigate to field center
    // Calculate angle and distance to field center
    let targetAngle = 0;
    let targetDistance = 0;
    let hasValidMap = false;
    
    if (mentalMap.blueGoal.distance !== null && mentalMap.yellowGoal.distance !== null) {
      // We have both goals in memory - calculate center
      const centerRelX = mentalMap.fieldCenter.x;
      const centerRelY = mentalMap.fieldCenter.y;
      targetDistance = Math_sqrt(centerRelX * centerRelX + centerRelY * centerRelY);
      targetAngle = Math_atan2(centerRelX, centerRelY) * 180 / Math_PI;
      hasValidMap = true;
      currentTarget = 'field center (map)';
    } else if (goal_blue.visible && goal_yellow.visible) {
      // Both goals visible - calculate center directly
      const blueAngleRad = (goal_blue.angle_deg * Math_PI) / 180;
      const yellowAngleRad = (goal_yellow.angle_deg * Math_PI) / 180;
      const blueGoalRelX = goal_blue.distance * Math_sin(blueAngleRad);
      const blueGoalRelY = goal_blue.distance * Math_cos(blueAngleRad);
      const yellowGoalRelX = goal_yellow.distance * Math_sin(yellowAngleRad);
      const yellowGoalRelY = goal_yellow.distance * Math_cos(yellowAngleRad);
      
      const centerRelX = (blueGoalRelX + yellowGoalRelX) / 2;
      const centerRelY = (blueGoalRelY + yellowGoalRelY) / 2;
      targetDistance = Math_sqrt(centerRelX * centerRelX + centerRelY * centerRelY);
      targetAngle = Math_atan2(centerRelX, centerRelY) * 180 / Math_PI;
      hasValidMap = true;
      currentTarget = 'field center';
    } else if (mentalMap.blueGoal.distance !== null || mentalMap.yellowGoal.distance !== null) {
      // Only one goal in memory - navigate toward estimated center
      // Field center is roughly halfway between goals
      // If we only see one goal, assume center is ~110cm away from that goal
      const knownGoal = mentalMap.blueGoal.distance !== null ? mentalMap.blueGoal : mentalMap.yellowGoal;
      const knownGoalDist = knownGoal.distance;
      const knownGoalAngle = knownGoal.angle_deg;
      
      // Estimate center as being perpendicular to goal direction
      // Center should be roughly 110cm from goal (half field height)
      targetAngle = knownGoalAngle + (knownGoalAngle > 0 ? -90 : 90);
      targetDistance = Math_abs(knownGoalDist - 110); // Distance to center
      hasValidMap = true;
      currentTarget = 'field center (estimated)';
    }
    
    // Exit condition: must be in midfield (Y ≈ 0) and not on sideline (X reasonable)
    // Only exit when robot is truly in the midfield, not just close to center
    const MIDFIELD_Y_THRESHOLD = 30; // cm - must be within 30cm of midfield line (Y=0)
    const MIDFIELD_X_THRESHOLD = 60; // cm - must be within 60cm of center line (X=0) - not on sideline
    
    // Check if we're in the midfield using world coordinates
    let isInMidfield = false;
    if (mentalMap.coordinateSystemEstablished) {
      // Use world coordinates to check if we're in midfield
      const robotY = mentalMap.lastPosition.y;
      const robotX = Math_abs(mentalMap.lastPosition.x);
      isInMidfield = Math_abs(robotY) < MIDFIELD_Y_THRESHOLD && robotX < MIDFIELD_X_THRESHOLD;
    } else if (hasValidMap && targetDistance < 30) {
      // Fallback: if coordinate system not established, use distance to center
      // But require both goals visible to ensure we're not on sideline
      if (goal_blue.visible && goal_yellow.visible) {
        isInMidfield = true;
      }
    }
    
    if (isInMidfield) {
      ignoreLineDetection = false;
      resetEvents = [];
      resetTargetGoalIsBlue = null;
      resetRotationAccumulated = 0;
      resetLastHeading = null;
      resetDistanceMoved = 0;
      resetInitialDistance = null;
      resetStuckCount = 0;
      resetCurrentDirection = -1;
      resetLastSwitchTime = 0;
      currentState = STATE.ATTACKING;
      return { motor1, motor2, motor3, motor4, kick };
    }
    
    // Strategy: Navigate to field center using mental map
    // PRIORITY 1: If hitting a wall or stuck, move away from it first
    // Check for multiple bumpers (corner situation) - always back up first
    const isStuckOnWall = bumper_front || bumper_left || bumper_right || stuck;
    const multipleBumpers = (bumper_front && (bumper_left || bumper_right)) || (bumper_left && bumper_right);
    
    if (isStuckOnWall || multipleBumpers) {
      // CRITICAL: When stuck on wall(s), always back up first, then turn away
      let backAwayAngle = 180; // Default: straight back
      
      if (multipleBumpers) {
        // Corner situation - back up and turn away from corner
        if (bumper_front && bumper_left) {
          // Front-left corner - back up and turn right
          backAwayAngle = 135; // Back-right
        } else if (bumper_front && bumper_right) {
          // Front-right corner - back up and turn left
          backAwayAngle = -135; // Back-left
        } else if (bumper_left && bumper_right) {
          // Both sides - just back up straight
          backAwayAngle = 180;
        } else {
          // Front + stuck - back up straight
          backAwayAngle = 180;
        }
        currentTarget = 'away from corner';
      } else if (bumper_front || (stuck && Math_abs(heading_deg) < 45)) {
        // Front wall - back up straight
        backAwayAngle = 180;
        currentTarget = 'away from front wall';
      } else if (bumper_left || (stuck && heading_deg > 45 && heading_deg < 135)) {
        // Left wall - back up and turn right
        backAwayAngle = 135; // Back-right
        currentTarget = 'away from left wall';
      } else if (bumper_right || (stuck && (heading_deg > 135 || heading_deg < -135 || (heading_deg < -45 && heading_deg > -135)))) {
        // Right wall - back up and turn left
        backAwayAngle = -135; // Back-left
        currentTarget = 'away from right wall';
      }
      
      // Always move backward when stuck on wall - more aggressive
      const backwardSpeed = -0.7; // Stronger backward speed
      const backAwayAngleRad = (backAwayAngle * Math_PI) / 180;
      const turnSpeed = clamp(Math_sin(backAwayAngleRad) * 0.8, -0.8, 0.8); // Turn component
      
      motor1 = backwardSpeed - turnSpeed;
      motor4 = backwardSpeed - turnSpeed;
      motor2 = backwardSpeed + turnSpeed;
      motor3 = backwardSpeed + turnSpeed;
      
      return { motor1, motor2, motor3, motor4, kick };
    }
    
    // No wall contact - use normal navigation
    if (!hasValidMap) {
      // No valid map - use fallback strategy
      if (goal_blue.visible || goal_yellow.visible) {
        // At least one goal visible - try to get both
        const visibleGoal = goal_blue.visible ? goal_blue : goal_yellow;
        targetAngle = visibleGoal.angle_deg;
        currentTarget = goal_blue.visible ? 'blue goal' : 'yellow goal';
      } else {
        // No goals visible and no map - move backward
        targetAngle = 180;
        currentTarget = 'searching';
      }
    }
    // Otherwise use the targetAngle calculated from mental map above
    
    // Navigate toward target angle
    const absAngle = Math_abs(targetAngle);
    
    // If target is behind (>90° or <-90°), move backward while turning
    if (absAngle > 90) {
      // Move backward while turning toward target
      const turnSpeed = clamp(targetAngle / 60, -1, 1) * 0.6;
      const backwardSpeed = -0.5; // Negative = backward
      motor1 = backwardSpeed - turnSpeed;
      motor4 = backwardSpeed - turnSpeed;
      motor2 = backwardSpeed + turnSpeed;
      motor3 = backwardSpeed + turnSpeed;
    } else if (absAngle > 15) {
      // Target is to the side - turn while moving forward
      const turnSpeed = clamp(targetAngle / 50, -1, 1) * 0.6;
      const forwardSpeed = 0.5;
      motor1 = forwardSpeed - turnSpeed;
      motor4 = forwardSpeed - turnSpeed;
      motor2 = forwardSpeed + turnSpeed;
      motor3 = forwardSpeed + turnSpeed;
    } else {
      // Target is aligned - move straight forward
      const forwardSpeed = 0.7;
      motor1 = forwardSpeed;
      motor2 = forwardSpeed;
      motor3 = forwardSpeed;
      motor4 = forwardSpeed;
    }
    
    return { motor1, motor2, motor3, motor4, kick };
  }
  
  // ============================================================
  // LINE DETECTION (Check for line crossing - triggers RESET_POSITION state)
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
      
      // If sensor goes to 0 (off) while still in memory, trigger RESET_POSITION state
      if (!sensor.value && memory.active) {
        // Sensor went off before direction changed - line was crossed
        // Transition directly to RESET_POSITION state
        memory.active = false;
        memory.direction = null;
        
        // Record uncrossing event
        resetEvents.push({ time: t_ms, type: 'uncrossing' });
        // Remove events older than window
        resetEvents = resetEvents.filter(e => t_ms - e.time < RESET_EVENT_WINDOW_MS);
        
        // Transition to RESET_POSITION state
        currentState = STATE.RESET_POSITION;
        ignoreLineDetection = true;
        resetRotationAccumulated = 0;
        resetLastHeading = null;
        resetDistanceMoved = 0;
        resetInitialDistance = null;
        resetStuckCount = 0;
        resetCurrentDirection = -1;
        resetLastSwitchTime = 0;
        
        return { motor1, motor2, motor3, motor4, kick };
      }
    }
    
    // Update last line state
    lastLineState = { front: line_front, left: line_left, right: line_right, rear: line_rear };
  }
  
  // Check if we just became stuck - transition to RESET_POSITION
  if (currentState !== STATE.RESET_POSITION && (stuck || bumper_front || bumper_left || bumper_right)) {
    // Record stuck event
    resetEvents.push({ time: t_ms, type: 'stuck' });
    // Remove events older than window
    resetEvents = resetEvents.filter(e => t_ms - e.time < RESET_EVENT_WINDOW_MS);
    
    // Transition to RESET_POSITION
    currentState = STATE.RESET_POSITION;
    ignoreLineDetection = true;
    resetRotationAccumulated = 0;
    resetLastHeading = null;
    resetDistanceMoved = 0;
    resetInitialDistance = null;
    resetStuckCount = 0;
    resetCurrentDirection = -1;
    resetLastSwitchTime = 0;
    return { motor1, motor2, motor3, motor4, kick };
  }
  
  // Ensure line detection is enabled for normal states (unless explicitly disabled above)
  if (currentState !== STATE.RESET_POSITION) {
    ignoreLineDetection = false;
  }
  
  // ============================================================
  // GLOBAL CHECK: RESET_POSITION after 3+ uncrossing events
  // ============================================================
  // Check if we should enter RESET_POSITION due to multiple line crossings
  // This check runs in all states (except RESET_POSITION itself) to catch cases where
  // we accumulated multiple line crossing events
  if (currentState !== STATE.RESET_POSITION) {
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
      resetInitialDistance = null;
      resetStuckCount = 0;
      resetCurrentDirection = -1;
      resetLastSwitchTime = 0;
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
