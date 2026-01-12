// Test omni wheel kinematics
// Tests forward kinematics (motor speeds -> movement) and inverse kinematics (movement -> motor speeds)

// Mock the physics engine's applyAction to capture movement
class TestPhysicsEngine {
  constructor() {
    this.lastMovement = null;
  }

  // Inverse kinematics: motor speeds -> robot movement
  // This matches the PhysicsEngine implementation
  motorSpeedsToMovement(motor1, motor2, motor3, motor4, robotAngle) {
    const sqrt2 = Math.sqrt(2);
    const vx_robot = (motor1 - motor2 - motor3 + motor4) / (2 * sqrt2);
    const vy_robot = (motor1 + motor2 - motor3 - motor4) / (2 * sqrt2);
    const omega = (motor1 + motor2 + motor3 + motor4) / 4;

    // Transform to world coordinates
    const cosAngle = Math.cos(robotAngle);
    const sinAngle = Math.sin(robotAngle);
    const vx_world = vx_robot * cosAngle - vy_robot * sinAngle;
    const vy_world = vx_robot * sinAngle + vy_robot * cosAngle;

    return { vx_world, vy_world, omega, vx_robot, vy_robot };
  }

  // Forward kinematics: desired movement -> motor speeds
  // This is what the strategy should use
  // vx = left/right (right = +), vy = forward/backward (forward = +)
  movementToMotorSpeeds(vx, vy, omega) {
    const sqrt2 = Math.sqrt(2);
    // Based on inverse kinematics, forward kinematics is:
    // m1 = (vx + vy) / sqrt(2) + ω
    // m2 = (-vx + vy) / sqrt(2) + ω
    // m3 = (-vx - vy) / sqrt(2) + ω
    // m4 = (vx - vy) / sqrt(2) + ω
    const motor1 = (vx + vy) / sqrt2 + omega;
    const motor2 = (-vx + vy) / sqrt2 + omega;
    const motor3 = (-vx - vy) / sqrt2 + omega;
    const motor4 = (vx - vy) / sqrt2 + omega;
    return { motor1, motor2, motor3, motor4 };
  }
}

const engine = new TestPhysicsEngine();

console.log('=== Testing Omni Wheel Kinematics ===\n');

// Test 1: Forward movement
console.log('Test 1: Forward movement');
const forwardMotors = engine.movementToMotorSpeeds(1.0, 0, 0);
console.log('Motor speeds:', forwardMotors);
const forwardMovement = engine.motorSpeedsToMovement(
  forwardMotors.motor1, forwardMotors.motor2, forwardMotors.motor3, forwardMotors.motor4, 0
);
console.log('Result movement:', forwardMovement);
console.log('Expected: vx_robot ≈ 1.0, vy_robot ≈ 0, omega ≈ 0');
console.log(`✓ Forward: vx=${forwardMovement.vx_robot.toFixed(3)}, vy=${forwardMovement.vy_robot.toFixed(3)}, ω=${forwardMovement.omega.toFixed(3)}\n`);

// Test 2: Backward movement
console.log('Test 2: Backward movement');
const backwardMotors = engine.movementToMotorSpeeds(-1.0, 0, 0);
console.log('Motor speeds:', backwardMotors);
const backwardMovement = engine.motorSpeedsToMovement(
  backwardMotors.motor1, backwardMotors.motor2, backwardMotors.motor3, backwardMotors.motor4, 0
);
console.log('Result movement:', backwardMovement);
console.log(`✓ Backward: vx=${backwardMovement.vx_robot.toFixed(3)}, vy=${backwardMovement.vy_robot.toFixed(3)}, ω=${backwardMovement.omega.toFixed(3)}\n`);

// Test 3: Strafe right
console.log('Test 3: Strafe right');
const strafeRightMotors = engine.movementToMotorSpeeds(0, 1.0, 0);
console.log('Motor speeds:', strafeRightMotors);
const strafeRightMovement = engine.motorSpeedsToMovement(
  strafeRightMotors.motor1, strafeRightMotors.motor2, strafeRightMotors.motor3, strafeRightMotors.motor4, 0
);
console.log('Result movement:', strafeRightMovement);
console.log(`✓ Strafe right: vx=${strafeRightMovement.vx_robot.toFixed(3)}, vy=${strafeRightMovement.vy_robot.toFixed(3)}, ω=${strafeRightMovement.omega.toFixed(3)}\n`);

// Test 4: Strafe left
console.log('Test 4: Strafe left');
const strafeLeftMotors = engine.movementToMotorSpeeds(0, -1.0, 0);
console.log('Motor speeds:', strafeLeftMotors);
const strafeLeftMovement = engine.motorSpeedsToMovement(
  strafeLeftMotors.motor1, strafeLeftMotors.motor2, strafeLeftMotors.motor3, strafeLeftMotors.motor4, 0
);
console.log('Result movement:', strafeLeftMovement);
console.log(`✓ Strafe left: vx=${strafeLeftMovement.vx_robot.toFixed(3)}, vy=${strafeLeftMovement.vy_robot.toFixed(3)}, ω=${strafeLeftMovement.omega.toFixed(3)}\n`);

// Test 5: Rotate clockwise
console.log('Test 5: Rotate clockwise');
const rotateCWMotors = engine.movementToMotorSpeeds(0, 0, 1.0);
console.log('Motor speeds:', rotateCWMotors);
const rotateCWMovement = engine.motorSpeedsToMovement(
  rotateCWMotors.motor1, rotateCWMotors.motor2, rotateCWMotors.motor3, rotateCWMotors.motor4, 0
);
console.log('Result movement:', rotateCWMovement);
console.log(`✓ Rotate CW: vx=${rotateCWMovement.vx_robot.toFixed(3)}, vy=${rotateCWMovement.vy_robot.toFixed(3)}, ω=${rotateCWMovement.omega.toFixed(3)}\n`);

// Test 6: Rotate counter-clockwise
console.log('Test 6: Rotate counter-clockwise');
const rotateCCWMotors = engine.movementToMotorSpeeds(0, 0, -1.0);
console.log('Motor speeds:', rotateCCWMotors);
const rotateCCWMovement = engine.motorSpeedsToMovement(
  rotateCCWMotors.motor1, rotateCCWMotors.motor2, rotateCCWMotors.motor3, rotateCCWMotors.motor4, 0
);
console.log('Result movement:', rotateCCWMovement);
console.log(`✓ Rotate CCW: vx=${rotateCCWMovement.vx_robot.toFixed(3)}, vy=${rotateCCWMovement.vy_robot.toFixed(3)}, ω=${rotateCCWMovement.omega.toFixed(3)}\n`);

// Test 7: Combined movement (strafe + forward + rotate)
console.log('Test 7: Combined movement (strafe right + forward + rotate)');
const combinedMotors = engine.movementToMotorSpeeds(0.5, 0.5, 0.3);
console.log('Motor speeds:', combinedMotors);
const combinedMovement = engine.motorSpeedsToMovement(
  combinedMotors.motor1, combinedMotors.motor2, combinedMotors.motor3, combinedMotors.motor4, 0
);
console.log('Result movement:', combinedMovement);
console.log(`✓ Combined: vx=${combinedMovement.vx_robot.toFixed(3)}, vy=${combinedMovement.vy_robot.toFixed(3)}, ω=${combinedMovement.omega.toFixed(3)}\n`);

console.log('=== All kinematics tests complete ===');
