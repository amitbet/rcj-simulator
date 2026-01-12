// ============================================================
// Test Movement Directions - Verify simple movement functions
// Tests moveForward, moveBackward, strafeLeft, strafeRight
// ============================================================

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

const { PhysicsEngine } = require('./src/physics/PhysicsEngine.ts');
const fs = require('fs');
const path = require('path');

// Load the strategy code
const strategyCode = fs.readFileSync(path.join(__dirname, 'src/strategies/attacker_simple.js'), 'utf-8');

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
    
    return { strategy, moveForward, moveBackward, strafeLeft, strafeRight };
  `;
  
  const factory = new Function(wrappedCode);
  return factory();
}

// Test configuration
const TEST_CONFIG = {
  duration_ms: 2000, // 2 seconds per test
  dt_ms: 16.67, // ~60fps
  robotStartX: 0,
  robotStartY: 0,
  robotStartAngle: 0, // degrees, facing north (0° = +Y direction in world, but Matter.js Y+ = DOWN)
  motorSpeed: 0.5,
};

// Helper to calculate movement direction
function calculateMovementDirection(startX, startY, endX, endY) {
  const dx = endX - startX;
  const dy = endY - startY;
  const distance = Math.sqrt(dx * dx + dy * dy);
  // Matter.js Y+ is DOWN, so negative dy = UP (north)
  // Angle from north: atan2(dx, -dy) because -dy is north in Matter.js
  const angle_deg = Math.atan2(dx, -dy) * 180 / Math.PI;
  return { dx, dy, distance, angle_deg };
}

// Helper to get direction name
function getDirectionName(angle_deg) {
  // Normalize to 0-360
  while (angle_deg < 0) angle_deg += 360;
  while (angle_deg >= 360) angle_deg -= 360;
  
  if (angle_deg >= 337.5 || angle_deg < 22.5) return 'North';
  if (angle_deg >= 22.5 && angle_deg < 67.5) return 'Northeast';
  if (angle_deg >= 67.5 && angle_deg < 112.5) return 'East';
  if (angle_deg >= 112.5 && angle_deg < 157.5) return 'Southeast';
  if (angle_deg >= 157.5 && angle_deg < 202.5) return 'South';
  if (angle_deg >= 202.5 && angle_deg < 247.5) return 'Southwest';
  if (angle_deg >= 247.5 && angle_deg < 292.5) return 'West';
  if (angle_deg >= 292.5 && angle_deg < 337.5) return 'Northwest';
  return 'Unknown';
}

// Run a movement test
function runMovementTest(testName, movementFunc, expectedDirection_deg, expectedDirectionName) {
  console.log(`\n${'='.repeat(80)}`);
  console.log(`Test: ${testName}`);
  console.log('='.repeat(80));
  
  const physics = new PhysicsEngine();
  physics.setOnGoalScored(() => {});
  physics.setOnOutOfBounds(() => {});
  physics.setOnRobotOutOfBounds(() => {});
  physics.setOnCollision(() => {});
  physics.initialize();
  
  const robotId = 'test_robot';
  const startAngleRad = TEST_CONFIG.robotStartAngle * Math.PI / 180;
  physics.createRobot(robotId, 'blue', 'attacker', TEST_CONFIG.robotStartX, TEST_CONFIG.robotStartY, startAngleRad);
  
  // Get initial position
  const robotMap = physics.getRobots();
  const robot = robotMap.get(robotId);
  const startX = robot.body.position.x;
  const startY = robot.body.position.y;
  const startAngle = robot.body.angle * 180 / Math.PI;
  
  console.log(`Start position: (${startX.toFixed(2)}, ${startY.toFixed(2)}), angle: ${startAngle.toFixed(1)}°`);
  
  // Run simulation
  let t_ms = 0;
  const dt_ms = TEST_CONFIG.dt_ms;
  
  while (t_ms < TEST_CONFIG.duration_ms) {
    // Get motors from movement function
    const motors = movementFunc(TEST_CONFIG.motorSpeed);
    
    // Apply action
    physics.applyAction(robotId, {
      motor1: motors.motor1,
      motor2: motors.motor2,
      motor3: motors.motor3,
      motor4: motors.motor4,
      kick: false
    });
    
    // Step physics
    physics.step(dt_ms);
    t_ms += dt_ms;
  }
  
  // Get final position
  const endX = robot.body.position.x;
  const endY = robot.body.position.y;
  const endAngle = robot.body.angle * 180 / Math.PI;
  
  console.log(`End position:   (${endX.toFixed(2)}, ${endY.toFixed(2)}), angle: ${endAngle.toFixed(1)}°`);
  
  // Calculate movement
  const movement = calculateMovementDirection(startX, startY, endX, endY);
  console.log(`Movement: dx=${movement.dx.toFixed(2)}cm, dy=${movement.dy.toFixed(2)}cm, distance=${movement.distance.toFixed(2)}cm`);
  console.log(`Direction: ${movement.angle_deg.toFixed(1)}° (${getDirectionName(movement.angle_deg)})`);
  console.log(`Rotation: ${(endAngle - startAngle).toFixed(1)}°`);
  
  // Check if direction matches expected
  let angleDiff = Math.abs(movement.angle_deg - expectedDirection_deg);
  while (angleDiff > 180) angleDiff = 360 - angleDiff;
  
  const directionMatch = angleDiff < 15; // Allow 15° tolerance
  const rotationMatch = Math.abs(endAngle - startAngle) < 5; // Should have minimal rotation
  
  if (directionMatch && rotationMatch) {
    console.log('✓ PASS');
    return { passed: true, testName, movement, expectedDirection_deg, expectedDirectionName };
  } else {
    console.log('✗ FAIL');
    const issues = [];
    if (!directionMatch) {
      issues.push(`Direction mismatch: expected ${expectedDirection_deg.toFixed(1)}° (${expectedDirectionName}), got ${movement.angle_deg.toFixed(1)}°`);
    }
    if (!rotationMatch) {
      issues.push(`Rotation: expected <5°, got ${(endAngle - startAngle).toFixed(1)}°`);
    }
    console.log(`  Issues: ${issues.join(', ')}`);
    return { passed: false, testName, movement, expectedDirection_deg, expectedDirectionName, issues };
  }
}

// Main test function
function runAllTests() {
  console.log('='.repeat(80));
  console.log('MOVEMENT DIRECTION TESTS');
  console.log('Robot starts at (0, 0) facing north (0°)');
  console.log('='.repeat(80));
  
  const strategyFunctions = createSandboxedStrategy(strategyCode);
  const results = [];
  
  // Test moveForward - should move north (0°)
  results.push(runMovementTest(
    'moveForward',
    strategyFunctions.moveForward,
    0, // Expected: North
    'North'
  ));
  
  // Test moveBackward - should move south (180°)
  results.push(runMovementTest(
    'moveBackward',
    strategyFunctions.moveBackward,
    180, // Expected: South
    'South'
  ));
  
  // Test strafeLeft - should move west (-90° or 270°)
  results.push(runMovementTest(
    'strafeLeft',
    strategyFunctions.strafeLeft,
    -90, // Expected: West
    'West'
  ));
  
  // Test strafeRight - should move east (90°)
  results.push(runMovementTest(
    'strafeRight',
    strategyFunctions.strafeRight,
    90, // Expected: East
    'East'
  ));
  
  // Summary
  console.log('\n\n' + '='.repeat(80));
  console.log('TEST SUMMARY');
  console.log('='.repeat(80));
  
  const passed = results.filter(r => r.passed).length;
  const failed = results.filter(r => !r.passed).length;
  
  console.log(`\nTotal tests: ${results.length}`);
  console.log(`Passed: ${passed}`);
  console.log(`Failed: ${failed}`);
  
  if (failed > 0) {
    console.log('\nFailed tests:');
    results.forEach((result, index) => {
      if (!result.passed) {
        console.log(`  ${index + 1}. ${result.testName}: ${result.issues.join(', ')}`);
      }
    });
  }
  
  console.log('\n' + '='.repeat(80));
  
  return failed === 0;
}

// Run tests
if (require.main === module) {
  const success = runAllTests();
  process.exit(success ? 0 : 1);
}

module.exports = { runAllTests, runMovementTest };
