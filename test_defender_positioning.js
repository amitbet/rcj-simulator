// Test script to visualize defender positioning in DEFENDING mode
// Run with: node test_defender_positioning.js

const fs = require('fs');
const vm = require('vm');
const path = require('path');

// Load the defender strategy code
const strategyCode = fs.readFileSync(path.join(__dirname, 'src/strategies/defender.js'), 'utf8');

// Create sandboxed environment similar to StrategyExecutor
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
    
    // Clamp helper
    function clamp(val, min, max) {
      return Math_max(min, Math_min(max, val));
    }
    
    // Normalize angle to -180..180
    function normalizeAngle(angle) {
      while (angle > 180) angle -= 360;
      while (angle < -180) angle += 360;
      return angle;
    }
    
    // Mock fetch to avoid errors
    const fetch = function() { return Promise.resolve(); };
    
    ${code}
    
    // Return the strategy function wrapped to capture state and target
    if (typeof strategy === 'function') {
      const originalStrategy = strategy;
      return function(worldState) {
        const result = originalStrategy(worldState);
        // Attach currentState to result if it exists
        if (typeof currentState !== 'undefined') {
          result._state = currentState;
        }
        // Attach currentTarget to result if it exists
        if (typeof currentTarget !== 'undefined') {
          result._target = currentTarget;
        }
        return result;
      };
    } else {
      throw new Error('Strategy must define a function called "strategy"');
    }
  `;

  // Create function in sandbox
  const factory = new Function(wrappedCode);
  return factory();
}

// Helper to create world state
function createWorldState(robotX, robotY, robotAngle, ballX, ballY, goalX, goalY, weAreBlue = true) {
  // Calculate distances and angles
  const ballDx = ballX - robotX;
  const ballDy = ballY - robotY;
  const ballDist = Math.sqrt(ballDx * ballDx + ballDy * ballDy);
  const ballAngleRad = Math.atan2(ballDx, ballDy) - robotAngle;
  const ballAngleDeg = (ballAngleRad * 180) / Math.PI;
  
  const goalDx = goalX - robotX;
  const goalDy = goalY - robotY;
  const goalDist = Math.sqrt(goalDx * goalDx + goalDy * goalDy);
  const goalAngleRad = Math.atan2(goalDx, goalDy) - robotAngle;
  const goalAngleDeg = (goalAngleRad * 180) / Math.PI;
  
  // Opponent goal (opposite side)
  const opponentGoalX = weAreBlue ? 200 : -200;
  const opponentGoalY = 0;
  const oppGoalDx = opponentGoalX - robotX;
  const oppGoalDy = opponentGoalY - robotY;
  const oppGoalDist = Math.sqrt(oppGoalDx * oppGoalDx + oppGoalDy * oppGoalDy);
  const oppGoalAngleRad = Math.atan2(oppGoalDx, oppGoalDy) - robotAngle;
  const oppGoalAngleDeg = (oppGoalAngleRad * 180) / Math.PI;
  
  return {
    ball: {
      visible: ballDist < 200,
      distance: ballDist,
      angle_deg: ballAngleDeg
    },
    goal_blue: weAreBlue ? {
      visible: goalDist < 200,
      distance: goalDist,
      angle_deg: goalAngleDeg
    } : {
      visible: oppGoalDist < 200,
      distance: oppGoalDist,
      angle_deg: oppGoalAngleDeg
    },
    goal_yellow: weAreBlue ? {
      visible: oppGoalDist < 200,
      distance: oppGoalDist,
      angle_deg: oppGoalAngleDeg
    } : {
      visible: goalDist < 200,
      distance: goalDist,
      angle_deg: goalAngleDeg
    },
    we_are_blue: weAreBlue,
    bumper_front: false,
    bumper_left: false,
    bumper_right: false,
    line_front: false,
    line_left: false,
    line_right: false,
    line_rear: false,
    stuck: false,
    t_ms: 0,
    dt_s: 0.016
  };
}

// Test scenarios
const scenarios = [
  {
    name: "Ball in front, robot near goal",
    robot: { x: 0, y: 0, angle: 0 },
    ball: { x: 50, y: 50 },
    goal: { x: 0, y: 0 },
    weAreBlue: true
  },
  {
    name: "Ball to the left, robot at 30cm from goal",
    robot: { x: 0, y: 30, angle: 0 },
    ball: { x: -50, y: 50 },
    goal: { x: 0, y: 0 },
    weAreBlue: true
  },
  {
    name: "Ball to the right, robot at 35cm from goal",
    robot: { x: 0, y: 35, angle: 0 },
    ball: { x: 50, y: 50 },
    goal: { x: 0, y: 0 },
    weAreBlue: true
  },
  {
    name: "Ball behind, robot at 40cm from goal",
    robot: { x: 0, y: 40, angle: 0 },
    ball: { x: 0, y: 100 },
    goal: { x: 0, y: 0 },
    weAreBlue: true
  },
  {
    name: "Ball far left, robot at 25cm from goal",
    robot: { x: 0, y: 25, angle: 0 },
    ball: { x: -100, y: 50 },
    goal: { x: 0, y: 0 },
    weAreBlue: true
  }
];

console.log("Defender Positioning Test\n");
console.log("=".repeat(80));

try {
  const strategyFunc = createSandboxedStrategy(strategyCode);
  
  // Force state to DEFENDING
  // We'll need to call it once to initialize, then modify state
  const initState = createWorldState(0, 0, 0, 50, 50, 0, 0, true);
  strategyFunc(initState);
  
  scenarios.forEach((scenario, index) => {
    console.log(`\nScenario ${index + 1}: ${scenario.name}`);
    console.log("-".repeat(80));
    
    const worldState = createWorldState(
      scenario.robot.x,
      scenario.robot.y,
      scenario.robot.angle,
      scenario.ball.x,
      scenario.ball.y,
      scenario.goal.x,
      scenario.goal.y,
      scenario.weAreBlue
    );
    
    // Calculate ideal arc position (40cm from goal, on line between goal and ball)
    const goalToBallDx = scenario.ball.x - scenario.goal.x;
    const goalToBallDy = scenario.ball.y - scenario.goal.y;
    const goalToBallDist = Math.sqrt(goalToBallDx * goalToBallDx + goalToBallDy * goalToBallDy);
    const idealArcX = scenario.goal.x + (goalToBallDx / goalToBallDist) * 40;
    const idealArcY = scenario.goal.y + (goalToBallDy / goalToBallDist) * 40;
    
    console.log(`Robot position: (${scenario.robot.x}, ${scenario.robot.y}), angle: ${scenario.robot.angle}°`);
    console.log(`Ball position: (${scenario.ball.x}, ${scenario.ball.y})`);
    console.log(`Goal position: (${scenario.goal.x}, ${scenario.goal.y})`);
    console.log(`Ideal arc position (40cm from goal): (${idealArcX.toFixed(1)}, ${idealArcY.toFixed(1)})`);
    console.log(`Ball distance: ${worldState.ball.distance.toFixed(1)}cm, angle: ${worldState.ball.angle_deg.toFixed(1)}°`);
    console.log(`Goal distance: ${worldState.goal_blue.distance.toFixed(1)}cm, angle: ${worldState.goal_blue.angle_deg.toFixed(1)}°`);
    
    // Run strategy multiple times to see positioning behavior
    const actions = [];
    for (let i = 0; i < 10; i++) {
      try {
        const result = strategyFunc(worldState);
        actions.push({
          motor1: result.motor1 || 0,
          motor2: result.motor2 || 0,
          motor3: result.motor3 || 0,
          motor4: result.motor4 || 0,
          state: result._state,
          target: result._target
        });
        
        worldState.t_ms += 16;
      } catch (error) {
        console.error(`Error at step ${i}:`, error.message);
        break;
      }
    }
    
    const lastAction = actions[actions.length - 1];
    if (lastAction) {
      console.log(`\nFinal state: ${lastAction.state || 'UNKNOWN'}`);
      console.log(`Target: ${lastAction.target || 'NONE'}`);
      console.log(`Motor commands: [${lastAction.motor1.toFixed(2)}, ${lastAction.motor2.toFixed(2)}, ${lastAction.motor3.toFixed(2)}, ${lastAction.motor4.toFixed(2)}]`);
      
      // Analyze movement intent
      const avgMotor = (lastAction.motor1 + lastAction.motor2 + lastAction.motor3 + lastAction.motor4) / 4;
      const turnDiff = ((lastAction.motor2 + lastAction.motor3) - (lastAction.motor1 + lastAction.motor4)) / 4;
      
      console.log(`Movement intent:`);
      if (Math.abs(avgMotor) > 0.1) {
        console.log(`  ${avgMotor > 0 ? 'Forward' : 'Backward'} speed: ${Math.abs(avgMotor).toFixed(2)}`);
      }
      if (Math.abs(turnDiff) > 0.1) {
        console.log(`  Turn: ${turnDiff > 0 ? 'Right' : 'Left'} speed: ${Math.abs(turnDiff).toFixed(2)}`);
      }
      
      // Check if strafing (sideways movement) - this indicates arc positioning
      const strafeLeft = (lastAction.motor1 + lastAction.motor4) - (lastAction.motor2 + lastAction.motor3);
      if (Math.abs(strafeLeft) > 0.1) {
        console.log(`  Strafe: ${strafeLeft > 0 ? 'Left' : 'Right'} speed: ${Math.abs(strafeLeft).toFixed(2)} (arc positioning)`);
      }
      
      // Check distance from goal
      const currentDistFromGoal = worldState.goal_blue.distance;
      const distFromIdeal = Math.abs(currentDistFromGoal - 40);
      console.log(`Current distance from goal: ${currentDistFromGoal.toFixed(1)}cm`);
      if (distFromIdeal > 5) {
        console.log(`  ⚠️  Not on ideal arc (should be 40cm, difference: ${distFromIdeal.toFixed(1)}cm)`);
      } else {
        console.log(`  ✓ On ideal arc (within 5cm of 40cm)`);
      }
    }
  });
  
  console.log("\n" + "=".repeat(80));
  console.log("\nTest complete!");
} catch (error) {
  console.error("Failed to load strategy:", error.message);
  console.error(error.stack);
}
