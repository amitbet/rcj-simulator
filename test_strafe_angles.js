// Test strafing at various angles

function clamp(val, min, max) {
  return Math.max(min, Math.min(max, val));
}

function movementToMotors(vx, vy, omega) {
  return {
    motor1: clamp(vx + vy + omega, -1, 1),
    motor2: clamp(-vx + vy + omega, -1, 1),
    motor3: clamp(vx - vy - omega, -1, 1),
    motor4: clamp(-vx - vy - omega, -1, 1)
  };
}

function strafeAtAngle(angle_deg, speed, omega = 0) {
  const angle_rad = angle_deg * Math.PI / 180;
  const vx = speed * Math.cos(angle_rad);
  const vy = speed * Math.sin(angle_rad);
  return movementToMotors(vx, vy, omega);
}

function motorsToMovement(m1, m2, m3, m4) {
  const vx = (m1 - m2) / 2;
  const vy_plus_omega = (m1 + m2) / 2;
  return { vx, vy_plus_omega };
}

console.log('=== Testing Strafe at Various Angles ===\n');

const angles = [0, 12, 30, 45, 60, 90, -12, -30, -45, -60, -90, 180];
const speed = 0.5;

angles.forEach(angle => {
  const motors = strafeAtAngle(angle, speed, 0);
  const movement = motorsToMovement(motors.motor1, motors.motor2, motors.motor3, motors.motor4);
  const expectedVx = speed * Math.cos(angle * Math.PI / 180);
  const expectedVy = speed * Math.sin(angle * Math.PI / 180);
  const vxError = Math.abs(movement.vx - expectedVx);
  const vyError = Math.abs(movement.vy_plus_omega - expectedVy);
  
  console.log(`Angle ${angle.toString().padStart(4)}°:`, {
    motors: `[${motors.motor1.toFixed(2)}, ${motors.motor2.toFixed(2)}, ${motors.motor3.toFixed(2)}, ${motors.motor4.toFixed(2)}]`,
    vx: movement.vx.toFixed(3),
    vy: movement.vy_plus_omega.toFixed(3),
    expectedVx: expectedVx.toFixed(3),
    expectedVy: expectedVy.toFixed(3),
    vxError: vxError < 0.01 ? '✓' : `✗ ${vxError.toFixed(3)}`,
    vyError: vyError < 0.01 ? '✓' : `✗ ${vyError.toFixed(3)}`
  });
});

console.log('\n=== Testing Arc Movement (strafe at angle while facing forward) ===\n');

// Simulate moving along an arc at 45° while maintaining forward orientation
console.log('Arc movement at 45° (forward-right diagonal):');
const arcMotors = strafeAtAngle(45, 0.5, 0);
console.log('Motors:', arcMotors);
const arcMovement = motorsToMovement(arcMotors.motor1, arcMotors.motor2, arcMotors.motor3, arcMotors.motor4);
console.log('Movement:', arcMovement);
console.log('Expected: vx ≈ 0.354 (forward), vy ≈ 0.354 (right)');

// Test moving along arc at 12° (slight angle)
console.log('\nArc movement at 12° (slight forward-right):');
const arc12Motors = strafeAtAngle(12, 0.5, 0);
console.log('Motors:', arc12Motors);
const arc12Movement = motorsToMovement(arc12Motors.motor1, arc12Motors.motor2, arc12Motors.motor3, arc12Motors.motor4);
console.log('Movement:', arc12Movement);
console.log('Expected: vx ≈ 0.489 (forward), vy ≈ 0.104 (right)');
