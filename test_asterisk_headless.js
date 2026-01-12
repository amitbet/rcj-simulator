// ============================================================
// Headless Test for Asterisk Movement Pattern
// Moves in 8 directions (N, NE, E, SE, S, SW, W, NW) then returns to center
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
const strategyCode = fs.readFileSync(path.join(__dirname, 'src/strategies/attacker_asterisk.js'), 'utf-8');

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

function testAsteriskPattern() {
  console.log('='.repeat(80));
  console.log('Testing Asterisk Movement Pattern (using real PhysicsEngine)');
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
  const steps = [];
  
  const duration_ms = 10000; // 10 seconds for 8 directions + return
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
  
  const expectedStepDuration = 1000; // ms
  let stepStartPosX = posX;
  let stepStartPosY = posY;
  let stepStartTime = t_ms;
  let lastMotors = null;
  let lastStepTransitionTime = 0;
  
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
    
    const motorChanged = lastMotors && (
      Math.abs(action.motor1 - lastMotors.motor1) > 0.1 ||
      Math.abs(action.motor2 - lastMotors.motor2) > 0.1 ||
      Math.abs(action.motor3 - lastMotors.motor3) > 0.1 ||
      Math.abs(action.motor4 - lastMotors.motor4) > 0.1
    );
    const timeSinceLastTransition = t_ms - lastStepTransitionTime;
    const timeElapsed = timeSinceLastTransition >= expectedStepDuration * 0.8;
    
    if (motorChanged && timeElapsed && steps.length < 15 && lastStepTransitionTime > 0) {
      const stepDistance = Math.sqrt((posX - stepStartPosX) ** 2 + (posY - stepStartPosY) ** 2);
      const totalDx = posX - stepStartPosX;
      const totalDy = posY - stepStartPosY;
      
      let currentDir = null;
      if (stepDistance > 0.3) {
        const dxAbs = Math.abs(totalDx);
        const dyAbs = Math.abs(totalDy);
        
        // Check if returning to center
        const distFromStart = Math.sqrt(posX ** 2 + posY ** 2);
        if (distFromStart < 5 && steps.length >= 8) {
          currentDir = 'center';
        } else {
          // Check if diagonal: both components are significant
          const maxComponent = Math.max(dxAbs, dyAbs);
          const minComponent = Math.min(dxAbs, dyAbs);
          const isDiagonal = minComponent > maxComponent * 0.3;
          
          if (isDiagonal) {
            // Diagonal movement
            if (totalDx > 0 && totalDy < 0) currentDir = 'northeast';
            else if (totalDx > 0 && totalDy > 0) currentDir = 'southeast';
            else if (totalDx < 0 && totalDy > 0) currentDir = 'southwest';
            else if (totalDx < 0 && totalDy < 0) currentDir = 'northwest';
          } else if (dxAbs > dyAbs * 1.5) {
            currentDir = totalDx > 0 ? 'east' : 'west';
          } else if (dyAbs > dxAbs * 1.5) {
            currentDir = totalDy > 0 ? 'south' : 'north';
          }
        }
      }
      
      if (currentDir) {
        steps.push({
          stepIndex: steps.length,
          direction: currentDir,
          startTime: stepStartTime,
          startPos: { x: stepStartPosX, y: stepStartPosY },
          endPos: { x: posX, y: posY }
        });
        
        stepStartPosX = posX;
        stepStartPosY = posY;
        stepStartTime = t_ms;
        lastStepTransitionTime = t_ms;
      }
    }
    
    if (lastStepTransitionTime === 0) {
      lastStepTransitionTime = t_ms;
    }
    
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
    lastMotors = { ...action };
    
    t_ms += dt_ms;
  }
  
  const finalStepDistance = Math.sqrt((posX - stepStartPosX) ** 2 + (posY - stepStartPosY) ** 2);
  if (finalStepDistance > 0.3 && steps.length < 15) {
    const totalDx = posX - stepStartPosX;
    const totalDy = posY - stepStartPosY;
    const dxAbs = Math.abs(totalDx);
    const dyAbs = Math.abs(totalDy);
    const distFromStart = Math.sqrt(posX ** 2 + posY ** 2);
    
    let finalDir = null;
    if (distFromStart < 5 && steps.length >= 8) {
      finalDir = 'center';
    } else {
      const maxComponent = Math.max(dxAbs, dyAbs);
      const minComponent = Math.min(dxAbs, dyAbs);
      const isDiagonal = minComponent > maxComponent * 0.3;
      
      if (isDiagonal) {
        if (totalDx > 0 && totalDy < 0) finalDir = 'northeast';
        else if (totalDx > 0 && totalDy > 0) finalDir = 'southeast';
        else if (totalDx < 0 && totalDy > 0) finalDir = 'southwest';
        else if (totalDx < 0 && totalDy < 0) finalDir = 'northwest';
      } else if (dxAbs > dyAbs * 1.5) {
        finalDir = totalDx > 0 ? 'east' : 'west';
      } else if (dyAbs > dxAbs * 1.5) {
        finalDir = totalDy > 0 ? 'south' : 'north';
      }
    }
    if (finalDir) {
      steps.push({
        stepIndex: steps.length,
        direction: finalDir,
        startTime: stepStartTime,
        startPos: { x: stepStartPosX, y: stepStartPosY },
        endPos: { x: posX, y: posY }
      });
    }
  }
  
  console.log(`\nSimulation complete. Total frames: ${positions.length}`);
  console.log(`\nDetected ${steps.length} movement steps:\n`);
  
  steps.forEach((step, idx) => {
    const endPos = step.endPos || step.startPos;
    const nextStep = steps[idx + 1];
    const duration = nextStep ? (nextStep.startTime - step.startTime) : (duration_ms - step.startTime);
    
    if (!endPos || typeof endPos.x !== 'number' || typeof endPos.y !== 'number') {
      console.log(`Step ${idx + 1}: ${step.direction} - INCOMPLETE`);
      return;
    }
    
    const dx = endPos.x - step.startPos.x;
    const dy = endPos.y - step.startPos.y;
    const distance = Math.sqrt(dx * dx + dy * dy);
    
    console.log(`Step ${idx + 1}: ${step.direction}`);
    console.log(`  Duration: ${duration.toFixed(0)}ms`);
    console.log(`  Distance: ${distance.toFixed(2)}cm`);
    console.log(`  Start: (${step.startPos.x.toFixed(2)}, ${step.startPos.y.toFixed(2)})`);
    console.log(`  End: (${endPos.x.toFixed(2)}, ${endPos.y.toFixed(2)})`);
    console.log(`  Delta: (${dx.toFixed(2)}, ${dy.toFixed(2)})`);
    console.log('');
  });
  
  const expectedSteps = ['north', 'northeast', 'east', 'southeast', 'south', 'southwest', 'west', 'northwest', 'center'];
  const actualSteps = steps.map(s => s.direction);
  
  console.log('Expected pattern:', expectedSteps.join(' → '));
  console.log('Actual pattern:  ', actualSteps.slice(0, 9).join(' → '));
  
  let passed = true;
  if (actualSteps.length < 8) {
    console.log('\n❌ FAILED: Not enough steps detected');
    passed = false;
  } else {
    // Check first 8 directions
    for (let i = 0; i < 8; i++) {
      if (actualSteps[i] !== expectedSteps[i]) {
        console.log(`\n❌ FAILED: Step ${i + 1} expected ${expectedSteps[i]}, got ${actualSteps[i]}`);
        passed = false;
      }
    }
    // Check if returned to center (last step should be 'center' or close to start)
    const finalPos = positions[positions.length - 1];
    const distFromStart = Math.sqrt(finalPos.posX ** 2 + finalPos.posY ** 2);
    if (distFromStart > 20) {
      console.log(`\n⚠️  WARNING: Did not return to center. Final distance: ${distFromStart.toFixed(2)}cm`);
    }
  }
  
  if (passed) {
    console.log('\n✅ TEST PASSED: Asterisk pattern is correct!');
  } else {
    console.log('\n❌ TEST FAILED: Pattern does not match expected');
  }
  
  console.log('\n' + '='.repeat(80));
  
  return { passed, steps, positions };
}

try {
  const result = testAsteriskPattern();
  process.exit(result.passed ? 0 : 1);
} catch (error) {
  console.error('Test failed with error:', error);
  process.exit(1);
}
