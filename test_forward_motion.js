// Test forward motion - find which motor pattern actually moves forward
const fs = require('fs');
const path = require('path');

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

console.log('=== Testing Forward Motion Patterns ===\n');

const patterns = [
  { name: 'Pattern 1: [+1, -1, -1, +1] (from diagram)', motors: { motor1: 1, motor2: -1, motor3: -1, motor4: 1 } },
  { name: 'Pattern 2: [-1, +1, +1, -1] (backward)', motors: { motor1: -1, motor2: 1, motor3: 1, motor4: -1 } },
  { name: 'Pattern 3: [+1, +1, -1, -1] (strafe right)', motors: { motor1: 1, motor2: 1, motor3: -1, motor4: -1 } },
  { name: 'Pattern 4: [-1, -1, +1, +1] (strafe left)', motors: { motor1: -1, motor2: -1, motor3: 1, motor4: 1 } },
  { name: 'Pattern 5: [+1, +1, +1, +1] (rotate CW)', motors: { motor1: 1, motor2: 1, motor3: 1, motor4: 1 } },
  { name: 'Pattern 6: [-1, -1, -1, -1] (rotate CCW)', motors: { motor1: -1, motor2: -1, motor3: -1, motor4: -1 } },
];

patterns.forEach(pattern => {
  const physics = new PhysicsEngine();
  physics.setOnGoalScored(() => {});
  physics.setOnOutOfBounds(() => {});
  physics.setOnRobotOutOfBounds(() => {});
  physics.setOnCollision(() => {});
  physics.initialize();
  
  const robotId = 'test_robot';
  physics.createRobot(robotId, 'blue', 'attacker', 0, 0, 0); // Start at origin, facing north (0°)
  
  const posBefore = { x: 0, y: 0 };
  
  // Apply action 10 times
  for (let i = 0; i < 10; i++) {
    physics.applyAction(robotId, { ...pattern.motors, kick: false });
    physics.step(16.67); // One frame
  }
  
  const robot = physics.getRobots().get(robotId);
  const posAfter = { x: robot.body.position.x, y: robot.body.position.y };
  
  const dx = posAfter.x - posBefore.x;
  const dy = posAfter.y - posBefore.y;
  const dist = Math.sqrt(dx * dx + dy * dy);
  const angle = Math.atan2(dy, dx) * 180 / Math.PI;
  
  console.log(pattern.name);
  console.log(`  Motors: [${pattern.motors.motor1}, ${pattern.motors.motor2}, ${pattern.motors.motor3}, ${pattern.motors.motor4}]`);
  console.log(`  Movement: dx=${dx.toFixed(2)}cm (east), dy=${dy.toFixed(2)}cm (north, Matter.js Y+ is DOWN)`);
  console.log(`  Distance: ${dist.toFixed(2)}cm, Angle: ${angle.toFixed(1)}°`);
  
  // Check if it moved forward (north, negative Y in Matter.js)
  const movedForward = Math.abs(dx) < 0.5 && dy < -0.5; // Small east movement, significant north movement
  const movedLeft = dx < -0.5 && Math.abs(dy) < 0.5; // Significant west movement, small north movement
  const movedRight = dx > 0.5 && Math.abs(dy) < 0.5; // Significant east movement, small north movement
  
  if (movedForward) {
    console.log(`  ✓ MOVED FORWARD (north)`);
  } else if (movedLeft) {
    console.log(`  → MOVED LEFT (west)`);
  } else if (movedRight) {
    console.log(`  → MOVED RIGHT (east)`);
  } else {
    console.log(`  ? MOVED DIAGONALLY or other`);
  }
  console.log('');
});
