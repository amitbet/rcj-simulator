// Test Arduino motor patterns to understand the kinematics
// Motor mapping from Arduino code:
//   Arduino M1 = Front Left (FL) = Our motor1
//   Arduino M2 = Back Right (BR) = Our motor3
//   Arduino M3 = Back Left (BL) = Our motor4
//   Arduino M4 = Front Right (FR) = Our motor2

console.log('=== Arduino Motor Patterns ===\n');

// Forward: FL +, FR -, BL -, BR +
// In our terms: motor1 +, motor2 -, motor4 -, motor3 +
const forward = { motor1: 1, motor2: -1, motor3: 1, motor4: -1 };
console.log('Forward:', forward);

// Back: FL -, FR +, BL +, BR -
const back = { motor1: -1, motor2: 1, motor3: -1, motor4: 1 };
console.log('Back:', back);

// Left: FL -, FR -, BL +, BR +
const left = { motor1: -1, motor2: -1, motor3: 1, motor4: 1 };
console.log('Left:', left);

// Right: FL +, FR +, BL -, BR -
const right = { motor1: 1, motor2: 1, motor3: -1, motor4: -1 };
console.log('Right:', right);

// Rotate CW: FL +, FR +, BL -, BR -
const rotateCW = { motor1: 1, motor2: 1, motor3: -1, motor4: -1 };
console.log('Rotate CW:', rotateCW);

// Rotate CCW: FL -, FR -, BL +, BR +
const rotateCCW = { motor1: -1, motor2: -1, motor3: 1, motor4: 1 };
console.log('Rotate CCW:', rotateCCW);

// Derive forward kinematics: m1, m2, m3, m4 = f(vx, vy, omega)
// Where vx = forward/backward (forward = +), vy = left/right (right = +), omega = rotation (CW = +)

// From patterns:
// Forward (vx=1, vy=0, omega=0): m1=1, m2=-1, m3=1, m4=-1
// Back (vx=-1, vy=0, omega=0): m1=-1, m2=1, m3=-1, m4=1
// Left (vx=0, vy=-1, omega=0): m1=-1, m2=-1, m3=1, m4=1
// Right (vx=0, vy=1, omega=0): m1=1, m2=1, m3=-1, m4=-1
// Rotate CW (vx=0, vy=0, omega=1): m1=1, m2=1, m3=-1, m4=-1
// Rotate CCW (vx=0, vy=0, omega=-1): m1=-1, m2=-1, m3=1, m4=1

// Looking at the patterns:
// m1 = vx + vy + omega
// m2 = -vx + vy + omega
// m3 = vx - vy - omega
// m4 = -vx - vy - omega

console.log('\n=== Verifying Forward Kinematics ===\n');

function movementToMotors(vx, vy, omega) {
  return {
    motor1: vx + vy + omega,
    motor2: -vx + vy + omega,
    motor3: vx - vy - omega,
    motor4: -vx - vy - omega
  };
}

// Test all patterns
const tests = [
  { name: 'Forward', vx: 1, vy: 0, omega: 0, expected: forward },
  { name: 'Back', vx: -1, vy: 0, omega: 0, expected: back },
  { name: 'Left', vx: 0, vy: -1, omega: 0, expected: left },
  { name: 'Right', vx: 0, vy: 1, omega: 0, expected: right },
  { name: 'Rotate CW', vx: 0, vy: 0, omega: 1, expected: rotateCW },
  { name: 'Rotate CCW', vx: 0, vy: 0, omega: -1, expected: rotateCCW }
];

tests.forEach(test => {
  const result = movementToMotors(test.vx, test.vy, test.omega);
  const match = JSON.stringify(result) === JSON.stringify(test.expected);
  console.log(`${test.name}:`, result, match ? '✓' : '✗');
});

// Inverse kinematics
console.log('\n=== Inverse Kinematics ===\n');

function motorsToMovement(m1, m2, m3, m4) {
  // From forward kinematics:
  // m1 = vx + vy + omega
  // m2 = -vx + vy + omega
  // m3 = vx - vy - omega
  // m4 = -vx - vy - omega
  //
  // Solving:
  // m1 - m2 = 2*vx => vx = (m1 - m2) / 2
  // m1 + m2 = 2*vy + 2*omega => vy + omega = (m1 + m2) / 2
  // m3 + m4 = -2*vy - 2*omega => vy + omega = -(m3 + m4) / 2
  //
  // Also: m1 - m3 = 2*vy + 2*omega => vy + omega = (m1 - m3) / 2
  // And: m2 - m4 = 2*vy + 2*omega => vy + omega = (m2 - m4) / 2
  //
  // We can't separate vy and omega from these equations alone.
  // But we can get: vx, and (vy + omega)
  //
  // Actually, let's check if we can separate them:
  // m1 + m3 = 2*vx (no vy or omega)
  // m1 - m3 = 2*vy + 2*omega
  // m2 + m4 = -2*vx (no vy or omega)
  // m2 - m4 = 2*vy + 2*omega
  //
  // So we have: vx = (m1 - m2) / 2 = (m1 + m3) / 2 = -(m2 + m4) / 2
  // And: vy + omega = (m1 + m2) / 2 = (m1 - m3) / 2 = (m2 - m4) / 2 = -(m3 + m4) / 2
  //
  // For our purposes, we usually want either vy OR omega, not both.
  // When we want pure rotation, vy=0, so omega = (m1 + m2) / 2
  // When we want pure strafe, omega=0, so vy = (m1 + m2) / 2
  //
  // So the inverse kinematics returns vy+omega combined, which is fine for most cases.
  const vx = (m1 - m2) / 2;
  const vy_plus_omega = (m1 + m2) / 2;
  // We can't separate vy and omega, but for most movements we only use one at a time
  return { vx, vy_plus_omega };
}

// Test inverse
console.log('Forward inverse:', motorsToMovement(forward.motor1, forward.motor2, forward.motor3, forward.motor4));
console.log('Expected: vx=1, vy+omega=0');

console.log('\nRight inverse:', motorsToMovement(right.motor1, right.motor2, right.motor3, right.motor4));
console.log('Expected: vx=0, vy+omega=1');

console.log('\nRotate CW inverse:', motorsToMovement(rotateCW.motor1, rotateCW.motor2, rotateCW.motor3, rotateCW.motor4));
console.log('Expected: vx=0, vy+omega=1 (vy=0, omega=1)');

console.log('\n=== Forward Kinematics Formula ===');
console.log('m1 = vx + vy + omega');
console.log('m2 = -vx + vy + omega');
console.log('m3 = vx - vy - omega');
console.log('m4 = -vx - vy - omega');
