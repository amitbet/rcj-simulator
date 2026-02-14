import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();

function compileStrategy(filePath) {
  const code = fs.readFileSync(filePath, 'utf8');
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
    if (typeof strategy !== 'function') throw new Error('Missing strategy()');
    return function(worldState) {
      const result = strategy(worldState);
      if (typeof currentState !== 'undefined') result._state = currentState;
      if (typeof currentTarget !== 'undefined') result._target = currentTarget;
      if (typeof mentalMap !== 'undefined') result._mentalMap = mentalMap;
      return result;
    };
  `;
  const factory = new Function(wrappedCode);
  return factory();
}

function defaultObs() {
  return {
    visible: false,
    angle_deg: 0,
    distance: 0,
    confidence: 0,
    cx: 0,
    cy: 0,
    w: 0,
    h: 0
  };
}

function defaultWorld() {
  return {
    t_ms: 0,
    dt_s: 0.1,
    heading_deg: 0,
    yaw_rate_dps: 0,
    v_est: 0,
    ball: defaultObs(),
    goal_blue: defaultObs(),
    goal_yellow: defaultObs(),
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
    kickoff_us: false
  };
}

function cloneWorld(w) {
  return JSON.parse(JSON.stringify(w));
}

function speedFromAction(a) {
  return Math.max(Math.abs(a.motor1 || 0), Math.abs(a.motor2 || 0), Math.abs(a.motor3 || 0), Math.abs(a.motor4 || 0));
}

function runScenario({ name, fn, steps = 40, dtMs = 100 }) {
  const events = [];
  let world = defaultWorld();
  const ctx = {
    attacker: compileStrategy(path.join(ROOT, 'src/strategies/attacker.js')),
    defender: compileStrategy(path.join(ROOT, 'src/strategies/defender.js'))
  };
  let ok = true;
  let error = '';
  try {
    for (let i = 0; i < steps; i++) {
      world.t_ms = i * dtMs;
      world.dt_s = dtMs / 1000;
      const frame = fn(i, cloneWorld(world), events, ctx);
      if (frame && frame.world) world = frame.world;
      if (frame && frame.event) events.push(frame.event);
    }
  } catch (e) {
    ok = false;
    error = e instanceof Error ? e.message : String(e);
  }
  return { name, ok, error, events };
}

function expect(cond, msg) {
  if (!cond) throw new Error(msg);
}

function makeSimpleArenaSim({ weAreBlue, x, y, headingDeg, ballX, ballY }) {
  const HALF_W = 79;
  const HALF_H = 109.5;
  const GOAL_BLUE = { x: 0, y: -HALF_H };
  const GOAL_YELLOW = { x: 0, y: HALF_H };
  const RADIUS = 9;

  const st = {
    x,
    y,
    headingDeg,
    stuckCount: 0,
    weAreBlue,
    ballX,
    ballY
  };

  function headingVectors(thetaDeg) {
    const th = (thetaDeg * Math.PI) / 180;
    // Heading 0 deg means facing +Y.
    const f = { x: Math.sin(th), y: Math.cos(th) };
    const r = { x: Math.cos(th), y: -Math.sin(th) };
    const l = { x: -r.x, y: -r.y };
    return { f, r, l };
  }

  function relObs(target) {
    const { f, r } = headingVectors(st.headingDeg);
    const dx = target.x - st.x;
    const dy = target.y - st.y;
    const dist = Math.hypot(dx, dy);
    const rightComp = dx * r.x + dy * r.y;
    const fwdComp = dx * f.x + dy * f.y;
    const ang = (Math.atan2(rightComp, fwdComp) * 180) / Math.PI;
    return { visible: dist < 220, distance: dist, angle_deg: ang };
  }

  function nearBoundary(p) {
    return Math.abs(p.x) > HALF_W - 2 || Math.abs(p.y) > HALF_H - 2;
  }

  function makeWorld(tMs, dtS) {
    const { f, r, l } = headingVectors(st.headingDeg);
    const frontP = { x: st.x + f.x * RADIUS, y: st.y + f.y * RADIUS };
    const leftP = { x: st.x + l.x * RADIUS, y: st.y + l.y * RADIUS };
    const rightP = { x: st.x + r.x * RADIUS, y: st.y + r.y * RADIUS };
    const rearP = { x: st.x - f.x * RADIUS, y: st.y - f.y * RADIUS };

    const world = defaultWorld();
    world.t_ms = tMs;
    world.dt_s = dtS;
    world.we_are_blue = st.weAreBlue;
    world.heading_deg = st.headingDeg;
    world.v_est = 0;

    const ballObs = relObs({ x: st.ballX, y: st.ballY });
    world.ball.visible = ballObs.visible;
    world.ball.distance = ballObs.distance;
    world.ball.angle_deg = ballObs.angle_deg;

    const blueObs = relObs(GOAL_BLUE);
    world.goal_blue.visible = blueObs.visible;
    world.goal_blue.distance = blueObs.distance;
    world.goal_blue.angle_deg = blueObs.angle_deg;

    const yellowObs = relObs(GOAL_YELLOW);
    world.goal_yellow.visible = yellowObs.visible;
    world.goal_yellow.distance = yellowObs.distance;
    world.goal_yellow.angle_deg = yellowObs.angle_deg;

    world.line_front = nearBoundary(frontP);
    world.line_left = nearBoundary(leftP);
    world.line_right = nearBoundary(rightP);
    world.line_rear = nearBoundary(rearP);

    world.bumper_front = Math.abs(frontP.x) > HALF_W || Math.abs(frontP.y) > HALF_H;
    world.bumper_left = Math.abs(leftP.x) > HALF_W || Math.abs(leftP.y) > HALF_H;
    world.bumper_right = Math.abs(rightP.x) > HALF_W || Math.abs(rightP.y) > HALF_H;
    world.stuck = st.stuckCount >= 4;

    return world;
  }

  function step(action, dtS) {
    const { f, r } = headingVectors(st.headingDeg);
    const fw = ((action.motor1 || 0) + (action.motor2 || 0) + (action.motor3 || 0) + (action.motor4 || 0)) / 4;
    const sw = ((action.motor1 || 0) - (action.motor2 || 0) + (action.motor3 || 0) - (action.motor4 || 0)) / 4;
    const tw = (-(action.motor1 || 0) + (action.motor2 || 0) + (action.motor3 || 0) - (action.motor4 || 0)) / 4;

    const speedScale = 28; // cm/s at full command
    const turnScale = 180; // deg/s at full command
    const dx = (f.x * fw + r.x * sw) * speedScale * dtS;
    const dy = (f.y * fw + r.y * sw) * speedScale * dtS;
    const dHeading = tw * turnScale * dtS;

    const oldX = st.x;
    const oldY = st.y;

    st.x += dx;
    st.y += dy;
    st.headingDeg += dHeading;
    while (st.headingDeg > 180) st.headingDeg -= 360;
    while (st.headingDeg < -180) st.headingDeg += 360;

    // clamp inside field
    if (st.x > HALF_W) st.x = HALF_W;
    if (st.x < -HALF_W) st.x = -HALF_W;
    if (st.y > HALF_H) st.y = HALF_H;
    if (st.y < -HALF_H) st.y = -HALF_H;

    const moved = Math.hypot(st.x - oldX, st.y - oldY);
    const cmdMag = speedFromAction(action);
    if (cmdMag > 0.35 && moved < 0.2) st.stuckCount++;
    else st.stuckCount = 0;
  }

  return { st, makeWorld, step };
}

const scenarios = [];

scenarios.push(runScenario({
  name: 'attacker exits recover and resumes ball play',
  steps: 50,
  fn: (i, world, events, ctx) => {
    world.we_are_blue = true;
    world.goal_blue.visible = true;
    world.goal_blue.distance = 45;
    world.goal_blue.angle_deg = 170;

    if (i < 5) {
      world.line_front = true;
      world.ball.visible = false;
    } else {
      world.line_front = false;
      world.ball.visible = true;
      world.ball.distance = Math.max(8, 90 - i * 2);
      world.ball.angle_deg = 8;
      world.goal_yellow.visible = true;
      world.goal_yellow.distance = 110;
      world.goal_yellow.angle_deg = 2;
    }

    const action = ctx.attacker(world);
    events.push({ s: action._state, v: speedFromAction(action), kick: !!action.kick });

    if (i === 10) expect(action._state !== 'RECOVER', 'attacker stayed in RECOVER too long');
    if (i > 20) expect(speedFromAction(action) > 0.15, 'attacker stopped moving in active play');
    if (i > 35 && world.ball.distance <= 20) {
      const anyKick = events.slice(-10).some(e => e.kick);
      expect(anyKick, 'attacker did not attempt kick near ball');
    }

    return { world };
  }
}));

scenarios.push(runScenario({
  name: 'complex attacker: escapes corner and meaningfully approaches ball',
  steps: 240,
  dtMs: 100,
  fn: (i, _world, events, ctx) => {
    if (i === 0) {
      events.sim = makeSimpleArenaSim({
        weAreBlue: true,
        x: -74,
        y: -103,
        headingDeg: -150,
        ballX: -10,
        ballY: 15
      });
      events.recoverFrames = 0;
      events.boundaryFrames = 0;
      events.minBallDist = 999;
    }
    const sim = events.sim;
    const world = sim.makeWorld(i * 100, 0.1);
    const action = ctx.attacker(world);
    sim.step(action, 0.1);

    const ballDist = Math.hypot(sim.st.ballX - sim.st.x, sim.st.ballY - sim.st.y);
    events.minBallDist = Math.min(events.minBallDist, ballDist);
    if (action._state === 'RECOVER') events.recoverFrames++;
    if (Math.abs(sim.st.x) > 70 || Math.abs(sim.st.y) > 98) events.boundaryFrames++;

    if (i === 239) {
      expect(events.minBallDist < 28, `attacker did not approach ball enough (min=${events.minBallDist.toFixed(1)}cm)`);
      expect(events.recoverFrames < 170, `attacker spent too long in RECOVER (${events.recoverFrames} frames)`);
      expect(events.boundaryFrames < 190, `attacker camped boundary too much (${events.boundaryFrames} frames)`);
    }
    return { world };
  }
}));

scenarios.push(runScenario({
  name: 'long attacker: no prolonged orbit/miss near ball',
  steps: 1200, // 120s
  dtMs: 100,
  fn: (i, _world, events, ctx) => {
    if (i === 0) {
      events.sim = makeSimpleArenaSim({
        weAreBlue: true,
        x: -45,
        y: 30,
        headingDeg: 35,
        ballX: 0,
        ballY: 0
      });
      events.nearFrames = 0;
      events.orbitCrosses = 0;
      events.prevBallAngle = null;
      events.minBallDist = 999;
      events.forwardSignFlipsNear = 0;
      events.prevForwardSign = 0;
      events.cornerFrames = 0;
    }

    const sim = events.sim;
    const world = sim.makeWorld(i * 100, 0.1);
    const action = ctx.attacker(world);
    sim.step(action, 0.1);

    const dx = sim.st.ballX - sim.st.x;
    const dy = sim.st.ballY - sim.st.y;
    const ballDist = Math.hypot(dx, dy);
    events.minBallDist = Math.min(events.minBallDist, ballDist);

    // ball angle in robot frame for orbit detection
    const th = (sim.st.headingDeg * Math.PI) / 180;
    const fx = Math.sin(th), fy = Math.cos(th);
    const rx = Math.cos(th), ry = -Math.sin(th);
    const fwd = dx * fx + dy * fy;
    const right = dx * rx + dy * ry;
    const ballAngle = (Math.atan2(right, fwd) * 180) / Math.PI;

    if (ballDist < 32) {
      events.nearFrames++;
      if (events.prevBallAngle !== null && Math.sign(ballAngle) !== Math.sign(events.prevBallAngle) && Math.abs(ballAngle) > 10 && Math.abs(events.prevBallAngle) > 10) {
        events.orbitCrosses++;
      }
      const forwardCmd = ((action.motor1 || 0) + (action.motor2 || 0) + (action.motor3 || 0) + (action.motor4 || 0)) / 4;
      const s = Math.sign(forwardCmd);
      if (events.prevForwardSign !== 0 && s !== 0 && s !== events.prevForwardSign) events.forwardSignFlipsNear++;
      if (s !== 0) events.prevForwardSign = s;
    }
    events.prevBallAngle = ballAngle;

    if (Math.abs(sim.st.x) > 70 || Math.abs(sim.st.y) > 98) events.cornerFrames++;

    if (i === 1199) {
      expect(events.minBallDist < 14, `attacker never got close enough to ball (min=${events.minBallDist.toFixed(1)}cm)`);
      expect(events.orbitCrosses < 28, `attacker orbiting/missing ball too much (crosses=${events.orbitCrosses})`);
      expect(events.forwardSignFlipsNear < 24, `attacker oscillates fwd/rev near ball (flips=${events.forwardSignFlipsNear})`);
      expect(events.cornerFrames < 420, `attacker spent too long near boundaries/corners (${events.cornerFrames} frames)`);
    }
    return { world };
  }
}));

scenarios.push(runScenario({
  name: 'long defender: does not live in corners all game',
  steps: 1500, // 150s
  dtMs: 100,
  fn: (i, _world, events, ctx) => {
    if (i === 0) {
      events.sim = makeSimpleArenaSim({
        weAreBlue: false,
        x: 72,
        y: 100,
        headingDeg: 150,
        ballX: -10,
        ballY: 10
      });
      events.cornerFrames = 0;
      events.recoverFrames = 0;
      events.operationalFrames = 0;
      events.centerVisits = 0;
    }

    const sim = events.sim;

    // Move ball slowly across field to force repositioning.
    sim.st.ballX = 50 * Math.sin(i / 130);
    sim.st.ballY = 30 * Math.cos(i / 180);

    const world = sim.makeWorld(i * 100, 0.1);
    const action = ctx.defender(world);
    sim.step(action, 0.1);

    if (Math.abs(sim.st.x) > 68 || Math.abs(sim.st.y) > 96) events.cornerFrames++;
    if (action._state === 'RECOVER' || action._state === 'ESCAPE_WALL') events.recoverFrames++;
    if (action._state === 'HOLD_LINE' || action._state === 'TRACK_BALL' || action._state === 'CLEAR_BALL') events.operationalFrames++;
    if (Math.abs(sim.st.x) < 45 && Math.abs(sim.st.y) < 80) events.centerVisits++;

    if (i === 1499) {
      expect(events.cornerFrames < 700, `defender corner dwell too high (${events.cornerFrames} frames)`);
      expect(events.recoverFrames < 620, `defender spent too long in recover/escape (${events.recoverFrames} frames)`);
      expect(events.operationalFrames > 420, `defender too little operational behavior (${events.operationalFrames} frames)`);
      expect(events.centerVisits > 90, `defender rarely left corner bands (${events.centerVisits} visits)`);
    }
    return { world };
  }
}));

scenarios.push(runScenario({
  name: 'attacker line-flicker stress: does not stay trapped in recover',
  steps: 900, // 90s
  dtMs: 100,
  fn: (i, _world, events, ctx) => {
    if (i === 0) {
      events.sim = makeSimpleArenaSim({
        weAreBlue: true,
        x: -72,
        y: -92,
        headingDeg: -135,
        ballX: 5,
        ballY: 0
      });
      events.recoverFrames = 0;
      events.activeFrames = 0;
    }
    const sim = events.sim;
    const world = sim.makeWorld(i * 100, 0.1);

    // Synthetic flicker near wall/corner to emulate noisy line sensing.
    if (i > 20 && i < 260 && i % 3 === 0) world.line_front = true;
    if (i > 40 && i < 260 && i % 5 === 0) world.line_left = true;

    const action = ctx.attacker(world);
    sim.step(action, 0.1);

    if (action._state === 'RECOVER') events.recoverFrames++;
    else events.activeFrames++;

    if (i === 899) {
      expect(events.activeFrames > 250, `attacker not returning to active states enough (${events.activeFrames})`);
      expect(events.recoverFrames < 620, `attacker trapped in RECOVER under flicker (${events.recoverFrames})`);
    }
    return { world };
  }
}));

scenarios.push(runScenario({
  name: 'complex defender: corner start recovers and returns to defensive operation',
  steps: 220,
  dtMs: 100,
  fn: (i, _world, events, ctx) => {
    if (i === 0) {
      events.sim = makeSimpleArenaSim({
        weAreBlue: false,
        x: 75,
        y: 102,
        headingDeg: 160,
        ballX: 20,
        ballY: 20
      });
      events.recoverFrames = 0;
      events.operationalFrames = 0;
    }
    const sim = events.sim;
    const world = sim.makeWorld(i * 100, 0.1);
    const action = ctx.defender(world);
    sim.step(action, 0.1);

    if (action._state === 'RECOVER') events.recoverFrames++;
    if (action._state === 'TRACK_BALL' || action._state === 'HOLD_LINE' || action._state === 'CLEAR_BALL') {
      events.operationalFrames++;
    }

    if (i === 219) {
      expect(events.operationalFrames > 40, `defender insufficient operational frames (${events.operationalFrames})`);
      expect(events.recoverFrames < 160, `defender stuck too long in RECOVER (${events.recoverFrames})`);
    }
    return { world };
  }
}));

scenarios.push(runScenario({
  name: 'attacker seeks when ball is unseen',
  steps: 20,
  fn: (i, world, events, ctx) => {
    world.we_are_blue = false;
    world.ball.visible = false;
    world.goal_blue.visible = false;
    world.goal_yellow.visible = false;
    const action = ctx.attacker(world);
    events.push({ s: action._state, m1: action.motor1, m2: action.motor2 });
    expect(action._state === 'SEEK_BALL' || action._state === 'RECOVER', 'attacker not in seek path when ball unseen');
    if (i > 8) {
      expect(speedFromAction(action) > 0.15, 'attacker seek movement too weak');
    }
    return { world };
  }
}));

scenarios.push(runScenario({
  name: 'defender exits recover and reaches non-recover state',
  steps: 50,
  fn: (i, world, events, ctx) => {
    world.we_are_blue = true;
    world.goal_blue.visible = true;
    world.goal_blue.distance = 42;
    world.goal_blue.angle_deg = 0;

    if (i < 6) {
      world.bumper_front = true;
    } else {
      world.bumper_front = false;
      world.ball.visible = true;
      world.ball.distance = 65;
      world.ball.angle_deg = 35;
    }

    const action = ctx.defender(world);
    events.push({ s: action._state, v: speedFromAction(action) });

    if (i === 12) expect(action._state !== 'RECOVER', 'defender stuck in RECOVER');
    if (i > 20) expect(action._state === 'TRACK_BALL' || action._state === 'HOLD_LINE' || action._state === 'CLEAR_BALL', 'defender not in operational state');
    return { world };
  }
}));

scenarios.push(runScenario({
  name: 'defender tracks by strafing when ball lateral',
  steps: 25,
  fn: (i, world, events, ctx) => {
    world.we_are_blue = false;
    world.goal_yellow.visible = true;
    world.goal_yellow.distance = 40;
    world.goal_yellow.angle_deg = 0;
    world.ball.visible = true;
    world.ball.distance = 55;
    world.ball.angle_deg = i < 12 ? 35 : -30;

    const action = ctx.defender(world);
    events.push({ s: action._state, m1: action.motor1, m2: action.motor2, m3: action.motor3, m4: action.motor4 });

    if (i > 5) {
      expect(action._state === 'TRACK_BALL' || action._state === 'CLEAR_BALL', 'defender failed to track/clear');
      // Strafe-like signature for omnidrive: opposite signs on left/right pairs.
      const lrOpposite = Math.sign(action.motor1 || 0) !== Math.sign(action.motor2 || 0);
      expect(lrOpposite, 'defender strafe signature missing');
    }
    return { world };
  }
}));

scenarios.push(runScenario({
  name: 'multi-bot: not all remain in recover lock',
  steps: 40,
  fn: (i, world, events, ctx) => {
    const mk = (teamBlue, hazard) => {
      const w = defaultWorld();
      w.t_ms = world.t_ms;
      w.dt_s = world.dt_s;
      w.we_are_blue = teamBlue;
      if (teamBlue) {
        w.goal_blue.visible = true; w.goal_blue.distance = 44; w.goal_blue.angle_deg = 0;
        w.goal_yellow.visible = true; w.goal_yellow.distance = 120; w.goal_yellow.angle_deg = 0;
      } else {
        w.goal_yellow.visible = true; w.goal_yellow.distance = 44; w.goal_yellow.angle_deg = 0;
        w.goal_blue.visible = true; w.goal_blue.distance = 120; w.goal_blue.angle_deg = 0;
      }
      w.ball.visible = true;
      w.ball.distance = 70;
      w.ball.angle_deg = teamBlue ? 12 : -10;
      if (hazard && i < 4) w.line_front = true;
      return w;
    };

    const aBlue = ctx.attacker(mk(true, true));
    const dBlue = ctx.defender(mk(true, false));
    const aYellow = ctx.attacker(mk(false, true));
    const dYellow = ctx.defender(mk(false, false));

    events.push([aBlue._state, dBlue._state, aYellow._state, dYellow._state]);

    if (i > 14) {
      const states = [aBlue._state, dBlue._state, aYellow._state, dYellow._state];
      const allRecover = states.every(s => s === 'RECOVER');
      expect(!allRecover, 'all bots remained in RECOVER lock');
    }

    return { world };
  }
}));

const failed = scenarios.filter(s => !s.ok);
for (const s of scenarios) {
  if (s.ok) {
    console.log(`PASS: ${s.name}`);
  } else {
    console.log(`FAIL: ${s.name}`);
    console.log(`  ${s.error}`);
  }
}

if (failed.length) {
  process.exit(1);
}
