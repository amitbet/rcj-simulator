// Test each defender strategy state individually
const fs = require('fs');
const path = require('path');

// Load defender strategy
const defenderCode = fs.readFileSync(path.join(__dirname, 'src/strategies/defender.js'), 'utf8');

// Create sandboxed strategy function (mimicking StrategyExecutor)
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
    
    function clamp(val, min, max) {
      return Math_max(min, Math_min(max, val));
    }
    
    function normalizeAngle(angle) {
      while (angle > 180) angle -= 360;
      while (angle < -180) angle += 360;
      return angle;
    }
    
    ${code}
    
    if (typeof strategy === 'function') {
      const originalStrategy = strategy;
      return function(worldState) {
        const result = originalStrategy(worldState);
        if (typeof currentState !== 'undefined') {
          result._state = currentState;
        }
        if (typeof currentTarget !== 'undefined') {
          result._target = currentTarget;
        }
        return result;
      };
    } else {
      throw new Error('Strategy must define a function called "strategy"');
    }
  `;
  const factory = new Function(wrappedCode);
  return factory();
}

const strategyFunc = createSandboxedStrategy(defenderCode);

// Helper to create mock world state
function createWorldState(overrides = {}) {
  const defaultState = {
    ball: { visible: true, angle_deg: 0, distance: 100 },
    goal_blue: { visible: true, angle_deg: 0, distance: 50 },
    goal_yellow: { visible: true, angle_deg: 180, distance: 200 },
    we_are_blue: true,
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
  return { ...defaultState, ...overrides };
}

// Helper to analyze motor commands
function analyzeMotors(action) {
  const { motor1, motor2, motor3, motor4 } = action;
  const sqrt2 = Math.sqrt(2);
  
  // Inverse kinematics to see what movement these motors produce
  const vx_robot = (motor1 - motor2 - motor3 + motor4) / (2 * sqrt2);
  const vy_robot = (motor1 + motor2 - motor3 - motor4) / (2 * sqrt2);
  const omega = (motor1 + motor2 + motor3 + motor4) / 4;
  
  return {
    motors: { motor1, motor2, motor3, motor4 },
    movement: { vx_robot, vy_robot, omega },
    description: {
      forward: vx_robot > 0.1 ? 'forward' : vx_robot < -0.1 ? 'backward' : 'none',
      strafe: vy_robot > 0.1 ? 'right' : vy_robot < -0.1 ? 'left' : 'none',
      rotate: omega > 0.1 ? 'CW' : omega < -0.1 ? 'CCW' : 'none'
    }
  };
}

console.log('=== Testing Defender Strategy States ===\n');

// Test 1: DEFENDING - Too far from goal
console.log('Test 1: DEFENDING - Too far from goal (>60cm)');
const state1 = createWorldState({
  ball: { visible: true, angle_deg: 0, distance: 100 },
  goal_blue: { visible: true, angle_deg: 0, distance: 70 }, // Too far
  t_ms: 0
});
const result1 = strategyFunc(state1);
const analysis1 = analyzeMotors(result1);
console.log('State:', result1._state);
console.log('Motors:', analysis1.motors);
console.log('Movement:', analysis1.movement);
console.log('Description:', analysis1.description);
console.log('Expected: Moving toward goal (forward)\n');

// Test 2: DEFENDING - At correct distance, ball in front
console.log('Test 2: DEFENDING - At correct distance (40cm), ball in front');
const state2 = createWorldState({
  ball: { visible: true, angle_deg: 0, distance: 100 },
  goal_blue: { visible: true, angle_deg: 0, distance: 40 }, // Correct distance
  goal_yellow: { visible: true, angle_deg: 180, distance: 200 }, // Opponent goal
  t_ms: 0
});
const result2 = strategyFunc(state2);
const analysis2 = analyzeMotors(result2);
console.log('State:', result2._state);
console.log('Motors:', analysis2.motors);
console.log('Movement:', analysis2.movement);
console.log('Description:', analysis2.description);
console.log('Expected: Strafe to intercept ball, face opponent goal\n');

// Test 3: DEFENDING - Ball to the right
console.log('Test 3: DEFENDING - Ball to the right of goal');
const state3 = createWorldState({
  ball: { visible: true, angle_deg: 45, distance: 100 },
  goal_blue: { visible: true, angle_deg: 0, distance: 40 },
  goal_yellow: { visible: true, angle_deg: 180, distance: 200 },
  t_ms: 0
});
const result3 = strategyFunc(state3);
const analysis3 = analyzeMotors(result3);
console.log('State:', result3._state);
console.log('Motors:', analysis3.motors);
console.log('Movement:', analysis3.movement);
console.log('Description:', analysis3.description);
console.log('Expected: Strafe right, face opponent goal\n');

// Test 4: DEFENDING - Ball to the left
console.log('Test 4: DEFENDING - Ball to the left of goal');
const state4 = createWorldState({
  ball: { visible: true, angle_deg: -45, distance: 100 },
  goal_blue: { visible: true, angle_deg: 0, distance: 40 },
  goal_yellow: { visible: true, angle_deg: 180, distance: 200 },
  t_ms: 0
});
const result4 = strategyFunc(state4);
const analysis4 = analyzeMotors(result4);
console.log('State:', result4._state);
console.log('Motors:', analysis4.motors);
console.log('Movement:', analysis4.movement);
console.log('Description:', analysis4.description);
console.log('Expected: Strafe left, face opponent goal\n');

// Test 5: DEFENDING - Too close to goal
console.log('Test 5: DEFENDING - Too close to goal (<30cm)');
const state5 = createWorldState({
  ball: { visible: true, angle_deg: 0, distance: 100 },
  goal_blue: { visible: true, angle_deg: 0, distance: 25 }, // Too close
  t_ms: 0
});
const result5 = strategyFunc(state5);
const analysis5 = analyzeMotors(result5);
console.log('State:', result5._state);
console.log('Motors:', analysis5.motors);
console.log('Movement:', analysis5.movement);
console.log('Description:', analysis5.description);
console.log('Expected: Move away from goal (forward)\n');

// Test 6: DEFLECTING - Ball close
console.log('Test 6: DEFLECTING - Ball close (<40cm)');
// Force DEFLECTING state by setting currentState
const state6 = createWorldState({
  ball: { visible: true, angle_deg: 0, distance: 30 },
  goal_blue: { visible: true, angle_deg: 0, distance: 40 },
  goal_yellow: { visible: true, angle_deg: 180, distance: 200 },
  t_ms: 0
});
// Need to run strategy twice - first to transition to DEFLECTING, second to execute
strategyFunc(state6);
const result6 = strategyFunc(state6);
const analysis6 = analyzeMotors(result6);
console.log('State:', result6._state);
console.log('Motors:', analysis6.motors);
console.log('Movement:', analysis6.movement);
console.log('Description:', analysis6.description);
console.log('Expected: Push ball toward opponent goal\n');

// Test 7: Ball not visible
console.log('Test 7: DEFENDING - Ball not visible');
const state7 = createWorldState({
  ball: { visible: false, angle_deg: 0, distance: 0 },
  goal_blue: { visible: true, angle_deg: 0, distance: 40 },
  t_ms: 0
});
const result7 = strategyFunc(state7);
const analysis7 = analyzeMotors(result7);
console.log('State:', result7._state);
console.log('Motors:', analysis7.motors);
console.log('Movement:', analysis7.movement);
console.log('Description:', analysis7.description);
console.log('Expected: Small search turn\n');

console.log('=== All state tests complete ===');
