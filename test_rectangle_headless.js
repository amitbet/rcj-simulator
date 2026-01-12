// ============================================================
// Headless Test for Rectangle Movement Pattern
// Runs the strategy using real PhysicsEngine to verify rectangle pattern
// ============================================================

const fs = require('fs');
const path = require('path');

// Use ts-node to run TypeScript directly
require('ts-node').register({
  transpileOnly: true,
  compilerOptions: {
    module: 'commonjs',
    target: 'ES2020',
    moduleResolution: 'node',
    esModuleInterop: true,
    skipLibCheck: true,
    resolveJsonModule: true,
    allowSyntheticDefaultImports: true
  }
});

// Import real PhysicsEngine
const { PhysicsEngine } = require('./src/physics/PhysicsEngine.ts');
const types = require('./src/types/index.ts');
const Team = types.Team;
const RobotRole = types.RobotRole;

// Calculate expected step duration (same as strategy)
function durationForDistanceCm(distanceCm, speed = 0.5) {
  const MAX_SPEED_CM_PER_S = 150;
  const speedCmPerS = speed * MAX_SPEED_CM_PER_S;
  return (distanceCm / speedCmPerS) * 1000; // Convert to ms
}
const FIELD_WIDTH_CM = 158;
const DISTANCE_PERCENT = 0.02;
const DISTANCE_CM = FIELD_WIDTH_CM * DISTANCE_PERCENT; // ~3.16cm
const MOVEMENT_SPEED_STAR = 0.5;
const EXPECTED_STEP_DURATION_MS = durationForDistanceCm(DISTANCE_CM, MOVEMENT_SPEED_STAR);

// Load the strategy code - use rectangle pattern strategy
const strategyCode = fs.readFileSync(path.join(__dirname, 'src/strategies/attacker_rectangle.js'), 'utf-8');

// Create sandboxed strategy function
function createSandboxedStrategy(code) {
  const wrappedCode = `
    "use strict";
    
    // Helper functions available to strategies
    const Math_abs = Math.abs;
    const Math_sin = Math.sin;
    const Math_cos = Math.cos;
    const Math_atan2 = Math.atan2;
    const Math_acos = Math.acos;
    const Math_sqrt = Math.sqrt;
    const Math_min = Math.min;
    const Math_max = Math.max;
    const Math_floor = Math.floor;
    const Math_ceil = Math.ceil;
    const Math_round = Math.round;
    const Math_PI = Math.PI;
    
    ${code}
    
    if (typeof strategy === 'function') {
      return strategy;
    } else {
      throw new Error('Strategy must define a function called "strategy"');
    }
  `;
  
  const factory = new Function(wrappedCode);
  return factory();
}

// Create mock world state
function createWorldState(t_ms, heading_deg) {
  return {
    t_ms,
    dt_s: 0.016,
    heading_deg,
    yaw_rate_dps: 0,
    v_est: 0,
    ball: { visible: false, angle_deg: 0, distance: 0 },
    goal_blue: { visible: false, angle_deg: 0, distance: 0 },
    goal_yellow: { visible: false, angle_deg: 0, distance: 0 },
    bumper_front: false,
    bumper_left: false,
    bumper_right: false,
    line_front: false,
    line_left: false,
    line_right: false,
    line_rear: false,
    stuck: false,
    stuck_confidence: 0,
    we_are_blue: true,
    kickoff_us: false,
  };
}

// Run test
function testRectanglePattern() {
  console.log('='.repeat(80));
  console.log('Testing Rectangle Movement Pattern (using real PhysicsEngine)');
  console.log('='.repeat(80));
  
  const strategyFunc = createSandboxedStrategy(strategyCode);
  
  // Create real physics engine
  const physics = new PhysicsEngine();
  physics.initialize();
  
  // Initial state - start at origin, facing north (0°)
  const startX = 0;
  const startY = 0;
  const startAngle = 0; // Facing north (0°)
  
  // Create robot in physics engine
  const robotId = 'test_robot';
  physics.createRobot(robotId, 'blue', 'attacker', startX, startY, startAngle);
  
  let t_ms = 0;
  
  const positions = [];
  const steps = [];
  
  // Run for 5 seconds (300 frames at 60fps)
  const duration_ms = 6000; // Increased to ensure all 4 steps are detected
  const dt_ms = 16.67; // ~60fps
  const dt_s = dt_ms / 1000;
  
  // Get initial position
  const robotMap = physics.getRobots();
  const robot = robotMap.get(robotId);
  if (!robot) {
    throw new Error(`Robot ${robotId} not found`);
  }
  let posX = robot.body.position.x;
  let posY = robot.body.position.y;
  let heading_deg = robot.body.angle * 180 / Math.PI;
  
  console.log(`\nStarting position: (${posX.toFixed(2)}, ${posY.toFixed(2)}), heading: ${heading_deg}°`);
  console.log(`Running simulation for ${duration_ms}ms...\n`);
  
  // Track step transitions - strategy transitions every 1000ms
  const expectedStepDuration = 1000; // ms (STEP_DURATION_MS from strategy)
  let stepStartPosX = posX;
  let stepStartPosY = posY;
  let stepStartTime = t_ms;
  let lastMotors = null;
  let lastStepTransitionTime = 0;
  
  for (let frame = 0; t_ms < duration_ms; frame++) {
    // Get current robot state from physics
    const robotMap = physics.getRobots();
    const robot = robotMap.get(robotId);
    if (!robot) {
      throw new Error(`Robot ${robotId} not found`);
    }
    posX = robot.body.position.x;
    posY = robot.body.position.y;
    heading_deg = robot.body.angle * 180 / Math.PI;
    
    // Get action from strategy
    const worldState = createWorldState(t_ms, heading_deg);
    const action = strategyFunc(worldState);
    
    // Detect step transition: strategy transitions every 1000ms
    // Check if motors changed significantly (indicates step change)
    const motorChanged = lastMotors && (
      Math.abs(action.motor1 - lastMotors.motor1) > 0.1 ||
      Math.abs(action.motor2 - lastMotors.motor2) > 0.1 ||
      Math.abs(action.motor3 - lastMotors.motor3) > 0.1 ||
      Math.abs(action.motor4 - lastMotors.motor4) > 0.1
    );
    const timeSinceLastTransition = t_ms - lastStepTransitionTime;
    const timeElapsed = timeSinceLastTransition >= expectedStepDuration * 0.8; // 80% of expected duration
    
    // Transition if motors changed significantly AND enough time has passed
    if (motorChanged && timeElapsed && steps.length < 10 && lastStepTransitionTime > 0) {
      // Calculate movement direction from accumulated movement during this step
      const stepDistance = Math.sqrt((posX - stepStartPosX) ** 2 + (posY - stepStartPosY) ** 2);
      const totalDx = posX - stepStartPosX;
      const totalDy = posY - stepStartPosY;
      
      // Determine direction (world-relative)
      // Matter.js Y+ is DOWN, so positive Y is south
      let currentDir = null;
      if (stepDistance > 0.3) { // Only if moved at least 0.3cm
        // Use a threshold to determine primary direction
        const dxAbs = Math.abs(totalDx);
        const dyAbs = Math.abs(totalDy);
        
        if (dxAbs > dyAbs * 1.2) {
          // Primarily horizontal movement
          currentDir = totalDx > 0 ? 'east' : 'west';
        } else if (dyAbs > dxAbs * 1.2) {
          // Primarily vertical movement
          currentDir = totalDy > 0 ? 'south' : 'north';
        } else {
          // Diagonal - use the larger component
          if (dxAbs > dyAbs) {
            currentDir = totalDx > 0 ? 'east' : 'west';
          } else {
            currentDir = totalDy > 0 ? 'south' : 'north';
          }
        }
      }
      
      // Record the completed step
      if (currentDir) {
        steps.push({
          stepIndex: steps.length,
          direction: currentDir,
          startTime: stepStartTime,
          startPos: { x: stepStartPosX, y: stepStartPosY },
          endPos: { x: posX, y: posY }
        });
        
        // Start new step
        stepStartPosX = posX;
        stepStartPosY = posY;
        stepStartTime = t_ms;
        lastStepTransitionTime = t_ms;
      }
    }
    
    // Initialize lastStepTransitionTime on first frame
    if (lastStepTransitionTime === 0) {
      lastStepTransitionTime = t_ms;
    }
    
    // Apply action to physics engine
    physics.applyAction(robotId, action);
    
    // Update physics engine (step takes milliseconds)
    physics.step(dt_ms);
    
    // Get updated position after physics update
    const updatedRobotMap = physics.getRobots();
    const updatedRobot = updatedRobotMap.get(robotId);
    if (!updatedRobot) {
      throw new Error(`Robot ${robotId} not found`);
    }
    posX = updatedRobot.body.position.x;
    posY = updatedRobot.body.position.y;
    heading_deg = updatedRobot.body.angle * 180 / Math.PI;
    
    // Track positions
    positions.push({ t_ms, posX, posY, heading_deg, motors: action });
    lastMotors = { ...action };
    
    t_ms += dt_ms;
  }
  
  // Record final step if incomplete
  const finalStepDistance = Math.sqrt((posX - stepStartPosX) ** 2 + (posY - stepStartPosY) ** 2);
  if (finalStepDistance > 0.3 && steps.length < 20) {
    const totalDx = posX - stepStartPosX;
    const totalDy = posY - stepStartPosY;
    const dxAbs = Math.abs(totalDx);
    const dyAbs = Math.abs(totalDy);
    
    let finalDir = null;
    if (dxAbs > dyAbs * 1.2) {
      finalDir = totalDx > 0 ? 'east' : 'west';
    } else if (dyAbs > dxAbs * 1.2) {
      finalDir = totalDy > 0 ? 'south' : 'north';
    } else {
      if (dxAbs > dyAbs) {
        finalDir = totalDx > 0 ? 'east' : 'west';
      } else {
        finalDir = totalDy > 0 ? 'south' : 'north';
      }
    }
    if (finalDir) {
      steps.push({
        stepIndex: steps.length,
        direction: finalDir,
        startTime: stepStartTime,
        startPos: { x: stepStartPosX, y: stepStartPosY },
        endPos: { x: posX, y: posY }
      });
    }
  }
  
  // Analyze results
  console.log(`\nSimulation complete. Total frames: ${positions.length}`);
  console.log(`\nDetected ${steps.length} movement steps:\n`);
  
  steps.forEach((step, idx) => {
    const endPos = step.endPos || step.startPos;
    const nextStep = steps[idx + 1];
    const duration = nextStep ? (nextStep.startTime - step.startTime) : (duration_ms - step.startTime);
    
    if (!endPos || typeof endPos.x !== 'number' || typeof endPos.y !== 'number') {
      console.log(`Step ${idx + 1}: ${step.direction} - INCOMPLETE`);
      return;
    }
    
    const dx = endPos.x - step.startPos.x;
    const dy = endPos.y - step.startPos.y;
    const distance = Math.sqrt(dx * dx + dy * dy);
    
    console.log(`Step ${idx + 1}: ${step.direction}`);
    console.log(`  Duration: ${duration.toFixed(0)}ms`);
    console.log(`  Distance: ${distance.toFixed(2)}cm`);
    console.log(`  Start: (${step.startPos.x.toFixed(2)}, ${step.startPos.y.toFixed(2)})`);
    console.log(`  End: (${endPos.x.toFixed(2)}, ${endPos.y.toFixed(2)})`);
    console.log(`  Delta: (${dx.toFixed(2)}, ${dy.toFixed(2)})`);
    console.log('');
  });
  
  // Verify rectangle pattern
  // Expected: forward (north), right (east), backward (south), left (west)
  const expectedSteps = ['north', 'east', 'south', 'west'];
  const actualSteps = steps.map(s => s.direction);
  
  console.log('Expected pattern:', expectedSteps.join(' → '));
  console.log('Actual pattern:  ', actualSteps.slice(0, 4).join(' → '));
  
  let passed = true;
  if (actualSteps.length < 4) {
    console.log('\n❌ FAILED: Not enough steps detected');
    passed = false;
  } else {
    for (let i = 0; i < 4; i++) {
      if (actualSteps[i] !== expectedSteps[i]) {
        console.log(`\n❌ FAILED: Step ${i + 1} expected ${expectedSteps[i]}, got ${actualSteps[i]}`);
        passed = false;
      }
    }
  }
  
  // Check distances (should be ~3.16cm each)
  const distances = steps.slice(0, 4).map((step) => {
    const endPos = step.endPos || step.startPos;
    const dx = endPos.x - step.startPos.x;
    const dy = endPos.y - step.startPos.y;
    return Math.sqrt(dx * dx + dy * dy);
  }).filter(d => !isNaN(d) && d > 0);
  
  const avgDistance = distances.reduce((a, b) => a + b, 0) / distances.length;
  const expectedDistance = 3.16; // 2% of 158cm
  
  console.log(`\nAverage distance per step: ${avgDistance.toFixed(2)}cm (expected: ${expectedDistance.toFixed(2)}cm)`);
  
  if (Math.abs(avgDistance - expectedDistance) > 1.0) {
    console.log(`\n⚠️  WARNING: Distance differs significantly from expected`);
  }
  
  if (passed) {
    console.log('\n✅ TEST PASSED: Rectangle pattern is correct!');
  } else {
    console.log('\n❌ TEST FAILED: Pattern does not match expected');
  }
  
  console.log('\n' + '='.repeat(80));
  
  return { passed, steps, positions };
}

// Helper to determine direction from motor commands
function getDirectionFromMotors(action, heading_deg) {
  // This is a simplified heuristic - in reality we'd need to track the actual movement
  // For now, we'll use the motor pattern to infer direction
  const { motor1, motor2, motor3, motor4 } = action;
  
  // Check if all motors are zero
  if (Math.abs(motor1) < 0.01 && Math.abs(motor2) < 0.01 && 
      Math.abs(motor3) < 0.01 && Math.abs(motor4) < 0.01) {
    return 'stop';
  }
  
  // Simplified: use the motor pattern to infer direction
  // This is approximate - we'd need full physics simulation for accuracy
  const vx_robot = (motor1 - motor2 + motor3 - motor4) / 4;
  const vy_plus_omega = (motor1 + motor2 - motor3 - motor4) / 4;
  
  // Very rough heuristic
  if (Math.abs(vx_robot) > Math.abs(vy_plus_omega)) {
    return vx_robot > 0 ? 'forward' : 'backward';
  } else {
    return vy_plus_omega > 0 ? 'right' : 'left';
  }
}

// Run the test
try {
  const result = testRectanglePattern();
  process.exit(result.passed ? 0 : 1);
} catch (error) {
  console.error('Test failed with error:', error);
  process.exit(1);
}
