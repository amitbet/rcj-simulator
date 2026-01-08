// ============================================================
// RoboCup Jr. Simulator - Observation System
// ============================================================

import { PhysicsState } from '../physics/PhysicsEngine';
import { WorldState, Observation, createDefaultObservation, createDefaultWorldState } from '../types';
import { FIELD, GOAL, ROBOT } from '../types/constants';

export class ObservationSystem {
  // Camera/vision parameters
  private readonly CAMERA_FOV = 90; // degrees field of view
  // Max detection distance should cover diagonal of field (sqrt(182^2 + 243^2) ≈ 303cm)
  private readonly MAX_DISTANCE = 350; // cm max detection distance

  constructor() {}

  // Calculate complete world state for a robot
  calculateWorldState(
    robotId: string,
    physicsState: PhysicsState,
    timeMs: number,
    deltaS: number,
    isBlueTeam: boolean
  ): WorldState {
    const robotState = physicsState.robots.get(robotId);
    if (!robotState) {
      return createDefaultWorldState();
    }

    const { x, y, angle, vx, vy } = robotState;
    const headingDeg = (angle * 180 / Math.PI + 360) % 360;

    // Calculate observations
    const ballObs = this.calculateObservation(
      x, y, angle,
      physicsState.ball.x, physicsState.ball.y
    );

    // Goal positions (blue goal at top, yellow at bottom)
    const blueGoalObs = this.calculateObservation(
      x, y, angle,
      0, -FIELD.HEIGHT / 2 - GOAL.DEPTH / 2
    );

    const yellowGoalObs = this.calculateObservation(
      x, y, angle,
      0, FIELD.HEIGHT / 2 + GOAL.DEPTH / 2
    );

    // Estimate speed
    const speed = Math.sqrt(vx * vx + vy * vy);

    // Check bumpers (simplified - check if robot is near walls)
    const bumperFront = this.checkBumper(x, y, angle, 0);
    const bumperLeft = this.checkBumper(x, y, angle, Math.PI / 2);
    const bumperRight = this.checkBumper(x, y, angle, -Math.PI / 2);

    // Check if stuck (very low speed despite motors running)
    const stuck = speed < 1 && deltaS > 0.1;

    return {
      t_ms: timeMs,
      dt_s: deltaS,
      heading_deg: headingDeg,
      yaw_rate_dps: 0, // Would need angular velocity tracking
      v_est: speed,
      ball: ballObs,
      goal_blue: blueGoalObs,
      goal_yellow: yellowGoalObs,
      bumper_front: bumperFront,
      bumper_left: bumperLeft,
      bumper_right: bumperRight,
      stuck,
      stuck_confidence: stuck ? 0.8 : 0,
      we_are_blue: isBlueTeam,
      kickoff_us: false, // Would need game state
    };
  }

  // Calculate observation to a target
  private calculateObservation(
    robotX: number,
    robotY: number,
    robotAngle: number,
    targetX: number,
    targetY: number
  ): Observation {
    const dx = targetX - robotX;
    const dy = targetY - robotY;
    const distance = Math.sqrt(dx * dx + dy * dy);

    // Calculate angle to target (world coordinates)
    const worldAngle = Math.atan2(dy, dx);
    
    // Convert to robot-relative angle
    let relativeAngle = (worldAngle - robotAngle) * 180 / Math.PI;
    
    // Normalize to -180 to 180
    while (relativeAngle > 180) relativeAngle -= 360;
    while (relativeAngle < -180) relativeAngle += 360;

    // Check if in field of view
    const inFOV = Math.abs(relativeAngle) <= this.CAMERA_FOV / 2;
    const visible = inFOV && distance <= this.MAX_DISTANCE;

    // Calculate confidence based on distance and angle
    let confidence = 0;
    if (visible) {
      const distanceConfidence = 1 - (distance / this.MAX_DISTANCE);
      const angleConfidence = 1 - (Math.abs(relativeAngle) / (this.CAMERA_FOV / 2));
      confidence = distanceConfidence * angleConfidence;
    }

    // Simulate pixel coordinates (assuming 320x240 camera)
    const imageWidth = 320;
    const imageHeight = 240;
    const cx = visible ? Math.round(imageWidth / 2 + (relativeAngle / (this.CAMERA_FOV / 2)) * (imageWidth / 2)) : 0;
    const cy = visible ? Math.round(imageHeight / 2) : 0;
    
    // Simulate bounding box size (smaller when farther)
    const baseSize = 50;
    const w = visible ? Math.round(baseSize * (1 - distance / this.MAX_DISTANCE / 2)) : 0;
    const h = visible ? Math.round(baseSize * (1 - distance / this.MAX_DISTANCE / 2)) : 0;

    return {
      visible,
      angle_deg: relativeAngle,
      distance,
      confidence,
      cx,
      cy,
      w,
      h,
    };
  }

  // Check bumper collision (simplified)
  // Bumpers detect walls at the OUTER boundary and other robots
  private checkBumper(
    robotX: number,
    robotY: number,
    robotAngle: number,
    bumperOffset: number // 0 = front, PI/2 = left, -PI/2 = right
  ): boolean {
    const checkAngle = robotAngle + bumperOffset;
    const checkDistance = ROBOT.RADIUS + 2; // Check slightly beyond robot radius
    
    const checkX = robotX + Math.cos(checkAngle) * checkDistance;
    const checkY = robotY + Math.sin(checkAngle) * checkDistance;

    // Use OUTER boundary (field + outer area) for wall detection
    const outerHalfW = FIELD.WIDTH / 2 + FIELD.OUTER_WIDTH;
    const outerHalfH = FIELD.HEIGHT / 2 + FIELD.OUTER_WIDTH;

    // Check if point is outside outer bounds (near walls)
    return checkX < -outerHalfW + 5 || checkX > outerHalfW - 5 || 
           checkY < -outerHalfH + 5 || checkY > outerHalfH - 5;
  }
}

