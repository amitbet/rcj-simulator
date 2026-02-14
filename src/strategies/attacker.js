// ============================================================
// RoboCup Jr. Simulator - Attacker Strategy (Physics-first)
// ============================================================

const STATE = {
  UNSTICK: 'UNSTICK',
  LINE_GUARD: 'LINE_GUARD',
  RECOVER: 'RECOVER',
  SEEK_BALL: 'SEEK_BALL',
  APPROACH_BALL: 'APPROACH_BALL',
  FINISH_ATTACK: 'FINISH_ATTACK'
};

var currentState = STATE.SEEK_BALL;
var currentTarget = null;

var recoverUntilMs = 0;
var recoverReason = null;
var recoverGraceUntilMs = 0; // suppress immediate recover re-entry after exiting
var seekDir = 1;
var closeAttackMode = false; // hysteresis to avoid APPROACH/FINISH flip-flop
var ownGoalAvoidActive = false; // hysteresis to avoid fwd/rev oscillation
var ownGoalAvoidUntilMs = 0;
var captureCommitUntilMs = 0; // force straight capture to prevent orbiting near ball
var sideLineFrames = 0;
var sideEscapeUntilMs = 0;
var sideEscapeDir = 0; // +1 strafe right, -1 strafe left
var lineGuardUntilMs = 0;
var lineGuardForward = 0;
var lineGuardStrafe = 0;
var lineGuardClearFrames = 0;
var lineGuardCooldownUntilMs = 0;
var unstickUntilMs = 0;
var unstickDir = 1;

var mentalMap = {
  mode: 'physics-first',
  blueGoal: { distance: null, angle_deg: null, lastSeen: 0, confidence: 0, worldX: null, worldY: null },
  yellowGoal: { distance: null, angle_deg: null, lastSeen: 0, confidence: 0, worldX: null, worldY: null },
  ball: { distance: null, angle_deg: null, lastSeen: 0, confidence: 0, worldX: null, worldY: null },
  lastPosition: { x: 0, y: 0 },
  fieldCenter: { x: 0, y: 0 },
  fieldBounds: { width: 158, height: 219 }
};

// Known goal world positions (field center = origin)
var BLUE_GOAL_WORLD_Y = -(219 / 2 + 7.4 / 2);  // -113.2
var YELLOW_GOAL_WORLD_Y = (219 / 2 + 7.4 / 2);  //  113.2

function normalizeAngle(a) {
  let v = a;
  while (v > 180) v -= 360;
  while (v < -180) v += 360;
  return v;
}

function limitUnit(v) {
  return Math_max(-1, Math_min(1, v));
}

function omniMix(forward, strafe, turn) {
  let m1 = forward + strafe - turn; // front-left
  let m2 = forward - strafe + turn; // front-right
  let m3 = forward + strafe + turn; // back-right
  let m4 = forward - strafe - turn; // back-left

  const maxMag = Math_max(1, Math_abs(m1), Math_abs(m2), Math_abs(m3), Math_abs(m4));
  m1 /= maxMag;
  m2 /= maxMag;
  m3 /= maxMag;
  m4 /= maxMag;

  return { motor1: m1, motor2: m2, motor3: m3, motor4: m4 };
}

function triggerRecover(t_ms, reason) {
  currentState = STATE.RECOVER;
  recoverReason = reason;
  recoverUntilMs = t_ms + 1000;
}

function recoveryCommand(worldState) {
  const { line_front, line_left, line_right, line_rear, bumper_front, bumper_left, bumper_right, stuck } = worldState;

  let f = 0;
  let s = 0;
  let t = 0;

  // Primary direction: get away from lines / walls quickly.
  if (line_front || bumper_front || stuck) f -= 0.70;
  if (line_rear) f += 0.55;
  if (line_left || bumper_left) s += 0.65;
  if (line_right || bumper_right) s -= 0.65;

  // Corner disambiguation.
  if ((line_front || bumper_front) && (line_left || bumper_left)) t += 0.55;
  if ((line_front || bumper_front) && (line_right || bumper_right)) t -= 0.55;

  // If no explicit cue, perform a short turning back-out.
  if (Math_abs(f) < 0.05 && Math_abs(s) < 0.05 && Math_abs(t) < 0.05) {
    f = -0.45;
    t = 0.50;
  }

  return omniMix(f, s, t);
}

function strategy(worldState) {
  const {
    t_ms,
    ball,
    goal_blue,
    goal_yellow,
    we_are_blue,
    line_front,
    line_left,
    line_right,
    line_rear,
    bumper_front,
    bumper_left,
    bumper_right,
    stuck
  } = worldState;

  // Update mental map with observations and compute world positions.
  const headingRad = worldState.heading_deg * Math_PI / 180;

  if (goal_blue.visible) {
    mentalMap.blueGoal.distance = goal_blue.distance;
    mentalMap.blueGoal.angle_deg = goal_blue.angle_deg;
    mentalMap.blueGoal.lastSeen = t_ms;
    mentalMap.blueGoal.confidence = 1.0;
  }
  if (goal_yellow.visible) {
    mentalMap.yellowGoal.distance = goal_yellow.distance;
    mentalMap.yellowGoal.angle_deg = goal_yellow.angle_deg;
    mentalMap.yellowGoal.lastSeen = t_ms;
    mentalMap.yellowGoal.confidence = 1.0;
  }

  // Localize robot from goal observations (triangulation).
  var locX = 0, locY = 0, locN = 0;
  if (goal_blue.visible) {
    var wa = headingRad + goal_blue.angle_deg * Math_PI / 180;
    locX += 0 - goal_blue.distance * Math_cos(wa);
    locY += BLUE_GOAL_WORLD_Y - goal_blue.distance * Math_sin(wa);
    locN++;
  }
  if (goal_yellow.visible) {
    var wa = headingRad + goal_yellow.angle_deg * Math_PI / 180;
    locX += 0 - goal_yellow.distance * Math_cos(wa);
    locY += YELLOW_GOAL_WORLD_Y - goal_yellow.distance * Math_sin(wa);
    locN++;
  }
  if (locN > 0) {
    mentalMap.lastPosition.x = locX / locN;
    mentalMap.lastPosition.y = locY / locN;

    // Set goal world positions (fixed landmarks).
    if (goal_blue.visible) {
      mentalMap.blueGoal.worldX = 0;
      mentalMap.blueGoal.worldY = BLUE_GOAL_WORLD_Y;
    }
    if (goal_yellow.visible) {
      mentalMap.yellowGoal.worldX = 0;
      mentalMap.yellowGoal.worldY = YELLOW_GOAL_WORLD_Y;
    }

    // Compute ball world position.
    if (ball.visible) {
      var bwa = headingRad + ball.angle_deg * Math_PI / 180;
      mentalMap.ball.worldX = mentalMap.lastPosition.x + ball.distance * Math_cos(bwa);
      mentalMap.ball.worldY = mentalMap.lastPosition.y + ball.distance * Math_sin(bwa);
    }
  }
  if (ball.visible) {
    mentalMap.ball.distance = ball.distance;
    mentalMap.ball.angle_deg = ball.angle_deg;
    mentalMap.ball.lastSeen = t_ms;
    mentalMap.ball.confidence = 1.0;
  } else {
    // Decay confidence when ball is not visible.
    mentalMap.ball.confidence = Math_max(0, mentalMap.ball.confidence - 0.02);
  }

  const ownGoal = we_are_blue ? goal_blue : goal_yellow;

  // Global unstick supervisor: multi-phase escape when stuck persists.
  if (stuck && t_ms >= unstickUntilMs) {
    currentState = STATE.UNSTICK;
    unstickDir = -unstickDir;
    unstickUntilMs = t_ms + 1700;
  }
  if (currentState === STATE.UNSTICK && t_ms < unstickUntilMs) {
    currentTarget = 'unstick';
    const remain = unstickUntilMs - t_ms;
    let cmd;
    if (remain > 1150) {
      cmd = omniMix(-0.85, 0.25 * unstickDir, 0.35 * unstickDir);
    } else if (remain > 650) {
      cmd = omniMix(0.55, 0.85 * unstickDir, 0.25 * unstickDir);
    } else {
      cmd = omniMix(0.75, 0, -0.45 * unstickDir);
    }
    return { ...cmd, kick: false };
  } else if (currentState === STATE.UNSTICK && t_ms >= unstickUntilMs) {
    currentState = ball.visible ? STATE.APPROACH_BALL : STATE.SEEK_BALL;
    recoverGraceUntilMs = t_ms + 1000;
  }

  // Hard line protection layer: preempt all behavior and move inward.
  // This dramatically reduces line crossing by reacting immediately and
  // keeping inward motion for a short lock even if sensors flicker.
  const lineNow = line_front || line_left || line_right || line_rear;
  if (lineNow && t_ms >= lineGuardCooldownUntilMs) {
    let f = 0;
    let s = 0;
    if (line_front) f -= 1.0;
    if (line_rear) f += 0.75;
    if (line_left) s += 0.95;
    if (line_right) s -= 0.95;
    if (Math_abs(f) < 0.05 && Math_abs(s) < 0.05) {
      f = -0.8;
    }
    lineGuardForward = f;
    lineGuardStrafe = s;
    lineGuardUntilMs = t_ms + 220;
    lineGuardClearFrames = 0;
  }
  if (currentState === STATE.LINE_GUARD || t_ms < lineGuardUntilMs) {
    currentState = STATE.LINE_GUARD;
    if (lineNow) lineGuardClearFrames = 0;
    else lineGuardClearFrames += 1;
    const canExitLineGuard = !lineNow && lineGuardClearFrames >= 2 && t_ms >= lineGuardUntilMs;
    if (canExitLineGuard) {
      lineGuardCooldownUntilMs = t_ms + 260;
      currentState = ball.visible ? STATE.APPROACH_BALL : STATE.SEEK_BALL;
    } else {
      currentTarget = 'line guard';
      const turn = limitUnit(lineGuardStrafe * 0.12);
      const cmd = omniMix(limitUnit(lineGuardForward * 0.78), limitUnit(lineGuardStrafe * 0.78), turn);
      return { ...cmd, kick: false };
    }
  }

  // Safety overrides always win, but don't retrigger RECOVER every frame.
  const lineHazard = line_front || line_left || line_right || line_rear;
  const contactHazard = stuck || bumper_front || bumper_left || bumper_right;

  // Persistent sideline detector -> force inward escape burst.
  if (line_left || line_right) sideLineFrames += 1;
  else sideLineFrames = 0;
  if (sideEscapeUntilMs <= t_ms && sideLineFrames >= 3) {
    sideEscapeDir = line_left ? 1 : -1;
    sideEscapeUntilMs = t_ms + 1100;
    sideLineFrames = 0;
  }
  if (t_ms < sideEscapeUntilMs) {
    currentTarget = 'sideline escape';
    const cmd = omniMix(0.62, 0.75 * sideEscapeDir, 0.18 * sideEscapeDir);
    return { ...cmd, kick: false };
  }

  if (currentState !== STATE.RECOVER) {
    const graceOver = t_ms >= recoverGraceUntilMs;
    if (lineHazard && graceOver) {
      triggerRecover(t_ms, 'line');
    } else if (contactHazard && graceOver) {
      triggerRecover(t_ms, 'contact');
    }
  } else if (contactHazard && recoverReason !== 'contact') {
    // Escalate recover reason without extending timer indefinitely.
    recoverReason = 'contact';
  }

  if (currentState === STATE.RECOVER) {
    currentTarget = recoverReason;
    const cmd = recoveryCommand(worldState);
    if (t_ms >= recoverUntilMs) {
      currentState = ball.visible ? STATE.APPROACH_BALL : STATE.SEEK_BALL;
      recoverReason = null;
      recoverGraceUntilMs = t_ms + 1200;
    }
    return { ...cmd, kick: false };
  }

  // Main state selection.
  if (!ball.visible) {
    closeAttackMode = false;
    captureCommitUntilMs = 0;
    currentState = STATE.SEEK_BALL;
  } else {
    // Distance hysteresis: prevents rapid state switching near boundary.
    if (!closeAttackMode && ball.distance <= 26) closeAttackMode = true;
    if (closeAttackMode && ball.distance >= 36) closeAttackMode = false;
    currentState = closeAttackMode ? STATE.FINISH_ATTACK : STATE.APPROACH_BALL;
  }

  // Avoid own-goal pushes only in very high-risk close-contact cases.
  const ownGoalAngleAbs = ownGoal.visible ? Math_abs(normalizeAngle(ownGoal.angle_deg)) : 180;
  const ownGoalDangerEnter = ownGoal.visible && ball.visible && ball.distance < 20 && ownGoalAngleAbs < 20;
  const ownGoalDangerExitSafe = !ownGoal.visible || !ball.visible || ball.distance > 28 || ownGoalAngleAbs > 30;

  if (!ownGoalAvoidActive && ownGoalDangerEnter) {
    ownGoalAvoidActive = true;
    ownGoalAvoidUntilMs = t_ms + 700;
  } else if (ownGoalAvoidActive && t_ms >= ownGoalAvoidUntilMs && ownGoalDangerExitSafe) {
    ownGoalAvoidActive = false;
  }

  if (ownGoalAvoidActive) {
    currentTarget = 'avoid own goal';
    const turn = ownGoal.angle_deg > 0 ? -0.65 : 0.65;
    // Use side-step with light reverse instead of hard reverse to avoid fwd/rev chatter.
    const side = ownGoal.angle_deg > 0 ? -0.55 : 0.55;
    const cmd = omniMix(-0.20, side, turn);
    return { ...cmd, kick: false };
  }

  if (currentState === STATE.SEEK_BALL) {
    currentTarget = 'find ball';

    // Sweep turn with slight forward movement to avoid static spinning.
    if (t_ms % 2200 < 30) seekDir = -seekDir;
    const cmd = omniMix(0.22, 0, 0.48 * seekDir);
    return { ...cmd, kick: false };
  }

  if (currentState === STATE.APPROACH_BALL) {
    currentTarget = 'ball';

    const a = normalizeAngle(ball.angle_deg);
    const absA = Math_abs(a);

    // Capture commit: only when well-aligned and close. Prevents orbiting.
    if (ball.distance < 38 && absA < 12 && t_ms >= captureCommitUntilMs) {
      captureCommitUntilMs = t_ms + 600;
    }
    const inCaptureCommit = t_ms < captureCommitUntilMs && ball.distance < 50;
    if (inCaptureCommit) {
      const steer = limitUnit(a / 60) * 0.30;
      const cmd = omniMix(1.0, steer * 0.5, steer);
      return { ...cmd, kick: false };
    }

    // Proportional approach: balance forward speed with alignment.
    let turn = limitUnit(a / 60) * 0.50;
    let forward = Math_min(0.95, Math_max(0.40, 0.40 + ball.distance / 180));
    let strafe = 0;

    if (absA > 35) {
      // Large angular error: mostly rotate, little forward.
      forward = 0.15;
      turn = limitUnit(a / 50) * 0.65;
    } else if (absA > 18) {
      // Medium angle: reduce forward to allow alignment before closing in.
      forward *= 0.55;
      turn = limitUnit(a / 55) * 0.55;
    }
    if (ball.distance < 55) {
      // Close range: add strafe for tighter intercept.
      strafe = limitUnit(a / 50) * 0.40;
    }

    const cmd = omniMix(forward, strafe, turn);
    return { ...cmd, kick: false };
  }

  // FINISH_ATTACK
  currentTarget = 'finish';
  {
    const ballAngle = normalizeAngle(ball.angle_deg);
    const absBallAngle = Math_abs(ballAngle);

    // Capture commit: only when very well-aligned. Full charge + kick.
    if (ball.distance < 30 && absBallAngle < 10 && t_ms >= captureCommitUntilMs) {
      captureCommitUntilMs = t_ms + 500;
    }
    const inCaptureCommit = t_ms < captureCommitUntilMs && ball.distance < 42;
    if (inCaptureCommit) {
      const steer = limitUnit(ballAngle / 50) * 0.25;
      const cmd = omniMix(1.0, steer * 0.5, steer);
      const canKickNow = ball.visible && ball.distance < 30 && absBallAngle < 26;
      return { ...cmd, kick: canKickNow };
    }

    // Strong proportional steering so the robot tracks the ball all the way in.
    const turn = limitUnit(ballAngle / 50) * 0.35;
    const strafe = limitUnit(ballAngle / 45) * 0.40;
    // Reduce forward when angle is large to allow correction before contact.
    const forward = absBallAngle > 20 ? 0.55 : 0.95;

    const cmd = omniMix(forward, strafe, turn);

    const canKick =
      ball.visible &&
      ball.distance < 30 &&
      absBallAngle < 26;

    return { ...cmd, kick: canKick };
  }
}
