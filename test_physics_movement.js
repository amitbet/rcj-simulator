// Physics simulation test for omni wheel movement
// Simulates robot movement based on motor commands and verifies correct behavior

function clamp(val, min, max) {
  return Math.max(min, Math.min(max, val));
}

// Forward kinematics (from Arduino code)
function movementToMotors(vx, vy, omega) {
  return {
    motor1: clamp(vx + vy + omega, -1, 1),
    motor2: clamp(-vx + vy + omega, -1, 1),
    motor3: clamp(vx - vy - omega, -1, 1),
    motor4: clamp(-vx - vy - omega, -1, 1)
  };
}

// Inverse kinematics (from PhysicsEngine)
function motorsToMovement(m1, m2, m3, m4) {
  const vx_robot = (m1 - m2) / 2;
  const vy_plus_omega = (m1 + m2) / 2;
  const allSameSign = (m1 > 0 && m2 > 0 && m3 > 0 && m4 > 0) ||
                      (m1 < 0 && m2 < 0 && m3 < 0 && m4 < 0);
  const vy_robot = allSameSign ? 0 : vy_plus_omega;
  const omega = allSameSign ? vy_plus_omega : 0;
  return { vx_robot, vy_robot, omega };
}

// Simulate robot movement
function simulateMovement(robot, motors, dt = 0.016) {
  const { vx_robot, vy_robot, omega } = motorsToMovement(
    motors.motor1, motors.motor2, motors.motor3, motors.motor4
  );
  
  // Transform robot-relative velocity to world coordinates
  const cosAngle = Math.cos(robot.angle);
  const sinAngle = Math.sin(robot.angle);
  const maxSpeed = 150; // cm/s
  const maxAngular = 180 * Math.PI / 180; // rad/s
  
  const moveX = (vx_robot * sinAngle + vy_robot * cosAngle) * maxSpeed * dt;
  const moveY = (vx_robot * cosAngle - vy_robot * sinAngle) * maxSpeed * dt;
  const newAngle = robot.angle + omega * maxAngular * dt;
  
  return {
    x: robot.x + moveX,
    y: robot.y + moveY,
    angle: newAngle
  };
}

// Test scenarios
console.log('=== Physics Movement Tests ===\n');

// Test 1: Attacker moving toward ball
console.log('Test 1: Attacker moving toward ball');
const attacker = { x: 0, y: 0, angle: 0 }; // Facing up (Y+)
const ball = { x: 0, y: 100 }; // Ball 100cm ahead
const ballAngle = Math.atan2(ball.x - attacker.x, ball.y - attacker.y) * 180 / Math.PI;
console.log(`Ball angle: ${ballAngle.toFixed(1)}°`);

// Attacker should move forward toward ball
const attackerMotors = movementToMotors(0.7, 0, 0); // Forward speed
console.log('Motors:', attackerMotors);
const attackerMovement = motorsToMovement(attackerMotors.motor1, attackerMotors.motor2, attackerMotors.motor3, attackerMotors.motor4);
console.log('Movement:', attackerMovement);
const attackerAfter = simulateMovement(attacker, attackerMotors);
console.log(`Robot after 1 frame: x=${attackerAfter.x.toFixed(2)}, y=${attackerAfter.y.toFixed(2)}, angle=${attackerAfter.angle.toFixed(2)}`);
console.log(`Distance to ball: ${Math.sqrt((ball.x - attackerAfter.x)**2 + (ball.y - attackerAfter.y)**2).toFixed(2)}cm`);
console.log(`Expected: y should increase (moving toward ball)`);
console.log(attackerAfter.y > attacker.y ? '✓ PASS' : '✗ FAIL - moving away from ball\n');

// Test 2: Defender strafing along goal
console.log('\nTest 2: Defender strafing along goal');
const defender = { x: 0, y: 0, angle: 0 }; // Facing up
const goal = { x: 0, y: -40 }; // Goal 40cm behind
const ball2 = { x: 30, y: 0 }; // Ball 30cm to the right

// Calculate goalToBallAngle
const goalToBallAngle = Math.atan2(ball2.x - goal.x, ball2.y - goal.y) * 180 / Math.PI;
console.log(`Goal to ball angle: ${goalToBallAngle.toFixed(1)}°`);

// Defender should strafe right (positive angle = right)
function strafeAtAngle(angle_deg, speed, omega = 0) {
  const angle_rad = angle_deg * Math.PI / 180;
  const vx = speed * Math.cos(angle_rad);
  const vy = speed * Math.sin(angle_rad);
  return movementToMotors(vx, vy, omega);
}

const defenderMotors = strafeAtAngle(goalToBallAngle, 0.3, 0);
console.log('Motors:', defenderMotors);
const defenderMovement = motorsToMovement(defenderMotors.motor1, defenderMotors.motor2, defenderMotors.motor3, defenderMotors.motor4);
console.log('Movement:', defenderMovement);
const defenderAfter = simulateMovement(defender, defenderMotors);
console.log(`Robot after 1 frame: x=${defenderAfter.x.toFixed(2)}, y=${defenderAfter.y.toFixed(2)}, angle=${defenderAfter.angle.toFixed(2)}`);
console.log(`Expected: x should increase (strafing right)`);
console.log(defenderAfter.x > defender.x ? '✓ PASS' : '✗ FAIL - not moving right\n');

// Test 3: Zero motors check
console.log('\nTest 3: Zero motors check');
const zeroMotors = { motor1: 0, motor2: 0, motor3: 0, motor4: 0 };
const zeroMovement = motorsToMovement(0, 0, 0, 0);
console.log('Zero motors movement:', zeroMovement);
console.log(zeroMovement.vx_robot === 0 && zeroMovement.vy_robot === 0 && zeroMovement.omega === 0 ? '✓ PASS' : '✗ FAIL\n');

// Test 4: Forward + turn combination
console.log('\nTest 4: Forward + turn combination');
const forwardTurnMotors = movementToMotors(0.5, 0, 0.3);
console.log('Forward + turn motors:', forwardTurnMotors);
const forwardTurnMovement = motorsToMovement(forwardTurnMotors.motor1, forwardTurnMotors.motor2, forwardTurnMotors.motor3, forwardTurnMotors.motor4);
console.log('Movement:', forwardTurnMovement);
console.log(`Expected: vx > 0 (forward), omega > 0 (turn)`);
console.log(forwardTurnMovement.vx_robot > 0 && forwardTurnMovement.omega > 0 ? '✓ PASS' : '✗ FAIL\n');
