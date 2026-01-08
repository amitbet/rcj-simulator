// ============================================================
// RoboCup Jr. Simulator - Opponent Defender Strategy
// ============================================================
// Yellow team defender - defends yellow goal

var searchTime = 0;
var lastBallVisible = true;

function strategy(worldState) {
  const { ball, goal_yellow, bumper_front, bumper_left, bumper_right, stuck, dt_s } = worldState;
  
  const ownGoal = goal_yellow;
  
  let motor1 = 0, motor2 = 0, motor3 = 0, motor4 = 0;
  let kick = false;
  
  const MAX_DISTANCE_FROM_GOAL = 80;
  
  // Handle stuck/wall
  if (stuck || bumper_front) {
    motor1 = -0.6;
    motor2 = -0.6;
    motor3 = -0.6;
    motor4 = -0.6;
    return { motor1, motor2, motor3, motor4, kick };
  }
  
  if (bumper_left) {
    motor1 = -0.3;
    motor2 = 0.3;
    motor3 = 0.3;
    motor4 = -0.3;
    return { motor1, motor2, motor3, motor4, kick };
  }
  
  if (bumper_right) {
    motor1 = 0.3;
    motor2 = -0.3;
    motor3 = -0.3;
    motor4 = 0.3;
    return { motor1, motor2, motor3, motor4, kick };
  }
  
  // Search
  if (!ball.visible) {
    if (lastBallVisible) {
      searchTime = 0;
    }
    searchTime += dt_s * 1000;
    lastBallVisible = false;
    
    if (ownGoal.visible && ownGoal.distance > MAX_DISTANCE_FROM_GOAL) {
      if (Math_abs(ownGoal.angle_deg) > 25) {
        const turn = clamp(ownGoal.angle_deg / 50, -1, 1) * 0.5;
        motor1 = -turn;
        motor4 = -turn;
        motor2 = turn;
        motor3 = turn;
      } else {
        motor1 = 0.5;
        motor2 = 0.5;
        motor3 = 0.5;
        motor4 = 0.5;
      }
    } else {
      const searchDirection = (Math_floor(searchTime / 1500) % 2 === 0) ? -1 : 1;
      const turnSpeed = 0.5 * searchDirection;
      motor1 = -turnSpeed;
      motor2 = turnSpeed;
      motor3 = turnSpeed;
      motor4 = -turnSpeed;
    }
    return { motor1, motor2, motor3, motor4, kick };
  }
  
  lastBallVisible = true;
  searchTime = 0;
  
  const ballAngle = ball.angle_deg;
  const ballDist = ball.distance;
  const goalBehind = ownGoal.visible && Math_abs(ownGoal.angle_deg) > 120;
  
  // Intercept close ball
  if (ballDist < 50) {
    if (Math_abs(ballAngle) > 25) {
      const turn = clamp(ballAngle / 40, -1, 1) * 0.7;
      motor1 = -turn;
      motor4 = -turn;
      motor2 = turn;
      motor3 = turn;
    } else {
      motor1 = 0.9;
      motor2 = 0.9;
      motor3 = 0.9;
      motor4 = 0.9;
      
      const steer = clamp(ballAngle / 45, -0.2, 0.2);
      motor1 -= steer;
      motor4 -= steer;
      motor2 += steer;
      motor3 += steer;
      
      if (ballDist < 25) {
        kick = true;
      }
    }
    return { motor1, motor2, motor3, motor4, kick };
  }
  
  // Defensive position
  if (goalBehind) {
    const strafeSpeed = clamp(ballAngle / 50, -1, 1) * 0.5;
    motor1 = strafeSpeed;
    motor4 = -strafeSpeed;
    motor2 = -strafeSpeed;
    motor3 = strafeSpeed;
    
    if (ownGoal.visible && ownGoal.distance > MAX_DISTANCE_FROM_GOAL - 10) {
      motor1 -= 0.2;
      motor2 -= 0.2;
      motor3 -= 0.2;
      motor4 -= 0.2;
    }
  } else {
    if (ownGoal.visible) {
      if (Math_abs(ownGoal.angle_deg) > 25) {
        const turn = clamp(ownGoal.angle_deg / 50, -1, 1) * 0.6;
        motor1 = -turn;
        motor4 = -turn;
        motor2 = turn;
        motor3 = turn;
      } else {
        motor1 = 0.6;
        motor2 = 0.6;
        motor3 = 0.6;
        motor4 = 0.6;
      }
    } else {
      motor1 = 0.4;
      motor2 = -0.4;
      motor3 = -0.4;
      motor4 = 0.4;
    }
  }
  
  return { motor1, motor2, motor3, motor4, kick };
}
