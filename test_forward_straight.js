// ============================================================
// Test: Move Straight Forward When Aligned with Ball
// ============================================================

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
const { ObservationSystem } = require('./src/simulator/ObservationSystem.ts');
const { StrategyExecutor } = require('./src/strategy/StrategyExecutor.ts');

// Simple strategy: just move forward
const strategyCode = `
  const MOVEMENT_SPEED = 0.5;
  
  function strategy(worldState) {
    // Always move forward - pure forward motors
    return {
      motor1: MOVEMENT_SPEED,
      motor2: -MOVEMENT_SPEED,
      motor3: MOVEMENT_SPEED,
      motor4: -MOVEMENT_SPEED,
      kick: false
    };
  }
`;

function createSandboxedStrategy(code) {
  const wrappedCode = `
    "use strict";
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

// Test: Robot starts aligned with ball, just move forward
const physics = new PhysicsEngine();
const observationSystem = new ObservationSystem();
const strategyExecutor = new StrategyExecutor();

physics.setOnGoalScored(() => {});
physics.setOnOutOfBounds(() => {});
physics.setOnRobotOutOfBounds(() => {});
physics.setOnCollision(() => {});
physics.initialize();

strategyExecutor.loadStrategy('test_robot', strategyCode);

// Robot starts at (-30, -40), ball at (0, 0)
// Robot facing north (0°) - ball is at ~53° relative, so let's start robot facing the ball
const robotStartX = -30;
const robotStartY = -40;
const ballX = 0;
const ballY = 0;

// Calculate angle to ball
const dx = ballX - robotStartX;
const dy = ballY - robotStartY;
const angleToBall = Math.atan2(dx, -dy) * 180 / Math.PI; // Robot-relative: atan2(dx, -dy)

const robotId = 'test_robot';
physics.createRobot(robotId, 'blue', 'attacker', robotStartX, robotStartY, angleToBall * Math.PI / 180);
physics.setBallPosition(ballX, ballY);

let t_ms = 0;
const duration_ms = 2000; // 2 seconds
const dt_ms = 16.67;

console.log(`\nRobot start: (${robotStartX}, ${robotStartY}), heading: ${angleToBall.toFixed(1)}° (facing ball)`);
console.log(`Ball position: (${ballX}, ${ballY})`);

const initialDist = Math.sqrt((robotStartX - ballX) ** 2 + (robotStartY - ballY) ** 2);
console.log(`Initial distance: ${initialDist.toFixed(1)}cm\n`);

for (let frame = 0; frame < duration_ms / dt_ms; frame++) {
  const robot = physics.getRobots().get(robotId);
  const posX = robot.body.position.x;
  const posY = robot.body.position.y;
  const heading_deg = robot.body.angle * 180 / Math.PI;
  
  const worldState = observationSystem.calculateWorldState(robotId, physics, t_ms, dt_ms / 1000);
  const { action } = strategyExecutor.executeStrategy(robotId, worldState);
  
  if (frame % 10 === 0) {
    const dist = Math.sqrt((posX - ballX) ** 2 + (posY - ballY) ** 2);
    const ballAngle = worldState.ball.angle_deg;
    console.log(`Frame ${frame}: pos=(${posX.toFixed(1)}, ${posY.toFixed(1)}), heading=${heading_deg.toFixed(1)}°, ballAngle=${ballAngle.toFixed(1)}°, dist=${dist.toFixed(1)}cm, motors=[${action.motor1.toFixed(2)}, ${action.motor2.toFixed(2)}, ${action.motor3.toFixed(2)}, ${action.motor4.toFixed(2)}]`);
  }
  
  physics.applyAction(robotId, action);
  physics.step(dt_ms);
  
  t_ms += dt_ms;
}

const finalRobot = physics.getRobots().get(robotId);
const finalX = finalRobot.body.position.x;
const finalY = finalRobot.body.position.y;
const finalHeading = finalRobot.body.angle * 180 / Math.PI;
const finalDist = Math.sqrt((finalX - ballX) ** 2 + (finalY - ballY) ** 2);

console.log(`\nFinal robot position: (${finalX.toFixed(1)}, ${finalY.toFixed(1)}), heading: ${finalHeading.toFixed(1)}°`);
console.log(`Final distance: ${finalDist.toFixed(1)}cm`);
console.log(`Distance change: ${(initialDist - finalDist).toFixed(1)}cm`);
console.log(`Heading change: ${(finalHeading - angleToBall).toFixed(1)}°`);

if (finalDist < initialDist) {
  console.log(`\n✅ Robot moved toward ball!`);
  process.exit(0);
} else {
  console.log(`\n❌ Robot moved away from ball!`);
  process.exit(1);
}
