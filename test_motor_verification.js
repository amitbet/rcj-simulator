// ============================================================
// Motor Verification Test - Test each motor individually and in pairs
// Verifies that motors are configured correctly and produce expected movement
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

// Test configuration
const TEST_CONFIG = {
  duration_ms: 2000, // 2 seconds per test
  dt_ms: 16.67, // ~60fps
  robotStartX: 0,
  robotStartY: 0,
  robotStartAngle: 0, // degrees, facing north (0° = +Y direction)
  motorSpeed: 0.5, // Motor speed for testing
};

// Helper to calculate movement direction
function calculateMovementDirection(startX, startY, endX, endY) {
  const dx = endX - startX;
  const dy = endY - startY;
  const distance = Math.sqrt(dx * dx + dy * dy);
  // NOTE: Matter.js Y+ is DOWN, so negative dy = UP (north)
  // For direction calculation, we need to account for this:
  // -dy means north, +dy means south
  // Angle from north: atan2(dx, -dy) because -dy is north in Matter.js
  const angle_deg = Math.atan2(dx, -dy) * 180 / Math.PI; // Angle from north (accounting for Matter.js Y+ = DOWN)
  return { dx, dy, distance, angle_deg };
}

// Helper to format angle
function formatAngle(angle_deg) {
  // Normalize to -180 to 180
  while (angle_deg > 180) angle_deg -= 360;
  while (angle_deg < -180) angle_deg += 360;
  return angle_deg.toFixed(1) + '°';
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

// Run a single motor test
function runMotorTest(testName, motors, expectedDirection_deg = null, expectedDirectionName = null, disableMotors = null) {
  console.log(`\n${'='.repeat(80)}`);
  console.log(`Test: ${testName}`);
  console.log(`Motors: [${motors.motor1.toFixed(2)}, ${motors.motor2.toFixed(2)}, ${motors.motor3.toFixed(2)}, ${motors.motor4.toFixed(2)}]`);
  if (disableMotors) {
    console.log(`Note: Motors ${disableMotors.join(', ')} are disabled (set to 0)`);
  }
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
  
  // Apply motor disabling if specified
  const actualMotors = { ...motors };
  if (disableMotors) {
    if (disableMotors.includes(1)) actualMotors.motor1 = 0;
    if (disableMotors.includes(2)) actualMotors.motor2 = 0;
    if (disableMotors.includes(3)) actualMotors.motor3 = 0;
    if (disableMotors.includes(4)) actualMotors.motor4 = 0;
  }
  
  // Get initial position
  const robotMap = physics.getRobots();
  const robotBefore = robotMap.get(robotId);
  if (!robotBefore) {
    throw new Error(`Robot ${robotId} not found`);
  }
  const startX = robotBefore.body.position.x;
  const startY = robotBefore.body.position.y;
  const startAngle = robotBefore.body.angle;
  
  // Run simulation
  let t_ms = 0;
  const numFrames = Math.floor(TEST_CONFIG.duration_ms / TEST_CONFIG.dt_ms);
  
  for (let frame = 0; frame < numFrames; frame++) {
    physics.applyAction(robotId, { ...actualMotors, kick: false });
    physics.step(TEST_CONFIG.dt_ms);
    t_ms += TEST_CONFIG.dt_ms;
  }
  
  // Get final position
  const robotAfter = robotMap.get(robotId);
  const endX = robotAfter.body.position.x;
  const endY = robotAfter.body.position.y;
  const endAngle = robotAfter.body.angle;
  
  // Calculate movement
  const movement = calculateMovementDirection(startX, startY, endX, endY);
  const angleChange_deg = (endAngle - startAngle) * 180 / Math.PI;
  
  console.log(`Start position: (${startX.toFixed(2)}, ${startY.toFixed(2)}), angle: ${(startAngle * 180 / Math.PI).toFixed(1)}°`);
  console.log(`End position:   (${endX.toFixed(2)}, ${endY.toFixed(2)}), angle: ${(endAngle * 180 / Math.PI).toFixed(1)}°`);
  console.log(`Movement: dx=${movement.dx.toFixed(2)}cm, dy=${movement.dy.toFixed(2)}cm, distance=${movement.distance.toFixed(2)}cm`);
  console.log(`Direction: ${formatAngle(movement.angle_deg)} (${getDirectionName(movement.angle_deg)})`);
  console.log(`Rotation: ${formatAngle(angleChange_deg)}`);
  
  // Check if movement matches expectation
  let passed = true;
  let issues = [];
  
  if (expectedDirection_deg !== null) {
    const angleDiff = Math.abs(movement.angle_deg - expectedDirection_deg);
    const normalizedAngleDiff = Math.min(angleDiff, 360 - angleDiff);
    if (normalizedAngleDiff > 30) { // Allow 30° tolerance
      passed = false;
      issues.push(`Direction mismatch: expected ${formatAngle(expectedDirection_deg)}, got ${formatAngle(movement.angle_deg)}`);
    }
  }
  
  if (movement.distance < 1) {
    passed = false;
    issues.push(`Robot barely moved (${movement.distance.toFixed(2)}cm)`);
  }
  
  // Single motors will always produce rotation (expected), so don't flag it
  // Only flag rotation for motor pairs that should produce pure movement
  const isSingleMotor = (Math.abs(motors.motor1) > 0.01 && Math.abs(motors.motor2) < 0.01 && 
                         Math.abs(motors.motor3) < 0.01 && Math.abs(motors.motor4) < 0.01) ||
                        (Math.abs(motors.motor1) < 0.01 && Math.abs(motors.motor2) > 0.01 && 
                         Math.abs(motors.motor3) < 0.01 && Math.abs(motors.motor4) < 0.01) ||
                        (Math.abs(motors.motor1) < 0.01 && Math.abs(motors.motor2) < 0.01 && 
                         Math.abs(motors.motor3) > 0.01 && Math.abs(motors.motor4) < 0.01) ||
                        (Math.abs(motors.motor1) < 0.01 && Math.abs(motors.motor2) < 0.01 && 
                         Math.abs(motors.motor3) < 0.01 && Math.abs(motors.motor4) > 0.01);
  
  if (Math.abs(angleChange_deg) > 5 && expectedDirectionName !== 'Rotation' && !isSingleMotor) {
    issues.push(`Unexpected rotation: ${formatAngle(angleChange_deg)}`);
  }
  
  if (issues.length > 0) {
    console.log(`\n⚠️  Issues:`);
    issues.forEach(issue => console.log(`   - ${issue}`));
  }
  
  const status = passed ? '✓ PASS' : '✗ FAIL';
  console.log(`\n${status}`);
  
  return { passed, movement, angleChange_deg, issues };
}

// Run all tests
function runAllTests() {
  console.log('='.repeat(80));
  console.log('MOTOR VERIFICATION TESTS');
  console.log('Robot starts at origin (0, 0), facing North (0°)');
  console.log('='.repeat(80));
  
  const results = [];
  const speed = TEST_CONFIG.motorSpeed;
  
  // ============================================================
  // Single Motor Tests
  // ============================================================
  console.log('\n\n## SINGLE MOTOR TESTS ##');
  
  // Motor 1 (Front Left) - should move diagonally (northwest-ish)
  results.push(runMotorTest(
    'Motor 1 only (Front Left)',
    { motor1: speed, motor2: 0, motor3: 0, motor4: 0 },
    135, // Expected: Northwest (135° from north = -45° from east)
    'Diagonal'
  ));
  
  // Motor 2 (Front Right) - should move diagonally (northeast-ish)
  results.push(runMotorTest(
    'Motor 2 only (Front Right)',
    { motor1: 0, motor2: speed, motor3: 0, motor4: 0 },
    45, // Expected: Northeast (45° from north)
    'Diagonal'
  ));
  
  // Motor 3 (Back Right) - should move diagonally (southeast-ish)
  results.push(runMotorTest(
    'Motor 3 only (Back Right)',
    { motor1: 0, motor2: 0, motor3: speed, motor4: 0 },
    -45, // Expected: Southeast (-45° from north = 315°)
    'Diagonal'
  ));
  
  // Motor 4 (Back Left) - should move diagonally (southwest-ish)
  results.push(runMotorTest(
    'Motor 4 only (Back Left)',
    { motor1: 0, motor2: 0, motor3: 0, motor4: speed },
    -135, // Expected: Southwest (-135° from north = 225°)
    'Diagonal'
  ));
  
  // ============================================================
  // Two Motor Tests - Front Pair (with back motors disabled)
  // ============================================================
  console.log('\n\n## TWO MOTOR TESTS - FRONT PAIR (motors 3+4 disabled) ##');
  
  // Front Left + Front Right (both positive) - should produce strafe right + rotation
  // But with back motors disabled, rotation should be reduced
  results.push(runMotorTest(
    'Motors 1+2 (Front Left + Front Right, both +, m3+m4=0)',
    { motor1: speed, motor2: speed, motor3: 0, motor4: 0 },
    90, // Expected: Right (East) - strafe right
    'Strafe',
    [3, 4] // Disable motors 3 and 4
  ));
  
  // Front Left + Front Right (both negative) - should produce strafe left
  results.push(runMotorTest(
    'Motors 1+2 (Front Left + Front Right, both -, m3+m4=0)',
    { motor1: -speed, motor2: -speed, motor3: 0, motor4: 0 },
    -90, // Expected: Left (West) - strafe left
    'Strafe',
    [3, 4] // Disable motors 3 and 4
  ));
  
  // Front Left + Front Right (opposite) - should produce pure forward
  results.push(runMotorTest(
    'Motors 1+2 (Front Left +, Front Right -, m3+m4=0)',
    { motor1: speed, motor2: -speed, motor3: 0, motor4: 0 },
    0, // Expected: Forward (North)
    'Forward',
    [3, 4] // Disable motors 3 and 4
  ));
  
  // ============================================================
  // Two Motor Tests - Back Pair (with front motors disabled)
  // ============================================================
  console.log('\n\n## TWO MOTOR TESTS - BACK PAIR (motors 1+2 disabled) ##');
  
  // Back Right + Back Left (both positive) - should produce strafe left
  results.push(runMotorTest(
    'Motors 3+4 (Back Right + Back Left, both +, m1+m2=0)',
    { motor1: 0, motor2: 0, motor3: speed, motor4: speed },
    -90, // Expected: Left (West) - strafe left
    'Strafe',
    [1, 2] // Disable motors 1 and 2
  ));
  
  // Back Right + Back Left (both negative) - should produce strafe right
  results.push(runMotorTest(
    'Motors 3+4 (Back Right + Back Left, both -, m1+m2=0)',
    { motor1: 0, motor2: 0, motor3: -speed, motor4: -speed },
    90, // Expected: Right (East) - strafe right
    'Strafe',
    [1, 2] // Disable motors 1 and 2
  ));
  
  // Back Right + Back Left (opposite) - should produce forward
  results.push(runMotorTest(
    'Motors 3+4 (Back Right +, Back Left -, m1+m2=0)',
    { motor1: 0, motor2: 0, motor3: speed, motor4: -speed },
    0, // Expected: Forward (North)
    'Forward',
    [1, 2] // Disable motors 1 and 2
  ));
  
  // ============================================================
  // Two Motor Tests - Left Pair (with right motors disabled)
  // ============================================================
  console.log('\n\n## TWO MOTOR TESTS - LEFT PAIR (motors 2+3 disabled) ##');
  
  // Front Left + Back Left (both positive) - should produce forward
  results.push(runMotorTest(
    'Motors 1+4 (Front Left + Back Left, both +, m2+m3=0)',
    { motor1: speed, motor2: 0, motor3: 0, motor4: speed },
    0, // Expected: Forward (North)
    'Forward',
    [2, 3] // Disable motors 2 and 3
  ));
  
  // Front Left + Back Left (both negative) - should produce backward
  results.push(runMotorTest(
    'Motors 1+4 (Front Left + Back Left, both -, m2+m3=0)',
    { motor1: -speed, motor2: 0, motor3: 0, motor4: -speed },
    180, // Expected: Backward (South)
    'Backward',
    [2, 3] // Disable motors 2 and 3
  ));
  
  // ============================================================
  // Two Motor Tests - Right Pair (with left motors disabled)
  // ============================================================
  console.log('\n\n## TWO MOTOR TESTS - RIGHT PAIR (motors 1+4 disabled) ##');
  
  // Front Right + Back Right (both positive) - should produce backward
  results.push(runMotorTest(
    'Motors 2+3 (Front Right + Back Right, both +, m1+m4=0)',
    { motor1: 0, motor2: speed, motor3: speed, motor4: 0 },
    180, // Expected: Backward (South)
    'Backward',
    [1, 4] // Disable motors 1 and 4
  ));
  
  // Front Right + Back Right (both negative) - should produce forward
  results.push(runMotorTest(
    'Motors 2+3 (Front Right + Back Right, both -, m1+m4=0)',
    { motor1: 0, motor2: -speed, motor3: -speed, motor4: 0 },
    0, // Expected: Forward (North)
    'Forward',
    [1, 4] // Disable motors 1 and 4
  ));
  
  // ============================================================
  // Forward Pattern Tests
  // ============================================================
  console.log('\n\n## FORWARD PATTERN TESTS ##');
  
  // Test 1: Forward with front pair only (2 motors)
  // If motors 1+2 with opposite signs move forward, this should work
  results.push(runMotorTest(
    'Forward with Front Pair Only [+speed, -speed, 0, 0]',
    { motor1: speed, motor2: -speed, motor3: 0, motor4: 0 },
    0, // Expected: Forward (North)
    'Forward',
    [3, 4] // Disable motors 3 and 4
  ));
  
  // Test 2: Forward with all 4 motors
  // If front pair works, then all 4 motors should also work with same pattern
  // Arduino forward pattern: [+1, -1, +1, -1]
  results.push(runMotorTest(
    'Forward Pattern with All 4 Motors [+speed, -speed, +speed, -speed]',
    { motor1: speed, motor2: -speed, motor3: speed, motor4: -speed },
    0, // Expected: Forward (North)
    'Forward'
  ));
  
  // Note: Both patterns should produce forward movement (north)
  // The 4-motor pattern should produce the same direction but potentially more consistent movement
  
  // ============================================================
  // Summary
  // ============================================================
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
        console.log(`  Test ${index + 1}: ${result.issues.join(', ')}`);
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

module.exports = { runAllTests, runMotorTest };
