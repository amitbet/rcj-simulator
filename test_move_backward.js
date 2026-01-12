// Simple test: Robot moves backward
// This test verifies that backward movement (vx < 0) actually moves the robot backward
// Run with: node test_move_backward.js

console.log('=== Testing Backward Movement ===\n');

// Test the motor-to-movement conversion (inverse kinematics)
function testMotorToMovement() {
  console.log('Testing motor speeds -> movement conversion...\n');
  
  // Backward movement: FL -, FR +, BL +, BR -
  // From Arduino patterns: Backward = motor1: -1, motor2: +1, motor3: +1, motor4: -1
  const backwardMotors = { motor1: -1, motor2: 1, motor3: 1, motor4: -1 };
  
  // Inverse kinematics formula from PhysicsEngine
  const motor1 = backwardMotors.motor1;
  const motor2 = backwardMotors.motor2;
  const motor3 = backwardMotors.motor3;
  const motor4 = backwardMotors.motor4;
  
  // From PhysicsEngine.ts line 380-390
  const vx_robot = (motor1 - motor2) / 2;
  const vy_plus_omega = (motor1 + motor2) / 2;
  
  // Heuristic to separate vy from omega
  const allSameSign = (motor1 > 0 && motor2 > 0 && motor3 > 0 && motor4 > 0) ||
                      (motor1 < 0 && motor2 < 0 && motor3 < 0 && motor4 < 0);
  
  const vxAbs = Math.abs(vx_robot);
  const vyOmegaAbs = Math.abs(vy_plus_omega);
  const threshold = 0.05;
  
  let vy_robot = 0;
  let omega = 0;
  
  if (allSameSign) {
    omega = vy_plus_omega;
  } else if (vxAbs > threshold && vyOmegaAbs > threshold) {
    omega = vy_plus_omega;
  } else if (vxAbs < threshold && vyOmegaAbs > threshold) {
    vy_robot = vy_plus_omega;
  }
  
  console.log(`Motor inputs: motor1=${motor1}, motor2=${motor2}, motor3=${motor3}, motor4=${motor4}`);
  console.log(`Calculated: vx_robot=${vx_robot.toFixed(3)}, vy_robot=${vy_robot.toFixed(3)}, omega=${omega.toFixed(3)}`);
  
  // Expected: vx_robot should be negative (backward), vy_robot=0, omega=0
  if (vx_robot < -0.9 && Math.abs(vy_robot) < 0.1 && Math.abs(omega) < 0.1) {
    console.log('✅ PASS: Backward motors produce backward movement (vx < 0)\n');
    return true;
  } else {
    console.log(`❌ FAIL: Expected vx < -0.9, got vx=${vx_robot.toFixed(3)}\n`);
    return false;
  }
}

// Test the movement-to-motor conversion (forward kinematics)
function testMovementToMotor() {
  console.log('Testing movement -> motor speeds conversion...\n');
  
  // Backward movement: vx=-1.0 (backward), vy=0, omega=0
  const vx = -1.0;
  const vy = 0;
  const omega = 0;
  
  // Forward kinematics formula (from strategy helper)
  const motor1 = Math.max(-1, Math.min(1, vx + vy + omega));
  const motor2 = Math.max(-1, Math.min(1, -vx + vy + omega));
  const motor3 = Math.max(-1, Math.min(1, vx - vy - omega));
  const motor4 = Math.max(-1, Math.min(1, -vx - vy - omega));
  
  console.log(`Movement input: vx=${vx}, vy=${vy}, omega=${omega}`);
  console.log(`Calculated motors: motor1=${motor1}, motor2=${motor2}, motor3=${motor3}, motor4=${motor4}`);
  
  // Expected: motor1=-1, motor2=1, motor3=-1, motor4=1 (backward pattern)
  const expected = { motor1: -1, motor2: 1, motor3: -1, motor4: 1 };
  const tolerance = 0.01;
  
  const match1 = Math.abs(motor1 - expected.motor1) < tolerance;
  const match2 = Math.abs(motor2 - expected.motor2) < tolerance;
  const match3 = Math.abs(motor3 - expected.motor3) < tolerance;
  const match4 = Math.abs(motor4 - expected.motor4) < tolerance;
  
  if (match1 && match2 && match3 && match4) {
    console.log('✅ PASS: Backward movement produces correct motor pattern\n');
    return true;
  } else {
    console.log(`❌ FAIL: Expected ${JSON.stringify(expected)}, got motor1=${motor1}, motor2=${motor2}, motor3=${motor3}, motor4=${motor4}\n`);
    return false;
  }
}

// Test coordinate transformation
function testCoordinateTransform() {
  console.log('Testing coordinate transformation (robot-relative to world)...\n');
  
  // Robot at origin, facing up (angle = 0)
  const robotAngle = 0;
  const vx_robot = -1.0; // Backward
  const vy_robot = 0;
  const omega = 0;
  
  // From PhysicsEngine.ts line 422-427
  const cosAngle = Math.cos(robotAngle);
  const sinAngle = Math.sin(robotAngle);
  const maxSpeed = 150 * 0.016; // cm per frame
  
  const moveX = (vx_robot * sinAngle + vy_robot * cosAngle) * maxSpeed;
  const moveY = (vx_robot * cosAngle - vy_robot * sinAngle) * maxSpeed;
  
  console.log(`Robot angle: ${robotAngle} (facing up/+Y)`);
  console.log(`Robot-relative: vx=${vx_robot}, vy=${vy_robot}`);
  console.log(`World movement: moveX=${moveX.toFixed(3)}, moveY=${moveY.toFixed(3)}`);
  
  // Expected: moveX=0 (no sideways), moveY < 0 (backward = -Y)
  if (Math.abs(moveX) < 0.01 && moveY < 0) {
    console.log('✅ PASS: Backward movement transforms to -Y direction\n');
    return true;
  } else {
    console.log(`❌ FAIL: Expected moveX≈0, moveY<0, got moveX=${moveX.toFixed(3)}, moveY=${moveY.toFixed(3)}\n`);
    return false;
  }
}

// Run all tests
const test1 = testMotorToMovement();
const test2 = testMovementToMotor();
const test3 = testCoordinateTransform();

console.log('=== Test Summary ===');
console.log(`Motor->Movement: ${test1 ? 'PASS' : 'FAIL'}`);
console.log(`Movement->Motor: ${test2 ? 'PASS' : 'FAIL'}`);
console.log(`Coordinate Transform: ${test3 ? 'PASS' : 'FAIL'}`);

if (test1 && test2 && test3) {
  console.log('\n✅ All tests PASSED - Backward movement should work correctly');
  process.exit(0);
} else {
  console.log('\n❌ Some tests FAILED - Backward movement may be broken');
  process.exit(1);
}
