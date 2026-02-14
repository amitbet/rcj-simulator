// ============================================================
// RoboCup Jr. Simulator - Defender Strategy (Physics-first)
// ============================================================

const STATE = {
  UNSTICK: 'UNSTICK',
  LINE_GUARD: 'LINE_GUARD',
  RECOVER: 'RECOVER',
  ESCAPE_WALL: 'ESCAPE_WALL',
  FIND_GOAL: 'FIND_GOAL',
  HOLD_LINE: 'HOLD_LINE',
  TRACK_BALL: 'TRACK_BALL',
  CLEAR_BALL: 'CLEAR_BALL'
};

var currentState = STATE.FIND_GOAL;
var currentTarget = null;

var recoverUntilMs = 0;
var recoverReason = null;
var recoverGraceUntilMs = 0; // suppress immediate recover re-entry after exiting
var recoverEntryCount = 0;
var escapeUntilMs = 0;
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
var spinDir = 1;

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
  recoverEntryCount += 1;
  recoverUntilMs = t_ms + 1000;
}

function recoveryCommand(worldState) {
  const { line_front, line_left, line_right, line_rear, bumper_front, bumper_left, bumper_right, stuck } = worldState;

  let f = 0;
  let s = 0;
  let t = 0;

  if (line_front || bumper_front || stuck) f -= 0.70;
  if (line_rear) f += 0.55;
  if (line_left || bumper_left) s += 0.65;
  if (line_right || bumper_right) s -= 0.65;

  if ((line_front || bumper_front) && (line_left || bumper_left)) t += 0.55;
  if ((line_front || bumper_front) && (line_right || bumper_right)) t -= 0.55;

  if (Math_abs(f) < 0.05 && Math_abs(s) < 0.05 && Math_abs(t) < 0.05) {
    f = -0.45;
    t = -0.50;
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
  const oppGoal = we_are_blue ? goal_yellow : goal_blue;

  // Global unstick supervisor: multi-phase escape when stuck persists.
  if (stuck && t_ms >= unstickUntilMs) {
    currentState = STATE.UNSTICK;
    unstickDir = -unstickDir;
    unstickUntilMs = t_ms + 1900;
  }
  if (currentState === STATE.UNSTICK && t_ms < unstickUntilMs) {
    currentTarget = 'unstick';
    const remain = unstickUntilMs - t_ms;
    let cmd;
    if (remain > 1300) {
      cmd = omniMix(-0.85, 0.35 * unstickDir, 0.35 * unstickDir);
    } else if (remain > 750) {
      cmd = omniMix(0.55, 0.90 * unstickDir, 0.20 * unstickDir);
    } else {
      cmd = omniMix(0.70, 0, -0.45 * unstickDir);
    }
    return { ...cmd, kick: false };
  } else if (currentState === STATE.UNSTICK && t_ms >= unstickUntilMs) {
    currentState = ownGoal.visible ? STATE.HOLD_LINE : STATE.FIND_GOAL;
    recoverGraceUntilMs = t_ms + 1000;
  }

  // Hard line protection layer: preempt all behavior and move inward.
  // Keeps inward command for a short lock to avoid re-crossing on sensor flicker.
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
      currentState = ownGoal.visible ? STATE.HOLD_LINE : STATE.FIND_GOAL;
    } else {
      currentTarget = 'line guard';
      const turn = limitUnit(lineGuardStrafe * 0.12);
      const cmd = omniMix(limitUnit(lineGuardForward * 0.78), limitUnit(lineGuardStrafe * 0.78), turn);
      return { ...cmd, kick: false };
    }
  }

  // Global safety first, but don't retrigger RECOVER every frame.
  const lineHazard = line_front || line_left || line_right || line_rear;
  const contactHazard = stuck || bumper_front || bumper_left || bumper_right;

  // Persistent sideline detector -> force inward escape burst.
  if (line_left || line_right) sideLineFrames += 1;
  else sideLineFrames = 0;
  if (sideEscapeUntilMs <= t_ms && sideLineFrames >= 3) {
    sideEscapeDir = line_left ? 1 : -1;
    sideEscapeUntilMs = t_ms + 1200;
    sideLineFrames = 0;
  }
  if (t_ms < sideEscapeUntilMs) {
    currentTarget = 'sideline escape';
    const cmd = omniMix(0.58, 0.75 * sideEscapeDir, 0.15 * sideEscapeDir);
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
      // If we keep bouncing into recover, force a dedicated wall-escape.
      if (recoverEntryCount >= 3) {
        currentState = STATE.ESCAPE_WALL;
        escapeUntilMs = t_ms + 1800;
        recoverEntryCount = 0;
      } else {
        currentState = ownGoal.visible ? STATE.HOLD_LINE : STATE.FIND_GOAL;
      }
      recoverReason = null;
      recoverGraceUntilMs = t_ms + 1200;
    }
    return { ...cmd, kick: false };
  }

  if (currentState === STATE.ESCAPE_WALL) {
    currentTarget = 'escape wall';

    let escapeAngle = 180;
    if (ownGoal.visible) {
      // Move opposite own-goal direction (toward field center).
      escapeAngle = normalizeAngle(ownGoal.angle_deg + 180);
    }

    const angRad = (escapeAngle * Math_PI) / 180;
    const forward = Math_cos(angRad) * 0.75;
    const strafe = Math_sin(angRad) * 0.65;
    const turn = limitUnit(escapeAngle / 60) * 0.35;
    const cmd = omniMix(forward, strafe, turn);

    if (t_ms >= escapeUntilMs) {
      currentState = ownGoal.visible ? STATE.HOLD_LINE : STATE.FIND_GOAL;
      recoverGraceUntilMs = t_ms + 1000;
    }
    return { ...cmd, kick: false };
  }

  // State selection.
  if (!ownGoal.visible) {
    currentState = STATE.FIND_GOAL;
  } else if (ball.visible && ball.distance < 20) {
    currentState = STATE.CLEAR_BALL;
  } else if (ball.visible && ball.distance < 85) {
    currentState = STATE.TRACK_BALL;
  } else {
    currentState = STATE.HOLD_LINE;
  }

  if (currentState === STATE.FIND_GOAL) {
    currentTarget = we_are_blue ? 'find blue goal' : 'find yellow goal';

    if (t_ms % 2400 < 30) spinDir = -spinDir;
    const cmd = omniMix(0.10, 0, 0.45 * spinDir);
    return { ...cmd, kick: false };
  }

  if (currentState === STATE.HOLD_LINE) {
    currentTarget = 'hold defense line';

    // Keep around fixed distance from own goal while maintaining lateral centering.
    const DEF_LINE_CM = 40;
    const distError = DEF_LINE_CM - ownGoal.distance;

    const goalRad = (normalizeAngle(ownGoal.angle_deg) * Math_PI) / 180;
    const lateral = Math_sin(goalRad); // + if goal appears to right

    // If too far from own goal, move backward (toward own goal).
    const forward = limitUnit(distError / 35) * 0.55;
    const strafe = limitUnit(lateral) * 0.45;

    const cmd = omniMix(forward, strafe, 0);
    return { ...cmd, kick: false };
  }

  if (currentState === STATE.TRACK_BALL) {
    currentTarget = 'track ball';

    const ballAngle = normalizeAngle(ball.angle_deg);

    // If ball is behind, rotate to reacquire front geometry.
    if (Math_abs(ballAngle) > 110) {
      const turn = limitUnit(ballAngle / 55) * 0.70;
      const cmd = omniMix(0, 0, turn);
      return { ...cmd, kick: false };
    }

    // Main defender behavior: strafe to match ball X with slight depth correction.
    const side = limitUnit(ballAngle / 45) * 0.75;

    const DEF_LINE_CM = 40;
    const depthError = ownGoal.visible ? (DEF_LINE_CM - ownGoal.distance) : 0;
    const forward = limitUnit(depthError / 45) * 0.25;

    const cmd = omniMix(forward, side, 0);
    return { ...cmd, kick: false };
  }

  // CLEAR_BALL
  currentTarget = 'clear ball';
  {
    const ballAngle = normalizeAngle(ball.angle_deg);
    const absBallAngle = Math_abs(ballAngle);
    const steerBall = limitUnit(ballAngle / 40) * 0.40;
    const steerGoal = oppGoal.visible ? limitUnit(normalizeAngle(oppGoal.angle_deg) / 80) * 0.15 : 0;
    const strafeBall = limitUnit(ballAngle / 40) * 0.35;
    // Slow down when angle is large so we don't charge past.
    const forward = absBallAngle > 25 ? 0.50 : 0.90;

    const cmd = omniMix(forward, strafeBall, steerBall + steerGoal);
    const canKick = ball.visible && ball.distance < 14 && absBallAngle < 18;
    return { ...cmd, kick: canKick };
  }
}
