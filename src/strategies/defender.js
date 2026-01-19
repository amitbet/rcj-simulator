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
  ESTABLISH_MAP: 'ESTABLISH_MAP',
  SEARCHING: 'SEARCHING',
  DEFENDING: 'DEFENDING',
  DEFLECTING: 'DEFLECTING',
  RESET_POSITION: 'RESET_POSITION'
};

// Current state - start with ESTABLISH_MAP if coordinate system not established
var currentState = STATE.ESTABLISH_MAP;

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
var resetStuckCount = 0; // Count consecutive calls without movement
var resetCurrentDirection = -1; // -1 = backward, 1 = forward
var resetLastSwitchTime = 0; // Time when we last switched direction
const RESET_STUCK_THRESHOLD = 20; // Number of calls without movement before switching direction
const RESET_MIN_SPEED_THRESHOLD = 2; // Minimum speed (cm/s) to count as moving
const RESET_SWITCH_COOLDOWN_MS = 2000; // Minimum time between direction switches (ms)

// Initial coordinate system establishment (only at match start)
var initialMapEstablished = false; // True once we've done the initial forward/back movement
var establishMapStartPosition = null; // Starting Y position when beginning map establishment
var establishMapSawOpponentGoal = false; // True once we've seen the opponent goal

// Track if we just entered DEFENDING state to return to defense line
var defendingJustEntered = false; // True when we first enter DEFENDING state

// Search pattern state tracking
var searchPhase = 0; // 0 = forward 20cm, 1 = strafe 50cm towards midfield, 2 = forward 20cm, 3 = strafe 50cm away from midfield
var searchPhaseStartPos = { x: 0, y: 0 }; // Starting position for current phase
var searchPhaseStartTime = 0; // Time when current phase started
const SEARCH_FORWARD_DISTANCE = 20; // cm to move forward in phases 0 and 2
const SEARCH_STRAFE_DISTANCE = 50; // cm to strafe in phases 1 and 3

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
  
  // Debug: Log current state
  if (currentState === STATE.DEFENDING) {
    console.log('[STRATEGY] Defender strategy called, state:', currentState, 'we_are_blue:', we_are_blue);
  }
  
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
  
  // Update goal positions in mental map
  if (goal_blue.visible) {
    // Goal is visible - update directly
    mentalMap.blueGoal.distance = goal_blue.distance;
    mentalMap.blueGoal.angle_deg = goal_blue.angle_deg;
    mentalMap.blueGoal.lastSeen = t_ms;
    mentalMap.blueGoal.confidence = 1.0;
  } else if (mentalMap.blueGoal.distance !== null && mentalMap.lastHeading !== null) {
    // Goal not visible - update using dead reckoning
    mentalMap.blueGoal.angle_deg = mentalMap.blueGoal.angle_deg - normalizedHeadingChange;
    const timeSinceSeen = t_ms - mentalMap.blueGoal.lastSeen;
    mentalMap.blueGoal.confidence = Math_max(0, 1.0 - (timeSinceSeen / 5000));
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
    
    // Calculate robot position from yellow goal
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
  
  // Calculate field center from mental map (robot-relative coordinates)
  if (mentalMap.blueGoal.distance !== null && mentalMap.yellowGoal.distance !== null) {
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
  // STATE: ESTABLISH_MAP (Move forward until seeing opponent goal, then back to start - only at match start)
  // ============================================================
  if (currentState === STATE.ESTABLISH_MAP) {
    // CRITICAL: If coordinate system is already established (from physics data) and we're far from start,
    // we're not at match start - exit ESTABLISH_MAP immediately
    if (mentalMap.coordinateSystemEstablished) {
      if (establishMapStartPosition === null) {
        // First time in this state - record current position as start
        establishMapStartPosition = mentalMap.lastPosition.y;
      }
      
      // If we're very far from where we started (more than 50cm), we're not at match start
      // Exit ESTABLISH_MAP and go to DEFENDING
      const distanceFromStart = Math_abs(mentalMap.lastPosition.y - establishMapStartPosition);
      if (distanceFromStart > 50) {
        // We're far from start - not at match start, exit ESTABLISH_MAP
        initialMapEstablished = true;
        currentState = STATE.DEFENDING;
        defendingJustEntered = true; // Flag to return to defense line
        currentTarget = null;
        establishMapStartPosition = null;
        establishMapSawOpponentGoal = false;
        // Fall through to DEFENDING
      } else if (establishMapSawOpponentGoal) {
        // We've seen opponent goal and are backing up
        if (distanceFromStart < 10) {
        // Back at start position - done establishing map
        initialMapEstablished = true;
        currentState = STATE.DEFENDING;
        defendingJustEntered = true; // Flag to return to defense line
        currentTarget = null;
        establishMapStartPosition = null;
        establishMapSawOpponentGoal = false;
        // Fall through to DEFENDING
        } else {
          // Still backing up to start position
          const backwardSpeed = -0.5;
          motor1 = backwardSpeed;
          motor2 = backwardSpeed;
          motor3 = backwardSpeed;
          motor4 = backwardSpeed;
          currentTarget = 'backing to start';
          return { motor1, motor2, motor3, motor4, kick };
        }
      } else if (opponentGoal.visible) {
        // Coordinate system established and we see opponent goal - mark it and back up
        establishMapSawOpponentGoal = true;
        const backwardSpeed = -0.5;
        motor1 = backwardSpeed;
        motor2 = backwardSpeed;
        motor3 = backwardSpeed;
        motor4 = backwardSpeed;
        currentTarget = 'backing to start';
        return { motor1, motor2, motor3, motor4, kick };
      } else {
        // Coordinate system established but no opponent goal visible - exit ESTABLISH_MAP
        initialMapEstablished = true;
        currentState = STATE.DEFENDING;
        defendingJustEntered = true; // Flag to return to defense line
        currentTarget = null;
        establishMapStartPosition = null;
        establishMapSawOpponentGoal = false;
        // Fall through to DEFENDING
      }
    } else {
      // Coordinate system not yet established - normal ESTABLISH_MAP behavior
      // Record starting position when entering this state
      if (establishMapStartPosition === null) {
        establishMapStartPosition = mentalMap.lastPosition.y;
      }
      
      // If we see opponent goal, mark it and start backing up immediately
      if (opponentGoal.visible) {
        establishMapSawOpponentGoal = true;
        // Back up to starting position
        const backwardSpeed = -0.5;
        motor1 = backwardSpeed;
        motor2 = backwardSpeed;
        motor3 = backwardSpeed;
        motor4 = backwardSpeed;
        currentTarget = 'backing to start';
        return { motor1, motor2, motor3, motor4, kick };
      }
      // If we don't see opponent goal yet, move forward slowly
      else {
        // Use slower forward speed to avoid overshooting
        const forwardSpeed = 0.3; // Reduced from 0.6
        motor1 = forwardSpeed;
        motor2 = forwardSpeed;
        motor3 = forwardSpeed;
        motor4 = forwardSpeed;
        currentTarget = 'opponent goal (establishing map)';
        return { motor1, motor2, motor3, motor4, kick };
      }
    }
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
      // We have both goals in memory - calculate center (robot-relative)
      const centerRelX = mentalMap.fieldCenter.x;
      const centerRelY = mentalMap.fieldCenter.y;
      targetDistance = Math_sqrt(centerRelX * centerRelX + centerRelY * centerRelY);
      targetAngle = Math_atan2(centerRelX, centerRelY) * 180 / Math_PI;
      hasValidMap = true;
      currentTarget = 'field center (map)';
    } else if (goal_blue.visible && goal_yellow.visible) {
      // Both goals visible - calculate center directly (robot-relative)
      const blueAngleRad = (goal_blue.angle_deg * Math_PI) / 180;
      const yellowAngleRad = (goal_yellow.angle_deg * Math_PI) / 180;
      // Goal positions relative to robot (robot-relative coordinates)
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
      const knownGoal = mentalMap.blueGoal.distance !== null ? mentalMap.blueGoal : mentalMap.yellowGoal;
      const knownGoalDist = knownGoal.distance;
      const knownGoalAngle = knownGoal.angle_deg;
      
      // Perpendicular to goal direction (toward center)
      targetAngle = knownGoalAngle + (knownGoalAngle > 0 ? -90 : 90);
      targetDistance = Math_abs(knownGoalDist - 110);
      hasValidMap = true;
      currentTarget = 'field center (estimated)';
    }
    
    // Exit condition: close to field center (within 30cm)
    const CENTER_THRESHOLD = 30; // cm
    if (hasValidMap && targetDistance < CENTER_THRESHOLD) {
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
      currentState = STATE.DEFENDING;
      defendingJustEntered = true; // Flag to return to defense line
      return { motor1, motor2, motor3, motor4, kick };
    }
    
    // Strategy: Navigate to field center using mental map
    // PRIORITY 1: If hitting a wall, move away from it first
    if (!hasValidMap) {
      // No valid map - use fallback strategy
      if (bumper_left || (stuck && heading_deg > 45 && heading_deg < 135)) {
        targetAngle = 90;
        currentTarget = 'away from left wall';
      } else if (bumper_right || (stuck && (heading_deg > 135 || heading_deg < -135 || (heading_deg < -45 && heading_deg > -135)))) {
        targetAngle = -90;
        currentTarget = 'away from right wall';
      } else if (bumper_front || (stuck && Math_abs(heading_deg) < 45)) {
        targetAngle = 180;
        currentTarget = 'away from front wall';
      } else if (goal_blue.visible || goal_yellow.visible) {
        const visibleGoal = goal_blue.visible ? goal_blue : goal_yellow;
        targetAngle = visibleGoal.angle_deg;
        currentTarget = goal_blue.visible ? 'blue goal' : 'yellow goal';
      } else {
        targetAngle = 180;
        currentTarget = 'searching';
      }
    } else if (bumper_left || (stuck && heading_deg > 45 && heading_deg < 135)) {
      targetAngle = 90;
      currentTarget = 'away from left wall';
    } else if (bumper_right || (stuck && (heading_deg > 135 || heading_deg < -135 || (heading_deg < -45 && heading_deg > -135)))) {
      targetAngle = -90;
      currentTarget = 'away from right wall';
    } else if (bumper_front || (stuck && Math_abs(heading_deg) < 45)) {
      targetAngle = 180;
      currentTarget = 'away from front wall';
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
  // STATE: SEARCHING (Pattern-based search when ball not visible)
  // ============================================================
  if (currentState === STATE.SEARCHING) {
    // If ball becomes visible, immediately switch to DEFENDING
    if (ball.visible && ball.angle_deg !== null && ball.angle_deg !== undefined) {
      console.log('[SEARCHING] Ball found, switching to DEFENDING');
      currentState = STATE.DEFENDING;
      defendingJustEntered = true;
      searchPhase = 0; // Reset search pattern
      searchPhaseStartTime = 0;
      // Fall through to DEFENDING state
    } else {
      // Execute search pattern: forward 20cm -> strafe 50cm towards midfield -> forward 20cm -> strafe 50cm away
      currentTarget = 'searching for ball';
      
      // Initialize search if just entered
      if (searchPhase === 0 && searchPhaseStartTime === 0) {
        searchPhaseStartPos.x = mentalMap.lastPosition.x;
        searchPhaseStartPos.y = mentalMap.lastPosition.y;
        searchPhaseStartTime = t_ms;
        console.log('[SEARCHING] Starting search pattern at position:', searchPhaseStartPos.x.toFixed(1), searchPhaseStartPos.y.toFixed(1));
      }
      
      // Calculate distance moved in current phase
      const dx = mentalMap.lastPosition.x - searchPhaseStartPos.x;
      const dy = mentalMap.lastPosition.y - searchPhaseStartPos.y;
      const distanceMoved = Math_sqrt(dx * dx + dy * dy);
      
      // Determine which direction is "towards midfield" in X direction (center line X=0)
      // Strafing moves perpendicular to robot heading (along X axis if robot faces Y axis)
      // If we're on left side (X < 0), towards midfield means increasing X (strafe right, positive sideSpeed)
      // If we're on right side (X > 0), towards midfield means decreasing X (strafe left, negative sideSpeed)
      const towardsMidfieldX = mentalMap.lastPosition.x < 0 ? 1 : -1; // +1 = increase X (strafe right), -1 = decrease X (strafe left)
      
      let phaseComplete = false;
      let targetDistance = 0;
      
      if (searchPhase === 0 || searchPhase === 2) {
        // Forward movement phases (0 and 2)
        targetDistance = SEARCH_FORWARD_DISTANCE;
        phaseComplete = distanceMoved >= SEARCH_FORWARD_DISTANCE;
      } else if (searchPhase === 1) {
        // Strafe towards midfield center (phase 1) - move towards X=0
        targetDistance = SEARCH_STRAFE_DISTANCE;
        // Check if we've moved 50cm in the X direction towards midfield
        const xMovement = mentalMap.lastPosition.x - searchPhaseStartPos.x;
        const xMovementTowardsMidfield = towardsMidfieldX > 0 ? xMovement : -xMovement;
        phaseComplete = xMovementTowardsMidfield >= SEARCH_STRAFE_DISTANCE;
      } else if (searchPhase === 3) {
        // Strafe away from midfield center (phase 3) - move away from X=0
        targetDistance = SEARCH_STRAFE_DISTANCE;
        // Check if we've moved 50cm in the X direction away from midfield
        const xMovement = mentalMap.lastPosition.x - searchPhaseStartPos.x;
        const xMovementAwayFromMidfield = towardsMidfieldX > 0 ? -xMovement : xMovement;
        phaseComplete = xMovementAwayFromMidfield >= SEARCH_STRAFE_DISTANCE;
      }
      
      console.log('[SEARCHING] Phase:', searchPhase, 'Distance moved:', distanceMoved.toFixed(1), 'Target:', targetDistance, 'Complete:', phaseComplete);
      
      // Execute current phase movement
      if (searchPhase === 0 || searchPhase === 2) {
        // Forward movement
        const forwardSpeed = 0.5;
        motor1 = forwardSpeed;
        motor2 = forwardSpeed;
        motor3 = forwardSpeed;
        motor4 = forwardSpeed;
        
        if (phaseComplete) {
          console.log('[SEARCHING] Forward phase complete, moving to next phase');
          searchPhase = (searchPhase + 1) % 4;
          searchPhaseStartPos.x = mentalMap.lastPosition.x;
          searchPhaseStartPos.y = mentalMap.lastPosition.y;
          searchPhaseStartTime = t_ms;
        }
      } else if (searchPhase === 1) {
        // Strafe towards midfield center (X=0)
        // Strafe direction: if towardsMidfieldX > 0, we need to increase X, which means strafe right (positive sideSpeed)
        // If towardsMidfieldX < 0, we need to decrease X, which means strafe left (negative sideSpeed)
        // Determine strafe direction based on which side of field we're on (X coordinate)
        const sideSpeed = towardsMidfieldX > 0 ? 0.6 : -0.6; // Positive = strafe right (increase X), negative = strafe left (decrease X)
        
        motor1 = sideSpeed;   // front-left: + for right, - for left
        motor2 = -sideSpeed;  // front-right: - for right, + for left
        motor3 = sideSpeed;   // back-right: + for right, - for left
        motor4 = -sideSpeed;  // back-left: - for right, + for left
        
        console.log('[SEARCHING] Strafe towards midfield, sideSpeed:', sideSpeed.toFixed(2));
        
        if (phaseComplete) {
          console.log('[SEARCHING] Strafe towards midfield complete, moving to next phase');
          searchPhase = (searchPhase + 1) % 4;
          searchPhaseStartPos.x = mentalMap.lastPosition.x;
          searchPhaseStartPos.y = mentalMap.lastPosition.y;
          searchPhaseStartTime = t_ms;
        }
      } else if (searchPhase === 3) {
        // Strafe away from midfield center (opposite direction from phase 1)
        const sideSpeed = towardsMidfieldX > 0 ? -0.6 : 0.6; // Opposite of phase 1
        
        motor1 = sideSpeed;   // front-left: + for right, - for left
        motor2 = -sideSpeed;  // front-right: - for right, + for left
        motor3 = sideSpeed;   // back-right: + for right, - for left
        motor4 = -sideSpeed;  // back-left: - for right, + for left
        
        console.log('[SEARCHING] Strafe away from midfield, sideSpeed:', sideSpeed.toFixed(2));
        
        if (phaseComplete) {
          console.log('[SEARCHING] Strafe away from midfield complete, restarting pattern');
          searchPhase = 0; // Restart pattern
          searchPhaseStartPos.x = mentalMap.lastPosition.x;
          searchPhaseStartPos.y = mentalMap.lastPosition.y;
          searchPhaseStartTime = t_ms;
        }
      }
      
      return { motor1, motor2, motor3, motor4, kick };
    }
  }
  
  // ============================================================
  // STATE: DEFENDING (Stay on defense line, move sideways to intercept ball)
  // ============================================================
  if (currentState === STATE.DEFENDING) {
    console.log('[DEFENDING] State entered');
    
    // Set target for display
    if (ball.visible) {
      currentTarget = 'ball';
    } else if (ownGoal.visible) {
      currentTarget = we_are_blue ? 'blue goal' : 'yellow goal';
    } else {
      currentTarget = null;
    }
    
    const distanceFromGoal = ownGoal.visible ? ownGoal.distance : 999;
    
    // Defense line distance - stay at this fixed distance from goal
    const DEFENSE_LINE_DISTANCE = 35; // cm from goal
    const DEFENSE_LINE_TOLERANCE = 3; // cm tolerance for maintaining line
    
    console.log('[DEFENDING] Ball visible:', ball.visible, 'Ball angle:', ball.visible ? ball.angle_deg.toFixed(1) : 'N/A', 'Ball distance:', ball.visible ? ball.distance.toFixed(1) : 'N/A');
    console.log('[DEFENDING] Own goal visible:', ownGoal.visible, 'Goal angle:', ownGoal.visible ? ownGoal.angle_deg.toFixed(1) : 'N/A', 'Distance from goal:', ownGoal.visible ? distanceFromGoal.toFixed(1) : 'N/A');
    console.log('[DEFENDING] defendingJustEntered:', defendingJustEntered);
    
    // Check if we just entered DEFENDING - if so, immediately return to defense line
    if (defendingJustEntered) {
      console.log('[DEFENDING] Just entered - returning to defense line');
      defendingJustEntered = false; // Clear flag
      // Force return to defense line
      if (ownGoal.visible) {
        const goalAngle = ownGoal.angle_deg;
        const distanceError = distanceFromGoal - DEFENSE_LINE_DISTANCE;
        const adjustSpeed = clamp(distanceError / 20, -0.6, 0.6); // Stronger adjustment
        
        if (Math_abs(goalAngle) > 20) {
          const turn = clamp(goalAngle / 40, -1, 1) * 0.4;
          motor1 = adjustSpeed - turn;
          motor4 = adjustSpeed - turn;
          motor2 = adjustSpeed + turn;
          motor3 = adjustSpeed + turn;
        } else {
          motor1 = adjustSpeed;
          motor2 = adjustSpeed;
          motor3 = adjustSpeed;
          motor4 = adjustSpeed;
        }
        return { motor1, motor2, motor3, motor4, kick };
      } else {
        // Goal not visible - just turn to find it, then fall through to normal behavior
        const turnSpeed = 0.4;
        motor1 = -turnSpeed;
        motor4 = -turnSpeed;
        motor2 = turnSpeed;
        motor3 = turnSpeed;
        return { motor1, motor2, motor3, motor4, kick };
      }
    }
    
    // Check if ball is close - transition to DEFLECTING if ball is within 30cm
    if (ball.visible && ball.distance < 30) {
      console.log('[DEFENDING] Ball too close, transitioning to DEFLECTING');
      currentState = STATE.DEFLECTING;
      return { motor1, motor2, motor3, motor4, kick };
    }
    
    // PRIORITY: If ball is visible, strafe to intercept it (this is the main defensive behavior)
    // Distance adjustment happens in parallel, not instead of strafing
    if (ball.visible && ball.angle_deg !== null && ball.angle_deg !== undefined) {
      console.log('[DEFENDING] Ball visible - calculating strafe');
      
      // Use the ball's angle to determine strafe direction
      // Ball angle: positive = right, negative = left, 0 = straight ahead
      const ballAngle = ball.angle_deg;
      console.log('[DEFENDING] Ball angle:', ballAngle.toFixed(1), 'Ball distance:', ball.distance.toFixed(1));
      
      // CRITICAL: If ball is behind us (angle > 90 or < -90), don't strafe - we need to turn first
      // Camera data might detect ball behind robot, causing backward movement
      if (Math_abs(ballAngle) > 90) {
        console.log('[DEFENDING] Ball is behind robot (angle > 90°), turning instead of strafing');
        // Turn toward the ball
        const turnSpeed = clamp(ballAngle / 60, -0.5, 0.5);
        motor1 = -turnSpeed;
        motor4 = -turnSpeed;
        motor2 = turnSpeed;
        motor3 = turnSpeed;
        return { motor1, motor2, motor3, motor4, kick };
      }
      
      // Calculate strafe speed - always strafe when ball is visible and in front
      // Make it more responsive and ensure minimum movement
      let sideSpeed = 0;
      
      if (Math_abs(ballAngle) > 5) {
        // Ball is to the side - strafe proportionally
        sideSpeed = clamp(ballAngle / 30, -0.7, 0.7); // More aggressive strafing
        console.log('[DEFENDING] Ball to side, sideSpeed:', sideSpeed.toFixed(2));
      } else {
        // Ball nearly straight ahead - strafe slowly based on which side
        sideSpeed = ballAngle >= 0 ? 0.3 : -0.3; // Always strafe when ball visible
        console.log('[DEFENDING] Ball straight ahead, sideSpeed:', sideSpeed.toFixed(2));
      }
      
      // Move sideways ONLY (strafing) - no forward/backward component, no rotation
      // Pattern from attacker.js: strafe(speed) = setMotors(speed, -speed, speed, -speed)
      // This creates diagonal movement: front-left and back-right forward, front-right and back-left backward
      motor1 = sideSpeed;   // front-left: + for right, - for left
      motor2 = -sideSpeed;  // front-right: - for right, + for left
      motor3 = sideSpeed;   // back-right: + for right, - for left
      motor4 = -sideSpeed;  // back-left: - for right, + for left
      
      console.log('[DEFENDING] Strafing motors:', { motor1: motor1.toFixed(2), motor2: motor2.toFixed(2), motor3: motor3.toFixed(2), motor4: motor4.toFixed(2) });
      
      // CRITICAL: Don't add forward/backward adjustment while strafing - it breaks the strafe pattern!
      // The physics engine detects strafing by checking if motors follow the pattern (speed, -speed, speed, -speed)
      // Adding the same value to all motors breaks this pattern and causes it to fall back to differential drive
      // Instead, we should only strafe when ball is visible, and adjust distance separately when ball is not visible
      
      console.log('[DEFENDING] Final motors:', { motor1: motor1.toFixed(2), motor2: motor2.toFixed(2), motor3: motor3.toFixed(2), motor4: motor4.toFixed(2) });
      return { motor1, motor2, motor3, motor4, kick };
    }
    
    // No ball visible OR ball angle is invalid - switch to SEARCHING
    if (!ball.visible || ball.angle_deg === null || ball.angle_deg === undefined) {
      console.log('[DEFENDING] Ball not visible, switching to SEARCHING');
      currentState = STATE.SEARCHING;
      searchPhase = 0; // Start search pattern from beginning
      searchPhaseStartTime = 0; // Reset phase start time
      // Fall through to SEARCHING state (will be handled in next iteration)
      // For now, return to maintain position
      if (!ownGoal.visible) {
        // Goal not visible - turn to find it (but don't go backward!)
        console.log('[DEFENDING] Goal not visible - turning in place to find it');
        const turnSpeed = 0.4;
        motor1 = -turnSpeed;
        motor4 = -turnSpeed;
        motor2 = turnSpeed;
        motor3 = turnSpeed;
        return { motor1, motor2, motor3, motor4, kick };
      } else {
        // Goal visible but no ball - maintain defense line position briefly
        console.log('[DEFENDING] Goal visible, no ball - maintaining position before search');
        const distanceError = distanceFromGoal - DEFENSE_LINE_DISTANCE;
        if (Math_abs(distanceError) > DEFENSE_LINE_TOLERANCE) {
          const goalAngle = ownGoal.angle_deg;
          if (Math_abs(goalAngle) < 45) {
            const adjustSpeed = clamp(distanceError / 30, -0.3, 0.3);
            motor1 = adjustSpeed;
            motor2 = adjustSpeed;
            motor3 = adjustSpeed;
            motor4 = adjustSpeed;
          } else {
            const turnSpeed = clamp(goalAngle / 50, -0.4, 0.4);
            motor1 = -turnSpeed;
            motor4 = -turnSpeed;
            motor2 = turnSpeed;
            motor3 = turnSpeed;
          }
        } else {
          motor1 = 0;
          motor2 = 0;
          motor3 = 0;
          motor4 = 0;
        }
        return { motor1, motor2, motor3, motor4, kick };
      }
    } else {
      console.log('[DEFENDING] Ball visible but angle invalid:', ball.angle_deg);
      // Ball angle invalid - still switch to searching
      currentState = STATE.SEARCHING;
      searchPhase = 0;
      searchPhaseStartTime = 0;
      // Return current position
      motor1 = 0;
      motor2 = 0;
      motor3 = 0;
      motor4 = 0;
      return { motor1, motor2, motor3, motor4, kick };
    }
  }
  
  // ============================================================
  // STATE: DEFLECTING (Go towards ball, kick it, then return to defense line)
  // ============================================================
  if (currentState === STATE.DEFLECTING) {
    // Set target for display
    currentTarget = 'ball';
    
    const distanceFromGoal = ownGoal.visible ? ownGoal.distance : 999;
    const ballAngle = ball.angle_deg;
    const ballDist = ball.distance;
    
    // Defense line distance - where we should return to after deflecting
    const DEFENSE_LINE_DISTANCE = 35; // cm from goal
    
    // If ball lost or too far, return to defense line and switch to DEFENDING
    if (!ball.visible || ball.distance > 50) {
      // Return to defense line
      if (ownGoal.visible) {
        const goalAngle = ownGoal.angle_deg;
        const distanceError = distanceFromGoal - DEFENSE_LINE_DISTANCE;
        
        if (Math_abs(distanceError) > 3) {
          // Need to adjust distance to goal
          const adjustSpeed = clamp(distanceError / 20, -0.4, 0.4);
          if (Math_abs(goalAngle) > 20) {
            const turn = clamp(goalAngle / 40, -1, 1) * 0.3;
            motor1 = adjustSpeed - turn;
            motor4 = adjustSpeed - turn;
            motor2 = adjustSpeed + turn;
            motor3 = adjustSpeed + turn;
          } else {
            motor1 = adjustSpeed;
            motor2 = adjustSpeed;
            motor3 = adjustSpeed;
            motor4 = adjustSpeed;
          }
        } else {
          // At defense line - switch to DEFENDING
          currentState = STATE.DEFENDING;
          defendingJustEntered = false; // Already at defense line, no need to return
          return { motor1, motor2, motor3, motor4, kick };
        }
      } else {
        // Goal not visible - back up and turn to find it
        motor1 = -0.5;
        motor2 = -0.5;
        motor3 = -0.5;
        motor4 = -0.5;
        motor1 += 0.3;
        motor4 += 0.3;
        motor2 -= 0.3;
        motor3 -= 0.3;
      }
      return { motor1, motor2, motor3, motor4, kick };
    }
    
    // Check if we should kick - if so, kick and immediately return to defense line
    if (ballDist < 25 && Math_abs(ballAngle) < 30) {
      // Close enough to kick - kick the ball
      kick = true;
      
      // Immediately start returning to defense line
      if (ownGoal.visible) {
        const goalAngle = ownGoal.angle_deg;
        const distanceError = distanceFromGoal - DEFENSE_LINE_DISTANCE;
        
        if (Math_abs(distanceError) > 3) {
          // Need to adjust distance to goal
          const adjustSpeed = clamp(distanceError / 20, -0.4, 0.4);
          if (Math_abs(goalAngle) > 20) {
            const turn = clamp(goalAngle / 40, -1, 1) * 0.3;
            motor1 = adjustSpeed - turn;
            motor4 = adjustSpeed - turn;
            motor2 = adjustSpeed + turn;
            motor3 = adjustSpeed + turn;
          } else {
            motor1 = adjustSpeed;
            motor2 = adjustSpeed;
            motor3 = adjustSpeed;
            motor4 = adjustSpeed;
          }
        } else {
          // At defense line - switch to DEFENDING
          currentState = STATE.DEFENDING;
          defendingJustEntered = false; // Already at defense line, no need to return
          return { motor1, motor2, motor3, motor4, kick };
        }
      } else {
        // Goal not visible - back up and turn to find it
        motor1 = -0.5;
        motor2 = -0.5;
        motor3 = -0.5;
        motor4 = -0.5;
        motor1 += 0.3;
        motor4 += 0.3;
        motor2 -= 0.3;
        motor3 -= 0.3;
      }
      return { motor1, motor2, motor3, motor4, kick };
    }
    
    // Go towards the ball
    if (Math_abs(ballAngle) > 20) {
      // Turn toward ball
      const turn = clamp(ballAngle / 40, -1, 1) * 0.6;
      motor1 = -turn;
      motor4 = -turn;
      motor2 = turn;
      motor3 = turn;
    } else {
      // Move forward toward ball
      const forwardSpeed = 0.5;
      const steer = clamp(ballAngle / 50, -0.2, 0.2);
      motor1 = forwardSpeed - steer;
      motor4 = forwardSpeed - steer;
      motor2 = forwardSpeed + steer;
      motor3 = forwardSpeed + steer;
    }
    
    return { motor1, motor2, motor3, motor4, kick };
  }
  
  return { motor1, motor2, motor3, motor4, kick };
}
