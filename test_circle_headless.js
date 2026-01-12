// ============================================================
// Headless Test for Circle Movement Pattern
// Moves in a circle by rotating while moving forward
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
const types = require('./src/types/index.ts');
const Team = types.Team;
const RobotRole = types.RobotRole;

// Load the strategy code
const strategyCode = fs.readFileSync(path.join(__dirname, 'src/strategies/attacker_circle.js'), 'utf-8');

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

function testCirclePattern() {
  console.log('='.repeat(80));
  console.log('Testing Circle Movement Pattern (using real PhysicsEngine)');
  console.log('='.repeat(80));
  
  const strategyFunc = createSandboxedStrategy(strategyCode);
  
  const physics = new PhysicsEngine();
  physics.setOnGoalScored(() => {});
  physics.setOnOutOfBounds(() => {});
  physics.setOnRobotOutOfBounds(() => {});
  physics.setOnCollision(() => {});
  physics.initialize();
  
  const startX = 0;
  const startY = 0;
  const startAngle = 0; // Facing north (0°)
  
  const robotId = 'test_robot';
  physics.createRobot(robotId, 'blue', 'attacker', startX, startY, startAngle * Math.PI / 180);
  
  let t_ms = 0;
  const positions = [];
  
  const duration_ms = 5000; // 5 seconds
  const dt_ms = 16.67;
  
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
  
  for (let frame = 0; t_ms < duration_ms; frame++) {
    const robotMap = physics.getRobots();
    const robot = robotMap.get(robotId);
    if (!robot) {
      throw new Error(`Robot ${robotId} not found`);
    }
    posX = robot.body.position.x;
    posY = robot.body.position.y;
    heading_deg = robot.body.angle * 180 / Math.PI;
    
    const worldState = createWorldState(t_ms, heading_deg);
    const action = strategyFunc(worldState);
    
    physics.applyAction(robotId, action);
    physics.step(dt_ms);
    
    const updatedRobotMap = physics.getRobots();
    const updatedRobot = updatedRobotMap.get(robotId);
    if (!updatedRobot) {
      throw new Error(`Robot ${robotId} not found`);
    }
    posX = updatedRobot.body.position.x;
    posY = updatedRobot.body.position.y;
    heading_deg = updatedRobot.body.angle * 180 / Math.PI;
    
    positions.push({ t_ms, posX, posY, heading_deg, motors: action });
    
    t_ms += dt_ms;
  }
  
  const startPos = positions[0];
  const endPos = positions[positions.length - 1];
  const finalDistance = Math.sqrt((endPos.posX - startPos.posX) ** 2 + (endPos.posY - startPos.posY) ** 2);
  const totalRotation = endPos.heading_deg - startPos.heading_deg;
  
  // Calculate average radius (distance from start)
  // Skip first 10 frames to avoid initial position affecting min radius
  const distances = positions.slice(10).map(p => Math.sqrt((p.posX - startPos.posX) ** 2 + (p.posY - startPos.posY) ** 2));
  const avgRadius = distances.length > 0 ? distances.reduce((a, b) => a + b, 0) / distances.length : 0;
  const maxRadius = distances.length > 0 ? Math.max(...distances) : 0;
  const minRadius = distances.length > 0 ? Math.min(...distances) : 0;
  const radiusVariation = maxRadius - minRadius;
  
  console.log(`\nSimulation complete. Total frames: ${positions.length}`);
  console.log(`\nCircle Pattern Analysis:`);
  console.log(`  Start position: (${startPos.posX.toFixed(2)}, ${startPos.posY.toFixed(2)})`);
  console.log(`  End position: (${endPos.posX.toFixed(2)}, ${endPos.posY.toFixed(2)})`);
  console.log(`  Distance from start: ${finalDistance.toFixed(2)}cm`);
  console.log(`  Total rotation: ${totalRotation.toFixed(1)}°`);
  console.log(`  Average radius: ${avgRadius.toFixed(2)}cm`);
  console.log(`  Radius variation: ${radiusVariation.toFixed(2)}cm`);
  console.log(`  Max radius: ${maxRadius.toFixed(2)}cm`);
  console.log(`  Min radius: ${minRadius.toFixed(2)}cm`);
  
  // Check if it's a good circle
  let passed = true;
  const issues = [];
  
  // Should rotate significantly (at least 180°)
  if (Math.abs(totalRotation) < 180) {
    issues.push(`Insufficient rotation: ${totalRotation.toFixed(1)}° (expected at least 180°)`);
    passed = false;
  }
  
  // Should maintain roughly constant radius (variation < 120% of average)
  // Allow larger variation since robot starts at center and expands outward
  if (avgRadius > 10 && radiusVariation / avgRadius > 1.2) {
    issues.push(`Radius variation too large: ${radiusVariation.toFixed(2)}cm (${((radiusVariation/avgRadius)*100).toFixed(1)}% of average)`);
    passed = false;
  }
  
  // Should not return to start (circle, not back-and-forth)
  if (finalDistance < avgRadius * 0.5) {
    issues.push(`Returned too close to start: ${finalDistance.toFixed(2)}cm (expected > ${(avgRadius*0.5).toFixed(2)}cm)`);
    passed = false;
  }
  
  if (issues.length > 0) {
    console.log(`\n⚠️  Issues:`);
    issues.forEach(issue => console.log(`   - ${issue}`));
  }
  
  if (passed) {
    console.log('\n✅ TEST PASSED: Circle pattern is correct!');
  } else {
    console.log('\n❌ TEST FAILED: Pattern does not match expected');
  }
  
  console.log('\n' + '='.repeat(80));
  
  return { passed, positions, avgRadius, totalRotation };
}

try {
  const result = testCirclePattern();
  process.exit(result.passed ? 0 : 1);
} catch (error) {
  console.error('Test failed with error:', error);
  process.exit(1);
}
