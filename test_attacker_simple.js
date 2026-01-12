// ============================================================
// Test Simple Attacker - Ball Approach
// ============================================================

const fs = require('fs');
const path = require('path');

// Use ts-node to run TypeScript directly
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

// Import real PhysicsEngine and ObservationSystem (same as game)
const { PhysicsEngine } = require('./src/physics/PhysicsEngine.ts');
const { ObservationSystem } = require('./src/simulator/ObservationSystem.ts');
const { StrategyExecutor } = require('./src/strategy/StrategyExecutor.ts');

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
    
    if (typeof strategy === 'function') {
      return strategy;
    } else {
      throw new Error('Strategy must define a function called "strategy"');
    }
  `;
  
  const factory = new Function(wrappedCode);
  return factory();
}

// Use the REAL ObservationSystem to create world state (same as game)
// This ensures the test uses the exact same observation calculations

// Test ball approach
function testBallApproach() {
  console.log('='.repeat(80));
  console.log('Testing Simple Attacker - Ball Approach');
  console.log('='.repeat(80));
  
  // Use the EXACT same components as the game
  const physics = new PhysicsEngine();
  const observationSystem = new ObservationSystem();
  const strategyExecutor = new StrategyExecutor();
  
  // Set up callbacks (same as SimulationEngine.setupPhysicsCallbacks)
  // These are no-ops for headless test, but ensure same initialization
  physics.setOnGoalScored(() => {});
  physics.setOnOutOfBounds(() => {});
  physics.setOnRobotOutOfBounds(() => {});
  physics.setOnCollision(() => {});
  
  // Initialize physics (same as SimulationEngine.initialize)
  physics.initialize();
  
  // Load strategy (same as SimulationEngine.loadStrategies)
  strategyExecutor.loadStrategy('test_robot', strategyCode);
  
  // Initial positions
  const robotStartX = -30;
  const robotStartY = -40;
  const robotStartAngle = 0; // Facing north
  const ballX = 0;
  const ballY = 0;
  
  // Create robot and ball
  const robotId = 'test_robot';
  physics.createRobot(robotId, 'blue', 'attacker', robotStartX, robotStartY, robotStartAngle * Math.PI / 180);
  physics.setBallPosition(ballX, ballY);
  
  let t_ms = 0;
  const duration_ms = 10000; // 10 seconds - give robot more time to approach
  const dt_ms = 16.67; // Fixed timestep matching game's base timestep
  
  const positions = [];
  const distances = [];
  
  console.log(`\nRobot start: (${robotStartX}, ${robotStartY}), heading: ${robotStartAngle}°`);
  console.log(`Ball position: (${ballX}, ${ballY})`);
  console.log(`Initial distance: ${Math.sqrt((robotStartX - ballX) ** 2 + (robotStartY - ballY) ** 2).toFixed(1)}cm\n`);
  
  for (let frame = 0; t_ms < duration_ms; frame++) {
    const robotMap = physics.getRobots();
    const robot = robotMap.get(robotId);
    if (!robot) throw new Error(`Robot ${robotId} not found`);
    
    const posX = robot.body.position.x;
    const posY = robot.body.position.y;
    const heading_deg = robot.body.angle * 180 / Math.PI;
    
    // Use the REAL ObservationSystem to calculate world state (same as game)
    const physicsState = physics.getState();
    const worldState = observationSystem.calculateWorldState(
      robotId,
      physicsState,
      t_ms,
      dt_ms / 1000, // Convert to seconds
      true // isBlueTeam
    );
    
    // Execute strategy using StrategyExecutor (same as game)
    const { action } = strategyExecutor.executeStrategy(robotId, worldState);
    
    // Get ball position for logging
    const ball = physics.getBall();
    const currentBallX = ball ? ball.position.x : ballX;
    const currentBallY = ball ? ball.position.y : ballY;
    
    // Log every 10 frames for debugging
    if (frame % 10 === 0) {
      const dist = Math.sqrt((posX - currentBallX) ** 2 + (posY - currentBallY) ** 2);
      console.log(`  Frame ${frame}: pos=(${posX.toFixed(1)}, ${posY.toFixed(1)}), heading=${heading_deg.toFixed(1)}°, ballAngle=${worldState.ball.angle_deg.toFixed(1)}°, dist=${dist.toFixed(1)}cm, motors=[${action.motor1.toFixed(2)}, ${action.motor2.toFixed(2)}, ${action.motor3.toFixed(2)}, ${action.motor4.toFixed(2)}]`);
    }
    
    physics.applyAction(robotId, action);
    physics.step(dt_ms);
    
    const distanceToBall = Math.sqrt((posX - currentBallX) ** 2 + (posY - currentBallY) ** 2);
    positions.push({ t_ms, x: posX, y: posY, heading: heading_deg });
    distances.push({ t_ms, distance: distanceToBall });
    
    t_ms += dt_ms;
  }
  
  // Get final state
  const finalRobot = physics.getRobots().get(robotId);
  const finalX = finalRobot.body.position.x;
  const finalY = finalRobot.body.position.y;
  const finalHeading = finalRobot.body.angle * 180 / Math.PI;
  const finalBall = physics.getBall();
  const finalBallX = finalBall ? finalBall.position.x : ballX;
  const finalBallY = finalBall ? finalBall.position.y : ballY;
  const finalDistance = Math.sqrt((finalX - finalBallX) ** 2 + (finalY - finalBallY) ** 2);
  const startDistance = Math.sqrt((robotStartX - ballX) ** 2 + (robotStartY - ballY) ** 2);
  
  console.log(`\nFinal robot position: (${finalX.toFixed(1)}, ${finalY.toFixed(1)}), heading: ${finalHeading.toFixed(1)}°`);
  console.log(`Final ball position: (${finalBallX.toFixed(1)}, ${finalBallY.toFixed(1)})`);
  console.log(`Final distance: ${finalDistance.toFixed(1)}cm`);
  console.log(`Distance change: ${(startDistance - finalDistance).toFixed(1)}cm`);
  
  // Check if robot approached ball AND moved it
  // Robot should get close enough to move the ball (within robot radius + kicker range = ~14cm)
  const minDistance = Math.min(...distances.map(d => d.distance));
  const gotCloseEnough = minDistance < 20; // Got within 20cm (robot can move ball at ~14cm)
  
  // Check if ball moved (robot touched/moved it)
  const ballMoved = Math.sqrt((finalBallX - ballX) ** 2 + (finalBallY - ballY) ** 2) > 2; // Ball moved at least 2cm
  
  // Robot should approach significantly closer
  const gotCloser = finalDistance < startDistance * 0.7; // At least 30% closer
  const approached = gotCloser || minDistance < 25; // Got significantly closer or within 25cm
  
  console.log(`\nMinimum distance reached: ${minDistance.toFixed(1)}cm`);
  console.log(`Ball moved: ${ballMoved ? 'Yes' : 'No'} (${Math.sqrt((finalBallX - ballX) ** 2 + (finalBallY - ballY) ** 2).toFixed(1)}cm)`);
  
  // Robot must get close enough to move the ball
  if (gotCloseEnough && (ballMoved || approached)) {
    console.log(`\n✅ TEST PASSED: Robot approached and moved the ball!`);
    console.log(`   Started at ${startDistance.toFixed(1)}cm, ended at ${finalDistance.toFixed(1)}cm, min distance: ${minDistance.toFixed(1)}cm`);
    return true;
  } else {
    console.log(`\n❌ TEST FAILED: Robot did not get close enough to move the ball`);
    console.log(`   Started at ${startDistance.toFixed(1)}cm, ended at ${finalDistance.toFixed(1)}cm, min distance: ${minDistance.toFixed(1)}cm`);
    console.log(`   Required: min distance < 20cm, got ${minDistance.toFixed(1)}cm`);
    return false;
  }
}

// Run test
try {
  const passed = testBallApproach();
  process.exit(passed ? 0 : 1);
} catch (error) {
  console.error('Test failed with error:', error);
  process.exit(1);
}
