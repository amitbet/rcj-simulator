// ============================================================
// RoboCup Jr. Simulator - Opponent Attacker Strategy
// ============================================================
// Yellow team attacker - attacks blue goal
// Same logic as blue attacker with alternating search

var searchTime = 0;
var lastBallVisible = true;

function strategy(worldState) {
  const { ball, goal_blue, bumper_front, bumper_left, bumper_right, stuck, dt_s } = worldState;
  
  let motor1 = 0, motor2 = 0, motor3 = 0, motor4 = 0;
  let kick = false;
  
  // Handle stuck/wall
  if (stuck) {
    motor1 = -0.5;
    motor2 = -0.3;
    motor3 = -0.3;
    motor4 = -0.5;
    return { motor1, motor2, motor3, motor4, kick };
  }
  
  if (bumper_front) {
    motor1 = -0.7;
    motor2 = -0.7;
    motor3 = -0.7;
    motor4 = -0.7;
    return { motor1, motor2, motor3, motor4, kick };
  }
  
  if (bumper_left) {
    motor1 = -0.4;
    motor2 = 0.4;
    motor3 = 0.4;
    motor4 = -0.4;
    return { motor1, motor2, motor3, motor4, kick };
  }
  
  if (bumper_right) {
    motor1 = 0.4;
    motor2 = -0.4;
    motor3 = -0.4;
    motor4 = 0.4;
    return { motor1, motor2, motor3, motor4, kick };
  }
  
  // Search for ball with alternating direction
  if (!ball.visible) {
    if (lastBallVisible) {
      searchTime = 0;
    }
    searchTime += dt_s * 1000;
    lastBallVisible = false;
    
    const searchDirection = (Math_floor(searchTime / 2000) % 2 === 0) ? -1 : 1;
    const turnSpeed = 0.6 * searchDirection;
    motor1 = -turnSpeed;
    motor2 = turnSpeed;
    motor3 = turnSpeed;
    motor4 = -turnSpeed;
    return { motor1, motor2, motor3, motor4, kick };
  }
  
  lastBallVisible = true;
  searchTime = 0;
  
  const ballAngle = ball.angle_deg;
  const ballDist = ball.distance;
  
  // Close to ball - push and kick
  if (ballDist < 25) {
    motor1 = 1.0;
    motor2 = 1.0;
    motor3 = 1.0;
    motor4 = 1.0;
    
    const steer = clamp(ballAngle / 45, -0.3, 0.3);
    motor1 -= steer;
    motor4 -= steer;
    motor2 += steer;
    motor3 += steer;
    
    kick = true;
    return { motor1, motor2, motor3, motor4, kick };
  }
  
  // Turn to face ball
  if (Math_abs(ballAngle) > 15) {
    const turn = clamp(ballAngle / 40, -1, 1) * 0.6;
    const forwardSpeed = ballDist > 50 ? 0.2 : 0;
    motor1 = forwardSpeed - turn;
    motor4 = forwardSpeed - turn;
    motor2 = forwardSpeed + turn;
    motor3 = forwardSpeed + turn;
    return { motor1, motor2, motor3, motor4, kick };
  }
  
  // Drive toward ball
  const speed = clamp(0.4 + ballDist / 200, 0.4, 0.85);
  motor1 = speed;
  motor2 = speed;
  motor3 = speed;
  motor4 = speed;
  
  const steer = clamp(ballAngle / 60, -0.2, 0.2);
  motor1 -= steer;
  motor4 -= steer;
  motor2 += steer;
  motor3 += steer;
  
  return { motor1, motor2, motor3, motor4, kick };
}
